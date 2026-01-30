# Getting Started with Always Coder

This guide walks you through setting up Always Coder from scratch, whether you're an end user, operator, or developer.

## Table of Contents

- [Overview](#overview)
- [Choose Your Path](#choose-your-path)
- [Path A: End User (Using Existing Backend)](#path-a-end-user-using-existing-backend)
- [Path B: Operator (Self-Deployment)](#path-b-operator-self-deployment)
- [Path C: Developer (Local Development)](#path-c-developer-local-development)
- [Usage Guide](#usage-guide)
- [FAQ](#faq)

## Overview

Always Coder is a remote AI coding agent control system with three components:

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   CLI       │ <---> │   Server    │ <---> │   Web       │
│  (Your PC)  │       │  (AWS)      │       │ (Browser)   │
└─────────────┘       └─────────────┘       └─────────────┘
     |                      |                      |
     v                      v                      v
  node-pty            Lambda/WS API           Next.js
  AI Process          DynamoDB                xterm.js
  E2E Crypto          Message Relay           E2E Crypto
```

All data is end-to-end encrypted. The server only relays encrypted messages.

## Choose Your Path

| If you want to... | Follow... |
|-------------------|-----------|
| Use Always Coder with someone else's backend | [Path A: End User](#path-a-end-user-using-existing-backend) |
| Deploy your own Always Coder infrastructure | [Path B: Operator](#path-b-operator-self-deployment) |
| Contribute or modify the code | [Path C: Developer](#path-c-developer-local-development) |

---

## Path A: End User (Using Existing Backend)

**Prerequisites:**
- Node.js 20+
- Server URL and Web URL (provided by your operator)

**Time required:** ~5 minutes

### Step 1: Install the CLI

```bash
curl -fsSL https://raw.githubusercontent.com/tyyzqmf/always-coder/main/install.sh | \
  bash -s -- <server-url> <web-url>
```

Replace `<server-url>` and `<web-url>` with the values provided by your operator.

Example:
```bash
curl -fsSL https://raw.githubusercontent.com/tyyzqmf/always-coder/main/install.sh | \
  bash -s -- wss://abc123.execute-api.us-east-1.amazonaws.com/prod https://d1234abc.cloudfront.net
```

### Step 2: Reload your shell

```bash
source ~/.bashrc  # or source ~/.zshrc for zsh
```

### Step 3: Start using

```bash
always claude
```

This will:
1. Start Claude in your terminal
2. Display a QR code
3. You can scan the QR code from your phone to control the session remotely

**Done!** You're ready to use Always Coder.

---

## Path B: Operator (Self-Deployment)

**Prerequisites:**
- Node.js 20+
- pnpm 8.14+
- AWS Account
- AWS CLI configured
- AWS CDK CLI

**Time required:** ~30 minutes

### Step 1: Install Prerequisites

**Node.js 20+:**
```bash
# Using nvm (recommended)
nvm install 20
nvm use 20

# Verify
node --version  # Should show v20.x.x
```

**pnpm:**
```bash
npm install -g pnpm

# Verify
pnpm --version  # Should show 8.x.x or higher
```

**AWS CLI:**
```bash
# macOS
brew install awscli

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure
aws configure
# Enter your AWS Access Key ID, Secret Access Key, and Region
```

**AWS CDK:**
```bash
npm install -g aws-cdk

# Verify
cdk --version
```

### Step 2: Clone the Repository

```bash
git clone https://github.com/tyyzqmf/always-coder.git
cd always-coder
```

### Step 3: Install Dependencies

```bash
pnpm install
```

### Step 4: Build All Packages

```bash
pnpm build
```

### Step 5: Bootstrap CDK (First Time Only)

```bash
cd infra
pnpm cdk bootstrap
```

This creates S3 buckets and IAM roles needed for CDK deployments.

### Step 6: Deploy Infrastructure

```bash
pnpm cdk deploy --all
```

You'll be asked to confirm the changes. Type `y` and press Enter.

Wait for deployment to complete (typically 5-10 minutes).

### Step 7: Note the Outputs

After deployment, you'll see outputs like:

```
Outputs:
AlwaysCoderApiStack.WebSocketUrl = wss://abc123xyz.execute-api.us-east-1.amazonaws.com/prod
AlwaysCoderWebStack.WebUrl = https://d1234567890abc.cloudfront.net
```

**Save these values!** You'll need them for CLI installation.

### Step 8: Install the CLI

```bash
cd ..  # Return to repo root
./install.sh <WebSocketUrl> <WebUrl>
source ~/.bashrc
```

### Step 9: Test the Installation

```bash
always claude
```

You should see Claude start with a QR code displayed.

### Step 10: Share with Users

Share the `WebSocketUrl` and `WebUrl` with your users. They can install the CLI using:

```bash
curl -fsSL https://raw.githubusercontent.com/tyyzqmf/always-coder/main/install.sh | \
  bash -s -- <WebSocketUrl> <WebUrl>
```

**Done!** Your Always Coder infrastructure is deployed and ready.

---

## Path C: Developer (Local Development)

**Prerequisites:**
- Node.js 20+
- pnpm 8.14+
- Git

**Time required:** ~10 minutes

### Step 1: Clone and Install

```bash
git clone https://github.com/tyyzqmf/always-coder.git
cd always-coder
pnpm install
```

### Step 2: Install CLI in Local Mode

```bash
./install.sh --local
source ~/.bashrc
```

This configures the CLI to use localhost URLs.

### Step 3: Start Development Servers

Open three terminal windows:

**Terminal 1 - Shared Package (watch mode):**
```bash
pnpm --filter @always-coder/shared dev
```

**Terminal 2 - Web App:**
```bash
pnpm --filter @always-coder/web dev
```

**Terminal 3 - Server (if testing locally):**
```bash
pnpm --filter @always-coder/server dev
```

Or run everything at once:
```bash
pnpm dev
```

### Step 4: Test Changes

The web app is available at http://localhost:3000

To test the CLI:
```bash
always claude
```

### Development Commands

```bash
# Run all packages in dev mode
pnpm dev

# Build all packages
pnpm build

# Run tests
pnpm test

# Run tests in watch mode
pnpm --filter @always-coder/shared test:watch

# Lint code
pnpm lint

# Type check
pnpm typecheck

# Build CLI only
pnpm --filter @always-coder/cli build
```

### Project Structure

```
always-coder/
├── packages/
│   ├── shared/     # Shared types, crypto, and protocol
│   ├── cli/        # CLI client
│   ├── server/     # AWS Lambda handlers
│   └── web/        # Next.js web app
├── infra/          # AWS CDK infrastructure
└── docs/           # Documentation
```

**Done!** You're ready to develop.

---

## Usage Guide

### Starting a Session

```bash
# Start Claude
always claude

# Start Claude in background mode
always claude --daemon

# Start any command
always -- npm run dev
```

### Managing Sessions

```bash
# List active sessions
always sessions

# Stop a specific session
always stop <session-id>

# Stop all sessions
always clean
```

### Configuration

```bash
# View configuration
always config list

# Change server URL
always config set server wss://new-server.amazonaws.com/prod

# Change web URL
always config set web https://new-web.cloudfront.net

# Reinitialize configuration
always init <server-url> <web-url>
```

### Remote Access

1. Run `always claude` on your computer
2. A QR code will appear in the terminal
3. Open the web URL on your phone/tablet
4. Scan the QR code or enter the session ID
5. You now have full terminal access from your device

---

## FAQ

### Q: What do I need from my operator?

You need two URLs:
- **Server URL**: WebSocket endpoint (starts with `wss://`)
- **Web URL**: Web application URL (starts with `https://`)

### Q: Can I use this without AWS?

The backend is designed for AWS, but you could adapt it for other cloud providers. The CLI and Web components would work with any WebSocket server that implements the same protocol.

### Q: Is my data secure?

Yes. All terminal data is encrypted end-to-end using X25519 key exchange and XSalsa20-Poly1305 encryption. The server only relays encrypted messages and cannot decrypt them.

### Q: How long do sessions last?

Sessions automatically expire after 24 hours. You can also manually stop them with `always stop <id>` or `always clean`.

### Q: Can multiple people connect to the same session?

Yes, multiple web clients can connect to the same CLI session. They all share the same terminal view and can send input.

### Q: What happens if I lose connection?

The CLI will attempt to reconnect automatically. If reconnection fails, the session continues running and you can reconnect by scanning the QR code again.

### Q: How do I update the CLI?

```bash
curl -fsSL https://raw.githubusercontent.com/tyyzqmf/always-coder/main/install.sh | \
  bash -s -- --update
```

### Q: I'm getting "command not found: always"

Run:
```bash
source ~/.bashrc  # or source ~/.zshrc
```

Or manually add to PATH:
```bash
export PATH="$HOME/.local/bin:$PATH"
```

### Q: How do I completely uninstall?

```bash
# Remove the CLI
rm -rf ~/.always-coder
rm ~/.local/bin/always
rm -rf ~/.always-coder

# Remove from PATH (edit your .bashrc or .zshrc)
# Delete the line: export PATH="$HOME/.local/bin:$PATH"
```

### Q: Where can I get help?

- GitHub Issues: https://github.com/tyyzqmf/always-coder/issues
- Documentation: https://github.com/tyyzqmf/always-coder
