# Contributing to @xtnd/mcp-one

Thank you for your interest in contributing to **`@xtnd/mcp-one`**! We welcome bug reports, feature suggestions, documentation improvements, and pull requests.

---

## Development Setup

1. **Fork and clone the repository:**
   ```bash
   git clone https://github.com/XTND-DYNAMICS/xtnd-mcp-one.git
   cd xtnd-mcp-one
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up local environment secrets:**
   ```bash
   cp .dev.vars.example .dev.vars
   # Edit .dev.vars with test credentials if running live tests
   ```

4. **Verify TypeScript typechecking & offline tests:**
   ```bash
   npm run check
   npm test
   ```

---

## Code Quality & Guidelines

* **Strict TypeScript**: Code must pass `npm run check` (`tsc --noEmit`) with zero errors.
* **Preserve Comments & JSDoc**: Ensure all exported types and functions include clear documentation.
* **Token Optimization**: When adding or updating tools that read email bodies, ensure content is sanitized and converted into compact Markdown using `htmlToMarkdown()`.
* **Zero Secret Leakage**: Never commit real credentials, passwords, or test API keys to git.

---

## Submitting a Pull Request

1. Create a feature branch:
   ```bash
   git checkout -b feat/my-new-feature
   ```
2. Commit your changes with clear, descriptive commit messages:
   ```bash
   git commit -m "feat(imap): add support for custom mailbox flags"
   ```
3. Push to your fork and submit a Pull Request to `main`.
4. Ensure CI checks pass on GitHub Actions.
