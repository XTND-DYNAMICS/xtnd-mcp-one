# @xtnd/mcp-one

Model Context Protocol (MCP) server for **one.com** mail servers, running as a Cloudflare Worker at **`https://one.mcp.xgi.io`**.

Provides full mail management (IMAP port 993 implicit TLS & SMTP port 465 implicit TLS) for AI agents such as Claude Desktop, Claude Code, Cursor, and OpenAPI-compatible AI clients (ChatGPT Actions).

## Features

- **Folders**: `list_folders`, `create_folder`, `delete_folder`, `rename_folder`
- **Search**: `search_emails`, `get_recent_emails` (server-side IMAP search)
- **Read**: `get_email_content`, `get_email_thread` (with token-efficient HTML-to-Markdown)
- **Triage**: `mark_emails` (read/unread/flag/unflag), `move_emails`, `delete_emails`
- **Send & Reply**: `send_email`, `reply_email`, `forward_email`, `create_draft`
- **AI-Optimized**: Strips tracking pixels, scripts, and stylesheets, converting HTML to clean Markdown.

## Connecting Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "onecom-mail": {
      "url": "https://one.mcp.xgi.io/sse",
      "headers": {
        "Authorization": "Bearer xmail_api_key_..."
      }
    }
  }
}
```

## Local Development

```bash
# Install dependencies
npm install

# Typecheck
npm run check

# Run offline unit tests
npm test

# Run live smoke test against one.com
npm run test:live

# Start local worker
npm run dev
```
