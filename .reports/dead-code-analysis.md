# Dead Code Analysis Report

**Generated:** 2026-02-05
**Branch:** feature/xterm-optimization
**Status:** ✅ Cleanup Completed

---

## Cleanup Summary

| Action | File | Function/Type |
|--------|------|---------------|
| ✅ Removed | `packages/cli/src/qrcode/generator.ts` | `displaySessionInfo` |
| ✅ Removed | `packages/server/src/utils/dynamodb.ts` | `getMessagesSince` |
| ⏭️ Skipped | Event type interfaces | Kept for API documentation |
| ⏭️ Skipped | `validateAndNormalizeUrl` | Used internally by `fetchServerConfig` |
| ⏭️ Skipped | `getWebUrl` | Used internally by `displayQRCode` |

**Tests:** All 154 tests passing ✅
**Build:** Successful ✅

---

## Summary

| Category | Count |
|----------|-------|
| Unused Files | 9 |
| Unused Dependencies | 3 |
| Unused DevDependencies | 3 |
| Unused Exports | 8 functions |
| Unused Exported Types | 4 types |

---

## 🔴 DANGER - Do NOT Delete (Infrastructure Files)

These files are reported as unused but are **critical infrastructure**:

| File | Reason to Keep |
|------|----------------|
| `infra/bin/app.ts` | CDK app entry point |
| `infra/lib/api-stack.ts` | API Gateway + Lambda infrastructure |
| `infra/lib/auth-stack.ts` | Cognito authentication stack |
| `infra/lib/database-stack.ts` | DynamoDB tables stack |
| `infra/lib/main-stack.ts` | Main CDK stack composition |
| `infra/lib/web-stack.ts` | CloudFront + S3 web hosting |

**Note:** These are CDK infrastructure files that knip cannot trace because they're consumed by `cdk deploy`, not imported by application code.

---

## 🟡 CAUTION - Review Before Deletion (Edge Functions)

These files may appear unused but are bundled separately:

| File | Purpose |
|------|---------|
| `packages/server/src/edge/auth.ts` | Lambda@Edge JWT authentication |
| `packages/server/src/edge/callback.ts` | Lambda@Edge OAuth callback handler |
| `packages/server/src/edge/index.ts` | Edge functions barrel export |

**Note:** Edge functions are bundled via `scripts/build-edge.mjs` and deployed to CloudFront. They're not imported in the main codebase but are actively used.

---

## 🟢 SAFE - Potential Cleanup Candidates

### Unused Dependencies

#### `infra/package.json`
- `aws-cdk-lib` - **KEEP** (used by CDK, knip false positive)
- `constructs` - **KEEP** (required by CDK)
- `source-map-support` - **REVIEW** (may not be needed)

#### Root `package.json`
- `esbuild` - **KEEP** (used by server edge build script)
- `prettier` - **KEEP** (used for code formatting)

### Unused DevDependencies

#### `infra/package.json`
- `esbuild` - **KEEP** (used for Lambda bundling)

#### `packages/web/package.json`
- `@types/react-dom` - **REVIEW** (may be needed for types)
- `autoprefixer` - **KEEP** (used by PostCSS/Tailwind)
- `postcss` - **KEEP** (used by Tailwind)
- `tailwindcss` - **KEEP** (actively used for styling)

---

## Unused Exports Analysis

### `packages/cli/src/auth/cognito.ts`
| Export | Usage | Recommendation |
|--------|-------|----------------|
| `refreshTokens` | Not called | **REVIEW** - May be needed for token refresh flow |
| `isTokenExpired` | Not called | **REVIEW** - May be needed for auth checks |
| `ensureValidToken` | Not called | **REVIEW** - May be needed for session validation |

### `packages/cli/src/config/index.ts`
| Export | Usage | Recommendation |
|--------|-------|----------------|
| `validateAndNormalizeUrl` | Not called | **SAFE TO REMOVE** - Utility function not used |

### `packages/cli/src/daemon/index.ts`
| Export | Usage | Recommendation |
|--------|-------|----------------|
| `getSessionsDir` | Not called | **REVIEW** - May be needed for daemon management |
| `getLogsDir` | Not called | **REVIEW** - May be needed for logging |
| `getSessionFile` | Not called | **REVIEW** - May be needed for session persistence |
| `loadDaemonSession` | Not called | **REVIEW** - May be needed for session loading |

### `packages/cli/src/qrcode/generator.ts`
| Export | Usage | Recommendation |
|--------|-------|----------------|
| `getWebUrl` | Not called | **SAFE TO REMOVE** - Redundant getter |
| `displaySessionInfo` | Not called | **REVIEW** - May be used for CLI output |

### `packages/cli/src/session/remote.ts`
| Export | Usage | Recommendation |
|--------|-------|----------------|
| `fetchRemoteSessionInfo` | Not called | **REVIEW** - May be needed for remote session feature |

### `packages/server/src/services/connection.ts`
| Export | Usage | Recommendation |
|--------|-------|----------------|
| `findConnectionsForSession` | Not called | **REVIEW** - May be needed for session management |
| `findCliConnection` | Not called | **REVIEW** - May be needed for CLI connection lookup |
| `findWebConnections` | Not called | **REVIEW** - May be needed for web connection lookup |

### `packages/server/src/services/relay.ts`
| Export | Usage | Recommendation |
|--------|-------|----------------|
| `broadcastToSession` | Not called | **REVIEW** - May be needed for broadcast feature |

### `packages/server/src/utils/dynamodb.ts`
| Export | Usage | Recommendation |
|--------|-------|----------------|
| `getMessagesSince` | Not called | **SAFE TO REMOVE** - Appears to be dead code |

---

## Unused Exported Types

| File | Type | Recommendation |
|------|------|----------------|
| `packages/cli/src/pty/terminal.ts` | `TerminalEvents` | **SAFE TO REMOVE** - Type not referenced |
| `packages/cli/src/session/manager.ts` | `SessionManagerEvents` | **SAFE TO REMOVE** - Type not referenced |
| `packages/cli/src/websocket/client.ts` | `WebSocketClientEvents` | **SAFE TO REMOVE** - Type not referenced |
| `packages/web/src/components/Terminal/Terminal.tsx` | `TerminalHandle` | **REVIEW** - May be needed for ref typing |

---

## Recommended Actions

### Phase 1: Safe Deletions (Low Risk)
1. Remove `validateAndNormalizeUrl` from `packages/cli/src/config/index.ts`
2. Remove `getWebUrl` from `packages/cli/src/qrcode/generator.ts`
3. Remove `getMessagesSince` from `packages/server/src/utils/dynamodb.ts`
4. Remove unused event type exports (`TerminalEvents`, `SessionManagerEvents`, `WebSocketClientEvents`)

### Phase 2: Review Required (Medium Risk)
1. Audit auth functions (`refreshTokens`, `isTokenExpired`, `ensureValidToken`) - may be planned features
2. Audit daemon functions - may be needed for daemon mode
3. Audit server connection functions - may be needed for advanced routing

### Phase 3: Do Not Touch (High Risk)
1. All `infra/` files - CDK infrastructure
2. All `edge/` files - Lambda@Edge functions
3. Build tool dependencies (esbuild, prettier, tailwindcss)

---

## Test Commands

Before any deletion, run:
```bash
pnpm build          # Ensure compilation succeeds
pnpm test           # Run all tests
pnpm typecheck      # Verify type safety
```
