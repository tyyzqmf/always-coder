# Always Coder

Remote AI coding agent control - access Claude, Codex and other AI assistants from anywhere via encrypted WebSocket.

## Quick Start (New Machine)

```bash
# 1. Clone and install
git clone https://github.com/tyyzqmf/always-coder.git
cd always-coder
pnpm install && pnpm build:cli

# 2. Configure server and web URL
pnpm always init <server-url> <web-url>

# 3. Run
pnpm always claude
```

## CLI Commands

```bash
pnpm always claude                      # Interactive mode
pnpm always claude --daemon             # Background mode
pnpm always sessions                    # List active sessions
pnpm always stop <id>                   # Stop a session
pnpm always clean                       # Stop all sessions
pnpm always config list                 # Show configuration
pnpm always init <server> <webUrl>      # Quick config setup
```

## Development

```bash
pnpm dev          # Run all packages
pnpm check        # Lint + build CLI
pnpm build:cli    # Build CLI only
pnpm test         # Run tests
```

## Architecture

```
CLI (node-pty) ←→ AWS (Lambda/WebSocket) ←→ Web (Next.js/xterm.js)
                     ↑
              E2E Encrypted (X25519 + XSalsa20-Poly1305)
```

## Project Structure

```
packages/
├── cli/      # CLI client
├── server/   # AWS Lambda handlers
├── web/      # Next.js web app
└── shared/   # Shared types & crypto
```

## License

MIT
