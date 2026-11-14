import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import worker from '../src/worker/index.js';
import { sha256Hex } from '../src/worker/auth.js';
import {
  createOneMcpServer,
  MCP_ONE_INSTRUCTIONS,
  MCP_ONE_VERSION,
} from '../src/mcp/server.js';
import { EdgeImapClient } from '../src/core/imap/client.js';
import { EdgeSmtpClient } from '../src/core/smtp/client.js';
import { OneMailClient } from '../src/core/client.js';
import type { WorkerEnv } from '../src/types.js';

const pkg = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')
) as { version: string };

const MCP_ONE_KEY = 'mcp-one-parity-test-key';
const MAILBOX = {
  'X-OneCom-Email': 'someone@example.com',
  'X-OneCom-Password': 'mailbox-password',
};
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

let connects: string[] = [];
const imapConnect = EdgeImapClient.prototype.connect;
const smtpConnect = (EdgeSmtpClient.prototype as any).connect;

beforeEach(() => {
  connects = [];
  EdgeImapClient.prototype.connect = async function () {
    connects.push('imap');
    throw new Error('test: no network');
  };
  (EdgeSmtpClient.prototype as any).connect = async function () {
    connects.push('smtp');
    throw new Error('test: no network');
  };
});

afterEach(() => {
  EdgeImapClient.prototype.connect = imapConnect;
  (EdgeSmtpClient.prototype as any).connect = smtpConnect;
});

function kv(entries: Record<string, string>): KVNamespace {
  const store = new Map(Object.entries(entries));
  return { get: async (key: string) => store.get(key) ?? null } as unknown as KVNamespace;
}

async function makeEnv(extra: Partial<WorkerEnv> = {}): Promise<WorkerEnv> {
  return {
    API_KEYS: kv({
      [`apikey:${await sha256Hex(MCP_ONE_KEY)}`]: JSON.stringify({ name: 'parity-test' }),
    }),
    ...extra,
  };
}

test('MCP_ONE_VERSION stays synchronized with package.json', () => {
  assert.equal(MCP_ONE_VERSION, pkg.version);
});

