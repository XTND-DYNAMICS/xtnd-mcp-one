<div align="center">

![XTND | MCP | ONE](assets/banner.jpg)

# XTND | MCP | ONE
### Official Model Context Protocol (MCP) Server for one.com Mail

[![npm version](https://img.shields.io/npm/v/@xtnd-dynamics/mcp-one.svg?color=blue)](https://www.npmjs.com/package/@xtnd-dynamics/mcp-one)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Smithery Compatible](https://img.shields.io/badge/Smithery-Compatible-orange.svg)](https://smithery.ai)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-f38020.svg?logo=cloudflare)](https://workers.cloudflare.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6.svg?logo=typescript)](https://www.typescriptlang.org)

**Connect Claude, ChatGPT, Cursor, and autonomous AI agents directly to your one.com email infrastructure with full mailbox management capabilities.**

[Features](#-key-features) • [Installation](#-installation--setup) • [Tool Catalog](#-available-mcp-tools) • [Architecture](#-architecture) • [Security](#-security--privacy) • [References](#-references--useful-links)

</div>

---

## 🚀 Key Features

* **📂 Mailbox & Folder Management**: Full control over mailboxes (`INBOX`, `Drafts`, `Sent`, `Archive`, `Trash`, and custom folders) with real-time total and unread message counters.
* **🔍 Fast Server-Side Search**: Search by full-text keyword, sender, recipient, subject, date ranges, and flags (`unread`, `flagged`) without downloading massive mailboxes.
* **📖 AI Context Protection (HTML to Markdown)**: Automatically cleans HTML emails, strips CSS styles, tracking pixels, and scripts, converting message bodies into compact, token-efficient Markdown for LLMs.
* **🏷️ Triage & Organization**: Mark emails as read/unread/flagged, organize into folders, and delete (soft delete to Trash or permanent expunge).
* **✉️ Outbound Delivery & Composition**: Send new emails, reply with automated `In-Reply-To`/`References`/quoted history, forward messages, and save drafts directly to `one.com`'s IMAP Drafts folder.
* **⚡ Dual-Mode Execution**: Run 100% locally via NPX Stdio (zero cloud setup) or connect to the multi-tenant hosted Cloudflare Edge Gateway (`https://one.mcp.xgi.io/sse`).

---

## 📦 Installation & Setup

### Option 1: Claude Desktop (Local Stdio — Recommended)

Add the following to your `claude_desktop_config.json`:

* **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
* **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "XTND | MCP | ONE": {
      "command": "npx",
      "args": ["-y", "@xtnd-dynamics/mcp-one"],
      "env": {
        "ONECOM_EMAIL": "user@yourdomain.com",
        "ONECOM_PASSWORD": "your_mailbox_password"
      }
    }
  }
}
```

> [!TIP]
> Restart Claude Desktop (<kbd>Cmd</kbd> + <kbd>Q</kbd> $\rightarrow$ Reopen) after saving the config.

---

### Option 2: 1-Click Install via Smithery

Install automatically for Claude Desktop using the [Smithery](https://smithery.ai) CLI:

```bash
npx -y @smithery/cli install @xtnd-dynamics/mcp-one --client claude
```

---

### Option 3: Hosted SaaS Gateway (Remote AI Agents & Cursor)

For web-based AI clients, Cursor, or remote frameworks connecting over HTTPS / Server-Sent Events (SSE):

```json
{
  "mcpServers": {
    "XTND | MCP | ONE": {
      "url": "https://one.mcp.xgi.io/sse",
      "headers": {
        "X-OneCom-Email": "user@yourdomain.com",
        "X-OneCom-Password": "your_mailbox_password"
      }
    }
  }
}
```

---

### Option 4: ChatGPT Custom Actions (OpenAPI 3.0)

In your Custom GPT configuration, add an **Action** pointing to the OpenAPI specification:

* **OpenAPI URL:** `https://one.mcp.xgi.io/openapi.json`
* **Authentication:** API Key (Bearer token)

---

## 🛠️ Available MCP Tools

`@xtnd-dynamics/mcp-one` provides 15 specialized tools across the entire mail management lifecycle:

| Tool Name | Parameters | Description |
|---|---|---|
| `list_folders` | *none* | Lists all mailboxes with total and unread message counts. |
| `create_folder` | `name` | Creates a new folder or mailbox in the account. |
| `rename_folder` | `oldName`, `newName` | Renames an existing mailbox. |
| `delete_folder` | `name` | Deletes a folder (with system mailbox protections). |
| `search_emails` | `query`, `folder?`, `from?`, `to?`, `subject?`, `since?`, `before?`, `unreadOnly?`, `flaggedOnly?`, `limit?` | Searches emails with server-side IMAP filters. |
| `get_recent_emails` | `folder?`, `limit?` | Fetches recent email envelopes and unread statuses. |
| `get_email_content` | `folder`, `uid`, `format?` | Retrieves full email content parsed to clean Markdown. |
| `get_email_thread` | `folder`, `uidOrMessageId` | Traverses headers to reconstruct the complete conversation thread. |
| `mark_emails` | `folder`, `uids[]`, `action` | Updates flags (`read`, `unread`, `flag`, `unflag`). |
| `move_emails` | `sourceFolder`, `targetFolder`, `uids[]` | Moves emails between mailboxes. |
| `delete_emails` | `folder`, `uids[]`, `permanent?` | Soft deletes (moves to Trash) or permanently expunges. |
| `send_email` | `to`, `subject`, `bodyText`, `bodyHtml?`, `cc?`, `bcc?` | Sends outbound email via `send.one.com:465` (SMTPS). |
| `reply_email` | `folder`, `uid`, `bodyText`, `bodyHtml?`, `replyAll?` | Sends a reply with proper `In-Reply-To` and quoted text. |
| `forward_email` | `folder`, `uid`, `to`, `comment?` | Forwards an existing email with original headers. |
| `create_draft` | `to`, `subject`, `bodyText`, `bodyHtml?`, `cc?` | Saves a message into `Drafts` without sending. |

---

## 🏗️ Architecture

```
┌─────────────────────────┐
│   AI Client / Claude    │
└────────────┬────────────┘
             │  JSON-RPC (stdio or HTTP/SSE)
             ▼
┌─────────────────────────────────────────────────────────┐
│ XTND | MCP | ONE (@xtnd-dynamics/mcp-one)                        │
│                                                         │
│  [HTML-to-Markdown Optimizer] ── Token Budget Pruner    │
│  [MIME Parser & Builder]     ── RFC 5322 & RFC 2045     │
│  [Multi-Tenant Session Pool] ── Isolated Mailbox Auth   │
└────────────┬─────────────────────────────────┬──────────┘
             │ IMAP:993 (Implicit TLS)         │ SMTPS:465 (Implicit TLS)
             ▼                                 ▼
    ┌─────────────────┐               ┌─────────────────┐
    │  imap.one.com   │               │  send.one.com   │
    │ (Read / Search) │               │ (Send / Reply)  │
    └─────────────────┘               └─────────────────┘
```

---

## 🔒 Security & Privacy

* **Zero Credential Logging**: Mailbox passwords are never logged, buffered to disk, or retained across sessions.
* **Direct Encrypted Transport**: All IMAP communication strictly uses implicit SSL/TLS on port 993 (`imap.one.com`), and all SMTP communication strictly uses implicit SSL/TLS on port 465 (`send.one.com`).
* **Local Isolation**: In Local Stdio mode (`npx @xtnd-dynamics/mcp-one`), credentials remain 100% on your local machine and never touch any intermediate server.

---

## 📚 References & Useful Links

* [one.com Mail Setup Guide](https://help.one.com/hc/en-us/articles/115005586869-Setting-up-mail-on-iPhone-iPad-Mac-PC)
* [Model Context Protocol (MCP) Official Documentation](https://modelcontextprotocol.io)
* [Anthropic MCP GitHub Organization](https://github.com/modelcontextprotocol)
* [Smithery.ai Registry Manifest](https://smithery.ai/docs/config)
* [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
* [XTND Dynamics GitHub](https://github.com/XTND-DYNAMICS)

---

## 👥 Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) and [Security Policy](SECURITY.md).

```bash
git clone https://github.com/XTND-DYNAMICS/xtnd-mcp-one.git
cd xtnd-mcp-one
npm install
npm test
```

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

Copyright © 2026 [XTND Dynamics](https://github.com/XTND-DYNAMICS).
