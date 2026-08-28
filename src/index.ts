/**
 * @xtnd/mcp-one Library Exports
 */

export * from './types.js';
export { OneMailClient } from './core/client.js';
export { EdgeImapClient } from './core/imap/client.js';
export { EdgeSmtpClient } from './core/smtp/client.js';
export { composeMimeMessage } from './core/smtp/mime.js';
export { parseRfc822, parseHeaders, parseAddressList } from './core/parser/mime-parser.js';
export { htmlToMarkdown, truncateForAI } from './core/parser/markdown.js';
export { createOneMcpServer } from './mcp/server.js';
