/**
 * High-performance Edge IMAP Client with implicit TLS
 * Supports Cloudflare Workers (cloudflare:sockets) and Node.js runtime (node:tls).
 */

import {
  EmailDetail,
  EmailHeaderSummary,
  MailboxCredentials,
  MailboxFolder,
  SearchOptions,
} from '../../types.js';
import {
  buildAppendCommand,
  buildCopyCommand,
  buildCreateCommand,
  buildDeleteCommand,
  buildExpungeCommand,
  buildFetchFullCommand,
  buildFetchHeadersCommand,
  buildListCommand,
  buildLoginCommand,
  buildLogoutCommand,
  buildMoveCommand,
  buildRenameCommand,
  buildSearchCommand,
  buildSelectCommand,
  buildStatusCommand,
  buildStoreFlagsCommand,
} from './commands.js';
import {
  extractFetchBody,
  parseFetchHeaders,
  parseListResponse,
  parseSearchResponse,
  parseStatusResponse,
  parseTaggedResponse,
} from './response.js';
import { parseRfc822 } from '../parser/mime-parser.js';

export class EdgeImapClient {
  private host: string;
  private port: number;
  private tagCounter = 1;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private socket: any = null;
  private nodeSocket: any = null;
  private buffer = '';

  constructor(credentials: Partial<MailboxCredentials> = {}) {
    this.host = credentials.imapHost || 'imap.one.com';
    this.port = credentials.imapPort || 993;
  }

  private nextTag(): string {
    return `A${String(this.tagCounter++).padStart(4, '0')}`;
  }

