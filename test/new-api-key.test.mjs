import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BINDING, parseArgs, putArgs } from '../scripts/new-api-key.mjs';

test('a name is required; there is no default', () => {
  assert.throws(() => parseArgs([]), /a name is required/);
  assert.throws(() => parseArgs(['--env', 'dev']), /a name is required/);
});

test('names, environments and stray arguments are checked', () => {
  assert.deepEqual(parseArgs(['claude-desktop-peter']), { name: 'claude-desktop-peter', env: undefined });
  assert.deepEqual(parseArgs(['ci.bot_1', '--env', 'dev']), { name: 'ci.bot_1', env: 'dev' });
  assert.throws(() => parseArgs(['a b']), /the name may use/);
  assert.throws(() => parseArgs(['x', '--env', 'production']), /--env takes one value/);
  assert.throws(() => parseArgs(['x', '--namespace-id', 'abc']), /unknown option --namespace-id/);
  assert.throws(() => parseArgs(['x', 'y']), /unexpected argument y/);
});

test('the record is written through mcp-one\'s own binding, never a namespace id', () => {
  const args = putArgs({ hash: 'ab12', name: 'peter', env: undefined, createdAt: '2026-11-13T00:00:00.000Z' });
  assert.equal(BINDING, 'API_KEYS');
  assert.deepEqual(args, [
    'wrangler', 'kv', 'key', 'put', '--binding', 'API_KEYS', 'apikey:ab12',
    '{"name":"peter","created_at":"2026-11-13T00:00:00.000Z"}', '--remote',
  ]);
  assert.ok(!args.some((a) => /namespace-id|^KV$|12eb8b74/.test(a)));
  assert.deepEqual(putArgs({ hash: 'ab12', name: 'p', env: 'dev', createdAt: 't' }).slice(-3), ['--remote', '--env', 'dev']);
});
