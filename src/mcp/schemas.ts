/**
 * MCP Tool Input Schemas (Zod)
 */

import { z } from 'zod';

export const ListFoldersSchema = z.object({});

export const CreateFolderSchema = z.object({
  name: z.string().min(1).describe('Name of the new folder or mailbox to create'),
});

export const RenameFolderSchema = z.object({
  oldName: z.string().min(1).describe('Current folder name'),
  newName: z.string().min(1).describe('New name for the folder'),
});

export const DeleteFolderSchema = z.object({
  name: z.string().min(1).describe('Folder name to delete'),
});

export const SearchEmailsSchema = z.object({
  folder: z.string().optional().default('INBOX').describe('Folder to search in (e.g. INBOX, Sent, Archive)'),
  query: z.string().optional().describe('Full-text search keyword to match in email headers and body'),
  from: z.string().optional().describe('Filter by sender email or name'),
  to: z.string().optional().describe('Filter by recipient email'),
  subject: z.string().optional().describe('Filter by subject keyword'),
  since: z.string().optional().describe('Filter emails received on or after date (YYYY-MM-DD or DD-Mon-YYYY)'),
  before: z.string().optional().describe('Filter emails received before date (YYYY-MM-DD or DD-Mon-YYYY)'),
  unreadOnly: z.boolean().optional().describe('Filter only unread emails'),
  flaggedOnly: z.boolean().optional().describe('Filter only starred/flagged emails'),
  limit: z.number().optional().default(20).describe('Maximum number of results to return'),
});

export const GetRecentEmailsSchema = z.object({
  folder: z.string().optional().default('INBOX').describe('Folder to inspect'),
  limit: z.number().optional().default(20).describe('Number of recent emails to retrieve (default: 20)'),
});

export const GetEmailContentSchema = z.object({
  folder: z.string().optional().default('INBOX').describe('Folder where the email resides'),
  uid: z.number().describe('UID of the email to retrieve'),
  format: z.enum(['markdown', 'text', 'html', 'raw']).optional().default('markdown').describe('Content format preference'),
});

export const GetEmailThreadSchema = z.object({
  folder: z.string().optional().default('INBOX').describe('Folder to search in'),
  uidOrMessageId: z.union([z.number(), z.string()]).describe('UID or Message-ID of an email in the conversation thread'),
});

export const MarkEmailsSchema = z.object({
  folder: z.string().optional().default('INBOX').describe('Folder where emails reside'),
  uids: z.array(z.number()).describe('Array of email UIDs to update'),
  action: z.enum(['read', 'unread', 'flag', 'unflag']).describe('Flag update action to perform'),
});

export const MoveEmailsSchema = z.object({
  sourceFolder: z.string().optional().default('INBOX').describe('Source folder'),
  targetFolder: z.string().describe('Destination folder (e.g. Archive, Trash, Work)'),
  uids: z.array(z.number()).describe('Array of email UIDs to move'),
});

export const DeleteEmailsSchema = z.object({
  folder: z.string().optional().default('INBOX').describe('Folder containing the emails'),
  uids: z.array(z.number()).describe('Array of email UIDs to delete'),
  permanent: z.boolean().optional().default(false).describe('If true, permanently expunges without moving to Trash'),
});

export const SendEmailSchema = z.object({
  to: z.union([z.string(), z.array(z.string())]).describe('Recipient email address or list of addresses'),
  subject: z.string().describe('Email subject line'),
  bodyText: z.string().describe('Plain text body of the email'),
  bodyHtml: z.string().optional().describe('Optional HTML version of the body'),
  cc: z.union([z.string(), z.array(z.string())]).optional().describe('Optional CC recipient(s)'),
  bcc: z.union([z.string(), z.array(z.string())]).optional().describe('Optional BCC recipient(s)'),
});

export const ReplyEmailSchema = z.object({
  folder: z.string().optional().default('INBOX').describe('Folder of the message being replied to'),
  uid: z.number().describe('UID of the email to reply to'),
  bodyText: z.string().describe('Reply message content'),
  bodyHtml: z.string().optional().describe('Optional HTML reply content'),
  replyAll: z.boolean().optional().default(false).describe('If true, replies to all recipients'),
});

export const ForwardEmailSchema = z.object({
  folder: z.string().optional().default('INBOX').describe('Folder of the message being forwarded'),
  uid: z.number().describe('UID of the email to forward'),
  to: z.union([z.string(), z.array(z.string())]).describe('Recipient(s) to forward the email to'),
  comment: z.string().optional().describe('Optional comment or note to prepend above the forwarded message'),
});

export const CreateDraftSchema = z.object({
  to: z.union([z.string(), z.array(z.string())]).describe('Recipient email address'),
  subject: z.string().describe('Email subject line'),
  bodyText: z.string().describe('Draft body text'),
  bodyHtml: z.string().optional().describe('Optional draft HTML body'),
  cc: z.union([z.string(), z.array(z.string())]).optional().describe('Optional CC recipients'),
});
