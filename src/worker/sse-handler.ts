/**
 * MCP Server-Sent Events (SSE) Transport Handler for Cloudflare Workers
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

// In-memory session registry (scoped to Worker execution lifecycle / session ID)
const activeSessions = new Map<string, SSEServerTransport>();

export async function handleSseConnect(
  request: Request,
  server: McpServer
): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = crypto.randomUUID();
  const messageEndpoint = `${url.origin}/message?sessionId=${sessionId}`;

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Create a minimal response mock for SSEServerTransport
  const responseMock = {
    writeHead: (status: number, headers: Record<string, string>) => {},
    write: (chunk: string) => {
      writer.write(encoder.encode(chunk)).catch(() => {});
    },
    end: () => {
      writer.close().catch(() => {});
      activeSessions.delete(sessionId);
    },
    on: (event: string, cb: () => void) => {
      // Event listener stub
    },
  };

  const transport = new SSEServerTransport(messageEndpoint, responseMock as any);
  activeSessions.set(sessionId, transport);

  request.signal.addEventListener('abort', () => {
    activeSessions.delete(sessionId);
    writer.close().catch(() => {});
  });

  await server.connect(transport);

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
    },
  });
}

export async function handleMessagePost(
  request: Request,
  server: McpServer
): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId');

  if (!sessionId || !activeSessions.has(sessionId)) {
    return new Response(JSON.stringify({ error: 'Invalid or expired SSE session ID' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const transport = activeSessions.get(sessionId)!;
  const body = await request.text();

  try {
    const jsonBody = JSON.parse(body);
    await transport.handlePostMessage(
      {
        body: jsonBody,
      } as any,
      {
        writeHead: () => {},
        end: () => {},
      } as any
    );

    return new Response(JSON.stringify({ status: 'accepted' }), {
      status: 202,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
