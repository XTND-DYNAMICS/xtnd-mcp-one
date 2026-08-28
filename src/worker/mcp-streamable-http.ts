/**
 * Streamable HTTP Transport Handler for /mcp
 * Compliant with MCP 2024-11-05+ JSON-RPC Streamable HTTP Specifications
 */

import { OneMailClient } from '../core/client.js';
import { MailboxCredentials, WorkerEnv } from '../types.js';
import { extractCredentialsFromRequest, handleSseConnect } from './sse-handler.js';

const SERVER_INFO = {
  name: '@xtnd-dynamics/mcp-one',
  version: '0.1.2',
};

const PROTOCOL_VERSION = '2024-11-05';

export async function handleMcpStreamableHttp(
  request: Request,
  env: WorkerEnv
): Promise<Response> {
  const url = new URL(request.url);

  // 1. GET requests: If client requests SSE stream or discovery
  if (request.method === 'GET') {
    const accept = request.headers.get('Accept') || '';
    if (accept.includes('text/event-stream')) {
      return handleSseConnect(request, env);
    }

    // Server capabilities discovery response
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {
            tools: { listChanged: false },
            prompts: { listChanged: false },
          },
          serverInfo: SERVER_INFO,
        },
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }

  // 2. POST requests: JSON-RPC request handling
  if (request.method === 'POST') {
    let payload: any;
    try {
      payload = await request.json();
    } catch {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error: Invalid JSON' },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const { id, method, params } = payload || {};

    // Notifications return 204
    if (method === 'notifications/initialized' || method?.startsWith('notifications/')) {
      return new Response(null, {
        status: 204,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Method: initialize
    if (method === 'initialize') {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {
              tools: { listChanged: false },
              prompts: { listChanged: false },
            },
            serverInfo: SERVER_INFO,
          },
        }),
        { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Method: ping
    if (method === 'ping') {
      return new Response(
        JSON.stringify({ jsonrpc: '2.0', id, result: {} }),
        { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Method: tools/list
    if (method === 'tools/list') {
      const tools = getToolDefinitions();
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: { tools },
        }),
        { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Method: prompts/list
    if (method === 'prompts/list') {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: {
            prompts: [
              {
                name: 'triage-inbox',
                description: 'Triage and summarize recent emails in your INBOX.',
                arguments: [
                  {
                    name: 'limit',
                    description: 'Number of recent emails to review (default: 10)',
                    required: false,
                  },
                ],
              },
            ],
          },
        }),
        { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Method: tools/call
    if (method === 'tools/call') {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};

      const credentials = extractCredentialsFromRequest(request, env);
      if (!credentials.email || !credentials.password) {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: 'Error: Missing mailbox credentials. Pass X-OneCom-Email and X-OneCom-Password headers.',
                },
              ],
              isError: true,
            },
          }),
          { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
      }

      const client = new OneMailClient(credentials);
      try {
        const result = await executeTool(client, toolName, toolArgs);
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
              isError: false,
            },
          }),
          { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: `Tool Error: ${err.message}` }],
              isError: true,
            },
          }),
          { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
      }
    }

    // Unknown method
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method '${method}' not found` },
      }),
      { status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }

  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getToolDefinitions() {
  return [
    {
      name: 'list_folders',
      description: 'List all mailboxes/folders in the one.com mail account with message and unread counts.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'create_folder',
      description: 'Create a new folder or mailbox in the one.com mail account.',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string', description: 'Folder name to create' } },
        required: ['name'],
      },
    },
    {
      name: 'rename_folder',
      description: 'Rename an existing mailbox/folder.',
      inputSchema: {
        type: 'object',
        properties: {
          oldName: { type: 'string', description: 'Current folder name' },
          newName: { type: 'string', description: 'New folder name' },
        },
        required: ['oldName', 'newName'],
      },
    },
    {
      name: 'delete_folder',
      description: 'Delete a folder/mailbox from the one.com mail account.',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string', description: 'Folder name to delete' } },
        required: ['name'],
      },
    },
    {
      name: 'search_emails',
      description: 'Search for emails in one.com mailbox using filters (query, folder, sender, recipient, flags).',
      inputSchema: {
        type: 'object',
        properties: {
          folder: { type: 'string', default: 'INBOX' },
          query: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' },
          subject: { type: 'string' },
          unreadOnly: { type: 'boolean' },
          limit: { type: 'number', default: 20 },
        },
      },
    },
    {
      name: 'get_recent_emails',
      description: 'Retrieve the most recent emails from a mailbox folder with envelopes.',
      inputSchema: {
        type: 'object',
        properties: {
          folder: { type: 'string', default: 'INBOX' },
          limit: { type: 'number', default: 10 },
        },
      },
    },
    {
      name: 'get_email_content',
      description: 'Fetch full email content by UID from a folder. Body is converted to clean Markdown.',
      inputSchema: {
        type: 'object',
        properties: {
          folder: { type: 'string', default: 'INBOX' },
          uid: { type: 'number' },
        },
        required: ['folder', 'uid'],
      },
    },
    {
      name: 'get_email_thread',
      description: 'Retrieve the full conversation thread for a given email UID or Message-ID.',
      inputSchema: {
        type: 'object',
        properties: {
          folder: { type: 'string', default: 'INBOX' },
          uidOrMessageId: { type: 'string' },
        },
        required: ['folder', 'uidOrMessageId'],
      },
    },
    {
      name: 'mark_emails',
      description: 'Mark emails as read, unread, flagged, or unflagged.',
      inputSchema: {
        type: 'object',
        properties: {
          folder: { type: 'string', default: 'INBOX' },
          uids: { type: 'array', items: { type: 'number' } },
          action: { type: 'string', enum: ['read', 'unread', 'flag', 'unflag'] },
        },
        required: ['folder', 'uids', 'action'],
      },
    },
    {
      name: 'move_emails',
      description: 'Move emails from a source folder to a destination folder.',
      inputSchema: {
        type: 'object',
        properties: {
          sourceFolder: { type: 'string', default: 'INBOX' },
          targetFolder: { type: 'string' },
          uids: { type: 'array', items: { type: 'number' } },
        },
        required: ['sourceFolder', 'targetFolder', 'uids'],
      },
    },
    {
      name: 'delete_emails',
      description: 'Delete emails by moving them to Trash (soft delete) or permanent expunge.',
      inputSchema: {
        type: 'object',
        properties: {
          folder: { type: 'string', default: 'INBOX' },
          uids: { type: 'array', items: { type: 'number' } },
          permanent: { type: 'boolean', default: false },
        },
        required: ['folder', 'uids'],
      },
    },
    {
      name: 'send_email',
      description: 'Send a new outbound email via one.com SMTP server (send.one.com:465).',
      inputSchema: {
        type: 'object',
        properties: {
          to: { type: 'string' },
          subject: { type: 'string' },
          bodyText: { type: 'string' },
          bodyHtml: { type: 'string' },
        },
        required: ['to', 'subject', 'bodyText'],
      },
    },
    {
      name: 'reply_email',
      description: 'Reply to an existing email with automated In-Reply-To and References headers.',
      inputSchema: {
        type: 'object',
        properties: {
          folder: { type: 'string', default: 'INBOX' },
          uid: { type: 'number' },
          bodyText: { type: 'string' },
          replyAll: { type: 'boolean', default: false },
        },
        required: ['folder', 'uid', 'bodyText'],
      },
    },
    {
      name: 'forward_email',
      description: 'Forward an existing email to new recipients with original header context.',
      inputSchema: {
        type: 'object',
        properties: {
          folder: { type: 'string', default: 'INBOX' },
          uid: { type: 'number' },
          to: { type: 'string' },
          comment: { type: 'string' },
        },
        required: ['folder', 'uid', 'to'],
      },
    },
    {
      name: 'create_draft',
      description: 'Create an email draft in the one.com Drafts folder without sending.',
      inputSchema: {
        type: 'object',
        properties: {
          to: { type: 'string' },
          subject: { type: 'string' },
          bodyText: { type: 'string' },
        },
        required: ['to', 'subject', 'bodyText'],
      },
    },
  ];
}

async function executeTool(client: OneMailClient, name: string, args: any): Promise<any> {
  switch (name) {
    case 'list_folders':
      return { folders: await client.listFolders() };
    case 'create_folder':
      return { success: await client.createFolder(args.name) };
    case 'rename_folder':
      return { success: await client.renameFolder(args.oldName, args.newName) };
    case 'delete_folder':
      return { success: await client.deleteFolder(args.name) };
    case 'search_emails':
      return await client.searchEmails(args);
    case 'get_recent_emails':
      return await client.getRecentEmails(args.folder || 'INBOX', args.limit || 10);
    case 'get_email_content':
      return await client.getEmailContent(args.folder || 'INBOX', args.uid);
    case 'get_email_thread':
      return { thread: await client.getEmailThread(args.folder || 'INBOX', args.uidOrMessageId) };
    case 'mark_emails':
      return { success: await client.markEmails(args.folder || 'INBOX', args.uids, args.action) };
    case 'move_emails':
      return { success: await client.moveEmails(args.sourceFolder || 'INBOX', args.targetFolder, args.uids) };
    case 'delete_emails':
      return { success: await client.deleteEmails(args.folder || 'INBOX', args.uids, args.permanent || false) };
    case 'send_email':
      return await client.sendEmail(args);
    case 'reply_email':
      return await client.replyEmail(args.folder || 'INBOX', args.uid, args.bodyText, args.bodyHtml, args.replyAll);
    case 'forward_email':
      return await client.forwardEmail(args.folder || 'INBOX', args.uid, args.to, args.comment);
    case 'create_draft':
      return await client.createDraft(args);
    default:
      throw new Error(`Unknown tool name: ${name}`);
  }
}
