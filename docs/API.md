# Always Coder - API Reference

## Overview

Always Coder uses WebSocket protocol for real-time bidirectional communication between CLI and Web clients. All messages are end-to-end encrypted except for initial handshake messages.

## WebSocket Endpoint

```
wss://{api-gateway-id}.execute-api.{region}.amazonaws.com/prod
```

## Connection Flow

### 1. Establishing Connection

```javascript
// CLI Client
const ws = new WebSocket(wsEndpoint);
ws.on('open', () => {
  // Send session create request
  ws.send(JSON.stringify({
    type: 'session:create',
    sessionId: 'ABC123',
    publicKey: 'base64-encoded-public-key'
  }));
});

// Web Client
const ws = new WebSocket(wsEndpoint);
ws.on('open', () => {
  // Send session join request
  ws.send(JSON.stringify({
    type: 'session:join',
    sessionId: 'ABC123',
    publicKey: 'base64-encoded-public-key'
  }));
});
```

### 2. Authentication (Optional)

If Cognito authentication is enabled, include JWT token in connection URL:

```javascript
const token = 'jwt-token-from-cognito';
const ws = new WebSocket(`${wsEndpoint}?token=${token}`);
```

## Message Protocol

### Message Structure

All messages follow this structure:

```typescript
interface Message<T = unknown> {
  type: MessageType;    // Message type enum
  payload: T;           // Type-specific payload
  seq: number;          // Sequence number for ordering
}
```

### Encrypted Envelope

After handshake, all messages are encrypted:

```typescript
interface EncryptedEnvelope {
  version: 1;           // Protocol version
  sessionId: string;    // Session identifier
  nonce: string;        // Base64 random nonce (24 bytes)
  ciphertext: string;   // Base64 encrypted Message
  timestamp: number;    // Unix timestamp (ms)
}
```

## Message Types

### Session Management

#### SESSION_CREATE

**Direction**: CLI → Server
**Encrypted**: No
**Purpose**: Create new session

```typescript
// Request
{
  type: 'session:create',
  sessionId: string,      // 6-char alphanumeric
  publicKey: string       // Base64 X25519 public key
}

// Response
{
  type: 'session:created',
  payload: {
    sessionId: string,
    wsEndpoint: string    // WebSocket URL
  }
}

// Error Response
{
  type: 'session:error',
  payload: {
    code: 'SESSION_EXISTS',
    message: 'Session already exists'
  }
}
```

#### SESSION_RECONNECT

**Direction**: CLI → Server
**Encrypted**: No
**Purpose**: Reconnect to existing session

```typescript
// Request
{
  type: 'session:reconnect',
  sessionId: string,
  publicKey: string       // New public key
}

// Response
{
  type: 'session:reconnected',
  payload: {
    sessionId: string,
    webConnections: number // Number of web clients
  }
}
```

#### SESSION_JOIN

**Direction**: Web → Server
**Encrypted**: No
**Purpose**: Join existing session

```typescript
// Request
{
  type: 'session:join',
  sessionId: string,
  publicKey: string
}

// Response
{
  type: 'session:joined',
  payload: {
    sessionId: string,
    cliPublicKey: string  // CLI's public key
  }
}

// Notification to CLI
{
  type: 'web:connected',
  payload: {
    publicKey: string,    // Web's public key
    connectionId: string
  }
}
```

#### SESSION_LEAVE

**Direction**: Web → Server
**Encrypted**: Yes
**Purpose**: Leave session gracefully

```typescript
{
  type: 'session:leave',
  payload: {}
}
```

### Session Discovery

#### SESSION_LIST_REQUEST

**Direction**: CLI → Server
**Encrypted**: Yes
**Purpose**: List user's sessions

```typescript
// Request
{
  type: 'session:list:request',
  payload: {
    includeInactive?: boolean  // Include inactive sessions
  }
}

// Response
{
  type: 'session:list:response',
  payload: {
    sessions: [
      {
        sessionId: string,
        status: 'active' | 'inactive',
        createdAt: number,
        lastActiveAt: number,
        instanceId?: string,
        instanceLabel?: string,
        hostname?: string,
        command?: string,
        commandArgs?: string[],
        webUrl?: string
      }
    ]
  }
}
```

