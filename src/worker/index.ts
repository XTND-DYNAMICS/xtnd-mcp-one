import { OneMailClient } from '../core/client.js';
import {
  buildOneMcpServerInfo,
  MCP_ONE_INSTRUCTIONS,
  MCP_ONE_NAME,
  MCP_ONE_PROTOCOL_VERSION,
  MCP_ONE_TITLE,
  MCP_ONE_VERSION,
} from '../mcp/server.js';
import { WorkerEnv } from '../types.js';
import { authenticateRequest } from './auth.js';
import { brandIconsForOrigin, serveBrandIconRoute } from './brand-icons.js';
import { handleMcpStreamableHttp } from './mcp-streamable-http.js';
import { getOpenApiSpec } from './openapi.js';
import {
  extractCredentialsFromRequest,
  handleMessagePost,
  handleSseConnect,
} from './sse-handler.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderSetupCardHtml(origin: string): string {
  const safeOrigin = escapeHtml(origin);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${MCP_ONE_TITLE}</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/favicon.ico" sizes="32x32">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      background: radial-gradient(circle at top, #0f172a 0%, #020617 70%);
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
    }
    main {
      width: 100%;
      max-width: 560px;
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 20px;
      padding: 28px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
    }
    .header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 18px;
    }
    .header img {
      width: 52px;
      height: 52px;
      border-radius: 14px;
      flex-shrink: 0;
    }
    h1 {
      margin: 0;
      font-size: 1.25rem;
      letter-spacing: 0.04em;
    }
    .meta {
      margin-top: 4px;
      font-size: 0.82rem;
      color: #94a3b8;
    }
    p {
      margin: 0 0 16px;
      line-height: 1.55;
      color: #cbd5e1;
      font-size: 0.94rem;
    }
    .box {
      background: rgba(2, 6, 23, 0.75);
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: 12px;
      padding: 14px 16px;
      margin-bottom: 14px;
    }
    .label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #38bdf8;
      margin-bottom: 6px;
      font-weight: 600;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.86rem;
      color: #f8fafc;
      word-break: break-all;
    }
    .note {
      margin: 0;
      font-size: 0.84rem;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <main>
    <div class="header">
      <img src="/favicon.svg" alt="${MCP_ONE_TITLE}" />
      <div>
        <h1>${MCP_ONE_TITLE}</h1>
        <div class="meta">v${MCP_ONE_VERSION} &middot; MCP ${MCP_ONE_PROTOCOL_VERSION} &middot; Streamable HTTP</div>
      </div>
    </div>
    <p>Model Context Protocol gateway for one.com IMAP/SMTP mailboxes.</p>
    <div class="box">
      <div class="label">MCP Streamable HTTP Endpoint</div>
      <code>${safeOrigin}/</code>
      <div class="meta">Alias: <code>${safeOrigin}/mcp</code></div>
    </div>
    <div class="box">
      <div class="label">Authentication Required</div>
      <p class="note">Operational MCP and REST requests require a valid API key in <code>Authorization: Bearer &lt;api-key&gt;</code> together with mailbox headers (<code>X-OneCom-Email</code> and <code>X-OneCom-Password</code>).</p>
    </div>
  </main>
</body>
</html>`;
}

function buildServerCard(origin: string) {
  return {
    protocolVersion: MCP_ONE_PROTOCOL_VERSION,
    serverInfo: buildOneMcpServerInfo(origin),
    icon: `${origin}/favicon.svg`,
    icons: brandIconsForOrigin(origin),
    banner: 'https://raw.githubusercontent.com/XTND-DYNAMICS/xtnd-mcp-one/main/assets/banner.jpg',
    description:
      'Model Context Protocol (MCP) server for one.com mailboxes. Full email management (IMAP/SMTP) for Claude and AI agents.',
    homepage: 'https://github.com/XTND-DYNAMICS/xtnd-mcp-one#readme',
    repository: 'https://github.com/XTND-DYNAMICS/xtnd-mcp-one',
    transport: {
      type: 'streamable-http',
      endpoint: `${origin}/`,
      aliases: [`${origin}/mcp`],
    },
    instructions: MCP_ONE_INSTRUCTIONS,
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
  };
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers':
            'Content-Type, Accept, Authorization, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID, X-OneCom-Email, X-OneCom-Password, X-OneCom-Imap-Host, X-OneCom-Imap-Port, X-OneCom-Smtp-Host, X-OneCom-Smtp-Port',
          'Access-Control-Expose-Headers':
            'MCP-Protocol-Version, Mcp-Session-Id, WWW-Authenticate',
        },
      });
    }

    // 0. First-party brand icons (unauthenticated, CORP: cross-origin)
    const brandIconResponse = serveBrandIconRoute(url.pathname, request.method);
    if (brandIconResponse) {
      return brandIconResponse;
    }

    // 1. Health check (unauthenticated)
    if (url.pathname === '/health' && request.method === 'GET') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'xtnd-mcp-one',
          version: MCP_ONE_VERSION,
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

    // 3. OpenAI Apps Challenge verification
    if (url.pathname === '/.well-known/openai-apps-challenge' && request.method === 'GET') {
      const challenge = env.OPENAI_APPS_CHALLENGE?.trim();
      if (!challenge) {
        return new Response('Not Found', {
          status: 404,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      return new Response(challenge, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // 4. Official Static Server Card for Smithery & MCP Auto-Discovery (SEP-1649)
    if (
      (url.pathname === '/.well-known/mcp/server-card.json' ||
        url.pathname === '/.well-known/mcp.json') &&
      request.method === 'GET'
    ) {
      return new Response(JSON.stringify(buildServerCard(url.origin), null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cross-Origin-Resource-Policy': 'cross-origin',
        },
      });
    }

    // 5. Unauthenticated bare-origin browser setup card / discovery JSON
    if (
      url.pathname === '/' &&
      request.method === 'GET' &&
      !request.headers.has('Authorization') &&
      !(request.headers.get('Accept') ?? '').includes('text/event-stream')
    ) {
      const accept = request.headers.get('Accept') ?? '';
      if (accept.includes('text/html')) {
        return new Response(renderSetupCardHtml(url.origin), {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      return new Response(
        JSON.stringify(
          {
            service: MCP_ONE_NAME,
            title: MCP_ONE_TITLE,
            version: MCP_ONE_VERSION,
            protocolVersion: MCP_ONE_PROTOCOL_VERSION,
            mcpEndpoint: `${url.origin}/`,
            mcpAliases: [`${url.origin}/mcp`],
            icons: brandIconsForOrigin(url.origin),
            serverCard: `${url.origin}/.well-known/mcp/server-card.json`,
          },
          null,
          2
        ),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // Every operational endpoint needs an mcp-one API key: /, /mcp, /sse,
    // /message and the REST API. Without one, nothing is forwarded to one.com,
    // so this Worker cannot be used to try mailbox passwords there
    // (xtnd-mcp-one#6 / #8).
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
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Expose-Headers': 'MCP-Protocol-Version, Mcp-Session-Id, WWW-Authenticate',
          },
        }
      );
    }

    // Streamable HTTP endpoint for modern MCP clients (bare origin / and /mcp)
    if (url.pathname === '/' || url.pathname === '/mcp') {
      return handleMcpStreamableHttp(request, env);
    }

    // MCP SSE Stream endpoint (Multi-tenant)
    if (url.pathname === '/sse' && request.method === 'GET') {
      return handleSseConnect(request, env);
    }

    // MCP Message dispatch endpoint
    if (url.pathname === '/message' && request.method === 'POST') {
      return handleMessagePost(request);
    }

    // REST endpoints (Multi-tenant)
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
