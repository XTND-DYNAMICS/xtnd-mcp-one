/**
 * Supreme MCP Server Factory for @xtnd-dynamics/mcp-one
 * Implements Tools (15), Prompts (4), and Resources (4) per MCP 2024-11-05+ Specs
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
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
    version: '0.1.3',
  });

  // 1. Register all 15 Core Tools
  registerFolderTools(server, getClient);
  registerSearchTools(server, getClient);
  registerReadTools(server, getClient);
  registerTriageTools(server, getClient);
  registerOutboundTools(server, getClient);

  // 2. Register Dynamic & Static MCP Resources
  server.resource(
    'folders',
    'one://folders',
    {
      description: 'Live catalog of all mailbox folders with real-time total and unread message counts.',
      mimeType: 'application/json',
    },
    async () => {
      try {
        const client = getClient();
        const folders = await client.listFolders();
        return {
          contents: [
            {
              uri: 'one://folders',
              mimeType: 'application/json',
              text: JSON.stringify({ count: folders.length, folders }, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          contents: [
            {
              uri: 'one://folders',
              mimeType: 'application/json',
              text: JSON.stringify({ error: err.message }),
            },
          ],
        };
      }
    }
  );

  server.resource(
    'status',
    'one://status',
    {
      description: 'Connection state and active mailbox capabilities for one.com gateway.',
      mimeType: 'application/json',
    },
    async () => {
      return {
        contents: [
          {
            uri: 'one://status',
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                service: '@xtnd-dynamics/mcp-one',
                version: '0.1.3',
                protocolVersion: '2024-11-05',
                imap: { host: 'imap.one.com', port: 993, tls: true },
                smtp: { host: 'send.one.com', port: 465, tls: true },
                toolsCount: 15,
                promptsCount: 4,
                resourcesCount: 4,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.resource(
    'meeting-followup-template',
    'one://templates/meeting-followup',
    {
      description: 'Standard template for professional post-meeting summaries and action items.',
      mimeType: 'text/markdown',
    },
    async () => ({
      contents: [
        {
          uri: 'one://templates/meeting-followup',
          mimeType: 'text/markdown',
          text: `# Meeting Summary: [Topic]

**Date:** [Date]
**Attendees:** [Names]

### Key Discussion Points
- [Point 1]
- [Point 2]

### Agreed Decisions
- [Decision 1]

### Action Items
- [ ] **[Owner]**: [Task description] (Due: [Date])
- [ ] **[Owner]**: [Task description] (Due: [Date])

Best regards,  
[Your Name]`,
        },
      ],
    })
  );

  server.resource(
    'out-of-office-template',
    'one://templates/out-of-office',
    {
      description: 'Standard template for out-of-office auto-responses.',
      mimeType: 'text/markdown',
    },
    async () => ({
      contents: [
        {
          uri: 'one://templates/out-of-office',
          mimeType: 'text/markdown',
          text: `Thank you for reaching out. I am currently out of the office with limited access to email until [Return Date].

For urgent matters, please contact [Colleague Name] at [Colleague Email].

Best regards,  
[Your Name]`,
        },
      ],
    })
  );

  // 3. Register Workflow Prompts (4 High-Value AI Assistants)

  // Prompt 1: Triage Inbox
  server.prompt(
    'triage-inbox',
    'Inspect recent unread emails, prioritize into categories, and recommend triage actions.',
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
2. For important emails, read their full context with get_email_content.
3. Categorize them into Urgent, Action Required, Informational, and Newsletters/Spam.
4. Suggest reply drafts or archive/move actions for each.`,
            },
          },
        ],
      };
    }
  );

  // Prompt 2: Draft Context-Aware Reply
  server.prompt(
    'draft-reply',
    'Analyze an email thread and draft a professional, contextual reply.',
    {
      uid: z.string().describe('The UID of the email to reply to'),
      tone: z.string().optional().describe('Tone of the reply: professional, friendly, concise, assertive (default: professional)'),
    },
    async (args) => {
      const tone = args.tone || 'professional';
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please draft a reply to email UID ${args.uid}:
1. Fetch the full email content with get_email_content({ uid: ${args.uid} }).
2. Check the thread history with get_email_thread if needed.
3. Draft a response with a ${tone} tone addressing all questions asked in the email.
4. Call create_draft or present the reply draft for my review.`,
            },
          },
        ],
      };
    }
  );

  // Prompt 3: Clean Spam & Newsletters
  server.prompt(
    'clean-inbox',
    'Detect marketing newsletters, automated alerts, and clutter, offering bulk cleanup actions.',
    {
      folder: z.string().optional().describe('Folder to scan (default: INBOX)'),
    },
    async (args) => {
      const folder = args.folder || 'INBOX';
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please scan my ${folder} for clutter and newsletters:
1. Fetch the most recent 30 emails with get_recent_emails({ folder: '${folder}', limit: 30 }).
2. Identify marketing newsletters, promotional emails, and automated notifications.
3. List the candidates with sender and subject.
4. Ask for my confirmation before archiving or deleting them using move_emails or delete_emails.`,
            },
          },
        ],
      };
    }
  );

  // Prompt 4: Executive Daily Briefing
  server.prompt(
    'executive-briefing',
    'Generate a high-density executive summary of all emails received today with action item tracker.',
    {},
    async () => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please generate an Executive Briefing of my one.com mailbox:
1. Search for all emails received in the last 24 hours with search_emails({ folder: 'INBOX', limit: 25 }).
2. Read the body of VIP and client emails with get_email_content.
3. Create a structured markdown summary:
   - 🔴 **Urgent / Blockers**
   - 🟡 **Pending Decisions Required from Me**
   - 🟢 **FYI / Completed Updates**
   - 📋 **Consolidated Action Item Checklist**`,
            },
          },
        ],
      };
    }
  );

  return server;
}