#### SESSION_INFO_REQUEST

**Direction**: CLI/Web → Server
**Encrypted**: Yes
**Purpose**: Get specific session details

```typescript
// Request
{
  type: 'session:info:request',
  payload: {
    sessionId: string
  }
}

// Response
{
  type: 'session:info:response',
  payload: {
    session: RemoteSessionInfo | null
  }
}
```

#### SESSION_UPDATE

**Direction**: CLI → Server
**Encrypted**: Yes
**Purpose**: Update session metadata

```typescript
{
  type: 'session:update',
  payload: {
    instanceId?: string,
    instanceLabel?: string,
    hostname?: string,
    command?: string,
    commandArgs?: string[],
    webUrl?: string
  }
}
```

### Terminal Data

#### TERMINAL_OUTPUT

**Direction**: CLI → Web
**Encrypted**: Yes
**Purpose**: Send terminal output

```typescript
{
  type: 'terminal:output',
  payload: string,        // Terminal output data
  seq: number
}
```

#### TERMINAL_INPUT

**Direction**: Web → CLI
**Encrypted**: Yes
**Purpose**: Send user input

```typescript
{
  type: 'terminal:input',
  payload: string,        // User input
  seq: number
}
```

#### TERMINAL_RESIZE

**Direction**: Web → CLI
**Encrypted**: Yes
**Purpose**: Resize terminal

```typescript
{
  type: 'terminal:resize',
  payload: {
    cols: number,         // Terminal columns
    rows: number          // Terminal rows
  },
  seq: number
}
```

### State Synchronization

#### STATE_REQUEST

**Direction**: Web → CLI
**Encrypted**: Yes
**Purpose**: Request current state

```typescript
{
  type: 'state:request',
  payload: {},
  seq: number
}
```

#### STATE_SYNC

**Direction**: CLI → Web
**Encrypted**: Yes
**Purpose**: Sync terminal state

```typescript
{
  type: 'state:sync',
  payload: {
    terminalHistory: string,  // Recent output
    cols: number,
    rows: number
  },
  seq: number
}
```

### Connection Events

#### WEB_CONNECTED

**Direction**: Server → CLI
**Encrypted**: No
**Purpose**: Notify CLI of web connection

```typescript
{
  type: 'web:connected',
  payload: {
    publicKey: string,
    connectionId: string
  }
}
```

#### WEB_DISCONNECTED

**Direction**: Server → CLI
**Encrypted**: No
**Purpose**: Notify CLI of web disconnection

```typescript
{
  type: 'web:disconnected',
  payload: {
    connectionId: string
  }
}
```

#### CLI_DISCONNECTED

**Direction**: Server → Web
**Encrypted**: No
**Purpose**: Notify web of CLI disconnection

```typescript
{
  type: 'cli:disconnected',
  payload: {}
}
```

### Heartbeat

#### PING

**Direction**: Any → Server
**Encrypted**: Optional
**Purpose**: Keep connection alive

```typescript
{
  type: 'ping',
  payload: {},
  seq: number
}
```

#### PONG

**Direction**: Server → Any
**Encrypted**: Optional
**Purpose**: Respond to ping

```typescript
{
  type: 'pong',
  payload: {},
  seq: number
}
```

### Errors

#### ERROR

**Direction**: Server → Any
**Encrypted**: No
**Purpose**: Report error

```typescript
{
  type: 'error',
  payload: {
    code: string,         // Error code
    message: string       // Human-readable message
  }
}
```

## Error Codes

