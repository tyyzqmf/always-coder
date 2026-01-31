# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Always Coder is a remote AI coding agent control system enabling secure terminal access to Claude, Codex, and other AI assistants via end-to-end encrypted WebSocket connections. The system uses a zero-knowledge architecture where the server never decrypts messages.

All browser operations use: `chrome-devtools-mcp`.

## Monorepo Structure

This is a pnpm workspace monorepo with 5 packages:

- **packages/shared** - Core types, E2E encryption (tweetnacl/NaCl), and WebSocket protocol definitions
- **packages/cli** - Node.js CLI (`always` command) wrapping AI assistant processes via node-pty
- **packages/server** - AWS Lambda WebSocket relay handlers (connect, disconnect, message routing) + Lambda@Edge auth functions
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

### Authentication Flow
1. **CLI Authentication**: User logs in via `always login` using Cognito SRP (Secure Remote Password)
2. **WebSocket Authorization**: Lambda Authorizer validates JWT from query string token
3. **CloudFront Authentication**: Lambda@Edge validates JWT from cookies for web requests
4. **User Isolation**: All sessions and connections are scoped to authenticated userId

### Multi-Instance Session Management
- Each CLI instance has a unique `instanceId` (UUID v4)
- Sessions are registered with `sessionId` (first 8 chars of public key hash)
- Multiple CLI instances can run under the same user account
- Web UI displays all active sessions for the authenticated user
- Each session tracks: `hostname`, `command`, `instanceLabel`, `webUrl`

### Key Files

**Shared Package:**
- `packages/shared/src/crypto/nacl.ts` - E2E encryption implementation (X25519 + XSalsa20-Poly1305)
- `packages/shared/src/protocol/messages.ts` - WebSocket message types and validation

**CLI Package:**
- `packages/cli/src/session/manager.ts` - Session lifecycle (PTY + WebSocket + crypto orchestration)
- `packages/cli/src/pty/terminal.ts` - PTY process management via node-pty
- `packages/cli/src/websocket/client.ts` - WebSocket connection with reconnection logic
- `packages/cli/src/auth/cognito.ts` - Cognito SRP authentication
- `packages/cli/src/daemon/index.ts` - Background daemon process management
- `packages/cli/src/config/index.ts` - User configuration management (~/.always-coder/)

**Server Package:**
- `packages/server/src/handlers/connect.ts` - WebSocket $connect handler
- `packages/server/src/handlers/disconnect.ts` - WebSocket $disconnect handler
- `packages/server/src/handlers/message.ts` - WebSocket $default message routing
- `packages/server/src/handlers/authorizer.ts` - Lambda Authorizer for JWT validation
- `packages/server/src/services/relay.ts` - Encrypted message relay service
- `packages/server/src/edge/auth.ts` - Lambda@Edge JWT authentication for CloudFront
- `packages/server/src/edge/callback.ts` - Lambda@Edge OAuth callback handler

**Web Package:**
- `packages/web/src/components/Terminal/Terminal.tsx` - xterm.js wrapper with FitAddon
- `packages/web/src/lib/websocket.ts` - WebSocket client for browser
- `packages/web/src/lib/encryption.ts` - Browser-side encryption using tweetnacl-js
- `packages/web/src/stores/session.ts` - Zustand store for session state
- `packages/web/src/app/login/page.tsx` - Cognito login page

**Infrastructure:**
- `infra/lib/api-stack.ts` - API Gateway WebSocket + Lambda + DynamoDB + Cognito
- `infra/lib/web-stack.ts` - CloudFront + S3 + Lambda@Edge authentication
- `infra/bin/infra.ts` - CDK app entry point

### AWS Services
- **API Gateway WebSocket API** - Real-time bidirectional communication
- **Lambda functions**: $connect, $disconnect, $default (message), authorizer
- **DynamoDB tables**:
  - `connections` - Connection state (GSI: sessionId)
  - `sessions` - Session metadata (GSI: userId)
- **Lambda@Edge** - CloudFront authentication with Cognito JWT validation
- **S3 + CloudFront** - Static web hosting with security headers
- **Cognito User Pool** - User authentication with SRP

## Technology Stack

