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

# Login to your server
always login --server https://your-server.example.com

# Start Claude with remote access
always claude

# Scan the QR code with your phone or visit the web URL
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

# Login to your server
always login --server https://your-server.example.com

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