| Code | Description | Recovery |
|------|-------------|----------|
| `INVALID_MESSAGE` | Malformed message | Check message format |
| `SESSION_NOT_FOUND` | Session doesn't exist | Create new session |
| `SESSION_EXISTS` | Session ID already in use | Use different ID |
| `NOT_AUTHORIZED` | Missing or invalid auth | Login required |
| `SESSION_EXPIRED` | Session timed out | Create new session |
| `INVALID_ROLE` | Wrong connection role | Check client type |
| `RATE_LIMITED` | Too many requests | Back off and retry |
| `INTERNAL_ERROR` | Server error | Retry with backoff |

## Rate Limits

| Limit | Value | Scope |
|-------|-------|-------|
| Connections per IP | 10/minute | IP address |
| Messages per connection | 100/second | Connection |
| Session creates per user | 10/hour | User ID |
| Total connections | 500 | API Gateway |
| Message size | 32KB | Per message |

## Code Examples

### CLI Client (Node.js)

```typescript
import WebSocket from 'ws';
import { E2ECrypto, generateSessionId } from '@always-coder/shared';

class CLIClient {
  private ws: WebSocket;
  private crypto: E2ECrypto;
  private sessionId: string;

  constructor(wsEndpoint: string) {
    this.crypto = new E2ECrypto();
    this.sessionId = generateSessionId();
    this.ws = new WebSocket(wsEndpoint);

    this.ws.on('open', () => {
      // Send session create
      this.ws.send(JSON.stringify({
        type: 'session:create',
        sessionId: this.sessionId,
        publicKey: this.crypto.getPublicKey()
      }));
    });

    this.ws.on('message', (data: string) => {
      const message = JSON.parse(data);

      if (message.type === 'web:connected') {
        // Establish encryption
        this.crypto.establishSharedKey(message.payload.publicKey);

        // Send encrypted terminal output
        this.sendTerminalOutput('Welcome to Always Coder!\n');
      }
    });
  }

  sendTerminalOutput(data: string) {
    const message = {
      type: 'terminal:output',
      payload: data,
      seq: Date.now()
    };

    const envelope = this.crypto.encrypt(message, this.sessionId);
    this.ws.send(JSON.stringify(envelope));
  }
}
```

### Web Client (Browser)

```typescript
class WebClient {
  private ws: WebSocket;
  private crypto: E2ECrypto;

  constructor(wsEndpoint: string, sessionId: string) {
    this.crypto = new E2ECrypto();
    this.ws = new WebSocket(wsEndpoint);

    this.ws.onopen = () => {
      // Join session
      this.ws.send(JSON.stringify({
        type: 'session:join',
        sessionId: sessionId,
        publicKey: this.crypto.getPublicKey()
      }));
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'session:joined') {
        // Establish encryption
        this.crypto.establishSharedKey(data.payload.cliPublicKey);
      } else if (data.version === 1) {
        // Encrypted envelope
        const message = this.crypto.decrypt(data);
        this.handleMessage(message);
      }
    };
  }

  sendInput(input: string) {
    const message = {
      type: 'terminal:input',
      payload: input,
      seq: Date.now()
    };

    const envelope = this.crypto.encrypt(message, sessionId);
    this.ws.send(JSON.stringify(envelope));
  }

  private handleMessage(message: Message) {
    switch (message.type) {
      case 'terminal:output':
        // Display in terminal
        terminal.write(message.payload);
        break;
      case 'state:sync':
        // Restore terminal state
        terminal.reset();
        terminal.write(message.payload.terminalHistory);
        break;
    }
  }
}
```

### Python Client

