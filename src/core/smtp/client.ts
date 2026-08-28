/**
 * Edge SMTPS Client (Port 465 Implicit TLS)
 * Compatible with Cloudflare Workers (cloudflare:sockets) and Node.js (node:tls).
 */

import { MailboxCredentials, SendEmailOptions } from '../../types.js';
import { composeMimeMessage } from './mime.js';

export class EdgeSmtpClient {
  private host: string;
  private port: number;
  private email: string;
  private password: string;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private socket: any = null;
  private nodeSocket: any = null;
  private buffer = '';

  constructor(credentials: MailboxCredentials) {
    this.host = credentials.smtpHost || 'send.one.com';
    this.port = credentials.smtpPort || 465;
    this.email = credentials.email;
    this.password = credentials.password;
  }

  async connect(): Promise<void> {
    if (typeof (globalThis as any).WebSocketPair !== 'undefined' || (globalThis as any).navigator?.userAgent?.includes('Cloudflare-Workers')) {
      try {
        const { connect } = await import('cloudflare:sockets');
        this.socket = connect(`${this.host}:${this.port}`, {
          secureTransport: 'on',
          allowHalfOpen: false,
        });
        this.reader = this.socket.readable.getReader();
        this.writer = this.socket.writable.getWriter();
        await this.readResponse();
        return;
      } catch (err) {}
    }

    const tls = await import('node:tls');
    return new Promise((resolve, reject) => {
      this.nodeSocket = tls.connect(
        {
          host: this.host,
          port: this.port,
          servername: this.host,
          rejectUnauthorized: true,
        },
        () => {
          resolve();
        }
      );

      this.nodeSocket.on('error', (err: Error) => {
        reject(err);
      });

      this.nodeSocket.setEncoding('utf8');
      this.nodeSocket.on('data', (chunk: string) => {
        this.buffer += chunk;
      });
    });
  }

  private async writeLine(line: string): Promise<void> {
    const payload = `${line}\r\n`;
    if (this.writer) {
      await this.writer.write(new TextEncoder().encode(payload));
    } else if (this.nodeSocket) {
      await new Promise<void>((resolve, reject) => {
        this.nodeSocket.write(payload, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } else {
      throw new Error('SMTP client not connected');
    }
  }

  private async readResponse(): Promise<{ code: number; text: string }> {
    if (this.nodeSocket) {
      while (!/\d{3}[ -]/.test(this.buffer)) {
        await new Promise((r) => setTimeout(r, 20));
      }
      const raw = this.buffer;
      this.buffer = '';
      const code = parseInt(raw.slice(0, 3), 10);
      return { code, text: raw };
    }

    if (this.reader) {
      let accumulated = '';
      while (true) {
        const { value, done } = await this.reader.read();
        if (done || !value) break;
        accumulated += new TextDecoder().decode(value);
        if (/\d{3}\s/.test(accumulated)) {
          break;
        }
      }
      const code = parseInt(accumulated.slice(0, 3), 10);
      return { code, text: accumulated };
    }

    throw new Error('SMTP connection lost');
  }

  async send(options: SendEmailOptions): Promise<{ success: boolean; messageId: string }> {
    await this.connect();

    // 1. EHLO
    const domain = this.email.split('@')[1] || 'mcp.xgi.io';
    await this.writeLine(`EHLO ${domain}`);
    const ehloRes = await this.readResponse();
    if (ehloRes.code >= 400) {
      throw new Error(`SMTP EHLO failed: ${ehloRes.text}`);
    }

    // 2. AUTH LOGIN
    await this.writeLine('AUTH LOGIN');
    await this.readResponse();

    // Username base64
    await this.writeLine(btoa(this.email));
    await this.readResponse();

    // Password base64
    await this.writeLine(btoa(this.password));
    const authRes = await this.readResponse();
    if (authRes.code !== 235) {
      throw new Error(`SMTP Auth failed: ${authRes.text}`);
    }

    // 3. MAIL FROM
    const from = options.from || this.email;
    await this.writeLine(`MAIL FROM:<${from}>`);
    const mailRes = await this.readResponse();
    if (mailRes.code >= 400) {
      throw new Error(`SMTP MAIL FROM failed: ${mailRes.text}`);
    }

    // 4. RCPT TO
    const recipients: string[] = [];
    if (Array.isArray(options.to)) recipients.push(...options.to);
    else recipients.push(options.to);

    if (options.cc) {
      if (Array.isArray(options.cc)) recipients.push(...options.cc);
      else recipients.push(options.cc);
    }
    if (options.bcc) {
      if (Array.isArray(options.bcc)) recipients.push(...options.bcc);
      else recipients.push(options.bcc);
    }

    for (const rcpt of recipients) {
      const cleanAddr = rcpt.replace(/.*<([^>]+)>.*/, '$1').trim();
      await this.writeLine(`RCPT TO:<${cleanAddr}>`);
      const rcptRes = await this.readResponse();
      if (rcptRes.code >= 400) {
        throw new Error(`SMTP RCPT TO ${cleanAddr} failed: ${rcptRes.text}`);
      }
    }

    // 5. DATA
    await this.writeLine('DATA');
    const dataPrompt = await this.readResponse();
    if (dataPrompt.code !== 354) {
      throw new Error(`SMTP DATA prompt failed: ${dataPrompt.text}`);
    }

    // 6. Send payload
    const mimePayload = composeMimeMessage(options, this.email);
    // Dot-stuffing: lines starting with . must have an extra .
    const dotStuffed = mimePayload.replace(/\r\n\./g, '\r\n..');
    await this.writeLine(`${dotStuffed}\r\n.`);

    const sendRes = await this.readResponse();
    if (sendRes.code >= 400) {
      throw new Error(`SMTP Send failed: ${sendRes.text}`);
    }

    // 7. QUIT
    try {
      await this.writeLine('QUIT');
      await this.readResponse();
    } catch {}

    try {
      if (this.socket) this.socket.close();
      if (this.nodeSocket) this.nodeSocket.destroy();
    } catch {}

    const msgIdMatch = mimePayload.match(/Message-ID:\s*<([^>]+)>/i);
    const messageId = msgIdMatch ? msgIdMatch[1] : `sent-${Date.now()}`;

    return { success: true, messageId };
  }
}
