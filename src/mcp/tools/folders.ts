/**
 * Folder Tools Implementation
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OneMailClient } from '../../core/client.js';
import { CreateFolderSchema, DeleteFolderSchema, ListFoldersSchema, RenameFolderSchema } from '../schemas.js';

export function registerFolderTools(server: McpServer, getClient: () => OneMailClient) {
  server.tool(
    'list_folders',
    'List all mailboxes/folders in the one.com mail account with total and unread message counts.',
    ListFoldersSchema.shape,
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

  server.tool(
    'create_folder',
    'Create a new folder or mailbox in the one.com mail account.',
    CreateFolderSchema.shape,
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

  server.tool(
    'rename_folder',
    'Rename an existing mailbox/folder in the one.com mail account.',
    RenameFolderSchema.shape,
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

  server.tool(
    'delete_folder',
    'Delete a folder/mailbox from the one.com mail account.',
    DeleteFolderSchema.shape,
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
