/**
 * Edge-compatible RFC 5322 / MIME parser
 */

import { EmailAddress, EmailAttachment, EmailDetail } from '../../types.js';
import { htmlToMarkdown } from './markdown.js';

export function parseRfc822(rawMessage: string, uid = 0, flags: string[] = []): EmailDetail {
  const headerBodySplit = rawMessage.indexOf('\r\n\r\n');
  let headerSection = '';
  let bodySection = '';

  if (headerBodySplit !== -1) {
    headerSection = rawMessage.slice(0, headerBodySplit);
    bodySection = rawMessage.slice(headerBodySplit + 4);
  } else {
    const lfSplit = rawMessage.indexOf('\n\n');
    if (lfSplit !== -1) {
      headerSection = rawMessage.slice(0, lfSplit);
      bodySection = rawMessage.slice(lfSplit + 2);
    } else {
      headerSection = rawMessage;
    }
  }

  const headers = parseHeaders(headerSection);

  const subject = decodeMimeWords(headers.get('subject') || '(No Subject)');
  const messageId = headers.get('message-id') || `<synthetic-${uid}@mcp-one>`;
  const date = headers.get('date') || new Date().toISOString();
  const inReplyTo = headers.get('in-reply-to');
  const contentType = headers.get('content-type') || 'text/plain; charset=utf-8';

  const from = parseAddressList(headers.get('from') || '');
  const to = parseAddressList(headers.get('to') || '');
  const cc = headers.has('cc') ? parseAddressList(headers.get('cc') || '') : undefined;

  const parsedBody = parseMimeBody(bodySection, contentType);

  let bodyMarkdown = parsedBody.bodyText;
  if (parsedBody.bodyHtml) {
    bodyMarkdown = htmlToMarkdown(parsedBody.bodyHtml);
  }

  return {
    uid,
    messageId,
    from,
    to,
    cc,
    subject,
    date,
    flags,
    size: rawMessage.length,
    hasAttachments: (parsedBody.attachments && parsedBody.attachments.length > 0) || false,
    inReplyTo,
    bodyText: parsedBody.bodyText,
    bodyHtml: parsedBody.bodyHtml,
    bodyMarkdown,
    attachments: parsedBody.attachments,
  };
}

export function parseHeaders(headerText: string): Map<string, string> {
  const headers = new Map<string, string>();
  const lines = headerText.replace(/\r\n/g, '\n').split('\n');

  let currentKey = '';
  let currentValue = '';

  for (const line of lines) {
    if (/^[ \t]/.test(line)) {
      // Continuation line (unfolding)
      currentValue += ' ' + line.trim();
    } else {
      if (currentKey) {
        headers.set(currentKey.toLowerCase(), currentValue.trim());
      }
      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) {
        currentKey = line.slice(0, colonIdx).trim();
        currentValue = line.slice(colonIdx + 1).trim();
      } else {
        currentKey = '';
        currentValue = '';
      }
    }
  }

  if (currentKey) {
    headers.set(currentKey.toLowerCase(), currentValue.trim());
  }

  return headers;
}