```python
import json
import asyncio
import websockets
import nacl.utils
import nacl.public
import nacl.encoding

class AlwaysCoderClient:
    def __init__(self, ws_endpoint):
        self.ws_endpoint = ws_endpoint
        self.private_key = nacl.utils.random(nacl.secret.SecretBox.KEY_SIZE)
        self.box = None
        self.session_id = self.generate_session_id()

    @staticmethod
    def generate_session_id():
        chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
        return ''.join(random.choice(chars) for _ in range(6))

    async def connect(self):
        async with websockets.connect(self.ws_endpoint) as websocket:
            # Send session create
            await websocket.send(json.dumps({
                'type': 'session:create',
                'sessionId': self.session_id,
                'publicKey': self.get_public_key()
            }))

            # Handle messages
            async for message in websocket:
                data = json.loads(message)
                await self.handle_message(data, websocket)

    def get_public_key(self):
        # Generate public key from private key
        keypair = nacl.public.PrivateKey(self.private_key)
        return keypair.public_key.encode(
            encoder=nacl.encoding.Base64Encoder
        ).decode('utf-8')

    async def handle_message(self, data, websocket):
        if data['type'] == 'web:connected':
            # Establish encryption
            their_public = nacl.public.PublicKey(
                data['payload']['publicKey'],
                encoder=nacl.encoding.Base64Encoder
            )
            self.box = nacl.public.Box(self.private_key, their_public)

# Usage
client = AlwaysCoderClient('wss://api.example.com/prod')
asyncio.run(client.connect())
```

## Testing

### WebSocket Testing with wscat

```bash
# Install wscat
npm install -g wscat

# Connect to WebSocket
wscat -c wss://your-api.execute-api.region.amazonaws.com/prod

# Create session (send after connection)
{"type":"session:create","sessionId":"TEST01","publicKey":"base64-public-key"}

# Join session (from another terminal)
{"type":"session:join","sessionId":"TEST01","publicKey":"base64-public-key"}

# Send ping
{"type":"ping","payload":{},"seq":1}
```

### cURL Testing

```bash
# Get WebSocket URL with authentication
curl -X POST https://api.example.com/connect \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"connect"}'
```

### Postman Testing

1. Create new WebSocket request
2. Enter WebSocket URL
3. Connect
4. Send messages in JSON format
5. Monitor responses

## SDK Libraries

### Official SDKs

- **JavaScript/TypeScript**: `@always-coder/shared`
- **Python**: Coming soon
- **Go**: Coming soon

### Community SDKs

- **Rust**: `always-coder-rs`
- **Ruby**: `always-coder-rb`
- **Java**: `always-coder-java`

## Best Practices

### Connection Management

1. **Implement reconnection logic**
   ```typescript
   class ReconnectingWebSocket {
     private reconnectDelay = 1000;
     private maxReconnectDelay = 30000;

     connect() {
       this.ws = new WebSocket(this.url);

       this.ws.onclose = () => {
         setTimeout(() => {
           this.reconnectDelay = Math.min(
             this.reconnectDelay * 2,
             this.maxReconnectDelay
           );
           this.connect();
         }, this.reconnectDelay);
       };

       this.ws.onopen = () => {
         this.reconnectDelay = 1000;
       };
     }
   }
   ```

2. **Handle connection errors gracefully**
3. **Implement heartbeat/ping mechanism**
4. **Queue messages during reconnection**

### Security

1. **Always use WSS (not WS)**
2. **Validate all incoming messages**
3. **Implement message sequence checking**
4. **Never log sensitive data**
5. **Rotate keys per session**

### Performance

1. **Batch small messages**
2. **Implement message compression** (before encryption)
3. **Use binary encoding** for large data
4. **Implement backpressure handling**
5. **Monitor message queue size**

## Debugging

### Enable Debug Logging

```typescript
// CLI
DEBUG=always-coder:* always claude

// Browser
localStorage.debug = 'always-coder:*';
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Connection refused | Wrong endpoint | Check WebSocket URL |
| 403 Forbidden | Auth required | Include valid token |
| Message not received | Encryption mismatch | Verify key exchange |
| High latency | Network issues | Check connection quality |
| Disconnections | Idle timeout | Implement heartbeat |

## API Versioning

Current version: **v1**

Version is included in encrypted envelope:

```typescript
interface EncryptedEnvelope {
  version: 1;  // API version
  // ...
}
```

### Breaking Changes Policy

- Breaking changes require new version
- Old versions supported for 6 months
- Deprecation notices 3 months in advance
- Version negotiation during handshake