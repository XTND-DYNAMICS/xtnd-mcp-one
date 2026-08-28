# @xtnd/mcp-one

[![npm version](https://img.shields.io/npm/v/@xtnd/mcp-one.svg)](https://www.npmjs.com/package/@xtnd/mcp-one)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Smithery Compatible](https://img.shields.io/badge/Smithery-Compatible-orange.svg)](https://smithery.ai)

Official **Model Context Protocol (MCP)** server for **one.com** mail accounts.

Provides **full email management** (IMAP over TLS 993 & SMTP over TLS 465) for AI agents such as **Claude Desktop**, **Claude Code**, **Cursor**, **ChatGPT**, and custom agentic frameworks.

---

## Features

- 📂 **Folders & Mailboxes**: `list_folders`, `create_folder`, `rename_folder`, `delete_folder` with real-time message and unread counters.
- 🔍 **Search & Discovery**: Server-side IMAP search (`search_emails`, `get_recent_emails`) across subject, sender, recipient, date ranges, and unread/flagged states.
- 📖 **Token-Optimized Reading**: `get_email_content` and `get_email_thread` automatically strip tracking beacons, CSS styles, and scripts, converting HTML bodies into clean, compact Markdown for AI context windows.
- 🏷️ **Triage & Organization**: `mark_emails` (read, unread, flag, unflag), `move_emails` (archive, folders), and `delete_emails` (trash or expunge).
- ✉️ **Outbound & Composition**: `send_email`, `reply_email` (with automated `In-Reply-To`, `References`, and quoted body), `forward_email`, and `create_draft`.

---

## Quickstart

### 1. Claude Desktop (Local Stdio — Recommended)

Add the following to your `claude_desktop_config.json`:

* **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
* **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "onecom-mail": {
      "command": "npx",
      "args": ["-y", "@xtnd/mcp-one"],
      "env": {
        "ONECOM_EMAIL": "your-email@yourdomain.com",
        "ONECOM_PASSWORD": "your_mailbox_password"
      }
    }
  }
}
```

### 2. Installing via Smithery

To install `@xtnd/mcp-one` for Claude Desktop automatically via [Smithery](https://smithery.ai):

```bash
npx -y @smithery/cli install @xtnd/mcp-one --client claude
```

### 3. Remote / Hosted SaaS Gateway (`one.mcp.xgi.io`)

For web-based AI clients, Cursor, or remote agents connecting over HTTPS / Server-Sent Events (SSE):

```json
{
  "mcpServers": {
    "onecom-mail": {
      "url": "https://one.mcp.xgi.io/sse",
      "headers": {
        "X-OneCom-Email": "your-email@yourdomain.com",
        "X-OneCom-Password": "your_mailbox_password"
      }
    }
  }
}
```

---

## Available MCP Tools

| Tool | Parameters | Description |
|---|---|---|
| `list_folders` | *none* | Lists all mailboxes with total and unread counts. |
| `create_folder` | `name` | Creates a new folder or mailbox. |
| `rename_folder` | `oldName`, `newName` | Renames an existing mailbox. |
| `delete_folder` | `name` | Deletes a mailbox. |
| `search_emails` | `query`, `folder?`, `from?`, `to?`, `subject?`, `since?`, `before?`, `unreadOnly?`, `flaggedOnly?`, `limit?` | Searches emails with server-side IMAP filters. |
| `get_recent_emails` | `folder?`, `limit?` | Fetches the latest emails from a folder. |
| `get_email_content` | `folder`, `uid`, `format?` | Retrieves full email content parsed to clean Markdown. |
| `get_email_thread` | `folder`, `uidOrMessageId` | Traverses headers to reconstruct the full conversational thread. |
| `mark_emails` | `folder`, `uids[]`, `action` | Updates flags (`read`, `unread`, `flag`, `unflag`). |
| `move_emails` | `sourceFolder`, `targetFolder`, `uids[]` | Moves emails between mailboxes. |
| `delete_emails` | `folder`, `uids[]`, `permanent?` | Soft deletes (moves to Trash) or permanently expunges. |
| `send_email` | `to`, `subject`, `bodyText`, `bodyHtml?`, `cc?`, `bcc?` | Sends outbound email via `send.one.com:465` with implicit TLS. |
| `reply_email` | `folder`, `uid`, `bodyText`, `bodyHtml?`, `replyAll?` | Sends a reply with proper headers and quoted context. |
| `forward_email` | `folder`, `uid`, `to`, `comment?` | Forwards an email to new recipients. |
| `create_draft` | `to`, `subject`, `bodyText`, `bodyHtml?`, `cc?` | Saves a message into the `Drafts` folder without sending. |

---

## Security & Privacy

* **Zero Password Logging**: Passwords are never logged, buffered, or retained.
* **Direct Encrypted Transport**: All IMAP communication uses implicit SSL/TLS on port 993 (`imap.one.com`), and all SMTP communication uses implicit SSL/TLS on port 465 (`send.one.com`).
* **Local Mode Isolation**: In Local Stdio mode (`npx @xtnd/mcp-one`), credentials never leave your machine.

---

## Development

```bash
# Clone repository
git clone https://github.com/XTND-DYNAMICS/xtnd-mcp-one.git
cd xtnd-mcp-one

# Install dependencies
npm install

# Run unit tests
npm test

# Run multi-tenant live tests
npm run test:live

# Build distribution artifacts
npm run build
```

---

## License

MIT © [XTND Dynamics](https://github.com/XTND-DYNAMICS)
