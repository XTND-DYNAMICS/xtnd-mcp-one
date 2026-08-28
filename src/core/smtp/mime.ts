/**
 * RFC 5322 MIME Message Composer
 */

import { SendEmailOptions } from '../../types.js';

export function composeMimeMessage(options: SendEmailOptions, senderEmail: string): string {
  const from = options.from || senderEmail;
  const toList = Array.isArray(options.to) ? options.to.join(', ') : options.to;
  const ccList = options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : undefined;
  const bccList = options.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc) : undefined;

  const dateStr = new Date().toUTCString();
  const domain = senderEmail.split('@')[1] || 'mcp.xgi.io';
  const messageId = `<${Date.now()}.${Math.random().toString(36).substring(2, 10)}@${domain}>`;

  const headers: string[] = [
    `From: ${from}`,
    `To: ${toList}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(options.subject)))}?=`,
    `Date: ${dateStr}`,
    `Message-ID: ${messageId}`,
    'MIME-Version: 1.0',
    'User-Agent: xtnd-mcp-one/0.1.0',
  ];

  if (ccList) headers.push(`Cc: ${ccList}`);
  if (bccList) headers.push(`Bcc: ${bccList}`);
  if (options.inReplyTo) headers.push(`In-Reply-To: ${options.inReplyTo}`);
  if (options.references) headers.push(`References: ${options.references}`);

  const hasAttachments = options.attachments && options.attachments.length > 0;
  const hasHtml = Boolean(options.bodyHtml);

  if (!hasAttachments && !hasHtml) {
    // Simple text/plain
    headers.push('Content-Type: text/plain; charset=UTF-8');
    headers.push('Content-Transfer-Encoding: 8bit');
    return `${headers.join('\r\n')}\r\n\r\n${options.bodyText}\r\n`;
  }

  const mixedBoundary = `====_Mixed_Boundary_${Date.now()}_====`;
  const altBoundary = `====_Alt_Boundary_${Date.now()}_====`;

  if (!hasAttachments && hasHtml) {
    // multipart/alternative
    headers.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    return [
      headers.join('\r\n'),
      '',
      `--${altBoundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      options.bodyText,
      '',
      `--${altBoundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      options.bodyHtml,
      '',
      `--${altBoundary}--`,
      '',
    ].join('\r\n');
  }

  // multipart/mixed with optional multipart/alternative
  headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);

  const bodyParts: string[] = [
    headers.join('\r\n'),
    '',
    `--${mixedBoundary}`,
  ];

  if (hasHtml) {
    bodyParts.push(
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      '',
      `--${altBoundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      options.bodyText,
      '',
      `--${altBoundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      options.bodyHtml!,
      '',
      `--${altBoundary}--`
    );
  } else {
    bodyParts.push(
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      options.bodyText
    );
  }

  if (options.attachments) {
    for (const att of options.attachments) {
      bodyParts.push(
        `--${mixedBoundary}`,
        `Content-Type: ${att.contentType}; name="${att.filename}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${att.filename}"`,
        '',
        formatBase64Wrap(att.content)
      );
    }
  }

  bodyParts.push(`--${mixedBoundary}--`, '');
  return bodyParts.join('\r\n');
}

function formatBase64Wrap(b64: string, lineLength = 76): string {
  const clean = b64.replace(/\s+/g, '');
  const chunks: string[] = [];
  for (let i = 0; i < clean.length; i += lineLength) {
    chunks.push(clean.slice(i, i + lineLength));
  }
  return chunks.join('\r\n');
}
