/**
 * Cloudflare Worker Entry Point for xtnd-mcp-one (Multi-Tenant & Hosted SaaS)
 */

import { OneMailClient } from '../core/client.js';
import { WorkerEnv } from '../types.js';
import { authenticateRequest } from './auth.js';
import { getOpenApiSpec } from './openapi.js';
import {
  extractCredentialsFromRequest,
  handleMessagePost,
  handleSseConnect,
} from './sse-handler.js';

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
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-OneCom-Email, X-OneCom-Password, X-OneCom-Imap-Host, X-OneCom-Imap-Port, X-OneCom-Smtp-Host, X-OneCom-Smtp-Port',
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
          multiTenant: true,
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

    // Authenticate all operational endpoints via API Key
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

    // 3. MCP SSE Stream endpoint (Multi-tenant)
    if (url.pathname === '/sse' && request.method === 'GET') {
      return handleSseConnect(request, env);
    }

    // 4. MCP Message dispatch endpoint
    if (url.pathname === '/message' && request.method === 'POST') {
      return handleMessagePost(request);
    }

    // 5. REST endpoints (Multi-tenant)
    const credentials = extractCredentialsFromRequest(request, env);
    if (!credentials.email || !credentials.password) {
      return new Response(
        JSON.stringify({
          error: 'Missing mailbox credentials. Pass X-OneCom-Email and X-OneCom-Password headers or configure server secrets.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const client = new OneMailClient(credentials);

    if (url.pathname === '/api/folders' && request.method === 'GET') {
      const folders = await client.listFolders();
      return new Response(JSON.stringify({ folders }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/api/emails/search' && request.method === 'POST') {
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
      const email = await client.getEmailContent(folder, uid);
      return new Response(JSON.stringify(email), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/api/emails/send' && request.method === 'POST') {
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
