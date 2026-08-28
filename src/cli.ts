/**
 * CLI Entrypoint for Local Stdio Transport (npx @xtnd/mcp-one)
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { OneMailClient } from './core/client.js';
import { createOneMcpServer } from './mcp/server.js';
import { MailboxCredentials } from './types.js';

async function runStdioCli() {
  const email = process.env.ONECOM_EMAIL;
  const password = process.env.ONECOM_PASSWORD;
  const imapHost = process.env.ONECOM_IMAP_HOST || 'imap.one.com';
  const imapPort = parseInt(process.env.ONECOM_IMAP_PORT || '993', 10);
  const smtpHost = process.env.ONECOM_SMTP_HOST || 'send.one.com';
  const smtpPort = parseInt(process.env.ONECOM_SMTP_PORT || '465', 10);

  if (!email || !password) {
    console.error('Error: ONECOM_EMAIL and ONECOM_PASSWORD environment variables must be set.');
    process.exit(1);
  }

  const credentials: MailboxCredentials = {
    email,
    password,
    imapHost,
    imapPort,
    smtpHost,
    smtpPort,
  };

  const getClient = () => new OneMailClient(credentials);
  const server = createOneMcpServer(getClient);
  const transport = new StdioServerTransport();

  await server.connect(transport);
}

runStdioCli().catch((err) => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