export function parseAddressList(headerValue: string): EmailAddress[] {
  if (!headerValue) return [];
  const results: EmailAddress[] = [];

  // Split on commas not enclosed in quotes
  const parts = headerValue.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const angleMatch = trimmed.match(/^(?:"?([^"]*)"?\s*)?<([^>]+)>$/);
    if (angleMatch) {
      const name = decodeMimeWords(angleMatch[1]?.trim() || '');
      const address = angleMatch[2]?.trim() || '';
      results.push({ name: name || undefined, address });
    } else {
      results.push({ address: trimmed.replace(/^["']|["']$/g, '') });
    }
  }

  return results;
}

export function decodeMimeWords(text: string): string {
  if (!text) return '';
  // Encoded words: =?charset?encoding?encoded_text?=
  return text.replace(/=\?([^\?]+)\?([BQbq])\?([^\?]+)\?=/g, (_match, charset, encoding, encoded) => {
    try {
      const isBase64 = encoding.toUpperCase() === 'B';
      if (isBase64) {
        const binary = atob(encoded);
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        return new TextDecoder(charset || 'utf-8').decode(bytes);
      } else {
        // Quoted-Printable in encoded words
        const qpDecoded = encoded.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_m: string, hex: string) => {
          return String.fromCharCode(parseInt(hex, 16));
        });
        return qpDecoded;
      }
    } catch {
      return text;
    }
  });
}

function parseMimeBody(
  bodyText: string,
  contentTypeHeader: string
): { bodyText?: string; bodyHtml?: string; attachments?: EmailAttachment[] } {
  const boundaryMatch = contentTypeHeader.match(/boundary=["']?([^"';]+)["']?/i);

  if (boundaryMatch && boundaryMatch[1]) {
    const boundary = boundaryMatch[1];
    return parseMultipart(bodyText, boundary);
  }

  // Single part
  const isHtml = /text\/html/i.test(contentTypeHeader);
  const isQp = /quoted-printable/i.test(contentTypeHeader);
  const isB64 = /base64/i.test(contentTypeHeader);

  let decoded = bodyText;
  if (isQp) {
    decoded = decodeQuotedPrintable(bodyText);
  } else if (isB64) {
    try {
      decoded = atob(bodyText.replace(/\s+/g, ''));
    } catch {}
  }

  if (isHtml) {
    return { bodyHtml: decoded };
  } else {
    return { bodyText: decoded };
  }
}

function parseMultipart(
  body: string,
  boundary: string
): { bodyText?: string; bodyHtml?: string; attachments?: EmailAttachment[] } {
  let resultText = '';
  let resultHtml = '';
  const attachments: EmailAttachment[] = [];

  const delimiter = `--${boundary}`;
  const parts = body.split(delimiter);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed || trimmed === '--') continue;

    const splitIdx = trimmed.indexOf('\r\n\r\n') !== -1 ? trimmed.indexOf('\r\n\r\n') : trimmed.indexOf('\n\n');
    if (splitIdx === -1) continue;

    const partHeaderStr = trimmed.slice(0, splitIdx);
    let partBodyStr = trimmed.slice(splitIdx).trim();

    const partHeaders = parseHeaders(partHeaderStr);
    const partContentType = partHeaders.get('content-type') || 'text/plain';
    const partTransferEncoding = partHeaders.get('content-transfer-encoding') || '';
    const partDisposition = partHeaders.get('content-disposition') || '';

    // Check nested boundary
    const nestedBoundaryMatch = partContentType.match(/boundary=["']?([^"';]+)["']?/i);
    if (nestedBoundaryMatch && nestedBoundaryMatch[1]) {
      const nestedResult = parseMultipart(partBodyStr, nestedBoundaryMatch[1]);
      if (nestedResult.bodyText && !resultText) resultText = nestedResult.bodyText;
      if (nestedResult.bodyHtml && !resultHtml) resultHtml = nestedResult.bodyHtml;
      if (nestedResult.attachments) attachments.push(...nestedResult.attachments);
      continue;
    }

    let decodedPartBody = partBodyStr;
    if (/quoted-printable/i.test(partTransferEncoding)) {
      decodedPartBody = decodeQuotedPrintable(partBodyStr);
    } else if (/base64/i.test(partTransferEncoding)) {
      try {
        decodedPartBody = atob(partBodyStr.replace(/\s+/g, ''));
      } catch {}
    }

    const filenameMatch =
      partDisposition.match(/filename=["']?([^"';]+)["']?/i) ||
      partContentType.match(/name=["']?([^"';]+)["']?/i);

    const isAttachment = /attachment/i.test(partDisposition) || Boolean(filenameMatch);

    if (isAttachment) {
      const filename = filenameMatch ? decodeMimeWords(filenameMatch[1]) : 'attachment';
      attachments.push({
        filename,
        contentType: partContentType.split(';')[0].trim().toLowerCase(),
        size: partBodyStr.length,
        contentId: partHeaders.get('content-id')?.replace(/[<>]/g, ''),
        dataBase64: /base64/i.test(partTransferEncoding) ? partBodyStr.replace(/\s+/g, '') : btoa(partBodyStr),
      });
    } else if (/text\/html/i.test(partContentType)) {
      resultHtml = decodedPartBody;
    } else if (/text\/plain/i.test(partContentType)) {
      resultText = decodedPartBody;
    }
  }

  return {
    bodyText: resultText || undefined,
    bodyHtml: resultHtml || undefined,
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}

export function decodeQuotedPrintable(input: string): string {
  if (!input) return '';
  // Soft line breaks (=\r\n or =\n)
  let text = input.replace(/=\r?\n/g, '');
  // Hex byte sequences =XX
  return text.replace(/=([0-9A-Fa-f]{2})/g, (_match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
}
