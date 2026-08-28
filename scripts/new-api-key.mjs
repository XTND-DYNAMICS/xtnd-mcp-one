#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';

function generateApiKey(name = 'default-client') {
  const rawSecret = 'xmail_' + randomBytes(24).toString('base64url');
  const hash = createHash('sha256').update(rawSecret).digest('hex');

  console.log('------------------------------------------------------------');
  console.log(`🔑 New API Key for: ${name}`);
  console.log('------------------------------------------------------------');
  console.log(`Plaintext Token (give to Claude / client) : ${rawSecret}`);
  console.log(`SHA-256 Hash (stored in Cloudflare KV)   : ${hash}`);
  console.log('------------------------------------------------------------');
  console.log('To register this key in Cloudflare KV:');
  console.log(`npx wrangler kv key put --binding KV "apikey:${hash}" '{"name":"${name}","created_at":"${new Date().toISOString()}"}' --remote`);
  console.log('------------------------------------------------------------\n');
}

const nameArg = process.argv[2] || 'claude-desktop';
generateApiKey(nameArg);
