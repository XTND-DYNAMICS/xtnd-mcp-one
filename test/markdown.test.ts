import { describe, it } from 'node:test';
import assert from 'node:assert';
import { htmlToMarkdown, decodeHtmlEntities, truncateForAI } from '../src/core/parser/markdown.js';

describe('HTML to Markdown Parser', () => {
  it('should strip scripts, styles, and hidden tracking pixels', () => {
    const rawHtml = `
      <html>
        <head><style>body { color: red; }</style></head>
        <body>
          <script>console.log('tracking');</script>
          <img width="1" height="1" src="https://tracker.com/pixel.gif" />
          <h1>Hello World</h1>
          <p>This is a <b>test</b> email with <a href="https://example.com">a link</a>.</p>
        </body>
      </html>
    `;
    const md = htmlToMarkdown(rawHtml);
    assert.ok(!md.includes('<style>'));
    assert.ok(!md.includes('<script>'));
    assert.ok(!md.includes('tracker.com'));
    assert.ok(md.includes('# Hello World'));
    assert.ok(md.includes('**test**'));
    assert.ok(md.includes('[a link](https://example.com)'));
  });

  it('should decode HTML entities correctly', () => {
    assert.strictEqual(decodeHtmlEntities('&amp; &lt; &gt; &quot; &#39;'), '& < > " \'');
  });

  it('should truncate content exceeding maximum character budget', () => {
    const longText = 'a'.repeat(20000);
    const { text, truncated } = truncateForAI(longText, 5000);
    assert.strictEqual(truncated, true);
    assert.ok(text.includes('[... Remaining content truncated'));
    assert.ok(text.length < 6000);
  });
});
