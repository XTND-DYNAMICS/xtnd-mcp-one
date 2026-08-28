/**
 * Cloudflare Worker Entry Point for xtnd-mcp-one
 */

import { OneMailClient } from '../core/client.js';
import { createOneMcpServer } from '../mcp/server.js';
import { MailboxCredentials, WorkerEnv } from '../types.js';
import { authenticateRequest } from './auth.js';
import { getOpenApiSpec } from './openapi.js';
import { handleMessagePost, handleSseConnect } from './sse-handler.js';

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // 1. Health check (unauthenticated)
    if (url.pathname === '/health' && request.method === 'GET') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'xtnd-mcp-one',
          version: '0.1.0',
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 2. OpenAPI 3.0 Spec for ChatGPT Actions
    if (url.pathname === '/openapi.json' && request.method === 'GET') {
      return new Response(JSON.stringify(getOpenApiSpec(url.origin), null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Authenticate all operational endpoints
    const auth = await authenticateRequest(request, env);
    if (!auth.authenticated) {
      return new Response(
        JSON.stringify({
          statusCode: 401,
          name: 'unauthorized',
          message: auth.error || 'Authentication required.',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Mailbox credentials resolver
    const credentials: MailboxCredentials = {
      email: env.ONECOM_EMAIL || 'pam@stejle.dk',
      password: env.ONECOM_PASSWORD || '',
      imapHost: env.ONECOM_IMAP_HOST || 'imap.one.com',
      imapPort: env.ONECOM_IMAP_PORT ? parseInt(env.ONECOM_IMAP_PORT, 10) : 993,
      smtpHost: env.ONECOM_SMTP_HOST || 'send.one.com',
      smtpPort: env.ONECOM_SMTP_PORT ? parseInt(env.ONECOM_SMTP_PORT, 10) : 465,
    };

    const getClient = () => new OneMailClient(credentials);
    const mcpServer = createOneMcpServer(getClient);

    // 3. MCP SSE Stream endpoint
    if (url.pathname === '/sse' && request.method === 'GET') {
      return handleSseConnect(request, mcpServer);
    }

    // 4. MCP Message dispatch endpoint
    if (url.pathname === '/message' && request.method === 'POST') {
      return handleMessagePost(request, mcpServer);
    }

    // 5. REST endpoints for ChatGPT / Webhook callers
    if (url.pathname === '/api/folders' && request.method === 'GET') {
      const client = getClient();
      const folders = await client.listFolders();
      return new Response(JSON.stringify({ folders }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/api/emails/search' && request.method === 'POST') {
      const client = getClient();
      const body = await request.json<any>();
      const result = await client.searchEmails(body);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname.startsWith('/api/emails/') && request.method === 'GET') {
      const uidStr = url.pathname.replace('/api/emails/', '');
      const uid = parseInt(uidStr, 10);
      const folder = url.searchParams.get('folder') || 'INBOX';
      const client = getClient();
      const email = await client.getEmailContent(folder, uid);
      return new Response(JSON.stringify(email), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/api/emails/send' && request.method === 'POST') {
      const client = getClient();
      const body = await request.json<any>();
      const result = await client.sendEmail(body);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
