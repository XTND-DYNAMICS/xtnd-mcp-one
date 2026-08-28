/**
 * Read and Thread Tools Implementation
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OneMailClient } from '../../core/client.js';
import { truncateForAI } from '../../core/parser/markdown.js';
import { GetEmailContentSchema, GetEmailThreadSchema } from '../schemas.js';

export function registerReadTools(server: McpServer, getClient: () => OneMailClient) {
  server.tool(
    'get_email_content',
    'Fetch full email content by UID from a folder. Body is converted to clean Markdown by default to optimize token usage.',
    GetEmailContentSchema.shape,
    async (args) => {
      try {
        const client = getClient();
        const email = await client.getEmailContent(args.folder, args.uid);

        let selectedBody = email.bodyMarkdown || email.bodyText || '';
        if (args.format === 'html' && email.bodyHtml) {
          selectedBody = email.bodyHtml;
        } else if (args.format === 'text' && email.bodyText) {
          selectedBody = email.bodyText;
        }

        const { text: truncatedBody, truncated } = truncateForAI(selectedBody, 15000);

        const responsePayload = {
          uid: email.uid,
          messageId: email.messageId,
          subject: email.subject,
          from: email.from,
          to: email.to,
          cc: email.cc,
          date: email.date,
          flags: email.flags,
          hasAttachments: email.hasAttachments,
          attachments: email.attachments?.map((a) => ({
            filename: a.filename,
            contentType: a.contentType,
            size: a.size,
          })),
          bodyFormat: args.format,
          truncated,
          body: truncatedBody,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(responsePayload, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Error reading email ${args.uid}: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'get_email_thread',
    'Retrieve the full conversation thread for a given email UID or Message-ID.',
    GetEmailThreadSchema.shape,
    async (args) => {
      try {
        const client = getClient();
        const thread = await client.getEmailThread(args.folder, args.uidOrMessageId);

        const formattedThread = thread.map((m) => ({
          uid: m.uid,
          messageId: m.messageId,
          from: m.from,
          to: m.to,
          date: m.date,
          subject: m.subject,
          snippet: truncateForAI(m.bodyMarkdown || m.bodyText || '', 500).text,
        }));

        return {
          content: [{ type: 'text', text: JSON.stringify({ count: thread.length, thread: formattedThread }, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Error fetching thread for '${args.uidOrMessageId}': ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
