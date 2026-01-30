# Always Coder

Remote AI coding agent control - access Claude, Codex and other AI assistants from anywhere via encrypted WebSocket.

## Quick Start

```bash
# Clone and build
git clone https://github.com/tyyzqmf/always-coder.git
cd always-coder
pnpm install && pnpm build:cli

# Configure server
node packages/cli/dist/index.js config set server wss://zys3xfqv9l.execute-api.us-east-1.amazonaws.com/prod

# Run
node packages/cli/dist/index.js claude
```

**One-liner:**
```bash
git clone https://github.com/tyyzqmf/always-coder.git && cd always-coder && pnpm install && pnpm build:cli && node packages/cli/dist/index.js config set server wss://zys3xfqv9l.execute-api.us-east-1.amazonaws.com/prod && node packages/cli/dist/index.js claude
```

## CLI Commands

```bash
always claude                    # Interactive mode
always claude --daemon           # Background mode
always sessions                  # List active sessions
always stop <id>                 # Stop a session
always clean                     # Stop all sessions
always config set server <url>   # Set server URL
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