- **Runtime:** Node.js 20, pnpm 8.14+
- **Languages:** TypeScript 5.3 (strict mode)
- **Frontend:** Next.js 14 (App Router, static export), Tailwind CSS, xterm.js, Zustand
- **Backend:** AWS Lambda, Commander (CLI), node-pty
- **Crypto:** tweetnacl (NaCl/libsodium) - X25519 key exchange, XSalsa20-Poly1305 AEAD
- **Testing:** Vitest
- **Infrastructure:** AWS CDK 2.124+

## Code Conventions

- ESM modules throughout (`"type": "module"`)
- Prettier formatting: semicolons, single quotes, 100 char width
- Conventional commits with emojis (✨ feat, 🐛 fix, 🔧 chore, 🔒 security)
- Web paths use `@/*` alias for `src/*`
- Lambda@Edge functions bundled separately via esbuild (CommonJS output for Node.js 20.x)
- Configuration placeholders in edge functions: `__COGNITO_REGION__`, `__USER_POOL_ID__`, etc.

## Security Considerations

When modifying authentication or encryption code:
- **Never log secrets, tokens, or encryption keys** - even in debug mode
- **Validate session ownership** - All operations must verify userId matches session owner
- **Preserve auth flows** - When updating Cognito client, include all ExplicitAuthFlows
- **Use secure cookies** - HttpOnly, Secure, SameSite=Lax for auth tokens
- **Validate JWT claims** - Check exp, iss, aud before trusting tokens

## Git Workflow

**IMPORTANT: Never commit directly to the `main` branch.** All changes must be submitted via Pull Request (PR).

### Branch and PR Rules
1. **Create a feature branch** for all changes: `git checkout -b feature/your-feature-name` or `fix/bug-description`
2. **Commit to feature branch** - never to main
3. **Push and create PR** - use `gh pr create` to submit changes
4. **Wait for CI checks** - ensure all workflows pass before merging
5. **Merge via PR** - use `gh pr merge` after approval

### Branch Naming Convention
- `feature/` - New features (e.g., `feature/add-session-export`)
- `fix/` - Bug fixes (e.g., `fix/cognito-auth-flows`)
- `docs/` - Documentation updates (e.g., `docs/update-readme`)
- `refactor/` - Code refactoring (e.g., `refactor/simplify-encryption`)
- `chore/` - Maintenance tasks (e.g., `chore/update-dependencies`)

## Development Workflow

After making code changes, you must redeploy and verify the changes work correctly before declaring the task complete. Do not consider a task finished until deployment succeeds and functionality is confirmed.

### Testing Checklist
1. `pnpm build` - Ensure all packages compile
2. `pnpm test` - Run unit tests
3. `pnpm lint` - Check code style
4. `cd infra && pnpm cdk deploy --all` - Deploy to AWS
5. Test CLI: `always claude` or `always bash --daemon`
6. Test Web: Navigate to CloudFront URL, login, connect to session

## Environment Variables

- `ALWAYS_CODER_SERVER` - WebSocket endpoint URL
- `ALWAYS_CODER_WEB_URL` - Web app URL
- `CDK_DEFAULT_ACCOUNT`, `CDK_DEFAULT_REGION` - AWS deployment targets

CLI stores user config in `~/.always-coder/config.json`:
```json
{
  "server": "wss://xxx.execute-api.us-east-1.amazonaws.com/prod",
  "webUrl": "https://xxx.cloudfront.net",
  "cognito": {
    "userPoolId": "us-east-1_xxx",
    "clientId": "xxx",
    "region": "us-east-1"
  },
  "auth": {
    "accessToken": "...",
    "idToken": "...",
    "refreshToken": "..."
  }
}
```

## Documentation

- `README.md` - Project overview and quick start
- `docs/ARCHITECTURE.md` - System architecture and design
- `docs/API.md` - WebSocket protocol and message types
- `docs/DEPLOYMENT.md` - AWS infrastructure deployment guide
- `docs/DEVELOPMENT.md` - Development environment setup
- `docs/SECURITY.md` - Security architecture and best practices
- `docs/TROUBLESHOOTING.md` - Common issues and solutions
- `docs/architecture.md` - Original Chinese design document
