import { EventEmitter } from 'events';
import { createWriteStream, appendFileSync, type WriteStream } from 'fs';
import {
  MessageType,
  type EncryptedEnvelope,
  InputFilter,
  type InputFilterConfig,
  DEFAULT_INPUT_FILTER_CONFIG,
} from '@always-coder/shared';
import { WebSocketClient } from '../websocket/client.js';
import { EncryptionManager } from '../crypto/encryption.js';
import { Terminal, type TerminalOptions } from '../pty/terminal.js';
import { displayQRCode } from '../qrcode/generator.js';
import { getWSEndpoint, getWebUrl, loadConfig } from '../config/index.js';
import { saveDaemonSession, deleteDaemonSession, type DaemonSession } from '../daemon/index.js';
import { getInstanceInfo, type InstanceInfo } from '../utils/instance.js';
import chalk from 'chalk';

/**
 * Session manager events
 */
export interface SessionManagerEvents {
  ready: () => void;
  'web:connected': (connectionId: string) => void;
  'web:disconnected': (connectionId: string) => void;
  'terminal:exit': (exitCode: number) => void;
  error: (error: Error) => void;
  closed: () => void;
}

/**
 * Session manager options
 */
export interface SessionManagerOptions {
  command: string;
  args?: string[];
  serverUrl?: string;
  daemon?: boolean;
  logFile?: string;
  /** Enable/disable web input filtering (default: true) */
  filterWebInput?: boolean;
  /** Custom input filter configuration */
  inputFilterConfig?: Partial<InputFilterConfig>;
}

/**
 * Session manager - orchestrates CLI, WebSocket, and PTY
 */
export class SessionManager extends EventEmitter {
  private wsClient: WebSocketClient | null = null;
  private encryption: EncryptionManager;
  private terminal: Terminal | null = null;
  private options: SessionManagerOptions;
  private connectedWebClients: Set<string> = new Set();
  private isReady: boolean = false;
  private terminalBuffer: string = '';
  private maxBufferSize: number = 100 * 1024; // 100KB buffer for late joiners
  private isDaemon: boolean = false;
  private logStream: WriteStream | null = null;
  private pendingSessionMetadata: {
    instanceInfo: InstanceInfo;
    sessionWebUrl: string;
  } | null = null;
  private inputFilter: InputFilter;

  constructor(options: SessionManagerOptions) {
    super();
    this.options = options;
    this.encryption = new EncryptionManager();
    this.isDaemon = options.daemon || false;

    // Set up input filter for web client signals
    // By default, block dangerous signals (Ctrl+C, Ctrl+D, etc.) from web clients
    // to prevent accidental session termination
    const filterEnabled = options.filterWebInput !== false;
    const filterConfig: InputFilterConfig = filterEnabled
      ? { ...DEFAULT_INPUT_FILTER_CONFIG, ...options.inputFilterConfig }
      : {
          blockCtrlC: false,
          blockCtrlD: false,
          blockCtrlZ: false,
          blockCtrlBackslash: false,
        };
    this.inputFilter = new InputFilter(filterConfig);

    // Set up logging for daemon mode
    if (this.isDaemon && options.logFile) {
      this.logStream = createWriteStream(options.logFile, { flags: 'a' });
    }
  }

