# Always Coder

Remote AI coding agent control system built on AWS. Control your AI coding assistants (Claude, Codex, etc.) from anywhere via a secure web interface.

## Features

- 🔐 **End-to-End Encryption**: All terminal data is encrypted using X25519 + XSalsa20-Poly1305
- 📱 **Mobile-First Web UI**: Access your terminal from any device
- 🔗 **QR Code Pairing**: Quick and secure session establishment
- ☁️ **Serverless Architecture**: Built on AWS Lambda, API Gateway, and DynamoDB
- 🚀 **Real-time Communication**: WebSocket-based bidirectional streaming

## Architecture

```
┌─────────────┐    WebSocket (E2EE)    ┌─────────────────┐    WebSocket (E2EE)    ┌─────────────┐
│  CLI Client │◄─────────────────────►│   AWS Backend   │◄─────────────────────►│  Web Client │
│  (Bun/PTY)  │                        │ (Lambda/APIGW)  │                        │  (Next.js)  │
└─────────────┘                        └─────────────────┘                        └─────────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+
- Bun 1.0+
- pnpm 8+
- AWS CLI configured
- AWS CDK CLI (`npm install -g aws-cdk`)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/always-coder.git
cd always-coder

# Install dependencies
pnpm install

# Build shared package
pnpm --filter @always-coder/shared build
```

### Deploy AWS Infrastructure

```bash
# Bootstrap CDK (first time only)
cd infra
pnpm cdk bootstrap

# Deploy all stacks
pnpm cdk deploy --all

# Note the outputs:
# - WebSocketUrl: wss://xxx.execute-api.region.amazonaws.com/prod
# - UserPoolId: us-east-1_xxx
# - UserPoolClientId: xxx
```

### Configure Web Client

```bash
cd packages/web
cp .env.example .env.local

# Edit .env.local with the values from CDK deploy output
```

### Run Locally

```bash
# Terminal 1: Start web dev server
cd packages/web
pnpm dev

# Terminal 2: Run CLI
cd packages/cli
bun run src/index.ts claude
```

## Usage

### Start a Remote Session

```bash
# Wrap any command
always claude              # Control Claude Code
always codex               # Control Codex
always -- npm run dev      # Wrap any command

# With custom server
always claude --server wss://your-api.execute-api.region.amazonaws.com/prod
```

### Connect from Web

1. Open the web app on your phone/browser
2. Scan the QR code displayed in your terminal
3. Start interacting with your AI assistant remotely!

## Project Structure

```
always-coder/
├── packages/
│   ├── cli/          # Bun CLI client
│   ├── server/       # AWS Lambda handlers
│   ├── web/          # Next.js web frontend
│   └── shared/       # Shared types and crypto
├── infra/            # AWS CDK infrastructure
└── docs/             # Documentation
```

## Security

- **Zero-Knowledge Server**: The server never sees decrypted data
- **X25519 Key Exchange**: Secure key establishment via QR code
- **XSalsa20-Poly1305**: Authenticated encryption for all messages
- **Session TTL**: Automatic cleanup after 24 hours
- **No Persistence**: Terminal content is not stored on the server

## Configuration

### CLI Configuration

```bash
# Set server URL
always config set server wss://your-api.execute-api.region.amazonaws.com/prod

# View configuration
always config list
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `ALWAYS_CODER_SERVER` | WebSocket server URL |
| `ALWAYS_CODER_WEB_URL` | Web app URL (for QR code) |

## Development

```bash
# Run all packages in dev mode
pnpm dev

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint
```

## License

MIT
