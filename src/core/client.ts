/**
 * Unified one.com Mail Client
 */

import {
  EmailDetail,
  EmailHeaderSummary,
  MailboxCredentials,
  MailboxFolder,
  SearchOptions,
  SendEmailOptions,
} from '../types.js';
import { EdgeImapClient } from './imap/client.js';
import { EdgeSmtpClient } from './smtp/client.js';
import { composeMimeMessage } from './smtp/mime.js';

export class OneMailClient {
  private credentials: MailboxCredentials;

  constructor(credentials: MailboxCredentials) {
    this.credentials = credentials;
  }

  private async getImapClient(): Promise<EdgeImapClient> {
    const client = new EdgeImapClient(this.credentials);
    await client.connect();
    await client.login(this.credentials.email, this.credentials.password);
    return client;
  }

  async listFolders(): Promise<MailboxFolder[]> {
    const imap = await this.getImapClient();
    try {
      const folders = await imap.listFolders();
      // Fetch status / counts for each folder
      for (const folder of folders) {
        try {
          const status = await imap.getFolderStatus(folder.name);
          folder.totalMessages = status.total;
          folder.unreadMessages = status.unread;
        } catch {}
      }
      return folders;
    } finally {
      await imap.logout();
    }
  }

  async createFolder(name: string): Promise<{ success: boolean; folder: string }> {
    const imap = await this.getImapClient();
    try {
      const success = await imap.createFolder(name);
      return { success, folder: name };
    } finally {
      await imap.logout();
    }
  }

  async renameFolder(oldName: string, newName: string): Promise<{ success: boolean; oldName: string; newName: string }> {
    const imap = await this.getImapClient();
    try {
      const success = await imap.renameFolder(oldName, newName);
      return { success, oldName, newName };
    } finally {
      await imap.logout();
    }
  }

  async deleteFolder(name: string): Promise<{ success: boolean; folder: string }> {
    const imap = await this.getImapClient();
    try {
      const success = await imap.deleteFolder(name);
      return { success, folder: name };
    } finally {
      await imap.logout();
    }
  }

  async searchEmails(options: SearchOptions = {}): Promise<{ total: number; emails: EmailHeaderSummary[] }> {
    const imap = await this.getImapClient();
    try {
      const folder = options.folder || 'INBOX';
      await imap.selectFolder(folder);
      const uids = await imap.search(options);
      const emails = await imap.fetchHeaders(uids);
      return { total: uids.length, emails };
    } finally {
      await imap.logout();
    }
  }

  async getRecentEmails(folder = 'INBOX', limit = 20): Promise<{ count: number; emails: EmailHeaderSummary[] }> {
    const res = await this.searchEmails({ folder, limit });
    return { count: res.total, emails: res.emails };
  }

  async getEmailContent(folder = 'INBOX', uid: number): Promise<EmailDetail> {
    const imap = await this.getImapClient();
    try {
      await imap.selectFolder(folder);
      return await imap.fetchFull(uid);
    } finally {
      await imap.logout();
    }
  }

  async getEmailThread(folder = 'INBOX', messageIdOrUid: string | number): Promise<EmailDetail[]> {
    const imap = await this.getImapClient();
    try {
      await imap.selectFolder(folder);

      let targetMessage: EmailDetail;
      if (typeof messageIdOrUid === 'number') {
        targetMessage = await imap.fetchFull(messageIdOrUid);
      } else {
        const uids = await imap.search({ query: messageIdOrUid });
        if (uids.length === 0) return [];
        targetMessage = await imap.fetchFull(uids[0]);
      }

      const threadMessages: EmailDetail[] = [targetMessage];

      // If inReplyTo exists, search backwards
      if (targetMessage.inReplyTo) {
        try {
          const parentUids = await imap.search({ query: targetMessage.inReplyTo });
          for (const pUid of parentUids) {
            if (pUid !== targetMessage.uid) {
              const parentMsg = await imap.fetchFull(pUid);
              threadMessages.unshift(parentMsg);
            }
          }
        } catch {}
      }

      // Search forwards for messages referencing this messageId
      if (targetMessage.messageId) {
        try {
          const childUids = await imap.search({ query: targetMessage.messageId });
          for (const cUid of childUids) {
            if (cUid !== targetMessage.uid && !threadMessages.some((m) => m.uid === cUid)) {
              const childMsg = await imap.fetchFull(cUid);
              threadMessages.push(childMsg);
            }
          }
        } catch {}
      }

      return threadMessages;
    } finally {
      await imap.logout();
    }
  }

