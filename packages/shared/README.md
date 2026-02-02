# @always-coder/shared

Shared types, crypto, and protocol definitions for Always Coder.

## Installation

```bash
npm install @always-coder/shared
```

## Features

- E2E encryption using X25519 key exchange and XSalsa20-Poly1305
- WebSocket message protocol types
- Shared TypeScript types

## Usage

```typescript
import { generateKeyPair, encrypt, decrypt } from '@always-coder/shared/crypto';
import { MessageType } from '@always-coder/shared/protocol';
```

## License

MIT
