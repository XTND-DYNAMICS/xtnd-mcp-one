/**
 * Live Smoke Test for one.com (stejle.dk) Mail Account
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { OneMailClient } from '../src/core/client.js';
import { EdgeSmtpClient } from '../src/core/smtp/client.js';

// Load .dev.vars manually for local node execution
function loadDevVars(): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as any;
  const devVarsPath = resolve(process.cwd(), '.dev.vars');

  if (existsSync(devVarsPath)) {
    const lines = readFileSync(devVarsPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        env[key] = val;
      }
    }
  }

  return env;
}

async function runLiveSmokeTest() {
  console.log('🚀 Starting live one.com smoke test for xtnd-mcp-one...\n');

  const env = loadDevVars();
  const email = env.ONECOM_EMAIL;
  const password = env.ONECOM_PASSWORD;
  const imapHost = env.ONECOM_IMAP_HOST || 'imap.one.com';
  const imapPort = parseInt(env.ONECOM_IMAP_PORT || '993', 10);
  const smtpHost = env.ONECOM_SMTP_HOST || 'send.one.com';
  const smtpPort = parseInt(env.ONECOM_SMTP_PORT || '465', 10);

  if (!email || !password) {
    console.error('❌ Error: ONECOM_EMAIL and ONECOM_PASSWORD must be configured in .dev.vars');
    process.exit(1);
  }

  console.log(`📧 Target Account : ${email}`);
  console.log(`📥 IMAP Endpoint  : ${imapHost}:${imapPort} (implicit TLS)`);
  console.log(`📤 SMTP Endpoint  : ${smtpHost}:${smtpPort} (implicit TLS)\n`);

  const client = new OneMailClient({
    email,
    password,
    imapHost,
    imapPort,
    smtpHost,
    smtpPort,
  });

  try {
    // 1. Test IMAP Login & Folder Listing
    console.log('🔹 1. Connecting to IMAP & Listing Folders...');
    const folders = await client.listFolders();
    console.log(`   ✅ Success! Found ${folders.length} folders:`);
    for (const f of folders) {
      console.log(`      - ${f.name} (Total: ${f.totalMessages ?? '?'}, Unread: ${f.unreadMessages ?? '?'})`);
    }
    console.log();

    // 2. Test INBOX Search / Recent Emails
    console.log('🔹 2. Inspecting INBOX recent emails...');
    const recent = await client.getRecentEmails('INBOX', 5);
    console.log(`   ✅ Success! Retrieved ${recent.emails.length} recent messages (Total in query: ${recent.count}):`);
    for (const m of recent.emails) {
      console.log(`      - [UID ${m.uid}] ${m.date} | From: ${m.from[0]?.address || 'unknown'} | Subject: "${m.subject}"`);
    }
    console.log();

    // 3. Test Full Email Fetch & Markdown Parsing if emails exist
    if (recent.emails.length > 0) {
      const sampleUid = recent.emails[0].uid;
      console.log(`🔹 3. Fetching full content for sample email UID ${sampleUid}...`);
      const detail = await client.getEmailContent('INBOX', sampleUid);
      console.log(`   ✅ Success! Message-ID: ${detail.messageId}`);
      console.log(`   📝 Parsed Markdown snippet (first 200 chars):`);
      const snippet = (detail.bodyMarkdown || detail.bodyText || '(empty)').slice(0, 200).replace(/\n/g, ' ');
      console.log(`      "${snippet}..."`);
      console.log();
    } else {
      console.log('🔹 3. INBOX is currently empty, skipping sample email body read.\n');
    }

    // 4. Test SMTP TLS Connection & Authentication
    console.log('🔹 4. Testing SMTPS (Port 465) Connection & AUTH LOGIN...');
    const smtp = new EdgeSmtpClient({
      email,
      password,
      smtpHost,
      smtpPort,
    });
    // Just verify connection & auth handshake
    await smtp.connect();
    console.log('   ✅ Success! SMTPS TLS handshake and credentials accepted by send.one.com.\n');

    console.log('🎉 All live smoke tests passed successfully!');
  } catch (err: any) {
    console.error('❌ Live smoke test failed with error:', err);
    process.exit(1);
  }
}

runLiveSmokeTest();
