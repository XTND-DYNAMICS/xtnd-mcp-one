# CLAUDE.md — xtnd-mcp-one

Model Context Protocol (MCP) server for one.com mail server on Cloudflare Workers (`one.mcp.xgi.io`).

## Golden Rules
1. **Commit only what you changed.** Stage files explicitly; never `git add -A` / `git add .`.
2. **Never commit credentials.** `.dev.vars` contains real mailbox secrets (`ONECOM_PASSWORD`) and must remain gitignored.
3. **Typecheck and test before committing:**
   - `npm run check` (`tsc --noEmit`)
   - `npm test` (offline unit tests)
   - `npm run test:live` (integration tests against live `pam@stejle.dk` account)

## Commands
- `npm run dev`: Start local Wrangler dev server on `:8787`.
- `npm run check`: Run TypeScript compiler typecheck.
- `npm test`: Run offline unit test suite.
- `npm run test:live`: Run live integration test against one.com.
- `npm run deploy`: Deploy Worker to Cloudflare (`one.mcp.xgi.io`).
