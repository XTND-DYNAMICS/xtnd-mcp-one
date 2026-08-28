/**
 * Search Tools Implementation
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OneMailClient } from '../../core/client.js';
import { GetRecentEmailsSchema, SearchEmailsSchema } from '../schemas.js';

export function registerSearchTools(server: McpServer, getClient: () => OneMailClient) {
  server.tool(
    'search_emails',
    'Search for emails in one.com mailbox using filters (query, from, to, subject, date range, unread/flagged flags).',
    SearchEmailsSchema.shape,
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

  server.tool(
    'get_recent_emails',
    'Retrieve the most recent emails from a mailbox folder with envelope headers and unread status.',
    GetRecentEmailsSchema.shape,
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
