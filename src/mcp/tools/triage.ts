/**
 * Triage and Management Tools Implementation
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OneMailClient } from '../../core/client.js';
import { DeleteEmailsSchema, MarkEmailsSchema, MoveEmailsSchema } from '../schemas.js';

export function registerTriageTools(server: McpServer, getClient: () => OneMailClient) {
  server.registerTool(
    'mark_emails',
    {
      description: 'Mark one or multiple emails as read, unread, flagged (starred), or unflagged.',
      inputSchema: MarkEmailsSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const client = getClient();
        const result = await client.markEmails(args.folder, args.uids, args.action);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Error updating flags: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'move_emails',
    {
      description: 'Move one or multiple emails from a source folder to a destination folder (e.g. Archive, Work, Projects).',
      inputSchema: MoveEmailsSchema.shape,
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
        const result = await client.moveEmails(args.sourceFolder, args.targetFolder, args.uids);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Error moving emails: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'delete_emails',
    {
      description: 'Delete emails by moving them to Trash (soft delete) or permanently expunging them.',
      inputSchema: DeleteEmailsSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const client = getClient();
        const result = await client.deleteEmails(args.folder, args.uids, args.permanent);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Error deleting emails: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
