/**
 * Folder Tools Implementation
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OneMailClient } from '../../core/client.js';
import { CreateFolderSchema, DeleteFolderSchema, ListFoldersSchema, RenameFolderSchema } from '../schemas.js';

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const FOLDER_MUTATION_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

const DESTRUCTIVE_FOLDER_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
} as const;

export function registerFolderTools(server: McpServer, getClient: () => OneMailClient) {
  server.registerTool(
    'list_folders',
    {
      description: 'List all mailboxes/folders in the one.com mail account with total and unread message counts.',
      inputSchema: ListFoldersSchema.shape,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async () => {
      try {
        const client = getClient();
        const folders = await client.listFolders();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ count: folders.length, folders }, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Error listing folders: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'create_folder',
    {
      description: 'Create a new folder or mailbox in the one.com mail account.',
      inputSchema: CreateFolderSchema.shape,
      annotations: FOLDER_MUTATION_ANNOTATIONS,
    },
    async (args) => {
      try {
        const client = getClient();
        const result = await client.createFolder(args.name);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Error creating folder '${args.name}': ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'rename_folder',
    {
      description: 'Rename an existing mailbox/folder in the one.com mail account.',
      inputSchema: RenameFolderSchema.shape,
      annotations: FOLDER_MUTATION_ANNOTATIONS,
    },
    async (args) => {
      try {
        const client = getClient();
        const result = await client.renameFolder(args.oldName, args.newName);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Error renaming folder '${args.oldName}' to '${args.newName}': ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'delete_folder',
    {
      description: 'Delete a folder/mailbox from the one.com mail account.',
      inputSchema: DeleteFolderSchema.shape,
      annotations: DESTRUCTIVE_FOLDER_ANNOTATIONS,
    },
    async (args) => {
      try {
        const client = getClient();
        const result = await client.deleteFolder(args.name);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Error deleting folder '${args.name}': ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
