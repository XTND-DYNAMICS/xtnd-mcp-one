import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  buildLoginCommand,
  buildListCommand,
  buildSelectCommand,
  buildSearchCommand,
  buildFetchHeadersCommand,
  buildStoreFlagsCommand,
  buildMoveCommand,
} from '../src/core/imap/commands.js';
import {
  parseTaggedResponse,
  parseListResponse,
  parseSearchResponse,
} from '../src/core/imap/response.js';

describe('IMAP Commands & Response Parsing', () => {
  it('should build proper IMAP commands', () => {
    assert.strictEqual(buildLoginCommand('A001', 'user@domain.com', 'pass"123'), 'A001 LOGIN "user@domain.com" "pass\\"123"\r\n');
    assert.strictEqual(buildListCommand('A002', '', '*'), 'A002 LIST "" "*"\r\n');
    assert.strictEqual(buildSelectCommand('A003', 'INBOX'), 'A003 SELECT "INBOX"\r\n');
    assert.strictEqual(buildSearchCommand('A004', { unreadOnly: true, query: 'invoice' }), 'A004 UID SEARCH ALL UNSEEN TEXT "invoice"\r\n');
    assert.strictEqual(buildFetchHeadersCommand('A005', [10, 12]), 'A005 UID FETCH 10,12 (FLAGS INTERNALDATE RFC822.SIZE BODY.PEEK[HEADER.FIELDS (MESSAGE-ID FROM TO CC SUBJECT DATE IN-REPLY-TO REFERENCES CONTENT-TYPE)])\r\n');
    assert.strictEqual(buildStoreFlagsCommand('A006', [10], ['\\Seen'], 'add'), 'A006 UID STORE 10 +FLAGS (\\Seen)\r\n');
    assert.strictEqual(buildMoveCommand('A007', [10], 'Archive'), 'A007 UID MOVE 10 "Archive"\r\n');
  });

  it('should parse tagged responses', () => {
    const raw = `* LIST () "/" "INBOX"\r\n* LIST () "/" "Sent"\r\nA001 OK LIST Completed\r\n`;
    const res = parseTaggedResponse(raw, 'A001');
    assert.strictEqual(res.status, 'OK');
    assert.strictEqual(res.untagged.length, 2);
  });

  it('should parse LIST responses into MailboxFolders', () => {
    const untagged = [
      '* LIST (\\HasNoChildren) "/" "INBOX"',
      '* LIST (\\HasNoChildren \\Drafts) "/" "Drafts"',
      '* LIST (\\HasNoChildren \\Sent) "/" "Sent"',
    ];
    const folders = parseListResponse(untagged);
    assert.strictEqual(folders.length, 3);
    assert.strictEqual(folders[0].name, 'INBOX');
    assert.strictEqual(folders[1].name, 'Drafts');
  });

  it('should parse SEARCH response UIDs', () => {
    const untagged = ['* SEARCH 101 102 105 200'];
    const uids = parseSearchResponse(untagged);
    assert.deepStrictEqual(uids, [200, 105, 102, 101]);
  });
});
