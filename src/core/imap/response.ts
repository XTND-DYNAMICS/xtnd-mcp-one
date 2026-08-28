/**
 * IMAP Protocol Response Parser
 */

import { EmailHeaderSummary, MailboxFolder } from '../../types.js';
import { parseHeaders, parseAddressList, decodeMimeWords } from '../parser/mime-parser.js';

export interface ImapParsedResponse {
  tag: string;
  status: 'OK' | 'NO' | 'BAD';
  info: string;
  untagged: string[];
}

export function parseTaggedResponse(raw: string, expectedTag: string): ImapParsedResponse {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const untagged: string[] = [];
  let status: 'OK' | 'NO' | 'BAD' = 'BAD';
  let info = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith(`${expectedTag} `)) {
      const parts = trimmed.split(' ');
      status = (parts[1]?.toUpperCase() as 'OK' | 'NO' | 'BAD') || 'BAD';
      info = parts.slice(2).join(' ');
    } else if (trimmed.startsWith('* ') || trimmed.startsWith('+ ')) {
      untagged.push(trimmed);
    }
  }

  return {
    tag: expectedTag,
    status,
    info,
    untagged,
  };
}

export function parseListResponse(untaggedLines: string[]): MailboxFolder[] {
  const folders: MailboxFolder[] = [];

  for (const line of untaggedLines) {
    // Format: * LIST (\HasNoChildren \Drafts) "/" "Drafts"
    const match = line.match(/^\*\s+LIST\s+\((.*?)\)\s+(?:"([^"]*)"|(\S+))\s+(?:"([^"]*)"|(\S+))/i);
    if (match) {
      const flagsStr = match[1] || '';
      const flags = flagsStr.split(/\s+/).filter(Boolean);
      const delimiter = match[2] || match[3] || '/';
      const name = match[4] || match[5] || '';

      folders.push({
        name,
        delimiter,
        flags,
      });
    }
  }

  return folders;
}

export function parseSearchResponse(untaggedLines: string[]): number[] {
  const uids: number[] = [];

  for (const line of untaggedLines) {
    if (line.toUpperCase().startsWith('* SEARCH')) {
      const parts = line.slice(8).trim().split(/\s+/);
      for (const p of parts) {
        const uid = parseInt(p, 10);
        if (!isNaN(uid) && uid > 0) {
          uids.push(uid);
        }
      }
    }
  }

  return uids.sort((a, b) => b - a); // descending by default (newest first)
}

export function parseStatusResponse(untaggedLines: string[]): { total: number; unread: number } {
  let total = 0;
  let unread = 0;

  for (const line of untaggedLines) {
    const match = line.match(/^\*\s+STATUS\s+.*?\((.*?)\)/i);
    if (match) {
      const tokens = match[1].trim().split(/\s+/);
      for (let i = 0; i < tokens.length; i += 2) {
        const key = tokens[i].toUpperCase();
        const val = parseInt(tokens[i + 1], 10);
        if (key === 'MESSAGES' && !isNaN(val)) total = val;
        if (key === 'UNSEEN' && !isNaN(val)) unread = val;
      }
    }
  }

  return { total, unread };
}

export function parseFetchHeaders(rawResponse: string): EmailHeaderSummary[] {
  const summaries: EmailHeaderSummary[] = [];

  // Each FETCH record: * <seq> FETCH (UID <uid> FLAGS (...) BODY[HEADER...] {len}\r\n<headers>\r\n)
  const fetchBlocks = rawResponse.split(/\*\s+\d+\s+FETCH\s+\(/i);

  for (const block of fetchBlocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const uidMatch = trimmed.match(/UID\s+(\d+)/i);
    if (!uidMatch) continue;
    const uid = parseInt(uidMatch[1], 10);

    const flagsMatch = trimmed.match(/FLAGS\s+\((.*?)\)/i);
    const flags = flagsMatch ? flagsMatch[1].split(/\s+/).filter(Boolean) : [];

    const sizeMatch = trimmed.match(/RFC822\.SIZE\s+(\d+)/i);
    const size = sizeMatch ? parseInt(sizeMatch[1], 10) : 0;

    // Find the header literal section
    const literalMatch = trimmed.match(/\{(\d+)\}\r?\n([\s\S]*)/);
    let headerText = '';
    if (literalMatch) {
      const len = parseInt(literalMatch[1], 10);
      headerText = literalMatch[2].slice(0, len);
    }

    const headers = parseHeaders(headerText);
    const subject = decodeMimeWords(headers.get('subject') || '(No Subject)');
    const messageId = headers.get('message-id') || `<${uid}@mcp-one>`;
    const date = headers.get('date') || '';
    const from = parseAddressList(headers.get('from') || '');
    const to = parseAddressList(headers.get('to') || '');
    const cc = headers.has('cc') ? parseAddressList(headers.get('cc') || '') : undefined;
    const inReplyTo = headers.get('in-reply-to');
    const contentType = headers.get('content-type') || '';
    const hasAttachments = /multipart\/mixed/i.test(contentType) || /attachment/i.test(contentType);

    summaries.push({
      uid,
      messageId,
      from,
      to,
      cc,
      subject,
      date,
      flags,
      size,
      hasAttachments,
      inReplyTo,
    });
  }

  return summaries;
}

export function extractFetchBody(rawResponse: string, uid: number): { body: string; flags: string[] } {
  let flags: string[] = [];
  const flagsMatch = rawResponse.match(/FLAGS\s+\((.*?)\)/i);
  if (flagsMatch) {
    flags = flagsMatch[1].split(/\s+/).filter(Boolean);
  }

  // Look for literal payload: BODY[] {len}\r\n<payload>)
  const literalMatch = rawResponse.match(/\{(\d+)\}\r?\n([\s\S]*)/);
  if (literalMatch) {
    const len = parseInt(literalMatch[1], 10);
    const body = literalMatch[2].slice(0, len);
    return { body, flags };
  }

  return { body: '', flags };
}