  async connect(): Promise<void> {
    // Detect environment: Cloudflare Workers vs Node.js
    if (typeof (globalThis as any).WebSocketPair !== 'undefined' || (globalThis as any).navigator?.userAgent?.includes('Cloudflare-Workers')) {
      try {
        const { connect } = await import('cloudflare:sockets');
        this.socket = connect(`${this.host}:${this.port}`, {
          secureTransport: 'on',
          allowHalfOpen: false,
        });
        this.reader = this.socket.readable.getReader();
        this.writer = this.socket.writable.getWriter();
        await this.readUntilGreeting();
        return;
      } catch (err) {
        // Fall back to Node.js tls if available
      }
    }

    // Node.js fallback (for local CLI, test suite, and scripts)
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

  private async readUntilGreeting(): Promise<string> {
    return this.readChunk();
  }

  private async writeRaw(data: string): Promise<void> {
    if (this.writer) {
      const bytes = new TextEncoder().encode(data);
      await this.writer.write(bytes);
    } else if (this.nodeSocket) {
      await new Promise<void>((resolve, reject) => {
        this.nodeSocket.write(data, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } else {
      throw new Error('IMAP Client is not connected');
    }
  }

  private async readChunk(): Promise<string> {
    if (this.reader) {
      const { value, done } = await this.reader.read();
      if (done || !value) return '';
      const text = new TextDecoder().decode(value);
      return text;
    }
    return '';
  }

  async sendCommand(commandGenerator: (tag: string) => string): Promise<{ status: 'OK' | 'NO' | 'BAD'; info: string; untagged: string[]; raw: string }> {
    const tag = this.nextTag();
    const cmdText = commandGenerator(tag);

    if (this.nodeSocket) {
      this.buffer = '';
      await this.writeRaw(cmdText);

      // Wait for tagged line
      while (!this.buffer.includes(`${tag} OK`) && !this.buffer.includes(`${tag} NO`) && !this.buffer.includes(`${tag} BAD`)) {
        await new Promise((r) => setTimeout(r, 20));
      }

      const parsed = parseTaggedResponse(this.buffer, tag);
      return { ...parsed, raw: this.buffer };
    }

    if (this.reader) {
      let accumulated = '';
      await this.writeRaw(cmdText);

      while (true) {
        const chunk = await this.readChunk();
        accumulated += chunk;
        if (accumulated.includes(`${tag} OK`) || accumulated.includes(`${tag} NO`) || accumulated.includes(`${tag} BAD`)) {
          break;
        }
      }

      const parsed = parseTaggedResponse(accumulated, tag);
      return { ...parsed, raw: accumulated };
    }

    throw new Error('IMAP connection lost');
  }

  async login(user: string, pass: string): Promise<boolean> {
    const res = await this.sendCommand((tag) => buildLoginCommand(tag, user, pass));
    if (res.status !== 'OK') {
      throw new Error(`IMAP Authentication failed: ${res.info}`);
    }
    return true;
  }

  async listFolders(reference = '', mailbox = '*'): Promise<MailboxFolder[]> {
    const res = await this.sendCommand((tag) => buildListCommand(tag, reference, mailbox));
    if (res.status !== 'OK') {
      throw new Error(`IMAP LIST failed: ${res.info}`);
    }
    return parseListResponse(res.untagged);
  }

  async selectFolder(mailbox = 'INBOX'): Promise<{ exists: number; recent: number; flags: string[] }> {
    const res = await this.sendCommand((tag) => buildSelectCommand(tag, mailbox));
    if (res.status !== 'OK') {
      throw new Error(`IMAP SELECT ${mailbox} failed: ${res.info}`);
    }

    let exists = 0;
    let recent = 0;
    for (const line of res.untagged) {
      const existsMatch = line.match(/^\*\s+(\d+)\s+EXISTS/i);
      if (existsMatch) exists = parseInt(existsMatch[1], 10);
      const recentMatch = line.match(/^\*\s+(\d+)\s+RECENT/i);
      if (recentMatch) recent = parseInt(recentMatch[1], 10);
    }

    return { exists, recent, flags: [] };
  }

  async getFolderStatus(mailbox: string): Promise<{ total: number; unread: number }> {
    const res = await this.sendCommand((tag) => buildStatusCommand(tag, mailbox));
    if (res.status !== 'OK') {
      return { total: 0, unread: 0 };
    }
    return parseStatusResponse(res.untagged);
  }

  async createFolder(mailbox: string): Promise<boolean> {
    const res = await this.sendCommand((tag) => buildCreateCommand(tag, mailbox));
    return res.status === 'OK';
  }

  async renameFolder(oldName: string, newName: string): Promise<boolean> {
    const res = await this.sendCommand((tag) => buildRenameCommand(tag, oldName, newName));
    return res.status === 'OK';
  }

  async deleteFolder(mailbox: string): Promise<boolean> {
    const res = await this.sendCommand((tag) => buildDeleteCommand(tag, mailbox));
    return res.status === 'OK';
  }

  async search(options: SearchOptions = {}): Promise<number[]> {
    const res = await this.sendCommand((tag) => buildSearchCommand(tag, options));
    if (res.status !== 'OK') {
      throw new Error(`IMAP SEARCH failed: ${res.info}`);
    }
    const uids = parseSearchResponse(res.untagged);
    if (options.limit && options.limit > 0) {
      return uids.slice(0, options.limit);
    }
    return uids;
  }

  async fetchHeaders(uids: number[]): Promise<EmailHeaderSummary[]> {
    if (!uids || uids.length === 0) return [];
    const res = await this.sendCommand((tag) => buildFetchHeadersCommand(tag, uids));
    return parseFetchHeaders(res.raw);
  }

  async fetchFull(uid: number): Promise<EmailDetail> {
    const res = await this.sendCommand((tag) => buildFetchFullCommand(tag, uid));
    if (res.status !== 'OK') {
      throw new Error(`IMAP FETCH for UID ${uid} failed: ${res.info}`);
    }

    const { body, flags } = extractFetchBody(res.raw, uid);
    return parseRfc822(body, uid, flags);
  }

  async markFlags(uids: number[], flags: string[], action: 'add' | 'remove' | 'set'): Promise<boolean> {
    if (!uids || uids.length === 0) return true;
    const res = await this.sendCommand((tag) => buildStoreFlagsCommand(tag, uids, flags, action));
    return res.status === 'OK';
  }

  async move(uids: number[], targetFolder: string): Promise<boolean> {
    if (!uids || uids.length === 0) return true;
    // Attempt UID MOVE first (RFC 6851)
    const res = await this.sendCommand((tag) => buildMoveCommand(tag, uids, targetFolder));
    if (res.status === 'OK') return true;

    // Fallback: UID COPY + STORE \Deleted + EXPUNGE
    await this.sendCommand((tag) => buildCopyCommand(tag, uids, targetFolder));
    await this.markFlags(uids, ['\\Deleted'], 'add');
    await this.expunge();
    return true;
  }

  async copy(uids: number[], targetFolder: string): Promise<boolean> {
    if (!uids || uids.length === 0) return true;
    const res = await this.sendCommand((tag) => buildCopyCommand(tag, uids, targetFolder));
    return res.status === 'OK';
  }

  async expunge(): Promise<boolean> {
    const res = await this.sendCommand((tag) => buildExpungeCommand(tag));
    return res.status === 'OK';
  }

  async appendMessage(mailbox: string, rawMessage: string, flags = ['\\Draft', '\\Seen']): Promise<boolean> {
    const tag = this.nextTag();
    const cmd = buildAppendCommand(tag, mailbox, rawMessage, flags);

    if (this.nodeSocket) {
      this.buffer = '';
      await this.writeRaw(cmd);
      // Wait for server + continuation prompt
      while (!this.buffer.includes('+') && !this.buffer.includes(`${tag} NO`) && !this.buffer.includes(`${tag} BAD`)) {
        await new Promise((r) => setTimeout(r, 20));
      }
      this.buffer = '';
      await this.writeRaw(rawMessage + '\r\n');
      while (!this.buffer.includes(`${tag} OK`) && !this.buffer.includes(`${tag} NO`) && !this.buffer.includes(`${tag} BAD`)) {
        await new Promise((r) => setTimeout(r, 20));
      }
      return this.buffer.includes(`${tag} OK`);
    }

    if (this.reader) {
      await this.writeRaw(cmd);
      // Read continuation +
      await this.readChunk();
      await this.writeRaw(rawMessage + '\r\n');
      let acc = '';
      while (true) {
        acc += await this.readChunk();
        if (acc.includes(`${tag} OK`) || acc.includes(`${tag} NO`) || acc.includes(`${tag} BAD`)) break;
      }
      return acc.includes(`${tag} OK`);
    }

    return false;
  }

  async logout(): Promise<void> {
    try {
      await this.sendCommand((tag) => buildLogoutCommand(tag));
    } catch {}

    try {
      if (this.reader) await this.reader.cancel();
      if (this.writer) await this.writer.close();
      if (this.socket) this.socket.close();
      if (this.nodeSocket) this.nodeSocket.destroy();
    } catch {}
  }
}
