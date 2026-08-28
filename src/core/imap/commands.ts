/**
 * IMAP Command Builders
 */

import { SearchOptions } from '../../types.js';

export function escapeImapString(str: string): string {
  return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function buildLoginCommand(tag: string, user: string, pass: string): string {
  return `${tag} LOGIN ${escapeImapString(user)} ${escapeImapString(pass)}\r\n`;
}

export function buildListCommand(tag: string, reference = '', mailbox = '*'): string {
  return `${tag} LIST ${escapeImapString(reference)} ${escapeImapString(mailbox)}\r\n`;
}

export function buildSelectCommand(tag: string, mailbox: string): string {
  return `${tag} SELECT ${escapeImapString(mailbox)}\r\n`;
}

export function buildExamineCommand(tag: string, mailbox: string): string {
  return `${tag} EXAMINE ${escapeImapString(mailbox)}\r\n`;
}

export function buildStatusCommand(tag: string, mailbox: string, items = ['MESSAGES', 'UNSEEN', 'RECENT', 'UIDNEXT']): string {
  return `${tag} STATUS ${escapeImapString(mailbox)} (${items.join(' ')})\r\n`;
}

export function buildCreateCommand(tag: string, mailbox: string): string {
  return `${tag} CREATE ${escapeImapString(mailbox)}\r\n`;
}

export function buildRenameCommand(tag: string, oldName: string, newName: string): string {
  return `${tag} RENAME ${escapeImapString(oldName)} ${escapeImapString(newName)}\r\n`;
}

export function buildDeleteCommand(tag: string, mailbox: string): string {
  return `${tag} DELETE ${escapeImapString(mailbox)}\r\n`;
}

export function buildSearchCommand(tag: string, options: SearchOptions): string {
  const criteria: string[] = ['ALL'];

  if (options.unreadOnly) {
    criteria.push('UNSEEN');
  }
  if (options.flaggedOnly) {
    criteria.push('FLAGGED');
  }
  if (options.from) {
    criteria.push(`FROM ${escapeImapString(options.from)}`);
  }
  if (options.to) {
    criteria.push(`TO ${escapeImapString(options.to)}`);
  }
  if (options.subject) {
    criteria.push(`SUBJECT ${escapeImapString(options.subject)}`);
  }
  if (options.query) {
    criteria.push(`TEXT ${escapeImapString(options.query)}`);
  }
  if (options.since) {
    criteria.push(`SINCE ${formatImapDate(options.since)}`);
  }
  if (options.before) {
    criteria.push(`BEFORE ${formatImapDate(options.before)}`);
  }

  return `${tag} UID SEARCH ${criteria.join(' ')}\r\n`;
}

export function buildFetchHeadersCommand(tag: string, uids: number[]): string {
  const uidSeq = uids.join(',');
  return `${tag} UID FETCH ${uidSeq} (FLAGS INTERNALDATE RFC822.SIZE BODY.PEEK[HEADER.FIELDS (MESSAGE-ID FROM TO CC SUBJECT DATE IN-REPLY-TO REFERENCES CONTENT-TYPE)])\r\n`;
}

export function buildFetchFullCommand(tag: string, uid: number): string {
  return `${tag} UID FETCH ${uid} (FLAGS INTERNALDATE RFC822.SIZE BODY.PEEK[])\r\n`;
}

export function buildStoreFlagsCommand(tag: string, uids: number[], flags: string[], action: 'add' | 'remove' | 'set'): string {
  const uidSeq = uids.join(',');
  const sign = action === 'add' ? '+FLAGS' : action === 'remove' ? '-FLAGS' : 'FLAGS';
  return `${tag} UID STORE ${uidSeq} ${sign} (${flags.join(' ')})\r\n`;
}

export function buildMoveCommand(tag: string, uids: number[], destinationFolder: string): string {
  const uidSeq = uids.join(',');
  return `${tag} UID MOVE ${uidSeq} ${escapeImapString(destinationFolder)}\r\n`;
}

export function buildCopyCommand(tag: string, uids: number[], destinationFolder: string): string {
  const uidSeq = uids.join(',');
  return `${tag} UID COPY ${uidSeq} ${escapeImapString(destinationFolder)}\r\n`;
}

export function buildExpungeCommand(tag: string): string {
  return `${tag} EXPUNGE\r\n`;
}

export function buildAppendCommand(tag: string, mailbox: string, message: string, flags: string[] = ['\\Seen']): string {
  const flagStr = flags.length > 0 ? `(${flags.join(' ')}) ` : '';
  const byteLength = new TextEncoder().encode(message).length;
  return `${tag} APPEND ${escapeImapString(mailbox)} ${flagStr}{${byteLength}}\r\n`;
}

export function buildLogoutCommand(tag: string): string {
  return `${tag} LOGOUT\r\n`;
}

export function formatImapDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    // If already in DD-Mon-YYYY format, return as is
    return dateStr;
  }
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(date.getDate()).padStart(2, '0');
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `"${day}-${month}-${year}"`;
}
