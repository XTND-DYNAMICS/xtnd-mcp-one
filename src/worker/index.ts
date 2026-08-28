import { OneMailClient } from '../core/client.js';
import { WorkerEnv } from '../types.js';
import { authenticateRequest } from './auth.js';
import { handleMcpStreamableHttp } from './mcp-streamable-http.js';
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
          version: '0.1.2',
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
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // 3. Official Static Server Card for Smithery & MCP Auto-Discovery (SEP-1649)
    if (url.pathname === '/.well-known/mcp/server-card.json' && request.method === 'GET') {
      return new Response(
        JSON.stringify(
          {
            serverInfo: {
              name: 'XTND | MCP | ONE',
              version: '0.1.3',
            },
            icon: 'https://raw.githubusercontent.com/XTND-DYNAMICS/xtnd-mcp-one/main/assets/icon.svg',
            banner: 'https://raw.githubusercontent.com/XTND-DYNAMICS/xtnd-mcp-one/main/assets/banner.jpg',
            description:
              'Model Context Protocol (MCP) server for one.com mailboxes. Full email management (IMAP/SMTP) for Claude and AI agents.',
            homepage: 'https://github.com/XTND-DYNAMICS/xtnd-mcp-one#readme',
            repository: 'https://github.com/XTND-DYNAMICS/xtnd-mcp-one',
            tools: [
              { name: 'list_folders', description: 'List all mailboxes/folders in the one.com mail account with message and unread counts.' },
              { name: 'create_folder', description: 'Create a new folder or mailbox in the one.com mail account.' },
              { name: 'rename_folder', description: 'Rename an existing mailbox/folder.' },
              { name: 'delete_folder', description: 'Delete a folder/mailbox from the one.com mail account.' },
              { name: 'search_emails', description: 'Search for emails in one.com mailbox using filters (query, folder, sender, recipient, flags).' },
              { name: 'get_recent_emails', description: 'Retrieve the most recent emails from a mailbox folder with envelopes.' },
              { name: 'get_email_content', description: 'Fetch full email content by UID from a folder. Body is converted to clean Markdown.' },
              { name: 'get_email_thread', description: 'Retrieve the full conversation thread for a given email UID or Message-ID.' },
              { name: 'mark_emails', description: 'Mark emails as read, unread, flagged, or unflagged.' },
              { name: 'move_emails', description: 'Move emails from a source folder to a destination folder.' },
              { name: 'delete_emails', description: 'Delete emails by moving them to Trash (soft delete) or permanent expunge.' },
              { name: 'send_email', description: 'Send a new outbound email via one.com SMTP server (send.one.com:465).' },
              { name: 'reply_email', description: 'Reply to an existing email with automated In-Reply-To and References headers.' },
              { name: 'forward_email', description: 'Forward an existing email to new recipients with original header context.' },
              { name: 'create_draft', description: 'Create an email draft in the one.com Drafts folder without sending.' },
            ],
            resources: [
              { uri: 'one://folders', name: 'Mailbox Folders', description: 'Live catalog of all mailbox folders with real-time message and unread counts.' },
              { uri: 'one://status', name: 'Gateway Status', description: 'Connection state and active mailbox capabilities for one.com gateway.' },
              { uri: 'one://templates/meeting-followup', name: 'Meeting Followup Template', description: 'Standard template for professional post-meeting summaries.' },
              { uri: 'one://templates/out-of-office', name: 'Out of Office Template', description: 'Standard template for out-of-office auto-responses.' },
            ],
            prompts: [
              { name: 'triage-inbox', description: 'Inspect recent unread emails, prioritize into categories, and recommend triage actions.' },
              { name: 'draft-reply', description: 'Analyze an email thread and draft a professional, contextual reply.' },
              { name: 'clean-inbox', description: 'Detect marketing newsletters, automated alerts, and clutter, offering bulk cleanup actions.' },
              { name: 'executive-briefing', description: 'Generate a high-density executive summary of all emails received today with action item tracker.' },
            ],
          },
          null,
          2
        ),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // 4. Streamable HTTP endpoint for Smithery & modern MCP clients (/mcp)
    if (url.pathname === '/mcp') {
      return handleMcpStreamableHttp(request, env);
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