  async markEmails(
    folder = 'INBOX',
    uids: number[],
    action: 'read' | 'unread' | 'flag' | 'unflag'
  ): Promise<{ success: boolean; affected: number }> {
    const imap = await this.getImapClient();
    try {
      await imap.selectFolder(folder);

      let flags: string[];
      let imapAction: 'add' | 'remove';

      switch (action) {
        case 'read':
          flags = ['\\Seen'];
          imapAction = 'add';
          break;
        case 'unread':
          flags = ['\\Seen'];
          imapAction = 'remove';
          break;
        case 'flag':
          flags = ['\\Flagged'];
          imapAction = 'add';
          break;
        case 'unflag':
          flags = ['\\Flagged'];
          imapAction = 'remove';
          break;
      }

      const success = await imap.markFlags(uids, flags, imapAction);
      return { success, affected: uids.length };
    } finally {
      await imap.logout();
    }
  }

  async moveEmails(
    sourceFolder = 'INBOX',
    targetFolder: string,
    uids: number[]
  ): Promise<{ success: boolean; moved: number; targetFolder: string }> {
    const imap = await this.getImapClient();
    try {
      await imap.selectFolder(sourceFolder);
      const success = await imap.move(uids, targetFolder);
      return { success, moved: uids.length, targetFolder };
    } finally {
      await imap.logout();
    }
  }

  async deleteEmails(
    folder = 'INBOX',
    uids: number[],
    permanent = false
  ): Promise<{ success: boolean; deleted: number; permanent: boolean }> {
    const imap = await this.getImapClient();
    try {
      await imap.selectFolder(folder);
      if (permanent || folder.toLowerCase() === 'trash' || folder.toLowerCase().includes('trash')) {
        await imap.markFlags(uids, ['\\Deleted'], 'add');
        await imap.expunge();
        return { success: true, deleted: uids.length, permanent: true };
      } else {
        // Move to Trash
        const success = await imap.move(uids, 'Trash');
        return { success, deleted: uids.length, permanent: false };
      }
    } finally {
      await imap.logout();
    }
  }

  async sendEmail(options: SendEmailOptions): Promise<{ success: boolean; messageId: string }> {
    const smtp = new EdgeSmtpClient(this.credentials);
    const result = await smtp.send(options);

    // Save copy to Sent folder in IMAP
    try {
      const imap = await this.getImapClient();
      const rawMime = composeMimeMessage(options, this.credentials.email);
      await imap.appendMessage('Sent', rawMime, ['\\Seen']);
      await imap.logout();
    } catch {}

    return result;
  }

  async replyEmail(
    folder = 'INBOX',
    uid: number,
    bodyText: string,
    bodyHtml?: string,
    replyAll = false
  ): Promise<{ success: boolean; messageId: string }> {
    const original = await this.getEmailContent(folder, uid);

    const replyTo = original.from.map((f) => f.address).filter(Boolean);
    const ccList: string[] = [];

    if (replyAll && original.to) {
      for (const t of original.to) {
        if (t.address.toLowerCase() !== this.credentials.email.toLowerCase()) {
          ccList.push(t.address);
        }
      }
    }

    const subject = original.subject.toLowerCase().startsWith('re:') ? original.subject : `Re: ${original.subject}`;

    const quotedText = `\n\nOn ${original.date}, ${original.from[0]?.address || 'sender'} wrote:\n> ${
      (original.bodyText || original.bodyMarkdown || '').split('\n').join('\n> ')
    }`;

    const fullBodyText = `${bodyText}${quotedText}`;

    return this.sendEmail({
      to: replyTo,
      cc: ccList.length > 0 ? ccList : undefined,
      subject,
      bodyText: fullBodyText,
      bodyHtml,
      inReplyTo: original.messageId,
      references: original.messageId,
    });
  }

  async forwardEmail(
    folder = 'INBOX',
    uid: number,
    to: string[] | string,
    comment = ''
  ): Promise<{ success: boolean; messageId: string }> {
    const original = await this.getEmailContent(folder, uid);
    const subject = original.subject.toLowerCase().startsWith('fwd:') ? original.subject : `Fwd: ${original.subject}`;

    const headerBlock = [
      '---------- Forwarded message ---------',
      `From: ${original.from.map((f) => f.address).join(', ')}`,
      `Date: ${original.date}`,
      `Subject: ${original.subject}`,
      `To: ${original.to.map((t) => t.address).join(', ')}`,
      '',
    ].join('\n');

    const forwardedBody = `${comment ? comment + '\n\n' : ''}${headerBlock}${original.bodyText || original.bodyMarkdown || ''}`;

    return this.sendEmail({
      to,
      subject,
      bodyText: forwardedBody,
    });
  }

  async createDraft(options: SendEmailOptions): Promise<{ success: boolean; folder: string }> {
    const imap = await this.getImapClient();
    try {
      const rawMime = composeMimeMessage(options, this.credentials.email);
      const success = await imap.appendMessage('Drafts', rawMime, ['\\Draft', '\\Seen']);
      return { success, folder: 'Drafts' };
    } finally {
      await imap.logout();
    }
  }
}
