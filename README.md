# Always Coder

Remote AI coding agent control - access Claude, Codex and other AI assistants from anywhere via encrypted WebSocket.

## Quick Start (New Machine)

```bash
# One-liner install
curl -fsSL https://raw.githubusercontent.com/tyyzqmf/always-coder/main/install.sh | bash -s -- <server-url> <web-url>

# Reload shell (first time only)
source ~/.bashrc

# Run
always claude
```

## CLI Commands

```bash
always claude                # Interactive mode
always claude --daemon       # Background mode
always sessions              # List active sessions
always stop <id>             # Stop a session
always clean                 # Stop all sessions
always config list           # Show configuration
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
