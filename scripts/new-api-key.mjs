#!/usr/bin/env node
// Issues an mcp-one API key and stores it in mcp-one's own KV namespace.
//
//   node scripts/new-api-key.mjs <name> [--env dev]
//
// The name is required: it says who holds the key, and it is the only thing
// about a key that ever appears in a log.
//
// The key is written through the binding API_KEYS, which wrangler resolves to
// the namespace the deployed xtnd-mcp-one Worker (xtnd-mcp-one-dev with
// --env dev) is bound to. It never takes a namespace id, so it cannot write
// into another service's namespace (xtnd-mcp-one#2). Run it from this
// repository, after the Worker has been deployed with that binding.
//
// The key is shown once, after the write succeeded. Only its SHA-256 is stored.

import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const BINDING = 'API_KEYS';
const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

/** Reads `<name> [--env dev]`. Throws on anything else. */
export function parseArgs(argv) {
  let name;
  let env;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--env') {
      env = argv[++i];
      if (env !== 'dev') throw new Error('--env takes one value: dev');
    } else if (arg.startsWith('-')) {
      throw new Error(`unknown option ${arg}`);
    } else if (name === undefined) {
      name = arg;
    } else {
      throw new Error(`unexpected argument ${arg}`);
    }
  }
  if (!name) throw new Error('a name is required: who holds this key, e.g. "claude-desktop-peter"');
  if (!NAME.test(name)) throw new Error('the name may use letters, digits, ".", "_" and "-" (at most 64)');
  return { name, env };
}

/** The wrangler arguments that store the record. Always the binding, never a namespace id. */
export function putArgs({ hash, name, env, createdAt }) {
  const record = JSON.stringify({ name, created_at: createdAt });
  return ['wrangler', 'kv', 'key', 'put', '--binding', BINDING, `apikey:${hash}`, record, '--remote', ...(env ? ['--env', env] : [])];
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`new-api-key: ${error.message}`);
    console.error('usage: node scripts/new-api-key.mjs <name> [--env dev]');
    process.exit(2);
  }

  const key = 'xmail_' + randomBytes(24).toString('base64url');
  const hash = createHash('sha256').update(key).digest('hex');

  // Store first: a key is only shown once it works.
  execFileSync('npx', putArgs({ hash, name: args.name, env: args.env, createdAt: new Date().toISOString() }), {
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  console.log('------------------------------------------------------------');
  console.log(`New mcp-one API key for "${args.name}"${args.env ? ` (${args.env})` : ''}, stored in ${BINDING}.`);
  console.log('Give it to the client now; it is not stored anywhere in plain text:');
  console.log(key);
  console.log('------------------------------------------------------------');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
