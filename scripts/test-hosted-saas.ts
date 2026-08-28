/**
 * Test Hosted SaaS Gateway (Approach 2 - Multi-Tenant Dynamic Headers)
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

async function testHostedSaasGateway() {
  console.log('🌐 Testing Approach 2: Hosted SaaS Gateway (one.mcp.xgi.io with Dynamic Headers)...\n');

  const env = loadDevVars();
  const email = env.ONECOM_EMAIL;
  const password = env.ONECOM_PASSWORD;
  const apiKey = 'xmail_s9gRHVq3IL4MWA4H_NcNmlo2PeuGTD8k';

  console.log(`📡 Gateway URL       : https://one.mcp.xgi.io`);
  console.log(`🔑 Bearer Auth Token : ${apiKey}`);
  console.log(`👤 Dynamic Tenant    : ${email} (passed via X-OneCom-Email header)\n`);

  // 1. Test Health endpoint
  console.log('🔹 1. Checking Gateway Health (/health)...');
  const healthRes = await fetch('https://one.mcp.xgi.io/health');
  const healthData = await healthRes.json<any>();
  console.log('   ✅ Health Response:', JSON.stringify(healthData));
  console.log();

  // 2. Test Dynamic Multi-Tenant Header Authentication (/api/folders)
  console.log('🔹 2. Invoking /api/folders passing dynamic tenant credentials in HTTP headers...');
  const foldersRes = await fetch('https://one.mcp.xgi.io/api/folders', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'X-OneCom-Email': email,
      'X-OneCom-Password': password,
    },
  });

  if (!foldersRes.ok) {
    const errBody = await foldersRes.text();
    throw new Error(`Hosted API returned HTTP ${foldersRes.status}: ${errBody}`);
  }

  const foldersData = await foldersRes.json<any>();
  console.log(`   ✅ Success! Gateway dynamically authenticated tenant '${email}' with one.com IMAP.`);
  console.log(`   📂 Returned ${foldersData.folders.length} folders:`);
  for (const f of foldersData.folders.slice(0, 4)) {
    console.log(`      - ${f.name} (Total: ${f.totalMessages}, Unread: ${f.unreadMessages})`);
  }
  console.log();

  // 3. Test Search over Hosted SaaS Gateway (/api/emails/search)
  console.log('🔹 3. Searching for "atrium" emails via Hosted SaaS Gateway...');
  const searchRes = await fetch('https://one.mcp.xgi.io/api/emails/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'X-OneCom-Email': email,
      'X-OneCom-Password': password,
    },
    body: JSON.stringify({
      folder: 'INBOX',
      query: 'atrium',
      limit: 2,
    }),
  });

  const searchData = await searchRes.json<any>();
  console.log(`   ✅ Search successful! Found ${searchData.total} matching messages.`);
  for (const m of searchData.emails) {
    console.log(`      - [UID ${m.uid}] ${m.date} | Subject: "${m.subject}"`);
  }
  console.log();

  console.log('🎉 Approach 2 (Hosted Multi-Tenant SaaS) verified successfully!\n');
}

testHostedSaasGateway().catch((err) => {
  console.error('❌ Hosted SaaS Test Failed:', err);
  process.exit(1);
});
