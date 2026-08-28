/**
 * MCP Server Factory
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OneMailClient } from '../core/client.js';
import { registerFolderTools } from './tools/folders.js';
import { registerSearchTools } from './tools/search.js';
import { registerReadTools } from './tools/read.js';
import { registerTriageTools } from './tools/triage.js';
import { registerOutboundTools } from './tools/outbound.js';
import { z } from 'zod';

export function createOneMcpServer(getClient: () => OneMailClient): McpServer {
  const server = new McpServer({
    name: '@xtnd-dynamics/mcp-one',
    version: '0.1.2',
  });

  registerFolderTools(server, getClient);
  registerSearchTools(server, getClient);
  registerReadTools(server, getClient);
  registerTriageTools(server, getClient);
  registerOutboundTools(server, getClient);

  // Register workflow prompt: Triage Inbox
  server.prompt(
    'triage-inbox',
    'Workflow prompt to inspect recent unread emails, summarize key messages, and suggest triage actions.',
    {
      limit: z.string().optional().describe('Maximum number of unread emails to inspect (default: 10)'),
    },
    async (args) => {
      const limit = args.limit ? parseInt(args.limit, 10) : 10;
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please triage my one.com inbox:
1. Fetch up to ${limit} unread emails using search_emails({ unreadOnly: true, limit: ${limit} }).
2. For important emails, read their summary with get_email_content.
3. Categorize them into Urgent, Action Required, Informational, and Newsletters/Spam.
4. Suggest reply drafts or archive/move actions for each.`,
            },
          },
        ],
      };
    }
  );

  return server;
}
