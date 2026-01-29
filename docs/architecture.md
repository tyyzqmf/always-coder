# Happy Coder (Always Coder) - AWS 技术栈实现方案

## 项目概述

构建一个基于纯 AWS 技术栈的远程 AI 编程代理控制系统，包含三个核心组件：
1. **Always Coder CLI** - 本地命令行客户端
2. **Always Coder Server** - AWS 云端中继服务
3. **Always Coder Web** - Web 远程控制界面

---

## 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AWS Cloud                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Amazon CloudFront                             │   │
│  │                     (CDN + Web Hosting)                              │   │
│  └──────────────────────────┬──────────────────────────────────────────┘   │
│                             │                                               │
│  ┌──────────────────────────▼──────────────────────────────────────────┐   │
│  │                         Amazon S3                                    │   │
│  │                   (Static Web Assets)                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    API Gateway WebSocket API                         │   │
│  │              (wss://xxx.execute-api.region.amazonaws.com)            │   │
│  └────────┬─────────────────┬─────────────────┬───────────────────────┘   │
│           │                 │                 │                             │
│           ▼                 ▼                 ▼                             │
│  ┌────────────┐    ┌────────────┐    ┌────────────┐                        │
│  │  Lambda    │    │  Lambda    │    │  Lambda    │                        │
│  │ $connect   │    │ $message   │    │$disconnect │                        │
│  └─────┬──────┘    └─────┬──────┘    └─────┬──────┘                        │
│        │                 │                 │                                │
│        └────────────────┬┴─────────────────┘                                │
│                         │                                                   │
│           ┌─────────────▼─────────────┐                                    │
│           │       DynamoDB            │                                    │
│           │  ┌─────────────────────┐  │                                    │
│           │  │ connections         │  │  (连接状态表)                       │
│           │  │ sessions            │  │  (会话表)                           │
│           │  │ messages            │  │  (加密消息缓存)                     │
│           │  └─────────────────────┘  │                                    │
│           └───────────────────────────┘                                    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Amazon Cognito                                  │   │
│  │                (用户认证 - 可选，支持匿名)                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘

        ▲                                               ▲
        │ WebSocket (E2EE)                              │ WebSocket (E2EE)
        │                                               │
┌───────┴───────┐                               ┌───────┴───────┐
│  Always Coder │                               │  Always Coder │
│     CLI       │                               │     Web       │
│  (本地电脑)    │                               │  (手机/浏览器) │
│               │                               │               │
│ ┌───────────┐ │                               │ ┌───────────┐ │
│ │ PTY 进程   │ │                               │ │ xterm.js  │ │
│ │ claude/   │ │                               │ │ 终端渲染   │ │
│ │ codex     │ │                               │ │           │ │
│ └───────────┘ │                               │ └───────────┘ │
└───────────────┘                               └───────────────┘
```

---

## 一、技术栈选型

### 客户端技术栈

| 组件 | 技术 | 说明 |
|------|------|------|
| CLI 运行时 | **Bun** | 高性能 JS 运行时，内置 TypeScript 支持 |
| CLI 终端 | **bun-pty (node-pty)** | PTY 进程管理 |
| Web 框架 | **Next.js 14 (App Router)** | React 全栈框架 |
| Web 终端 | **xterm.js** | 终端模拟器 |
| 状态管理 | **Zustand** | 轻量状态管理 |
| 加密库 | **tweetnacl** | E2EE 加密 |

### AWS 服务选型

| 组件 | AWS 服务 | 用途 |
|------|----------|------|
| WebSocket 通信 | **API Gateway WebSocket API** | 实时双向通信 |
| 业务逻辑 | **AWS Lambda (Node.js 20.x)** | 无服务器计算 |
| 数据存储 | **DynamoDB** | 连接状态、会话、消息缓存 |
| Web 托管 | **S3 + CloudFront** 或 **Amplify Hosting** | 静态网站托管 + CDN |
| 用户认证 | **Cognito** (可选) | 身份验证，支持匿名和登录两种模式 |
| 基础设施即代码 | **AWS CDK (TypeScript)** | 基础设施部署 |
| 日志监控 | **CloudWatch** | 日志和指标 |
| 密钥管理 | **Secrets Manager** | API 密钥存储 (可选) |

---

## 二、目录结构

```
always-coder/
├── packages/
│   ├── cli/                      # CLI 客户端 (Bun)
│   │   ├── src/
│   │   │   ├── index.ts          # 入口 (bun run)
│   │   │   ├── pty/              # PTY 管理
│   │   │   │   └── terminal.ts
│   │   │   ├── crypto/           # E2EE 加密
│   │   │   │   └── encryption.ts
│   │   │   ├── websocket/        # WebSocket 客户端
│   │   │   │   └── client.ts
│   │   │   ├── session/          # 会话管理
│   │   │   │   └── manager.ts
│   │   │   ├── qrcode/           # 二维码生成
│   │   │   │   └── generator.ts
│   │   │   └── config/           # 配置管理
│   │   │       └── index.ts
│   │   ├── package.json
│   │   └── bunfig.toml           # Bun 配置
│   │
│   ├── server/                   # AWS Lambda 后端
│   │   ├── src/
│   │   │   ├── handlers/
│   │   │   │   ├── connect.ts    # $connect 处理
│   │   │   │   ├── disconnect.ts # $disconnect 处理
│   │   │   │   ├── message.ts    # $default 消息路由
│   │   │   │   └── authorizer.ts # Cognito 认证
│   │   │   ├── services/
│   │   │   │   ├── connection.ts # 连接管理
│   │   │   │   ├── session.ts    # 会话管理
│   │   │   │   └── relay.ts      # 消息中继
│   │   │   └── utils/
│   │   │       └── dynamodb.ts   # DynamoDB 工具
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── web/                      # Web 前端 (Next.js 14)
│   │   ├── app/
│   │   │   ├── layout.tsx        # 根布局
│   │   │   ├── page.tsx          # 首页
│   │   │   ├── session/
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx  # 会话页面
│   │   │   ├── scan/
│   │   │   │   └── page.tsx      # 扫码页面
│   │   │   └── api/
│   │   │       └── auth/         # NextAuth (可选)
│   │   │           └── [...nextauth]/route.ts
│   │   ├── components/
│   │   │   ├── Terminal/         # 终端组件
│   │   │   │   ├── Terminal.tsx
│   │   │   │   └── TerminalToolbar.tsx
│   │   │   ├── QRScanner/        # 二维码扫描
│   │   │   │   └── QRScanner.tsx
│   │   │   ├── SessionList/      # 会话列表
│   │   │   │   └── SessionList.tsx
│   │   │   └── ui/               # 通用 UI 组件
│   │   │       └── ...
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts
│   │   │   ├── useCrypto.ts
│   │   │   └── useSession.ts
│   │   ├── lib/
│   │   │   ├── crypto.ts         # E2EE 加密
│   │   │   ├── websocket.ts      # WebSocket 客户端
│   │   │   └── cognito.ts        # Cognito 集成
│   │   ├── stores/
│   │   │   └── session.ts        # Zustand 状态
│   │   ├── next.config.js
│   │   ├── tailwind.config.js
│   │   └── package.json
│   │
│   └── shared/                   # 共享代码
│       ├── src/
│       │   ├── types/            # 类型定义
│       │   │   ├── message.ts
│       │   │   └── session.ts
│       │   ├── crypto/           # 加密算法
│       │   │   └── nacl.ts
│       │   └── protocol/         # 通信协议
│       │       └── messages.ts
│       └── package.json
│
├── infra/                        # AWS CDK 基础设施
│   ├── lib/
│   │   ├── api-stack.ts          # API Gateway + Lambda
│   │   ├── database-stack.ts     # DynamoDB
│   │   ├── web-stack.ts          # S3 + CloudFront
│   │   └── main-stack.ts         # 主 Stack
│   ├── bin/
│   │   └── app.ts
│   ├── cdk.json
│   └── package.json
│
├── package.json                  # Monorepo 根配置
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```

---

## 三、核心模块设计

### 3.1 通信协议 (E2EE)

```typescript
// packages/shared/src/types/message.ts

// 消息类型
enum MessageType {
  // 会话管理
  SESSION_CREATE = 'session:create',
  SESSION_JOIN = 'session:join',
  SESSION_LEAVE = 'session:leave',

  // 终端数据
  TERMINAL_OUTPUT = 'terminal:output',
  TERMINAL_INPUT = 'terminal:input',
  TERMINAL_RESIZE = 'terminal:resize',

  // 状态同步
  STATE_SYNC = 'state:sync',
  STATE_REQUEST = 'state:request',

  // 心跳
  PING = 'ping',
  PONG = 'pong',
}

// 加密消息包装
interface EncryptedEnvelope {
  version: 1;
  sessionId: string;
  nonce: string;      // Base64 编码的随机数
  ciphertext: string; // Base64 编码的密文
  timestamp: number;
}

// 解密后的消息
interface Message<T = unknown> {
  type: MessageType;
  payload: T;
  seq: number;        // 序列号，用于排序
}
```

### 3.2 加密方案 (TweetNaCl)

```typescript
// packages/shared/src/crypto/nacl.ts
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';

export class E2ECrypto {
  private keyPair: nacl.BoxKeyPair;
  private sharedKey: Uint8Array | null = null;

  constructor() {
    this.keyPair = nacl.box.keyPair();
  }

  // 获取公钥 (用于二维码)
  getPublicKey(): string {
    return encodeBase64(this.keyPair.publicKey);
  }

  // 使用对方公钥建立共享密钥
  establishSharedKey(theirPublicKey: string): void {
    const theirKey = decodeBase64(theirPublicKey);
    // 使用 X25519 Diffie-Hellman 密钥交换
    this.sharedKey = nacl.box.before(theirKey, this.keyPair.secretKey);
  }

  // 加密消息
  encrypt(message: Message): EncryptedEnvelope {
    if (!this.sharedKey) throw new Error('Shared key not established');

    const nonce = nacl.randomBytes(24);
    const messageBytes = new TextEncoder().encode(JSON.stringify(message));
    const ciphertext = nacl.box.after(messageBytes, nonce, this.sharedKey);

    return {
      version: 1,
      sessionId: '', // 由上层填充
      nonce: encodeBase64(nonce),
      ciphertext: encodeBase64(ciphertext),
      timestamp: Date.now(),
    };
  }

  // 解密消息
  decrypt(envelope: EncryptedEnvelope): Message {
    if (!this.sharedKey) throw new Error('Shared key not established');

    const nonce = decodeBase64(envelope.nonce);
    const ciphertext = decodeBase64(envelope.ciphertext);
    const decrypted = nacl.box.open.after(ciphertext, nonce, this.sharedKey);

    if (!decrypted) throw new Error('Decryption failed');

    return JSON.parse(new TextDecoder().decode(decrypted));
  }
}
```

### 3.3 DynamoDB 表设计

```typescript
// 连接表 - 存储 WebSocket 连接
const ConnectionsTable = {
  TableName: 'always-coder-connections',
  KeySchema: [
    { AttributeName: 'connectionId', KeyType: 'HASH' }
  ],
  Attributes: {
    connectionId: 'string',  // WebSocket 连接 ID
    sessionId: 'string',     // 所属会话 ID
    role: 'cli | web',       // 连接角色
    connectedAt: 'number',   // 连接时间
    ttl: 'number',           // 自动过期 (24小时)
  },
  GSI: [
    { name: 'sessionId-index', key: 'sessionId' }
  ]
};

// 会话表 - 存储会话信息
const SessionsTable = {
  TableName: 'always-coder-sessions',
  KeySchema: [
    { AttributeName: 'sessionId', KeyType: 'HASH' }
  ],
  Attributes: {
    sessionId: 'string',     // 会话 ID (6位短码)
    cliConnectionId: 'string', // CLI 连接 ID
    webConnectionIds: 'string[]', // Web 连接 ID 列表
    createdAt: 'number',
    lastActiveAt: 'number',
    ttl: 'number',           // 自动过期 (24小时)
  }
};

// 消息缓存表 - 存储最近的终端输出 (用于新连接同步)
const MessagesTable = {
  TableName: 'always-coder-messages',
  KeySchema: [
    { AttributeName: 'sessionId', KeyType: 'HASH' },
    { AttributeName: 'seq', KeyType: 'RANGE' }
  ],
  Attributes: {
    sessionId: 'string',
    seq: 'number',           // 消息序列号
    encryptedData: 'string', // 加密的消息数据
    timestamp: 'number',
    ttl: 'number',           // 1小时过期
  }
};
```

---

## 四、组件详细设计

### 4.1 CLI 客户端 (Bun)

**技术栈:** Bun / TypeScript / node-pty / 内置 WebSocket

**核心功能:**
1. PTY 进程管理 - 启动并包装 claude/codex 命令
2. 终端数据捕获 - 实时捕获 stdout/stderr
3. WebSocket 通信 - 使用 Bun 内置 WebSocket 连接 AWS
4. E2EE 加密 - 所有数据端到端加密
5. 二维码生成 - 显示配对二维码 (qrcode-terminal)
6. 会话恢复 - 支持断线重连
7. Cognito 可选登录 - 支持匿名或登录模式

**CLI 命令设计:**
```bash
# 基础使用 (匿名模式)
always claude                    # 包装 claude 命令
always codex                     # 包装 codex 命令
always -- npm run dev            # 包装任意命令

# 登录模式
always login                     # Cognito 登录
always logout                    # 登出
always sessions                  # 查看历史会话

# 配置
always config set server <url>   # 设置服务器地址
```

```typescript
// packages/cli/src/index.ts - Bun 主入口
import { spawn } from 'node-pty';

async function main() {
  const args = Bun.argv.slice(2);
  const command = args[0] || 'claude';

  // 1. 生成密钥对和会话 ID
  const crypto = new E2ECrypto();
  const sessionId = generateShortId(); // 6位短码

  // 2. 连接 WebSocket (Bun 内置)
  const ws = new WebSocket(WS_ENDPOINT);
  await new Promise(resolve => ws.addEventListener('open', resolve));

  // 3. 创建会话
  ws.send(JSON.stringify({ type: 'session:create', sessionId, publicKey: crypto.getPublicKey() }));

  // 4. 显示二维码 (包含会话 ID 和公钥)
  displayQRCode({ sessionId, publicKey: crypto.getPublicKey(), wsEndpoint: WS_ENDPOINT });

  // 5. 等待 Web 端连接
  const webPublicKey = await waitForWebConnection(ws);
  crypto.establishSharedKey(webPublicKey);

  // 6. 启动 PTY 进程 (node-pty 兼容 Bun)
  const pty = spawn(command, args.slice(1), {
    name: 'xterm-256color',
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
    cwd: process.cwd(),
    env: process.env,
  });

  // 7. 本地终端也显示输出
  pty.onData((data) => {
    process.stdout.write(data);
    const encrypted = crypto.encrypt({ type: 'terminal:output', payload: data, seq: seq++ });
    ws.send(JSON.stringify(encrypted));
  });

  // 8. 处理来自 Web 的输入
  ws.addEventListener('message', (event) => {
    const envelope = JSON.parse(event.data);
    const message = crypto.decrypt(envelope);
    if (message.type === 'terminal:input') {
      pty.write(message.payload);
    } else if (message.type === 'terminal:resize') {
      pty.resize(message.payload.cols, message.payload.rows);
    }
  });

  // 9. 本地键盘输入也转发
  process.stdin.setRawMode(true);
  process.stdin.on('data', (data) => pty.write(data));
}
```

### 4.2 AWS Lambda 后端

**技术栈:** Node.js 20.x / TypeScript / AWS SDK v3

**Lambda 函数:**

| 函数 | 触发器 | 职责 |
|------|--------|------|
| `connect` | $connect | 记录连接、验证 token |
| `disconnect` | $disconnect | 清理连接、通知其他端 |
| `message` | $default | 消息路由和转发 |
| `authorizer` | 可选 | JWT/Cognito 验证 |

```typescript
// packages/server/src/handlers/message.ts - 消息处理伪代码
export const handler = async (event: APIGatewayProxyEvent) => {
  const connectionId = event.requestContext.connectionId;
  const body = JSON.parse(event.body);

  // 获取连接信息
  const connection = await getConnection(connectionId);
  const session = await getSession(connection.sessionId);

  // 路由消息 (服务器不解密，直接转发)
  switch (body.type) {
    case 'session:create':
      // CLI 创建会话
      await createSession(body.sessionId, connectionId);
      break;

    case 'session:join':
      // Web 加入会话
      await joinSession(body.sessionId, connectionId);
      // 通知 CLI 有新连接
      await relayToConnection(session.cliConnectionId, {
        type: 'web:connected',
        publicKey: body.publicKey
      });
      break;

    default:
      // 转发加密消息到目标连接
      const targets = connection.role === 'cli'
        ? session.webConnectionIds
        : [session.cliConnectionId];

      await Promise.all(targets.map(targetId =>
        relayToConnection(targetId, body)
      ));
  }

  return { statusCode: 200 };
};

// 消息转发函数
async function relayToConnection(connectionId: string, data: unknown) {
  const client = new ApiGatewayManagementApiClient({ endpoint: WS_ENDPOINT });
  await client.send(new PostToConnectionCommand({
    ConnectionId: connectionId,
    Data: JSON.stringify(data)
  }));
}
```

### 4.3 Web 前端 (Next.js 14)

**技术栈:** Next.js 14 (App Router) / TypeScript / xterm.js / Zustand / Tailwind CSS

**页面路由:**

| 路由 | 功能 |
|------|------|
| `/` | 首页 - 登录/扫码入口 |
| `/scan` | 扫描二维码配对 |
| `/session/[id]` | 终端会话页面 |
| `/sessions` | 历史会话列表 (登录用户) |

**核心组件:**

| 组件 | 功能 |
|------|------|
| `Terminal` | xterm.js 终端渲染 (客户端组件) |
| `QRScanner` | 相机扫描二维码 (html5-qrcode) |
| `SessionList` | 会话列表和管理 |
| `AuthButton` | Cognito 登录/登出 |

```typescript
// packages/web/components/Terminal/Terminal.tsx - Next.js 客户端组件
'use client';

import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { useCrypto } from '@/hooks/useCrypto';
import { useWebSocket } from '@/hooks/useWebSocket';
import { MessageType } from '@always-coder/shared';
import 'xterm/css/xterm.css';

interface TerminalProps {
  sessionId: string;
  publicKey: string;
}

export function Terminal({ sessionId, publicKey }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const { crypto, establishKey } = useCrypto();
  const { isConnected, send, subscribe } = useWebSocket(sessionId);

  // 初始化终端
  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
      theme: {
        background: '#1a1b26',
        foreground: '#a9b1d6',
        cursor: '#c0caf5',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;

    // 建立密钥
    establishKey(publicKey);

    // 处理用户输入
    term.onData((data) => {
      const encrypted = crypto.encrypt({
        type: MessageType.TERMINAL_INPUT,
        payload: data,
        seq: Date.now(),
      });
      send(encrypted);
    });

    // 响应窗口大小变化
    const handleResize = () => {
      fitAddon.fit();
      const { cols, rows } = term;
      const encrypted = crypto.encrypt({
        type: MessageType.TERMINAL_RESIZE,
        payload: { cols, rows },
        seq: Date.now(),
      });
      send(encrypted);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
    };
  }, []);

  // 接收终端输出
  useEffect(() => {
    const unsubscribe = subscribe((envelope) => {
      try {
        const message = crypto.decrypt(envelope);
        if (message.type === MessageType.TERMINAL_OUTPUT && xtermRef.current) {
          xtermRef.current.write(message.payload);
        }
      } catch (error) {
        console.error('Failed to decrypt message:', error);
      }
    });

    return unsubscribe;
  }, [crypto, subscribe]);

  return (
    <div className="flex flex-col h-screen bg-[#1a1b26]">
      <div className="flex items-center justify-between px-4 py-2 bg-[#24283b]">
        <span className="text-sm text-gray-400">Session: {sessionId}</span>
        <span className={`text-sm ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
          {isConnected ? '● Connected' : '○ Disconnected'}
        </span>
      </div>
      <div ref={terminalRef} className="flex-1" />
    </div>
  );
}
```

```typescript
// packages/web/app/session/[id]/page.tsx - 会话页面
import { Terminal } from '@/components/Terminal/Terminal';
import { notFound } from 'next/navigation';

interface PageProps {
  params: { id: string };
  searchParams: { key?: string };
}

export default function SessionPage({ params, searchParams }: PageProps) {
  const { id: sessionId } = params;
  const { key: publicKey } = searchParams;

  if (!publicKey) {
    notFound();
  }

  return <Terminal sessionId={sessionId} publicKey={decodeURIComponent(publicKey)} />;
}
```

```typescript
// packages/web/components/QRScanner/QRScanner.tsx - 二维码扫描
'use client';

import { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useRouter } from 'next/navigation';

export function QRScanner() {
  const router = useRouter();
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        // 解析二维码: { sessionId, publicKey, wsEndpoint }
        const data = JSON.parse(decodedText);
        scanner.stop();
        router.push(`/session/${data.sessionId}?key=${encodeURIComponent(data.publicKey)}`);
      },
      () => {} // ignore errors
    );

    return () => {
      scanner.stop().catch(() => {});
    };
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900">
      <h1 className="text-2xl text-white mb-8">Scan QR Code to Connect</h1>
      <div id="qr-reader" className="w-80 h-80" />
    </div>
  );
}
```

### 4.4 AWS CDK 基础设施

```typescript
// infra/lib/api-stack.ts - API Gateway + Lambda + Cognito
export class ApiStack extends Stack {
  public readonly webSocketApi: WebSocketApi;
  public readonly userPool: UserPool;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    // ==================== Cognito ====================
    const userPool = new UserPool(this, 'UserPool', {
      userPoolName: 'always-coder-users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
      },
    });

    const userPoolClient = userPool.addClient('WebClient', {
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [OAuthScope.EMAIL, OAuthScope.OPENID, OAuthScope.PROFILE],
        callbackUrls: ['http://localhost:3000/api/auth/callback/cognito'],
      },
    });

    this.userPool = userPool;

    // ==================== DynamoDB ====================
    const connectionsTable = new Table(this, 'Connections', {
      tableName: 'always-coder-connections',
      partitionKey: { name: 'connectionId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
    });

    connectionsTable.addGlobalSecondaryIndex({
      indexName: 'sessionId-index',
      partitionKey: { name: 'sessionId', type: AttributeType.STRING },
    });

    const sessionsTable = new Table(this, 'Sessions', {
      tableName: 'always-coder-sessions',
      partitionKey: { name: 'sessionId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
    });

    sessionsTable.addGlobalSecondaryIndex({
      indexName: 'userId-index',
      partitionKey: { name: 'userId', type: AttributeType.STRING },
      sortKey: { name: 'createdAt', type: AttributeType.NUMBER },
    });

    const messagesTable = new Table(this, 'Messages', {
      tableName: 'always-coder-messages',
      partitionKey: { name: 'sessionId', type: AttributeType.STRING },
      sortKey: { name: 'seq', type: AttributeType.NUMBER },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
    });

    // ==================== Lambda 函数 ====================
    const commonEnv = {
      CONNECTIONS_TABLE: connectionsTable.tableName,
      SESSIONS_TABLE: sessionsTable.tableName,
      MESSAGES_TABLE: messagesTable.tableName,
    };

    const connectHandler = new NodejsFunction(this, 'ConnectHandler', {
      entry: 'packages/server/src/handlers/connect.ts',
      runtime: Runtime.NODEJS_20_X,
      environment: commonEnv,
      timeout: Duration.seconds(10),
    });

    const disconnectHandler = new NodejsFunction(this, 'DisconnectHandler', {
      entry: 'packages/server/src/handlers/disconnect.ts',
      runtime: Runtime.NODEJS_20_X,
      environment: commonEnv,
      timeout: Duration.seconds(10),
    });

    const messageHandler = new NodejsFunction(this, 'MessageHandler', {
      entry: 'packages/server/src/handlers/message.ts',
      runtime: Runtime.NODEJS_20_X,
      environment: commonEnv,
      timeout: Duration.seconds(30),
    });

    // 授权 Lambda 访问 DynamoDB
    connectionsTable.grantReadWriteData(connectHandler);
    connectionsTable.grantReadWriteData(disconnectHandler);
    connectionsTable.grantReadWriteData(messageHandler);
    sessionsTable.grantReadWriteData(connectHandler);
    sessionsTable.grantReadWriteData(disconnectHandler);
    sessionsTable.grantReadWriteData(messageHandler);
    messagesTable.grantReadWriteData(messageHandler);

    // ==================== WebSocket API ====================
    const webSocketApi = new WebSocketApi(this, 'WebSocketApi', {
      apiName: 'always-coder-ws',
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration('ConnectIntegration', connectHandler),
      },
      disconnectRouteOptions: {
        integration: new WebSocketLambdaIntegration('DisconnectIntegration', disconnectHandler),
      },
      defaultRouteOptions: {
        integration: new WebSocketLambdaIntegration('MessageIntegration', messageHandler),
      },
    });

    const stage = new WebSocketStage(this, 'ProdStage', {
      webSocketApi,
      stageName: 'prod',
      autoDeploy: true,
    });

    // 授权 Lambda 发送消息到 WebSocket 连接
    webSocketApi.grantManageConnections(messageHandler);
    webSocketApi.grantManageConnections(disconnectHandler);

    this.webSocketApi = webSocketApi;

    // ==================== 输出 ====================
    new CfnOutput(this, 'WebSocketUrl', {
      value: stage.url,
      description: 'WebSocket API URL',
    });

    new CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
    });

    new CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
    });
  }
}
```

```typescript
// infra/lib/web-stack.ts - Next.js 部署 (Amplify Hosting)
export class WebStack extends Stack {
  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);

    // 使用 Amplify Hosting 部署 Next.js
    const amplifyApp = new App(this, 'AlwaysCoderWeb', {
      appName: 'always-coder-web',
      sourceCodeProvider: new GitHubSourceCodeProvider({
        owner: 'your-org',
        repository: 'always-coder',
        oauthToken: SecretValue.secretsManager('github-token'),
      }),
      buildSpec: BuildSpec.fromObjectToYaml({
        version: 1,
        applications: [{
          appRoot: 'packages/web',
          frontend: {
            phases: {
              preBuild: { commands: ['npm install'] },
              build: { commands: ['npm run build'] },
            },
            artifacts: {
              baseDirectory: '.next',
              files: ['**/*'],
            },
            cache: { paths: ['node_modules/**/*'] },
          },
        }],
      }),
      environmentVariables: {
        NEXT_PUBLIC_WS_ENDPOINT: props.wsEndpoint,
        NEXT_PUBLIC_COGNITO_USER_POOL_ID: props.userPoolId,
        NEXT_PUBLIC_COGNITO_CLIENT_ID: props.userPoolClientId,
      },
    });

    amplifyApp.addBranch('main', { autoBuild: true });
  }
}
```

---

## 五、安全设计

### 5.1 端到端加密流程

```
1. CLI 启动时生成 X25519 密钥对
2. CLI 创建会话，显示二维码 (含 sessionId + publicKey)
3. Web 扫描二维码，生成自己的密钥对
4. Web 发送自己的 publicKey 给 CLI
5. 双方使用 X25519 ECDH 计算共享密钥
6. 所有后续通信使用 XSalsa20-Poly1305 加密
```

### 5.2 零信任服务器

- 服务器只看到 sessionId 和加密的密文
- 无法解密任何消息内容
- 只负责按 sessionId 路由消息

### 5.3 会话安全

- 会话 ID 使用 6 位短码 (便于手动输入)
- 会话 24 小时自动过期 (DynamoDB TTL)
- 支持会话主动销毁

---

## 六、部署流程

```bash
# 1. 安装依赖 (使用 pnpm workspace)
pnpm install

# 2. 配置 AWS 凭证
aws configure  # 或设置 AWS_PROFILE

# 3. Bootstrap CDK (首次)
cd infra && cdk bootstrap

# 4. 部署 AWS 基础设施
cdk deploy --all

# 部署输出示例:
# ✅ ApiStack
# WebSocketUrl = wss://abc123.execute-api.us-east-1.amazonaws.com/prod
# UserPoolId = us-east-1_xxxxxxx
# UserPoolClientId = xxxxxxxxxxxxxxxxxxxxxxxxxx

# 5. 配置 Web 环境变量
cd ../packages/web
cp .env.example .env.local
# 编辑 .env.local 填入上述输出值

# 6. 本地开发测试
pnpm dev  # Next.js dev server at http://localhost:3000

# 7. 部署 Web (Amplify 自动部署或手动)
# 方式 A: 推送到 GitHub，Amplify 自动构建
git push origin main

# 方式 B: 手动部署到 S3 + CloudFront
pnpm build
aws s3 sync out/ s3://always-coder-web-bucket/ --delete
aws cloudfront create-invalidation --distribution-id EXXXXXX --paths "/*"

# 8. 构建 CLI
cd ../packages/cli
bun build ./src/index.ts --compile --outfile always

# 9. 发布 CLI
# 方式 A: npm 发布
npm publish

# 方式 B: 直接分发二进制
# 生成的 always 可执行文件可直接分发
```

---

## 七、实现优先级

### Phase 1: 项目基础 (Day 1)
1. [ ] 项目初始化 - pnpm monorepo + TypeScript 配置
2. [ ] shared 包 - 类型定义 (MessageType, EncryptedEnvelope)
3. [ ] shared 包 - E2EE 加密模块 (tweetnacl)

### Phase 2: AWS 后端 (Day 2-3)
4. [ ] infra - CDK 基础设施定义
   - DynamoDB 表 (connections, sessions, messages)
   - API Gateway WebSocket API
   - Lambda 函数配置
   - Cognito User Pool
5. [ ] server 包 - connect handler
6. [ ] server 包 - disconnect handler
7. [ ] server 包 - message handler (路由 + 转发)
8. [ ] 部署并测试 WebSocket 连接

### Phase 3: CLI 客户端 (Day 4-5)
9. [ ] cli 包 - 项目结构和 Bun 配置
10. [ ] cli 包 - WebSocket 客户端
11. [ ] cli 包 - PTY 进程管理 (node-pty)
12. [ ] cli 包 - 二维码生成显示
13. [ ] cli 包 - E2EE 加密集成
14. [ ] cli 包 - 命令行参数解析

### Phase 4: Web 前端 (Day 6-8)
15. [ ] web 包 - Next.js 14 项目初始化
16. [ ] web 包 - xterm.js 终端组件
17. [ ] web 包 - 二维码扫描组件 (html5-qrcode)
18. [ ] web 包 - WebSocket hook
19. [ ] web 包 - E2EE 加密 hook
20. [ ] web 包 - 会话页面 (/session/[id])
21. [ ] web 包 - 扫码页面 (/scan)

### Phase 5: 认证集成 (Day 9-10)
22. [ ] Cognito 集成 - CLI 登录流程
23. [ ] Cognito 集成 - Web NextAuth
24. [ ] 会话持久化 - 登录用户的历史会话
25. [ ] 会话列表页面 (/sessions)

### Phase 6: 完善和优化 (Day 11-12)
26. [ ] 会话恢复 - 新连接同步历史输出
27. [ ] 多客户端 - 支持多 Web 同时连接
28. [ ] 错误处理 - 断线重连机制
29. [ ] CloudWatch - 日志和监控
30. [ ] 文档 - README 和使用指南

### Phase 7: 语音功能 (后续)
31. [ ] Web Speech API 语音识别
32. [ ] 语音输入 UI 组件
33. [ ] 语音转文本输入

---

## 八、验证方案

### 8.1 单元测试
```bash
# 运行所有测试
pnpm test

# 重点测试模块
- packages/shared/src/crypto/nacl.test.ts  # 加密/解密
- packages/server/src/services/*.test.ts   # 会话管理
```

### 8.2 集成测试
```bash
# 本地启动 LocalStack 或使用真实 AWS
# 测试 WebSocket 连接和消息转发
pnpm test:integration
```

### 8.3 手动 E2E 验证流程
```bash
# 终端 1: 启动 CLI
cd packages/cli
bun run src/index.ts claude

# 输出:
# 🔗 Session: ABC123
# 📱 Scan QR code to connect:
# ██████████████████████
# ██████████████████████ (QR Code)
# ██████████████████████
# Waiting for connection...

# 浏览器: 打开 Web
# 1. 访问 http://localhost:3000/scan
# 2. 用手机相机扫描二维码
# 3. 自动跳转到 /session/ABC123
# 4. 看到终端界面，显示 CLI 输出
# 5. 在 Web 输入命令，CLI 执行
# 6. 输出实时同步到 Web

# 验证点:
# ✅ 二维码正确生成和扫描
# ✅ WebSocket 连接建立
# ✅ E2EE 密钥交换成功
# ✅ 终端输出实时同步
# ✅ 用户输入正确传递
# ✅ 窗口大小同步
# ✅ 断线重连正常工作
```

### 8.4 安全验证
- [ ] 抓包验证服务器只看到加密数据
- [ ] 验证不同会话使用不同密钥
- [ ] 验证会话过期自动清理

---

## 九、关键文件清单

```
实现时需重点关注的文件:

packages/shared/
├── src/types/message.ts         # 消息类型定义 (最先实现)
├── src/crypto/nacl.ts           # E2EE 加密核心 (最先实现)
└── src/protocol/messages.ts     # 协议常量

packages/server/
├── src/handlers/connect.ts      # WebSocket 连接处理
├── src/handlers/message.ts      # 消息路由 (核心)
└── src/services/relay.ts        # 消息转发逻辑

packages/cli/
├── src/index.ts                 # CLI 入口 (Bun)
├── src/pty/terminal.ts          # PTY 管理 (核心)
└── src/websocket/client.ts      # WebSocket 通信

packages/web/
├── app/session/[id]/page.tsx    # 会话页面
├── components/Terminal/Terminal.tsx  # 终端组件 (核心)
└── hooks/useWebSocket.ts        # WebSocket hook

infra/
├── lib/api-stack.ts             # WebSocket + Lambda + DynamoDB
└── lib/web-stack.ts             # Amplify 部署
```
