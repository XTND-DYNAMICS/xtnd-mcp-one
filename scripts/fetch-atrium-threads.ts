/**
 * Fetch Atrium email threads
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { OneMailClient } from '../src/core/client.js';

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

async function main() {
  const env = loadDevVars();
  const client = new OneMailClient({
    email: env.ONECOM_EMAIL,
    password: env.ONECOM_PASSWORD,
    imapHost: env.ONECOM_IMAP_HOST || 'imap.one.com',
    imapPort: parseInt(env.ONECOM_IMAP_PORT || '993', 10),
    smtpHost: env.ONECOM_SMTP_HOST || 'send.one.com',
    smtpPort: parseInt(env.ONECOM_SMTP_PORT || '465', 10),
  });

  console.log('🔍 Discovering mailboxes on one.com...');
  const folders = await client.listFolders();
  console.log(`📂 Available folders: ${folders.map((f) => f.name).join(', ')}\n`);

  const allEmails: any[] = [];

  for (const f of folders) {
    // Search each folder that has messages
    if (f.totalMessages && f.totalMessages > 0) {
      try {
        const res = await client.searchEmails({ folder: f.name, query: 'atrium' });
        if (res.emails.length > 0) {
          console.log(`   Found ${res.emails.length} match(es) in folder '${f.name}'`);
          allEmails.push(...res.emails.map((e) => ({ ...e, folder: f.name })));
        }
      } catch (err: any) {
        // Skip errors on special namespaces
      }
    }
  }

  // Also search for sender/recipient domains @atriumcph.com or @atrium.dk
  for (const f of folders) {
    if (f.totalMessages && f.totalMessages > 0) {
      try {
        const res = await client.searchEmails({ folder: f.name, from: 'atriumcph.com' });
        for (const e of res.emails) {
          if (!allEmails.some((x) => x.uid === e.uid && x.folder === f.name)) {
            allEmails.push({ ...e, folder: f.name });
          }
        }
      } catch (err) {}
    }
  }

  console.log(`\n📬 Total Atrium-related emails found: ${allEmails.length}\n`);

  // Group emails by normalized subject / thread
  const threads = new Map<string, typeof allEmails>();

  for (const email of allEmails) {
    const normalizedSubject = email.subject.replace(/^(?:(?:Re|Fwd|SV|Vs):\s*)+/gi, '').trim().toLowerCase();
    if (!threads.has(normalizedSubject)) {
      threads.set(normalizedSubject, []);
    }
    threads.get(normalizedSubject)!.push(email);
  }

  let threadIdx = 1;
  for (const [topic, messages] of threads.entries()) {
    console.log(`======================================================================`);
    console.log(`🧵 Thread #${threadIdx++}: "${messages[0].subject}" (${messages.length} message${messages.length > 1 ? 's' : ''})`);
    console.log(`======================================================================`);

    // Sort chronologically
    messages.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    for (const msg of messages) {
      console.log(`  ✉️ [${msg.folder}] UID: ${msg.uid} | Date: ${msg.date}`);
      console.log(`     From: ${msg.from.map((f: any) => `${f.name ? f.name + ' ' : ''}<${f.address}>`).join(', ')}`);
      console.log(`     To  : ${msg.to.map((t: any) => `${t.name ? t.name + ' ' : ''}<${t.address}>`).join(', ')}`);
      if (msg.cc && msg.cc.length > 0) {
        console.log(`     Cc  : ${msg.cc.map((c: any) => `${c.name ? c.name + ' ' : ''}<${c.address}>`).join(', ')}`);
      }
      console.log(`     Subject: ${msg.subject}`);
      console.log(`     Flags: [${msg.flags.join(', ')}]`);

      try {
        const detail = await client.getEmailContent(msg.folder, msg.uid);
        const rawContent = detail.bodyMarkdown || detail.bodyText || '';
        const bodyPreview = rawContent.slice(0, 400).replace(/\n\s*\n/g, '\n     > ').replace(/\n/g, '\n     > ');
        console.log(`     Content:`);
        console.log(`     > ${bodyPreview}...`);
      } catch (err: any) {
        console.log(`     (Could not fetch body: ${err.message})`);
      }
      console.log();
    }
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
