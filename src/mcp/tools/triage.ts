/**
 * Triage and Management Tools Implementation
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OneMailClient } from '../../core/client.js';
import { DeleteEmailsSchema, MarkEmailsSchema, MoveEmailsSchema } from '../schemas.js';

export function registerTriageTools(server: McpServer, getClient: () => OneMailClient) {
  server.tool(
    'mark_emails',
    'Mark one or multiple emails as read, unread, flagged (starred), or unflagged.',
    MarkEmailsSchema.shape,
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

  server.tool(
    'move_emails',
    'Move one or multiple emails from a source folder to a destination folder (e.g. Archive, Work, Projects).',
    MoveEmailsSchema.shape,
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

  server.tool(
    'delete_emails',
    'Delete emails by moving them to Trash (soft delete) or permanently expunging them.',
    DeleteEmailsSchema.shape,
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
