# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Always Coder is a remote AI coding agent control system enabling secure terminal access to Claude, Codex, and other AI assistants via end-to-end encrypted WebSocket connections. The system uses a zero-knowledge architecture where the server never decrypts messages.

## Monorepo Structure

This is a pnpm workspace monorepo with 5 packages:

- **packages/shared** - Core types, E2E encryption (tweetnacl/NaCl), and WebSocket protocol definitions
- **packages/cli** - Node.js CLI (`always` command) wrapping AI assistant processes via node-pty
- **packages/server** - AWS Lambda WebSocket relay handlers (connect, disconnect, message routing)
- **packages/web** - Next.js 14 static web app with xterm.js terminal emulation
- **infra** - AWS CDK infrastructure (API Gateway WebSocket, Lambda, DynamoDB, Cognito, CloudFront)

**Dependency flow:** All packages depend on `@always-coder/shared`. Build order: shared → {cli, web, server, infra}

## Common Commands

```bash
# Root-level (monorepo)
pnpm dev              # Run all packages in parallel dev mode
pnpm build            # Build all packages (respects dependency order)
pnpm test             # Run tests across all packages
pnpm lint             # Lint all packages
pnpm typecheck        # Type check all packages

# Package-specific
pnpm --filter @always-coder/web dev           # Next.js dev server (localhost:3000)
pnpm --filter @always-coder/cli dev           # CLI with hot reload (tsx)
pnpm --filter @always-coder/server build      # Build Lambda handlers + edge functions
pnpm --filter @always-coder/shared test:watch # Vitest watch mode

# Run single test file
pnpm --filter @always-coder/shared vitest run src/crypto/nacl.test.ts

# Infrastructure
cd infra && pnpm cdk deploy --all   # Deploy all stacks
cd infra && pnpm cdk synth          # Generate CloudFormation templates
```

## Architecture

### E2E Encryption Flow
1. CLI generates X25519 keypair, creates session, displays QR code with session ID + public key
2. Web scans QR, generates own keypair, performs key exchange via WebSocket
3. All terminal I/O encrypted with XSalsa20-Poly1305 before transmission
4. Server relays encrypted envelopes without decryption (zero-knowledge)

### Key Files
- `packages/shared/src/crypto/nacl.ts` - E2E encryption implementation
- `packages/cli/src/session/manager.ts` - Session lifecycle (PTY + WebSocket + crypto orchestration)
- `packages/cli/src/pty/terminal.ts` - PTY process management
- `packages/server/src/handlers/message.ts` - WebSocket message routing
- `packages/server/src/services/relay.ts` - Encrypted message relay
- `packages/web/src/components/Terminal/Terminal.tsx` - xterm.js wrapper

### AWS Services
- API Gateway WebSocket API for real-time bidirectional communication
- Lambda functions: $connect, $disconnect, $default (message), authorizer
- DynamoDB tables: connections (GSI: sessionId), sessions (GSI: userId)
- Lambda@Edge for CloudFront authentication with Cognito
- S3 + CloudFront for static web hosting

## Technology Stack

- **Runtime:** Node.js 20, pnpm 8.14+
- **Languages:** TypeScript 5.3 (strict mode)
- **Frontend:** Next.js 14 (App Router, static export), Tailwind CSS, xterm.js, Zustand
- **Backend:** AWS Lambda, Commander (CLI), node-pty
- **Crypto:** tweetnacl (NaCl/libsodium)
- **Testing:** Vitest
- **Infrastructure:** AWS CDK 2.124+

## Code Conventions

- ESM modules throughout (`"type": "module"`)
- Prettier formatting: semicolons, single quotes, 100 char width
- Conventional commits with emojis (✨ feat, 🔒 fix, 🔧 chore)
- Web paths use `@/*` alias for `src/*`
- Lambda@Edge functions bundled separately via esbuild (CommonJS output)

## Environment Variables

- `ALWAYS_CODER_SERVER` - WebSocket endpoint URL
- `ALWAYS_CODER_WEB_URL` - Web app URL
- `CDK_DEFAULT_ACCOUNT`, `CDK_DEFAULT_REGION` - AWS deployment targets

CLI stores user config in `~/.always-coder/config.json`