test('brand icon routes return 200 unauthenticated with CORP cross-origin while POST / and POST /mcp require auth', async () => {
  const iconPaths = [
    '/favicon.svg',
    '/icon.svg',
    '/favicon.ico',
    '/icon-192.png',
    '/favicon.png',
    '/icon.png',
    '/apple-touch-icon.png',
    '/apple-touch-icon-precomposed.png',
  ];

  const env = await makeEnv();

  for (const path of iconPaths) {
    for (const method of ['GET', 'HEAD'] as const) {
      const res = await worker.fetch(
        new Request(`https://one.mcp.xgi.io${path}`, { method }),
        env,
        ctx
      );
      assert.equal(res.status, 200, `${method} ${path}`);
      assert.equal(res.headers.get('Cross-Origin-Resource-Policy'), 'cross-origin');
      assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
      if (method === 'GET' && path.endsWith('.svg')) {
        const svg = await res.text();
        assert.ok(svg.includes('<svg'));
      }
      if (method === 'HEAD') {
        assert.equal(await res.text(), '');
      }
    }
  }

  // Operational endpoints MUST still reject unauthenticated calls with 401
  const unauthenticatedRequests = [
    new Request('https://one.mcp.xgi.io/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...MAILBOX },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    }),
    new Request('https://one.mcp.xgi.io/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...MAILBOX },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    }),
    new Request('https://one.mcp.xgi.io/', {
      method: 'GET',
      headers: { ...MAILBOX, Accept: 'text/event-stream' },
    }),
    new Request('https://one.mcp.xgi.io/', {
      method: 'GET',
      headers: { ...MAILBOX, Authorization: 'Bearer wrong-key' },
    }),
    new Request('https://one.mcp.xgi.io/favicon.ico', {
      method: 'POST',
      headers: MAILBOX,
    }),
  ];

  for (const req of unauthenticatedRequests) {
    const res = await worker.fetch(req, env, ctx);
    assert.equal(res.status, 401, `${req.method} ${req.url}`);
  }

  assert.deepEqual(connects, []);
});

test('OPTIONS preflight allows and exposes MCP 2025-11-25 transport headers', async () => {
  const res = await worker.fetch(
    new Request('https://one.mcp.xgi.io/', { method: 'OPTIONS' }),
    await makeEnv(),
    ctx
  );
  assert.equal(res.status, 204);
  const allowHeaders = res.headers.get('Access-Control-Allow-Headers') || '';
  const exposeHeaders = res.headers.get('Access-Control-Expose-Headers') || '';
  for (const required of ['Accept', 'MCP-Protocol-Version', 'Mcp-Session-Id', 'Last-Event-ID']) {
    assert.ok(allowHeaders.includes(required), `missing allow header: ${required}`);
  }
  for (const exposed of ['MCP-Protocol-Version', 'Mcp-Session-Id', 'WWW-Authenticate']) {
    assert.ok(exposeHeaders.includes(exposed), `missing expose header: ${exposed}`);
  }
});

test('server-card.json and mcp.json expose first-party icons, version, and bare-origin transport', async () => {
  const env = await makeEnv();
  for (const path of ['/.well-known/mcp/server-card.json', '/.well-known/mcp.json']) {
    const res = await worker.fetch(new Request(`https://one.mcp.xgi.io${path}`), env, ctx);
    assert.equal(res.status, 200, path);
    assert.equal(res.headers.get('Cross-Origin-Resource-Policy'), 'cross-origin');
    const card = (await res.json()) as any;
    assert.equal(card.icon, 'https://one.mcp.xgi.io/favicon.svg');
    assert.equal(card.serverInfo.name, '@xtnd-dynamics/mcp-one');
    assert.equal(card.serverInfo.title, 'XTND | MCP | ONE');
    assert.equal(card.serverInfo.version, pkg.version);
    assert.equal(card.serverInfo.websiteUrl, 'https://one.mcp.xgi.io');
    assert.ok(Array.isArray(card.serverInfo.icons));
    assert.equal(card.serverInfo.icons[0].src, 'https://one.mcp.xgi.io/favicon.svg');
    assert.deepEqual(card.transport, {
      type: 'streamable-http',
      endpoint: 'https://one.mcp.xgi.io/',
      aliases: ['https://one.mcp.xgi.io/mcp'],
    });
  }
});

test('unauthenticated GET / serves HTML setup card for browsers and discovery JSON otherwise', async () => {
  const env = await makeEnv();

  const htmlRes = await worker.fetch(
    new Request('https://one.mcp.xgi.io/', {
      headers: { Accept: 'text/html,application/xhtml+xml' },
    }),
    env,
    ctx
  );
  assert.equal(htmlRes.status, 200);
  assert.ok((htmlRes.headers.get('Content-Type') || '').includes('text/html'));
  const html = await htmlRes.text();
  assert.ok(html.includes('<link rel="icon" href="/favicon.svg" type="image/svg+xml">'));
  assert.ok(html.includes('<link rel="icon" href="/favicon.ico" sizes="32x32">'));
  assert.ok(html.includes('<link rel="apple-touch-icon" href="/apple-touch-icon.png">'));
  assert.ok(html.includes('XTND | MCP | ONE'));
  assert.ok(html.includes('https://one.mcp.xgi.io/'));
  assert.ok(html.includes('https://one.mcp.xgi.io/mcp'));

  const jsonRes = await worker.fetch(
    new Request('https://one.mcp.xgi.io/', {
      headers: { Accept: 'application/json' },
    }),
    env,
    ctx
  );
  assert.equal(jsonRes.status, 200);
  const discovery = (await jsonRes.json()) as any;
  assert.equal(discovery.service, '@xtnd-dynamics/mcp-one');
  assert.equal(discovery.title, 'XTND | MCP | ONE');
  assert.equal(discovery.version, pkg.version);
  assert.equal(discovery.mcpEndpoint, 'https://one.mcp.xgi.io/');
  assert.equal(discovery.serverCard, 'https://one.mcp.xgi.io/.well-known/mcp/server-card.json');
  assert.equal(discovery.icons[0].src, 'https://one.mcp.xgi.io/favicon.svg');
});

test('/.well-known/openai-apps-challenge returns 404 when unset and 200 text/plain when configured', async () => {
  const unsetRes = await worker.fetch(
    new Request('https://one.mcp.xgi.io/.well-known/openai-apps-challenge'),
    await makeEnv(),
    ctx
  );
  assert.equal(unsetRes.status, 404);

  const setRes = await worker.fetch(
    new Request('https://one.mcp.xgi.io/.well-known/openai-apps-challenge'),
    await makeEnv({ OPENAI_APPS_CHALLENGE: 'challenge-token-xyz' }),
    ctx
  );
  assert.equal(setRes.status, 200);
  assert.ok((setRes.headers.get('Content-Type') || '').startsWith('text/plain'));
  assert.equal(await setRes.text(), 'challenge-token-xyz');
});

test('authenticated bare-origin POST / and POST /mcp both serve MCP 2025-11-25 Streamable HTTP', async () => {
  const env = await makeEnv();

  for (const endpoint of ['https://mcp-one.xgi.io/', 'https://mcp-one.xgi.io/mcp']) {
    const initRes = await worker.fetch(
      new Request(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${MCP_ONE_KEY}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'parity-client', version: '1.0.0' },
          },
        }),
      }),
      env,
      ctx
    );

    assert.equal(initRes.status, 200, endpoint);
    const initJson = (await initRes.json()) as any;
    assert.equal(initJson.result.protocolVersion, '2025-11-25');
    assert.equal(initJson.result.serverInfo.name, '@xtnd-dynamics/mcp-one');
    assert.equal(initJson.result.serverInfo.title, 'XTND | MCP | ONE');
    assert.equal(initJson.result.serverInfo.version, pkg.version);
    assert.equal(initJson.result.serverInfo.websiteUrl, 'https://one.mcp.xgi.io');
    assert.equal(initJson.result.serverInfo.icons[0].src, 'https://mcp-one.xgi.io/favicon.svg');
    assert.equal(initJson.result.instructions, MCP_ONE_INSTRUCTIONS);
  }

  const callRes = await worker.fetch(
    new Request('https://one.mcp.xgi.io/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MCP_ONE_KEY}`,
        ...MAILBOX,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'list_folders', arguments: {} },
      }),
    }),
    env,
    ctx
  );
  assert.equal(callRes.status, 200);
  assert.deepEqual(connects, ['imap']);
});

