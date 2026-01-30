# Always Coder

Remote AI coding agent control system - access Claude, Codex, and other AI assistants from anywhere via end-to-end encrypted WebSocket connections.

## Features

- **Remote Terminal Access** - Control AI assistants (Claude, Codex, etc.) from any device
- **End-to-End Encryption** - All data encrypted using X25519 + XSalsa20-Poly1305 (NaCl/libsodium)
- **Zero-Knowledge Server** - Server relays encrypted messages without decryption
- **QR Code Pairing** - Scan to connect instantly from your phone or browser
- **Real-time Sync** - Live terminal output with xterm.js emulation

## Architecture

```
CLI (node-pty) <--> AWS (Lambda/WebSocket) <--> Web (Next.js/xterm.js)
                          |
                  E2E Encrypted (X25519 + XSalsa20-Poly1305)
```

## Quick Start

### For End Users (Using Existing Backend)

If someone has already deployed the Always Coder infrastructure and provided you with server/web URLs:

```bash
# One-liner install
curl -fsSL https://raw.githubusercontent.com/tyyzqmf/always-coder/main/install.sh | bash -s -- <server-url> <web-url>

# Reload shell (first time only)
source ~/.bashrc

# Start a session
always claude
```

### For Self-Deployment (Full Setup)

If you want to deploy your own Always Coder infrastructure:

1. **Prerequisites**
   - Node.js 20+
   - pnpm 8.14+
   - AWS Account with CLI configured
   - AWS CDK CLI (`npm install -g aws-cdk`)

2. **Deploy Infrastructure**
   ```bash
   # Clone the repository
   git clone https://github.com/tyyzqmf/always-coder.git
   cd always-coder

   # Install dependencies
   pnpm install

   # Deploy AWS infrastructure (first time: cdk bootstrap)
   cd infra
   pnpm cdk bootstrap  # Only needed once per AWS account/region
   pnpm cdk deploy --all

   # Note the outputs:
   # - WebSocketUrl: wss://xxx.execute-api.region.amazonaws.com/prod
   # - WebUrl: https://xxx.cloudfront.net
   ```

3. **Install CLI**
   ```bash
   # From repo root
   cd ..
   ./install.sh <WebSocketUrl> <WebUrl>
   source ~/.bashrc
   ```

4. **Start Using**
   ```bash
   always claude  # Starts Claude with QR code for remote access
   ```

See [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) for detailed setup guide.
See [infra/README.md](infra/README.md) for AWS infrastructure details.

## System Requirements

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 20+ | Required for CLI and build |
| pnpm | 8.14+ | Package manager |
| AWS CLI | 2.x | For infrastructure deployment |
| AWS CDK | 2.124+ | Infrastructure as Code |

## CLI Commands

```bash
# Start AI assistant sessions
always claude                # Start Claude in interactive mode
always claude --daemon       # Start Claude in background mode
always codex                 # Start Codex
always -- <any-command>      # Wrap any command

# Session management
always sessions              # List active sessions
always stop <id>             # Stop a specific session
always clean                 # Stop all sessions

# Configuration
always config list           # Show current configuration
always config set server <url>  # Set server URL
always config set web <url>     # Set web URL
always init <server> <web>      # Initialize configuration
```

## Project Structure

```
always-coder/
├── packages/
│   ├── cli/       # CLI client (always command)
│   ├── server/    # AWS Lambda handlers
│   ├── web/       # Next.js web terminal
│   └── shared/    # Shared types & crypto
├── infra/         # AWS CDK infrastructure
└── docs/          # Documentation
```

## Development

```bash
# Run all packages in dev mode
pnpm dev

# Build everything
pnpm build

# Run tests
pnpm test

# Lint and typecheck
pnpm lint
pnpm typecheck

# Build CLI only
pnpm --filter @always-coder/cli build

# Run web dev server
pnpm --filter @always-coder/web dev
```

## Troubleshooting

### Installation Issues

**"pnpm not found"**
```bash
npm install -g pnpm
```

**"Node.js 20+ required"**
```bash
# Using nvm
nvm install 20
nvm use 20
```

**"always command not found" after installation**
```bash
source ~/.bashrc
# Or add to PATH manually:
export PATH="$HOME/.local/bin:$PATH"
```

### Connection Issues

**"WebSocket connection failed"**
- Verify your server URL is correct: `always config list`
- Check if the AWS infrastructure is deployed and running
- Ensure your network allows WebSocket connections

**"Session not found"**
- Sessions expire after 24 hours
- Create a new session with `always claude`

### Deployment Issues

**"CDK bootstrap required"**
```bash
cd infra
pnpm cdk bootstrap
```

**"Insufficient permissions"**
- Ensure your AWS credentials have permissions for:
  - API Gateway
  - Lambda
  - DynamoDB
  - CloudFront
  - S3
  - Cognito
  - IAM (for creating roles)

## Security

- **E2E Encryption**: All terminal data is encrypted client-to-client
- **Zero-Knowledge**: Server cannot decrypt message contents
- **Session Expiry**: Sessions automatically expire after 24 hours
- **Key Exchange**: X25519 Diffie-Hellman for secure key establishment

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `pnpm test`
5. Submit a pull request

## License

MIT
