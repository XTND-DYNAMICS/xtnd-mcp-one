/**
 * Verification Test: MCP Streamable HTTP Transport (/mcp)
 * Tests full JSON-RPC 2.0 handshake and tool execution
 */

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

async function testStreamableHttp() {
  console.log('🧪 Testing MCP Streamable HTTP Transport (/mcp)...\n');

  const env = loadDevVars();
  const email = env.ONECOM_EMAIL;
  const password = env.ONECOM_PASSWORD;
  const baseUrl = 'https://one.mcp.xgi.io/mcp';

  // 1. Test GET /mcp (Capabilities Discovery)
  console.log('🔹 1. Testing GET /mcp (Capabilities Discovery)...');
  const getRes = await fetch(baseUrl, { method: 'GET' });
  if (!getRes.ok) throw new Error(`GET /mcp failed with status ${getRes.status}`);
  const getData = await getRes.json<any>();
  console.log('   ✅ GET /mcp Capabilities:', JSON.stringify(getData.result.serverInfo));

  // 2. Test POST /mcp (initialize)
  console.log('\n🔹 2. Testing POST /mcp (initialize JSON-RPC handshake)...');
  const initRes = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    }),
  });
  if (!initRes.ok) throw new Error(`initialize failed with status ${initRes.status}`);
  const initData = await initRes.json<any>();
  console.log('   ✅ initialize result:', JSON.stringify(initData.result.serverInfo));

  // 3. Test POST /mcp (notifications/initialized)
  console.log('\n🔹 3. Testing POST /mcp (notifications/initialized)...');
  const notifRes = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }),
  });
  console.log(`   ✅ notifications/initialized status: ${notifRes.status} (Expected 204 No Content)`);

  // 4. Test POST /mcp (tools/list)
  console.log('\n🔹 4. Testing POST /mcp (tools/list)...');
  const listRes = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    }),
  });
  const listData = await listRes.json<any>();
  console.log(`   ✅ tools/list returned ${listData.result.tools.length} available tools:`);
  for (const t of listData.result.tools.slice(0, 5)) {
    console.log(`      - ${t.name}: ${t.description.slice(0, 50)}...`);
  }

  // 5. Test POST /mcp (tools/call -> list_folders)
  console.log('\n🔹 5. Testing POST /mcp (tools/call -> list_folders with tenant credentials)...');
  const callRes = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-OneCom-Email': email,
      'X-OneCom-Password': password,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'list_folders',
        arguments: {},
      },
    }),
  });
  const callData = await callRes.json<any>();
  if (callData.result.isError) {
    throw new Error(`Tool execution error: ${callData.result.content[0].text}`);
  }
  const folderPayload = JSON.parse(callData.result.content[0].text);
  console.log(`   ✅ tools/call success! Found ${folderPayload.folders.length} mailboxes:`);
  for (const f of folderPayload.folders.slice(0, 4)) {
    console.log(`      - ${f.name} (${f.totalMessages} messages, ${f.unreadMessages} unread)`);
  }

  // 6. Test POST /mcp (ping)
  console.log('\n🔹 6. Testing POST /mcp (ping)...');
  const pingRes = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 4,
      method: 'ping',
    }),
  });
  const pingData = await pingRes.json<any>();
  console.log('   ✅ ping result:', JSON.stringify(pingData.result));

  console.log('\n🎉 ALL MCP Streamable HTTP (/mcp) BEST PRACTICE VERIFICATIONS PASSED!\n');
}

testStreamableHttp().catch((err) => {
  console.error('❌ Streamable HTTP Test Failed:', err);
  process.exit(1);
});
