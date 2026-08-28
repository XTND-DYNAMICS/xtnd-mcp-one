import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseHeaders, parseAddressList, decodeMimeWords, parseRfc822 } from '../src/core/parser/mime-parser.js';
import { composeMimeMessage } from '../src/core/smtp/mime.js';

describe('MIME & Header Parser', () => {
  it('should parse headers with unfolded continuation lines', () => {
    const rawHeaders = `From: "John Doe" <john@example.com>\r\nSubject: Test\r\n Multi-line\r\n Subject\r\nTo: jane@example.com`;
    const headers = parseHeaders(rawHeaders);
    assert.strictEqual(headers.get('from'), '"John Doe" <john@example.com>');
    assert.strictEqual(headers.get('subject'), 'Test Multi-line Subject');
    assert.strictEqual(headers.get('to'), 'jane@example.com');
  });

  it('should parse email addresses', () => {
    const fromStr = '"Doe, Jane" <jane@example.com>, user@domain.com';
    const list = parseAddressList(fromStr);
    assert.strictEqual(list.length, 2);
    assert.strictEqual(list[0].name, 'Doe, Jane');
    assert.strictEqual(list[0].address, 'jane@example.com');
    assert.strictEqual(list[1].address, 'user@domain.com');
  });

  it('should decode MIME encoded words', () => {
    // =?utf-8?B?SGVsbG8gV29ybGQ=?= is "Hello World"
    const decoded = decodeMimeWords('=?utf-8?B?SGVsbG8gV29ybGQ=?=');
    assert.strictEqual(decoded, 'Hello World');
  });

  it('should compose and parse back RFC 5322 MIME messages', () => {
    const mime = composeMimeMessage(
      {
        to: 'pam@stejle.dk',
        subject: 'Test Email',
        bodyText: 'Plain body message',
        bodyHtml: '<p>HTML body <b>message</b></p>',
      },
      'sender@example.com'
    );

    const parsed = parseRfc822(mime, 101, ['\\Seen']);
    assert.strictEqual(parsed.uid, 101);
    assert.strictEqual(parsed.to[0].address, 'pam@stejle.dk');
    assert.strictEqual(parsed.subject, 'Test Email');
    assert.ok(parsed.bodyText?.includes('Plain body message'));
    assert.ok(parsed.bodyMarkdown?.includes('HTML body **message**'));
  });
});
