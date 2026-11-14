/**
 * Outbound and Composition Tools Implementation
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OneMailClient } from '../../core/client.js';
import { CreateDraftSchema, ForwardEmailSchema, ReplyEmailSchema, SendEmailSchema } from '../schemas.js';

const OUTBOUND_SEND_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
} as const;

export function registerOutboundTools(server: McpServer, getClient: () => OneMailClient) {
  server.registerTool(
    'send_email',
    {
      description: 'Send a new outbound email via one.com SMTP server (send.one.com:465 implicit TLS). Automatically saves a copy to Sent folder.',
      inputSchema: SendEmailSchema.shape,
      annotations: OUTBOUND_SEND_ANNOTATIONS,
    },
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

  server.registerTool(
    'reply_email',
    {
      description: 'Reply to an existing email. Handles In-Reply-To, References, and quoted text formatting.',
      inputSchema: ReplyEmailSchema.shape,
      annotations: OUTBOUND_SEND_ANNOTATIONS,
    },
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

  server.registerTool(
    'forward_email',
    {
      description: 'Forward an existing email to new recipients with original headers.',
      inputSchema: ForwardEmailSchema.shape,
      annotations: OUTBOUND_SEND_ANNOTATIONS,
    },
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

  server.registerTool(
    'create_draft',
    {
      description: 'Create an email draft in the one.com Drafts folder without sending.',
      inputSchema: CreateDraftSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
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
