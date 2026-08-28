/**
 * Multi-Tenant MCP Server-Sent Events (SSE) Transport Handler for Cloudflare Workers
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { OneMailClient } from '../core/client.js';
import { createOneMcpServer } from '../mcp/server.js';
import { MailboxCredentials, WorkerEnv } from '../types.js';

interface SessionContext {
  transport: SSEServerTransport;
  server: McpServer;
  credentials: MailboxCredentials;
}

// In-memory session registry (scoped to Worker execution lifecycle / session ID)
const activeSessions = new Map<string, SessionContext>();

export function extractCredentialsFromRequest(request: Request, env: WorkerEnv): MailboxCredentials {
  const email =
    request.headers.get('X-OneCom-Email') ||
    request.headers.get('X-Mailbox-User') ||
    env.ONECOM_EMAIL ||
    '';

  const password =
    request.headers.get('X-OneCom-Password') ||
    request.headers.get('X-Mailbox-Password') ||
    env.ONECOM_PASSWORD ||
    '';

  const imapHost =
    request.headers.get('X-OneCom-Imap-Host') ||
    env.ONECOM_IMAP_HOST ||
    'imap.one.com';

  const imapPort = parseInt(
    request.headers.get('X-OneCom-Imap-Port') ||
    env.ONECOM_IMAP_PORT ||
    '993',
    10
  );

  const smtpHost =
    request.headers.get('X-OneCom-Smtp-Host') ||
    env.ONECOM_SMTP_HOST ||
    'send.one.com';

  const smtpPort = parseInt(
    request.headers.get('X-OneCom-Smtp-Port') ||
    env.ONECOM_SMTP_PORT ||
    '465',
    10
  );

  return { email, password, imapHost, imapPort, smtpHost, smtpPort };
}

export async function handleSseConnect(
  request: Request,
  env: WorkerEnv
): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = crypto.randomUUID();
  const messageEndpoint = `${url.origin}/message?sessionId=${sessionId}`;

  const credentials = extractCredentialsFromRequest(request, env);

  if (!credentials.email || !credentials.password) {
    return new Response(
      JSON.stringify({
        error: 'Missing mailbox credentials. Pass X-OneCom-Email and X-OneCom-Password headers or configure server secrets.',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const getClient = () => new OneMailClient(credentials);
  const server = createOneMcpServer(getClient);

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const responseMock = {
    writeHead: (status: number, headers: Record<string, string>) => {},
    write: (chunk: string) => {
      writer.write(encoder.encode(chunk)).catch(() => {});
    },
    end: () => {
      writer.close().catch(() => {});
      activeSessions.delete(sessionId);
    },
    on: (event: string, cb: () => void) => {},
  };

  const transport = new SSEServerTransport(messageEndpoint, responseMock as any);
  activeSessions.set(sessionId, { transport, server, credentials });

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
  request: Request
): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId');

  if (!sessionId || !activeSessions.has(sessionId)) {
    return new Response(JSON.stringify({ error: 'Invalid or expired SSE session ID' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const session = activeSessions.get(sessionId)!;
  const body = await request.text();

  try {
    const jsonBody = JSON.parse(body);
    await session.transport.handlePostMessage(
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
