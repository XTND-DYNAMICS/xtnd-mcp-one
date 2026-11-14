/**
 * Streamable HTTP Transport Handler for / and /mcp
 * Compliant with MCP 2025-11-25 JSON-RPC Streamable HTTP Specifications
 */

import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { OneMailClient } from '../core/client.js';
import {
  buildOneMcpServerInfo,
  createOneMcpServer,
  MCP_ONE_INSTRUCTIONS,
  MCP_ONE_PROTOCOL_VERSION,
} from '../mcp/server.js';
import { WorkerEnv } from '../types.js';
import { extractCredentialsFromRequest, handleSseConnect } from './sse-handler.js';

const STREAMABLE_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'MCP-Protocol-Version, Mcp-Session-Id, WWW-Authenticate',
};

export async function handleMcpStreamableHttp(
  request: Request,
  env: WorkerEnv
): Promise<Response> {
  const url = new URL(request.url);
  const origin = url.origin;

  // 1. GET requests: If client requests SSE stream or capabilities discovery
  if (request.method === 'GET') {
    const accept = request.headers.get('Accept') || '';
    if (accept.includes('text/event-stream')) {
      return handleSseConnect(request, env);
    }

    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        result: {
          protocolVersion: MCP_ONE_PROTOCOL_VERSION,
          capabilities: {
            tools: { listChanged: true },
            prompts: { listChanged: true },
            resources: { listChanged: true },
          },
          serverInfo: buildOneMcpServerInfo(origin),
          instructions: MCP_ONE_INSTRUCTIONS,
        },
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...STREAMABLE_CORS_HEADERS,
          'MCP-Protocol-Version': MCP_ONE_PROTOCOL_VERSION,
        },
      }
    );
  }

  // 2. POST requests: JSON-RPC request handling via McpServer
  if (request.method === 'POST') {
    let payload: any;
    try {
      payload = await request.json();
    } catch {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error: Invalid JSON' },
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...STREAMABLE_CORS_HEADERS },
        }
      );
    }

    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      typeof payload.method !== 'string'
    ) {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: payload?.id ?? null,
          error: { code: -32600, message: 'Invalid Request' },
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...STREAMABLE_CORS_HEADERS },
        }
      );
    }

    const { id, method, params } = payload;

    // Notifications return 204
    if (method === 'notifications/initialized' || method.startsWith('notifications/') || id === undefined) {
      return new Response(null, {
        status: 204,
        headers: STREAMABLE_CORS_HEADERS,
      });
    }

    // Smithery registry inspection methods
    if (method === 'ai.smithery/events/list' || method === 'events/list' || method === 'triggers/list') {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: { events: [], triggers: [] },
        }),
        {
          headers: { 'Content-Type': 'application/json', ...STREAMABLE_CORS_HEADERS },
        }
      );
    }

    // Dynamic resource credential gate for one://folders
    if (method === 'resources/read' && params?.uri === 'one://folders') {
      const credentials = extractCredentialsFromRequest(request, env);
      if (!credentials.email || !credentials.password) {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: 'Authentication required for dynamic resource one://folders',
            },
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...STREAMABLE_CORS_HEADERS },
          }
        );
      }
    }

    const getClient = () => {
      const credentials = extractCredentialsFromRequest(request, env);
      if (!credentials.email || !credentials.password) {
        throw new Error(
          'Missing mailbox credentials. Pass X-OneCom-Email and X-OneCom-Password headers.'
        );
      }
      return new OneMailClient(credentials);
    };

    const server = createOneMcpServer(getClient, { origin: new URL(request.url).origin });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const hasNullId = id === null;
    const transportId = hasNullId ? '__null_id__' : id;

    const normalizedRequest =
      method === 'initialize'
        ? {
            jsonrpc: '2.0' as const,
            id: transportId,
            method: 'initialize',
            params: {
              protocolVersion:
                typeof params?.protocolVersion === 'string'
                  ? params.protocolVersion
                  : MCP_ONE_PROTOCOL_VERSION,
              capabilities:
                params?.capabilities && typeof params.capabilities === 'object'
                  ? params.capabilities
                  : {},
              clientInfo:
                params?.clientInfo &&
                typeof params.clientInfo === 'object' &&
                typeof params.clientInfo.name === 'string' &&
                typeof params.clientInfo.version === 'string'
                  ? params.clientInfo
                  : { name: 'mcp-client', version: '0.0.0' },
            },
          }
        : {
            jsonrpc: '2.0' as const,
            id: transportId,
            method,
            ...(params !== undefined ? { params } : {}),
          };

    await server.connect(serverTransport);
    await clientTransport.start();

    try {
      const responseMessage = await new Promise<any>((resolve, reject) => {
        clientTransport.onmessage = (msg: any) => {
          if (msg && 'id' in msg && msg.id === transportId) {
            resolve(msg);
          }
        };
        clientTransport.onerror = (err) => reject(err);
        clientTransport.send(normalizedRequest as any).catch(reject);
      });

      if (hasNullId) {
        responseMessage.id = null;
      }

      const negotiatedProtocolVersion =
        method === 'initialize' && typeof responseMessage?.result?.protocolVersion === 'string'
          ? responseMessage.result.protocolVersion
          : request.headers.get('MCP-Protocol-Version') || MCP_ONE_PROTOCOL_VERSION;

      return new Response(JSON.stringify(responseMessage), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...STREAMABLE_CORS_HEADERS,
          'MCP-Protocol-Version': negotiatedProtocolVersion,
        },
      });
    } finally {
      await server.close();
    }
  }

  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', ...STREAMABLE_CORS_HEADERS },
  });
}