  /**
   * Log message (to console or file in daemon mode)
   */
  private log(message: string): void {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}\n`;

    if (this.isDaemon && this.logStream) {
      this.logStream.write(logLine);
    } else {
      console.log(message);
    }
  }

  /**
   * Log error message
   */
  private logError(message: string, error?: unknown): void {
    const timestamp = new Date().toISOString();
    const errorStr = error instanceof Error ? error.message : String(error);
    const logLine = `[${timestamp}] ERROR: ${message}${error ? ` - ${errorStr}` : ''}\n`;

    if (this.isDaemon && this.logStream) {
      this.logStream.write(logLine);
    } else {
      console.error(chalk.red(message), error || '');
    }
  }

  /**
   * Start the session
   */
  async start(): Promise<void> {
    const wsEndpoint = this.options.serverUrl || getWSEndpoint();
    const config = loadConfig();
    const authToken = config.authToken;

    this.log(chalk.blue('🚀 Starting Always Coder session...'));
    this.log(chalk.gray(`   Server: ${wsEndpoint}`));
    if (authToken) {
      this.log(chalk.gray('   Auth: Using configured token'));
    }

    // Connect to WebSocket server with optional auth token
    this.wsClient = new WebSocketClient({
      endpoint: wsEndpoint,
      authToken,
    });
    this.setupWebSocketHandlers();

    try {
      await this.wsClient.connect();

      // Note: session create is now sent in the 'open' handler after initial connect
      // This allows proper handling of reconnections

      // Get instance info and build web URL
      const webUrl = getWebUrl();
      const instanceInfo = await getInstanceInfo();
      const sessionWebUrl = `${webUrl}/join?id=${this.encryption.getSessionId()}&key=${encodeURIComponent(this.encryption.getPublicKey())}`;

      // Store metadata for sending after session is created on server
      // (we need to wait for SESSION_CREATED before sending SESSION_UPDATE
      // so the server has registered our connection)
      this.pendingSessionMetadata = { instanceInfo, sessionWebUrl };

      // Save daemon session info (for first connect)
      if (this.isDaemon) {
        const daemonSession: DaemonSession = {
          sessionId: this.encryption.getSessionId(),
          pid: process.pid,
          command: this.options.command,
          args: this.options.args || [],
          startedAt: Date.now(),
          webUrl: sessionWebUrl,
          logFile: this.options.logFile || '',
          instanceId: instanceInfo.instanceId,
          hostname: instanceInfo.hostname,
          instanceLabel: instanceInfo.label,
        };
        saveDaemonSession(daemonSession);
        this.log(`Session saved: ${daemonSession.sessionId}`);
        this.log(`Instance: ${instanceInfo.label || instanceInfo.instanceId}`);
        this.log(`Web URL: ${daemonSession.webUrl}`);
      } else {
        // Display QR code for web connection (only in interactive mode)
        displayQRCode({
          sessionId: this.encryption.getSessionId(),
          publicKey: this.encryption.getPublicKey(),
          wsEndpoint,
        });
      }

      this.log(chalk.yellow('⏳ Waiting for web client to connect...'));
    } catch (error) {
      this.logError('Failed to connect to server:', error);
      throw error;
    }
  }

  /**
   * Set up WebSocket event handlers
   */
  private setupWebSocketHandlers(): void {
    if (!this.wsClient) return;

    // Handle WebSocket open (first connect or reconnect)
    this.wsClient.on('open', ({ isReconnect }: { isReconnect: boolean }) => {
      if (isReconnect) {
        this.log(chalk.yellow('🔄 WebSocket reconnected, re-registering session...'));
        this.wsClient?.sendSessionReconnect(
          this.encryption.getSessionId(),
          this.encryption.getPublicKey()
        );
      } else {
        // First connect - create session
        this.wsClient?.sendSessionCreate(
          this.encryption.getSessionId(),
          this.encryption.getPublicKey()
        );
      }
    });

    this.wsClient.on('session:created', () => {
      this.log(chalk.green('✓ Session created on server'));
      // Now that the connection is registered on the server, send session metadata
      this.sendPendingSessionMetadata();
    });

    this.wsClient.on('session:reconnected', () => {
      this.log(chalk.green('✓ Session reconnected on server'));
      // Re-send session metadata after reconnect
      this.sendPendingSessionMetadata();
    });

    this.wsClient.on('web:connected', (data: { publicKey: string; connectionId: string }) => {
      try {
        this.log(chalk.green(`✓ Web client connected: ${data.connectionId}`));
        this.log(chalk.gray(`   Public key: ${data.publicKey.substring(0, 20)}...`));
        this.connectedWebClients.add(data.connectionId);

        // Establish shared encryption key
        if (!this.encryption.isReady()) {
          this.encryption.establishSharedKey(data.publicKey);
          this.log(chalk.green('✓ Encryption established'));

          // Start the terminal now that we have a client
          this.startTerminal();
        } else if (this.encryption.isWebKeyChanged(data.publicKey)) {
          // Web client reconnected with a new keypair (page refresh)
          // Re-establish shared key with the new public key
          this.log(chalk.yellow('🔄 Web client has new keypair, re-establishing encryption...'));
          this.encryption.reestablishSharedKey(data.publicKey);
          this.log(chalk.green('✓ Encryption re-established'));

          // Send buffered output to reconnecting client
          this.sendBufferedOutput();
        } else {
          // Same web public key - send buffered output to late-joining client
          this.sendBufferedOutput();
        }

        this.emit('web:connected', data.connectionId);
      } catch (error) {
        this.logError('Error handling web connection:', error);
        // Don't crash - just log the error
      }
    });

    this.wsClient.on('web:disconnected', (data: { connectionId: string }) => {
      this.log(chalk.yellow(`⚠ Web client disconnected: ${data.connectionId}`));
      this.connectedWebClients.delete(data.connectionId);
      this.emit('web:disconnected', data.connectionId);

      if (this.connectedWebClients.size === 0) {
        this.log(chalk.yellow('⏳ No web clients connected. Waiting for reconnection...'));
      }
    });

    this.wsClient.on('encrypted', (envelope: EncryptedEnvelope) => {
      this.handleEncryptedMessage(envelope);
    });

    this.wsClient.on('error', (error: Error) => {
      this.logError('WebSocket error:', error.message);
      this.emit('error', error);
    });

    this.wsClient.on('close', () => {
      this.log(chalk.yellow('WebSocket connection closed'));
    });
  }

  /**
   * Handle encrypted messages from web clients
   */
  private handleEncryptedMessage(envelope: EncryptedEnvelope): void {
    if (!this.encryption.isReady()) {
      this.logError('Received encrypted message but encryption not ready - message discarded');
      return;
    }

    try {
      const message = this.encryption.decrypt(envelope);

      switch (message.type) {
        case MessageType.TERMINAL_INPUT:
          // Validate payload type before processing
          if (typeof message.payload !== 'string') {
            this.logError(`Invalid TERMINAL_INPUT payload type: ${typeof message.payload}`);
            return;
          }
          this.handleTerminalInput(message.payload);
          break;

        case MessageType.TERMINAL_RESIZE:
          // Validate payload type before processing
          const resizePayload = message.payload as { cols?: unknown; rows?: unknown };
          if (
            typeof resizePayload?.cols !== 'number' ||
            typeof resizePayload?.rows !== 'number' ||
            resizePayload.cols <= 0 ||
            resizePayload.rows <= 0
          ) {
            this.logError(`Invalid TERMINAL_RESIZE payload: ${JSON.stringify(resizePayload)}`);
            return;
          }
          this.handleTerminalResize({ cols: resizePayload.cols, rows: resizePayload.rows });
          break;

        case MessageType.STATE_REQUEST:
          this.sendBufferedOutput();
          break;

        default:
          this.logError(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      this.logError('Failed to decrypt message from web client', error);
    }
  }

  /**
   * Filter web client input for dangerous control signals
   * @returns FilterResult with filtered data and blocked signal info
   */
  private filterWebInput(data: string) {
    return this.inputFilter.filter(data);
  }

  /**
   * Handle terminal input from web client
   */
  private handleTerminalInput(data: string): void {
    if (this.terminal && this.terminal.isRunning()) {
      // Filter dangerous control signals from web input
      const result = this.filterWebInput(data);

      if (result.blocked) {
        this.log(
          chalk.yellow(`⚠ Blocked control signals from web: ${result.blockedSignals.join(', ')}`)
        );
      }

      // Only write filtered data to terminal
      if (result.data.length > 0) {
        this.terminal.write(result.data);
      }
    }
  }

  /**
   * Handle terminal resize from web client
   */
  private handleTerminalResize(size: { cols: number; rows: number }): void {
    if (this.terminal && this.terminal.isRunning()) {
      this.terminal.resize(size.cols, size.rows);
      // Also resize local terminal
      process.stdout.write(`\x1b[8;${size.rows};${size.cols}t`);
    }
  }

  /**
   * Start the PTY terminal
   */
  private startTerminal(): void {
    if (this.terminal) return;

    // Auto-add --dangerously-skip-permissions for claude/codex
    let args = this.options.args || [];
    if (this.options.command === 'claude' || this.options.command === 'codex') {
      if (!args.includes('--dangerously-skip-permissions')) {
        args = ['--dangerously-skip-permissions', ...args];
      }
    }

    const terminalOptions: TerminalOptions = {
      command: this.options.command,
      args,
      cwd: process.cwd(),
      cols: this.isDaemon ? 120 : (process.stdout.columns || 80),
      rows: this.isDaemon ? 40 : (process.stdout.rows || 24),
    };

    this.terminal = new Terminal(terminalOptions);

    this.terminal.on('data', (data: string) => {
      // In daemon mode, log terminal output for debugging
      if (this.isDaemon && this.options.logFile) {
        appendFileSync(this.options.logFile, `[${new Date().toISOString()}] TERMINAL DATA: ${JSON.stringify(data)}\n`);
      }

      // Write to local stdout (only in interactive mode)
      if (!this.isDaemon) {
        process.stdout.write(data);
      } else {
        this.logStream?.write(`[TERMINAL] ${data}`);
      }

      // Buffer for late joiners
      this.terminalBuffer += data;
      if (this.terminalBuffer.length > this.maxBufferSize) {
        this.terminalBuffer = this.terminalBuffer.slice(-this.maxBufferSize);
      }

      // Send to web clients
      this.sendTerminalOutput(data);
    });

    this.terminal.on('exit', (exitCode: number, signal?: number) => {
      this.log(chalk.blue(`\n✓ Process exited with code ${exitCode}, signal ${signal}`));
      this.emit('terminal:exit', exitCode);
      this.close();
    });

    this.terminal.on('error', (error: Error) => {
      this.logError('Terminal error:', error);
      this.emit('error', error);
    });

    // Handle local stdin (only in interactive mode)
    if (!this.isDaemon) {
      this.setupLocalInput();

      // Handle terminal resize
      process.stdout.on('resize', () => {
        const { columns, rows } = process.stdout;
        if (this.terminal && columns && rows) {
          this.terminal.resize(columns, rows);
        }
      });
    }

    // Start the terminal
    this.terminal.start();
    this.isReady = true;
    this.emit('ready');

    this.log(chalk.green('\n✓ Terminal started. You can now use it locally and remotely.\n'));

    // Note: Auto-accept trust dialog is not needed when using --dangerously-skip-permissions
    // The flag is automatically added for claude/codex commands
  }

  /**
   * Set up local stdin handling
   */
  private setupLocalInput(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    process.stdin.on('data', (data: Buffer) => {
      if (this.terminal && this.terminal.isRunning()) {
        this.terminal.write(data.toString());
      }
    });
  }

  /**
   * Send terminal output to web clients
   */
  private sendTerminalOutput(data: string): void {
    if (!this.wsClient || !this.encryption.isReady()) return;

    const logFile = this.options.logFile;

    try {
      if (this.isDaemon && logFile) {
        appendFileSync(logFile, `[${new Date().toISOString()}] sendTerminalOutput START: ${data.length} bytes\n`);
      }
      const envelope = this.encryption.encrypt(MessageType.TERMINAL_OUTPUT, data);
      if (this.isDaemon && logFile) {
        appendFileSync(logFile, `[${new Date().toISOString()}] Encrypted, sending...\n`);
      }
      this.wsClient.sendEncrypted(envelope);
      if (this.isDaemon && logFile) {
        appendFileSync(logFile, `[${new Date().toISOString()}] Sent terminal output: ${data.length} bytes\n`);
      }
    } catch (error) {
      this.logError('Failed to send terminal output', error);
    }
  }

  /**
   * Send buffered output to late-joining clients
   */
  private sendBufferedOutput(): void {
    if (this.terminalBuffer.length > 0) {
      this.sendTerminalOutput(this.terminalBuffer);
    }

    // Also send current terminal size
    if (this.terminal) {
      const { cols, rows } = this.terminal.getDimensions();
      try {
        const envelope = this.encryption.encrypt(MessageType.STATE_SYNC, {
          cols,
          rows,
          hasHistory: this.terminalBuffer.length > 0,
        });
        this.wsClient?.sendEncrypted(envelope);
      } catch (error) {
        this.logError('Failed to send state sync', error);
      }
    }
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.encryption.getSessionId();
  }

  /**
   * Get connected web client count
   */
  getConnectedClientCount(): number {
    return this.connectedWebClients.size;
  }

  /**
   * Check if session is ready
   */
  isSessionReady(): boolean {
    return this.isReady;
  }

  /**
   * Send pending session metadata to server
   * Called after session is created/reconnected on server
   */
  private sendPendingSessionMetadata(): void {
    if (!this.pendingSessionMetadata || !this.wsClient) return;

    const { instanceInfo, sessionWebUrl } = this.pendingSessionMetadata;

    this.wsClient.sendSessionUpdate({
      instanceId: instanceInfo.instanceId,
      instanceLabel: instanceInfo.label,
      hostname: instanceInfo.hostname,
      command: this.options.command,
      commandArgs: this.options.args || [],
      webUrl: sessionWebUrl,
    });

    this.log(chalk.gray('   Session metadata sent to server'));
  }

  /**
   * Close the session
   */
  close(): void {
    // Log stack trace to debug unexpected closes
    if (this.isDaemon) {
      const stack = new Error().stack;
      this.logStream?.write(`[${new Date().toISOString()}] CLOSE CALLED - Stack trace:\n${stack}\n`);
    }
    this.log(chalk.blue('\n🔌 Closing session...'));

    // Delete daemon session info
    if (this.isDaemon) {
      deleteDaemonSession(this.encryption.getSessionId());
    }

    // Restore stdin (only in interactive mode)
    if (!this.isDaemon && process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    if (!this.isDaemon) {
      process.stdin.pause();
    }

    // Kill terminal
    if (this.terminal) {
      this.terminal.kill();
      this.terminal = null;
    }

    // Close WebSocket
    if (this.wsClient) {
      this.wsClient.close();
      this.wsClient = null;
    }

    // Close log stream
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }

    this.emit('closed');
  }
}