test('createOneMcpServer exposes SEP-973 serverInfo.icons, websiteUrl, instructions, and complete annotations on all 15 tools', async () => {
  const server = createOneMcpServer(
    () => new OneMailClient({ email: 'user@example.com', password: 'secret' }),
    { origin: 'https://one.mcp.xgi.io' }
  );
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  try {
    const serverInfo = client.getServerVersion() as any;
    assert.equal(serverInfo.name, '@xtnd-dynamics/mcp-one');
    assert.equal(serverInfo.title, 'XTND | MCP | ONE');
    assert.equal(serverInfo.version, pkg.version);
    assert.equal(serverInfo.websiteUrl, 'https://one.mcp.xgi.io');
    assert.ok(Array.isArray(serverInfo.icons));
    assert.equal(serverInfo.icons.length, 3);
    assert.equal(serverInfo.icons[0].src, 'https://one.mcp.xgi.io/favicon.svg');

    assert.equal(client.getInstructions(), MCP_ONE_INSTRUCTIONS);

    const { tools } = await client.listTools();
    assert.equal(tools.length, 15);

    const expectedAnnotations: Record<
      string,
      {
        readOnlyHint: boolean;
        destructiveHint: boolean;
        idempotentHint: boolean;
        openWorldHint: boolean;
      }
    > = {
      list_folders: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      search_emails: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      get_recent_emails: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      get_email_content: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      get_email_thread: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },

      create_folder: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      rename_folder: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      mark_emails: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      move_emails: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      create_draft: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },

      delete_folder: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      delete_emails: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      send_email: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      reply_email: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      forward_email: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    };

    const byName = new Map(tools.map((t) => [t.name, t]));
    assert.deepEqual(
      [...byName.keys()].sort(),
      Object.keys(expectedAnnotations).sort()
    );

    for (const [toolName, expected] of Object.entries(expectedAnnotations)) {
      const tool = byName.get(toolName);
      assert.ok(tool, `missing tool ${toolName}`);
      assert.deepEqual(tool.annotations, expected, `annotations mismatch on ${toolName}`);
    }
  } finally {
    await client.close();
    await server.close();
  }
});
