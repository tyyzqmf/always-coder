# Always Coder

[![npm version](https://img.shields.io/npm/v/@always-coder/cli)](https://www.npmjs.com/package/@always-coder/cli)
[![Node.js 20+](https://img.shields.io/badge/node-20%2B-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Claude](https://img.shields.io/badge/powered%20by-claude-orange)](https://claude.ai)

**Remote AI Coding Agent Control System** - Secure terminal access to Claude, Codex, and other AI assistants from anywhere via end-to-end encrypted WebSocket connections.

## Features

### Core Capabilities
- **🔐 End-to-End Encryption** - Military-grade encryption using X25519 + XSalsa20-Poly1305 (NaCl/libsodium)
- **📱 Multi-Device Access** - Control AI assistants from any device with a browser
- **🔒 Zero-Knowledge Architecture** - Server cannot decrypt messages, only routes encrypted envelopes
- **📸 QR Code Pairing** - Instant connection via QR code scanning
- **⚡ Real-time Terminal** - Live terminal emulation with xterm.js
- **👥 Multi-Instance Support** - Manage multiple AI sessions across different machines
- **🔑 Cognito Authentication** - Secure user authentication with AWS Cognito (optional)
- **💾 Session Persistence** - Reconnect to existing sessions after network interruptions

### Security Features
- **X25519 Key Exchange** - Elliptic curve Diffie-Hellman for secure key establishment
- **XSalsa20-Poly1305** - Authenticated encryption with associated data (AEAD)
- **Perfect Forward Secrecy** - Each session uses unique ephemeral keys
- **User Isolation** - Sessions are isolated per user when authentication is enabled
- **Automatic Expiry** - Sessions expire after 24 hours for security

## Quick Start

### Option 1: CLI Users (Recommended)

If you have access to an existing Always Coder server (someone has deployed the infrastructure):

**Install via npm (easiest):**
```bash
# Install globally
npm install -g @always-coder/cli

# Configure server endpoints
always init <server-url> <web-url>

# Login (if authentication is required)
always login

# Start Claude with remote access
always claude

# Scan the QR code with your phone or visit the web URL
```

**Or install via script:**
```bash
# One-line installation with auto-configuration
curl -fsSL https://raw.githubusercontent.com/tyyzqmf/always-coder/main/install.sh | bash -s -- <server-url> <web-url>

# Reload shell (first time only)
source ~/.bashrc  # or source ~/.zshrc

# Start using
always claude
```

### Option 2: Self-Deployment (Full Stack)

Deploy your own Always Coder infrastructure on AWS:

**Prerequisites:**
- Node.js 20+
- pnpm 8.14+
- AWS CLI configured with credentials
- AWS CDK 2.124+

**Deploy:**
```bash
# Clone and install dependencies
git clone https://github.com/tyyzqmf/always-coder.git
cd always-coder
pnpm install

# Bootstrap CDK (first time only)
cd infra
pnpm cdk bootstrap

# Deploy all stacks (Database, API, Web)
pnpm cdk deploy --all

# Note the outputs:
# - WebSocketUrl: wss://xxx.execute-api.us-east-1.amazonaws.com/prod
# - WebUrl: https://xxx.cloudfront.net
```

**Install CLI and connect to your server:**
```bash
# Option A: Install from npm
npm install -g @always-coder/cli
always init <WebSocketUrl> <WebUrl>

# Option B: Use install script
cd ..
./install.sh <WebSocketUrl> <WebUrl>
source ~/.bashrc

# Start using
always claude
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed deployment guide.

## CLI Commands

### Starting AI Sessions

```bash
# Interactive mode (default)
always claude                     # Start Claude
always codex                      # Start GitHub Copilot/Codex
always -- <command>               # Wrap any command

# Background mode (daemon)
always claude --daemon            # Run in background
always claude -d                  # Short form

# With custom server
always claude --server wss://custom.server.com
```

### Session Management

```bash
# List all sessions
always sessions                   # Show active sessions
always sessions --all             # Include inactive sessions

# Session control
always stop <session-id>          # Stop specific session
always clean                      # Stop all sessions
always reconnect <session-id>     # Reconnect to existing session
```

### Authentication (Optional)

```bash
# Login to enable user isolation
always login                      # Interactive login
always login -u user@email.com   # With username

# Manage authentication
always logout                     # Clear credentials
always whoami                     # Show current user
```

### Configuration

```bash
# View configuration
always config list                # Show all settings
always config get <key>           # Get specific value

# Update configuration
always config set server <url>   # Set WebSocket server
always config set web <url>      # Set web URL

# Initialize configuration
always init <server> <web>       # Set both URLs at once
```

## Architecture

```
┌─────────────────┐     E2E Encrypted      ┌──────────────────┐      WebSocket       ┌─────────────┐
│                 │ ◄──────────────────────► │                  │ ◄──────────────────► │             │
│   CLI Client    │     X25519 + XSalsa20   │   AWS Lambda     │        Relay         │  Web Client │
│   (node-pty)    │                          │  (Zero-Knowledge)│                      │  (xterm.js) │
│                 │                          │                  │                      │             │
└─────────────────┘                          └──────────────────┘                      └─────────────┘
        │                                            │                                        │
        │                                            │                                        │
        ▼                                            ▼                                        ▼
  ┌─────────────┐                          ┌──────────────────┐                    ┌─────────────┐
  │   AI Agent  │                          │    DynamoDB      │                    │   Browser   │
  │   Process   │                          │  (Sessions/Msgs) │                    │   Terminal  │
  └─────────────┘                          └──────────────────┘                    └─────────────┘
```

### Key Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| **CLI** | Node.js, Commander, node-pty | Terminal wrapper for AI processes |
| **Server** | AWS Lambda, API Gateway WebSocket | Message relay (zero-knowledge) |
| **Web** | Next.js 14, xterm.js, React | Browser-based terminal interface |
| **Crypto** | TweetNaCl (libsodium) | E2E encryption implementation |
| **Auth** | AWS Cognito, Lambda@Edge | User authentication (optional) |
| **Storage** | DynamoDB, S3, CloudFront | Session state and web hosting |

## System Requirements

### CLI Users Only
- **Node.js** 20+ or **Bun** 1.0+
- **Modern browser** (Chrome, Firefox, Safari, Edge) for web access

### Self-Deployment
- **Node.js** 20+
- **pnpm** 8.14+
- **AWS CLI** 2.x (configured with credentials)
- **AWS CDK** 2.124+
- **AWS Account** with permissions for Lambda, API Gateway, DynamoDB, S3, CloudFront, Cognito

## Project Structure

```
always-coder/
├── packages/
│   ├── cli/                  # CLI client application
│   │   ├── src/
│   │   │   ├── auth/        # Cognito authentication
│   │   │   ├── config/      # Configuration management
│   │   │   ├── crypto/      # Encryption utilities
│   │   │   ├── daemon/      # Background process management
│   │   │   ├── pty/         # Terminal process control
│   │   │   ├── qrcode/      # QR code generation
│   │   │   ├── session/     # Session lifecycle
│   │   │   └── websocket/   # WebSocket client
│   │   └── package.json
│   │
│   ├── server/               # AWS Lambda handlers
│   │   ├── src/
│   │   │   ├── edge/        # Lambda@Edge functions
│   │   │   ├── handlers/    # WebSocket route handlers
│   │   │   ├── services/    # Business logic
│   │   │   └── utils/       # DynamoDB utilities
│   │   └── package.json
│   │
│   ├── web/                  # Next.js web application
│   │   ├── src/
│   │   │   ├── app/         # Next.js App Router
│   │   │   ├── components/  # React components
│   │   │   ├── hooks/       # Custom React hooks
│   │   │   ├── lib/         # Utilities
│   │   │   └── stores/      # Zustand state stores
│   │   └── package.json
│   │
│   └── shared/               # Shared types and crypto
│       ├── src/
│       │   ├── crypto/      # E2E encryption core
│       │   ├── protocol/    # Message protocol
│       │   └── types/       # TypeScript types
│       └── package.json
│
├── infra/                    # AWS CDK infrastructure
│   ├── lib/
│   │   ├── api-stack.ts    # WebSocket API, Lambda, DynamoDB
│   │   └── web-stack.ts    # CloudFront, S3, Lambda@Edge
│   └── package.json
│
├── docs/                     # Documentation
│   ├── ARCHITECTURE.md      # System design
│   ├── DEPLOYMENT.md        # Deployment guide
│   ├── SECURITY.md          # Security details
│   ├── API.md               # API reference
│   └── DEVELOPMENT.md       # Development guide
│
└── scripts/                  # Build and deployment scripts
```

## Development

### Setup Development Environment

```bash
# Clone repository
git clone https://github.com/tyyzqmf/always-coder.git
cd always-coder

# Install dependencies
pnpm install

# Run all packages in dev mode
pnpm dev
```

### Package-Specific Development

```bash
# CLI development with hot reload
pnpm --filter @always-coder/cli dev

# Web development server (http://localhost:3000)
pnpm --filter @always-coder/web dev

# Build Lambda functions
pnpm --filter @always-coder/server build

# Run tests in watch mode
pnpm --filter @always-coder/shared test:watch
```

### Building for Production

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter @always-coder/cli build

# Run all tests
pnpm test

# Type checking
pnpm typecheck

# Linting
pnpm lint
```

## Documentation

- **[Getting Started](docs/GETTING_STARTED.md)** - Quick setup guide
- **[Architecture](docs/ARCHITECTURE.md)** - System design and components
- **[Deployment Guide](docs/DEPLOYMENT.md)** - AWS infrastructure deployment
- **[Security](docs/SECURITY.md)** - Encryption and authentication details
- **[API Reference](docs/API.md)** - WebSocket protocol and messages
- **[Development](docs/DEVELOPMENT.md)** - Contributing and development setup
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Common issues and solutions

## Security

Always Coder implements multiple layers of security:

1. **End-to-End Encryption** - All data encrypted client-to-client
2. **Zero-Knowledge Server** - Server cannot decrypt message contents
3. **Perfect Forward Secrecy** - Unique keys per session
4. **User Authentication** - Optional Cognito integration
5. **Session Isolation** - Users can only access their own sessions
6. **Automatic Expiry** - Sessions expire after 24 hours

See [docs/SECURITY.md](docs/SECURITY.md) for detailed security information.

## Contributing

We welcome contributions! Please see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for:

- Development environment setup
- Code style guidelines
- Testing requirements
- Pull request process

## License

MIT - See [LICENSE](LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/tyyzqmf/always-coder/issues)
- **Discussions**: [GitHub Discussions](https://github.com/tyyzqmf/always-coder/discussions)
- **Security**: Report security issues to security@always-coder.dev

## Acknowledgments

Built with:
- [TweetNaCl](https://tweetnacl.js.org/) - Cryptography library
- [xterm.js](https://xtermjs.org/) - Terminal emulator
- [AWS CDK](https://aws.amazon.com/cdk/) - Infrastructure as Code
- [Next.js](https://nextjs.org/) - React framework
- [node-pty](https://github.com/microsoft/node-pty) - Pseudoterminal support