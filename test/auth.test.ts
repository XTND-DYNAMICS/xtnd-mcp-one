import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authenticateRequest, keyName, sha256Hex } from '../src/worker/auth.js';

const MCP_ONE_KEY = 'xmail_mcp-one-test-key';
const XMAIL_KEY = 'xmail_xmail-test-key';

function kv(entries: Record<string, string>): KVNamespace {
  const store = new Map(Object.entries(entries));
  return { get: async (key: string) => store.get(key) ?? null } as unknown as KVNamespace;
}

async function record(key: string, value: object): Promise<Record<string, string>> {
  return { [`apikey:${await sha256Hex(key)}`]: JSON.stringify(value) };
}

function bearer(key: string): Request {
  return new Request('https://one.mcp.xgi.io/sse', { headers: { Authorization: `Bearer ${key}` } });
}

function capture() {
  const lines: string[] = [];
  return { lines, log: { warn: (...args: unknown[]) => void lines.push(args.map(String).join(' ')) } };
}

async function env() {
  return {
    API_KEYS: kv(await record(MCP_ONE_KEY, { name: 'claude-desktop-peter', created_at: '2026-11-13T00:00:00Z' })),
    XMAIL_KEYS: kv(await record(XMAIL_KEY, { name: 'xtnd-exchange-api', policy: { allow: ['xms:send'] } })),
  };
}

test('an mcp-one key is accepted from its own namespace, with nothing logged', async () => {
  const { lines, log } = capture();
  const result = await authenticateRequest(bearer(MCP_ONE_KEY), await env(), log);
  assert.deepEqual(result, { authenticated: true, source: 'mcp-one' });
  assert.deepEqual(lines, []);
});

test('an XMail key is accepted during the transition and logged by name only', async () => {
  const { lines, log } = capture();
  const result = await authenticateRequest(bearer(XMAIL_KEY), await env(), log);
  assert.deepEqual(result, { authenticated: true, source: 'xmail' });
  assert.deepEqual(lines, ['mcp-one: authenticated with an XMail key "xtnd-exchange-api"']);
  const hash = await sha256Hex(XMAIL_KEY);
  assert.ok(lines.every((line) => !line.includes(XMAIL_KEY) && !line.includes(hash)));
});

test('an unknown key is refused', async () => {
  const { lines, log } = capture();
  const result = await authenticateRequest(bearer('xmail_unknown'), await env(), log);
  assert.deepEqual(result, { authenticated: false, error: 'Invalid API key.' });
  assert.deepEqual(lines, []);
});

test('a key in both namespaces is mcp-one\'s, and is not logged as an XMail key', async () => {
  const { lines, log } = capture();
  const both = await record(MCP_ONE_KEY, { name: 'both' });
  const result = await authenticateRequest(bearer(MCP_ONE_KEY), { API_KEYS: kv(both), XMAIL_KEYS: kv(both) }, log);
  assert.deepEqual(result, { authenticated: true, source: 'mcp-one' });
  assert.deepEqual(lines, []);
});

test('without the XMAIL_KEYS binding (step 2), an XMail key is refused', async () => {
  const { API_KEYS } = await env();
  const result = await authenticateRequest(bearer(XMAIL_KEY), { API_KEYS }, capture().log);
  assert.equal(result.authenticated, false);
});

test('API_KEYS_SHA256 no longer authenticates anything', async () => {
  const fallback = { API_KEYS: kv({}), API_KEYS_SHA256: await sha256Hex(MCP_ONE_KEY) };
  const result = await authenticateRequest(bearer(MCP_ONE_KEY), fallback as never, capture().log);
  assert.equal(result.authenticated, false);
});

test('a request without a bearer token is refused before any lookup', async () => {
  const refuse = { get: async () => assert.fail('no lookup without a token') } as unknown as KVNamespace;
  for (const request of [new Request('https://one.mcp.xgi.io/sse'), bearer(' ')]) {
    const result = await authenticateRequest(request, { API_KEYS: refuse, XMAIL_KEYS: refuse }, capture().log);
    assert.equal(result.authenticated, false);
  }
});

test('keyName shows the record\'s name only, and something safe when there is none', () => {
  assert.equal(keyName('{"name":"peter","policy":{}}'), 'peter');
  assert.equal(keyName('{"created_at":"2026-08-14"}'), '(unnamed)');
  assert.equal(keyName('{"name":"  "}'), '(unnamed)');
  assert.equal(keyName('not json'), '(unreadable record)');
  assert.equal(keyName('{"name":"a\\"b\\nc"}'), 'a?b?c');
});
