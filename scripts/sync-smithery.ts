/**
 * Automated Smithery Registry Synchronizer
 * Syncs metadata, description, icon, repository, and homepage directly to Smithery API
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv(): Record<string, string> {
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

async function syncSmithery() {
  console.log('🔄 Syncing server metadata with Smithery Registry API...\n');

  const env = loadEnv();
  const apiKey = env.SMITHERY_API_KEY || process.env.SMITHERY_API_KEY;

  const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));
  const serverQualifiedName = 'xtnd/mcp-one';
  const targetUrl = `https://api.smithery.ai/servers/${encodeURIComponent(serverQualifiedName)}`;

  const payload = {
    displayName: 'XTND | MCP | ONE',
    description: pkg.description,
    homepage: 'https://github.com/XTND-DYNAMICS/xtnd-mcp-one#readme',
    repositoryUrl: 'https://github.com/XTND-DYNAMICS/xtnd-mcp-one',
    iconUrl: 'https://raw.githubusercontent.com/XTND-DYNAMICS/xtnd-mcp-one/main/assets/icon.svg',
    license: pkg.license || 'MIT',
    unlisted: false,
  };

  console.log(`📡 Target Endpoint : ${targetUrl}`);
  console.log(`📝 Display Name    : ${payload.displayName}`);
  console.log(`📄 Description     : ${payload.description}`);
  console.log(`🖼️ Icon URL        : ${payload.iconUrl}`);
  console.log(`🐙 Repository      : ${payload.repositoryUrl}`);
  console.log(`🌐 Homepage        : ${payload.homepage}\n`);

  if (!apiKey) {
    console.log('⚠️  SMITHERY_API_KEY is not set in environment or GitHub Secrets.');
    console.log('👉 Get a free API key at: https://smithery.ai/account/api-keys');
    console.log('   Once set, GitHub Actions will sync this automatically on every release!\n');
    return;
  }

  const res = await fetch(targetUrl, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Smithery API returned HTTP ${res.status}: ${errText}`);
  }

  const result = await res.json<any>();
  console.log('✅ Success! Smithery server metadata updated:', JSON.stringify(result, null, 2));
}

syncSmithery().catch((err) => {
  console.error('❌ Smithery Sync Failed:', err.message);
  process.exit(1);
});
