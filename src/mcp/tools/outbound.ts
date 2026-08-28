/**
 * Outbound and Composition Tools Implementation
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OneMailClient } from '../../core/client.js';
import { CreateDraftSchema, ForwardEmailSchema, ReplyEmailSchema, SendEmailSchema } from '../schemas.js';

export function registerOutboundTools(server: McpServer, getClient: () => OneMailClient) {
  server.tool(
    'send_email',
    'Send a new outbound email via one.com SMTP server (send.one.com:465 implicit TLS). Automatically saves a copy to Sent folder.',
    SendEmailSchema.shape,
    async (args) => {
      try {
        const client = getClient();
        const result = await client.sendEmail(args);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, message: `Email sent successfully`, messageId: result.messageId }, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Error sending email: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'reply_email',
    'Reply to an existing email. Handles In-Reply-To, References, and quoted text formatting.',
    ReplyEmailSchema.shape,
    async (args) => {
      try {
        const client = getClient();
        const result = await client.replyEmail(args.folder, args.uid, args.bodyText, args.bodyHtml, args.replyAll);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, message: `Reply sent successfully`, messageId: result.messageId }, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Error sending reply: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'forward_email',
    'Forward an existing email to new recipients with original headers.',
    ForwardEmailSchema.shape,
    async (args) => {
      try {
        const client = getClient();
        const result = await client.forwardEmail(args.folder, args.uid, args.to, args.comment);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, message: `Email forwarded successfully`, messageId: result.messageId }, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Error forwarding email: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'create_draft',
    'Create an email draft in the one.com Drafts folder without sending.',
    CreateDraftSchema.shape,
    async (args) => {
      try {
        const client = getClient();
        const result = await client.createDraft(args);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, message: `Draft saved to Drafts folder`, result }, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Error saving draft: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
