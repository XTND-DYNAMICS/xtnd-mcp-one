/**
 * Search Tools Implementation
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OneMailClient } from '../../core/client.js';
import { GetRecentEmailsSchema, SearchEmailsSchema } from '../schemas.js';

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export function registerSearchTools(server: McpServer, getClient: () => OneMailClient) {
  server.registerTool(
    'search_emails',
    {
      description: 'Search for emails in one.com mailbox using filters (query, from, to, subject, date range, unread/flagged flags).',
      inputSchema: SearchEmailsSchema.shape,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (args) => {
      try {
        const client = getClient();
        const result = await client.searchEmails(args);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Error searching emails: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'get_recent_emails',
    {
      description: 'Retrieve the most recent emails from a mailbox folder with envelope headers and unread status.',
      inputSchema: GetRecentEmailsSchema.shape,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (args) => {
      try {
        const client = getClient();
        const result = await client.getRecentEmails(args.folder, args.limit);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Error fetching recent emails: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
