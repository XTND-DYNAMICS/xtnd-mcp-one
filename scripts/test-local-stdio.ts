/**
 * Test NPX / Local Stdio Transport (Approach 1)
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDevVars(): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as any;
  const devVarsPath = resolve(process.cwd(), '.dev.vars');

  if (existsSync(devVarsPath)) {
    for (const line of readFileSync(devVarsPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
        env[trimmed.slice(0, eqIdx).trim()] = val;
      }
    }
  }
  return env;
}

async function testLocalStdio() {
  console.log('🧪 Testing Approach 1: Local Stdio Transport (npx @xtnd/mcp-one)...\n');

  const env = loadDevVars();
  const email = env.ONECOM_EMAIL;
  const password = env.ONECOM_PASSWORD;

  if (!email || !password) {
    console.error('❌ ONECOM_EMAIL and ONECOM_PASSWORD must be in .dev.vars');
    process.exit(1);
  }

  console.log(`🔐 Passing credentials via Local Process Environment (ONECOM_EMAIL=${email})`);

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', 'src/cli.ts'],
    env: {
      ...process.env,
      ONECOM_EMAIL: email,
      ONECOM_PASSWORD: password,
    },
  });

  const client = new Client(
    { name: 'test-stdio-client', version: '0.1.0' },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log('✅ Connected to local MCP stdio sub-process!\n');

  // 1. List tools
  console.log('🔹 1. Querying available tools...');
  const tools = await client.listTools();
  console.log(`   ✅ Found ${tools.tools.length} registered tools:`);
  for (const t of tools.tools) {
    console.log(`      - ${t.name}: ${(t.description || '').slice(0, 60)}...`);
  }
  console.log();

  // 2. Call list_folders tool
  console.log('🔹 2. Calling tool `list_folders` via stdio JSON-RPC...');
  const foldersRes = await client.callTool({ name: 'list_folders', arguments: {} });
  console.log('   ✅ Result received:');
  console.log('   ', (foldersRes.content as any)[0]?.text?.slice(0, 200).replace(/\n/g, ' '));
  console.log();

  // 3. Call search_emails tool
  console.log('🔹 3. Calling tool `search_emails` with query "atrium"...');
  const searchRes = await client.callTool({
    name: 'search_emails',
    arguments: { query: 'atrium', limit: 2 },
  });
  console.log('   ✅ Search results received:');
  console.log('   ', (searchRes.content as any)[0]?.text?.slice(0, 300).replace(/\n/g, ' '));
  console.log();

  await client.close();
  console.log('🎉 Approach 1 (Local Stdio) verified successfully!\n');
}

testLocalStdio().catch((err) => {
  console.error('❌ Stdio Test Failed:', err);
  process.exit(1);
});
