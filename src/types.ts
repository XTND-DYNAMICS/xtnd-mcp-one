/**
 * Shared types for @xtnd/mcp-one
 */

export interface MailboxCredentials {
  email: string;
  password: string;
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
}

export interface MailboxFolder {
  name: string;
  delimiter: string;
  flags: string[];
  totalMessages?: number;
  unreadMessages?: number;
}

export interface EmailAddress {
  name?: string;
  address: string;
}

export interface EmailHeaderSummary {
  uid: number;
  messageId: string;
  from: EmailAddress[];
  to: EmailAddress[];
  cc?: EmailAddress[];
  subject: string;
  date: string;
  flags: string[];
  size: number;
  hasAttachments: boolean;
  inReplyTo?: string;
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
  dataBase64?: string;
}

export interface EmailDetail extends EmailHeaderSummary {
  bodyText?: string;
  bodyHtml?: string;
  bodyMarkdown?: string;
  attachments?: EmailAttachment[];
}

export interface SearchOptions {
  folder?: string;
  query?: string;
  from?: string;
  to?: string;
  subject?: string;
  since?: string; // YYYY-MM-DD or DD-Mon-YYYY
  before?: string;
  unreadOnly?: boolean;
  flaggedOnly?: boolean;
  limit?: number;
}

export interface SendEmailOptions {
  from?: string;
  to: string[] | string;
  cc?: string[] | string;
  bcc?: string[] | string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: {
    filename: string;
    contentType: string;
    content: string; // base64
  }[];
}

export interface WorkerEnv {
  KV: KVNamespace;
  ONECOM_IMAP_HOST?: string;
  ONECOM_IMAP_PORT?: string;
  ONECOM_SMTP_HOST?: string;
  ONECOM_SMTP_PORT?: string;
  ONECOM_EMAIL?: string;
  ONECOM_PASSWORD?: string;
  API_KEYS_SHA256?: string;
}
