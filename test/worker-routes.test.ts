import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker/index.js';
import { sha256Hex } from '../src/worker/auth.js';
import { EdgeImapClient } from '../src/core/imap/client.js';
import { EdgeSmtpClient } from '../src/core/smtp/client.js';
import type { WorkerEnv } from '../src/types.js';

const MCP_ONE_KEY = 'mcp-one-route-test-key';
const XMAIL_KEY = 'xmail-route-test-key';
const MAILBOX = { 'X-OneCom-Email': 'someone@example.com', 'X-OneCom-Password': 'mailbox-password' };
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

// Every connection to a mail server is recorded here and refused: no test touches the network.
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

async function env(): Promise<WorkerEnv> {
  return {
    API_KEYS: kv({ [`apikey:${await sha256Hex(MCP_ONE_KEY)}`]: JSON.stringify({ name: 'route-test' }) }),
    XMAIL_KEYS: kv({ [`apikey:${await sha256Hex(XMAIL_KEY)}`]: JSON.stringify({ name: 'xmail-route-test' }) }),
  };
}

function rpc(method: string, params: object, headers: Record<string, string> = {}): Request {
  return new Request('https://one.mcp.xgi.io/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...MAILBOX, ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
}

const listFolders = (headers: Record<string, string> = {}) => rpc('tools/call', { name: 'list_folders', arguments: {} }, headers);

test('/mcp without an mcp-one key is refused with 401 and never connects to one.com', async () => {
  const requests = [
    listFolders(),
    listFolders({ Authorization: 'Bearer not-a-key' }),
    listFolders({ Authorization: 'Basic c29tZW9uZTpwYXNzd29yZA==' }),
    rpc('initialize', { protocolVersion: '2024-11-05' }),
    new Request('https://one.mcp.xgi.io/mcp', { headers: MAILBOX }),
    new Request('https://one.mcp.xgi.io/mcp', { headers: { ...MAILBOX, Accept: 'text/event-stream' } }),
  ];
  for (const request of requests) {
    const res = await worker.fetch(request, await env(), ctx);
    assert.equal(res.status, 401, `${request.method} ${request.headers.get('Accept') ?? ''}`);
    assert.equal(((await res.json()) as { name: string }).name, 'unauthorized');
  }
  assert.deepEqual(connects, []);
});

test('/mcp with a valid mcp-one key and mailbox credentials proceeds to the mailbox', async () => {
  const init = await worker.fetch(rpc('initialize', { protocolVersion: '2024-11-05' }, { Authorization: `Bearer ${MCP_ONE_KEY}` }), await env(), ctx);
  assert.equal(init.status, 200);
  assert.ok(((await init.json()) as { result: { serverInfo: unknown } }).result.serverInfo);
  assert.deepEqual(connects, []);

  const call = await worker.fetch(listFolders({ Authorization: `Bearer ${MCP_ONE_KEY}` }), await env(), ctx);
  assert.notEqual(call.status, 401);
  assert.deepEqual(connects, ['imap']);
});

test('until step 2, an XMail key still gets through /mcp, and is logged by name', async () => {
  const warn = console.warn;
  const lines: string[] = [];
  console.warn = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
  try {
    const call = await worker.fetch(listFolders({ Authorization: `Bearer ${XMAIL_KEY}` }), await env(), ctx);
    assert.notEqual(call.status, 401);
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(connects, ['imap']);
  assert.ok(lines.includes('mcp-one: authenticated with an XMail key "xmail-route-test"'));
});

test('the public routes stay open without a key', async () => {
  for (const path of ['/health', '/openapi.json', '/.well-known/mcp/server-card.json']) {
    const res = await worker.fetch(new Request(`https://one.mcp.xgi.io${path}`), await env(), ctx);
    assert.equal(res.status, 200, path);
  }
  assert.deepEqual(connects, []);
});
