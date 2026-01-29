import { EventEmitter } from 'events';
import { MessageType, type EncryptedEnvelope } from '@always-coder/shared';
import { WebSocketClient } from '../websocket/client.js';
import { EncryptionManager } from '../crypto/encryption.js';
import { Terminal, type TerminalOptions } from '../pty/terminal.js';
import { displayQRCode } from '../qrcode/generator.js';
import { getWSEndpoint } from '../config/index.js';
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

  constructor(options: SessionManagerOptions) {
    super();
    this.options = options;
    this.encryption = new EncryptionManager();
  }

  /**
   * Start the session
   */
  async start(): Promise<void> {
    const wsEndpoint = this.options.serverUrl || getWSEndpoint();

    console.log(chalk.blue('🚀 Starting Always Coder session...'));
    console.log(chalk.gray(`   Server: ${wsEndpoint}`));

    // Connect to WebSocket server
    this.wsClient = new WebSocketClient(wsEndpoint);
    this.setupWebSocketHandlers();

    try {
      await this.wsClient.connect();

      // Create session on server
      this.wsClient.sendSessionCreate(
        this.encryption.getSessionId(),
        this.encryption.getPublicKey()
      );

      // Display QR code for web connection
      displayQRCode({
        sessionId: this.encryption.getSessionId(),
        publicKey: this.encryption.getPublicKey(),
        wsEndpoint,
      });

      console.log(chalk.yellow('⏳ Waiting for web client to connect...'));
    } catch (error) {
      console.error(chalk.red('Failed to connect to server:'), error);
      throw error;
    }
  }

  /**
   * Set up WebSocket event handlers
   */
  private setupWebSocketHandlers(): void {
    if (!this.wsClient) return;

    this.wsClient.on('session:created', () => {
      console.log(chalk.green('✓ Session created on server'));
    });

    this.wsClient.on('web:connected', (data: { publicKey: string; connectionId: string }) => {
      console.log(chalk.green(`✓ Web client connected: ${data.connectionId}`));
      this.connectedWebClients.add(data.connectionId);

      // Establish shared encryption key
      if (!this.encryption.isReady()) {
        this.encryption.establishSharedKey(data.publicKey);
        console.log(chalk.green('✓ Encryption established'));

        // Start the terminal now that we have a client
        this.startTerminal();
      } else {
        // Send buffered output to late-joining client
        this.sendBufferedOutput();
      }

      this.emit('web:connected', data.connectionId);
    });

    this.wsClient.on('web:disconnected', (data: { connectionId: string }) => {
      console.log(chalk.yellow(`⚠ Web client disconnected: ${data.connectionId}`));
      this.connectedWebClients.delete(data.connectionId);
      this.emit('web:disconnected', data.connectionId);

      if (this.connectedWebClients.size === 0) {
        console.log(chalk.yellow('⏳ No web clients connected. Waiting for reconnection...'));
      }
    });

    this.wsClient.on('encrypted', (envelope: EncryptedEnvelope) => {
      this.handleEncryptedMessage(envelope);
    });

    this.wsClient.on('error', (error: Error) => {
      console.error(chalk.red('WebSocket error:'), error.message);
      this.emit('error', error);
    });

    this.wsClient.on('close', () => {
      console.log(chalk.yellow('WebSocket connection closed'));
    });
  }

  /**
   * Handle encrypted messages from web clients
   */
  private handleEncryptedMessage(envelope: EncryptedEnvelope): void {
    if (!this.encryption.isReady()) {
      console.warn('Received encrypted message but encryption not ready');
      return;
    }

    try {
      const message = this.encryption.decrypt(envelope);

      switch (message.type) {
        case MessageType.TERMINAL_INPUT:
          this.handleTerminalInput(message.payload as string);
          break;

        case MessageType.TERMINAL_RESIZE:
          this.handleTerminalResize(message.payload as { cols: number; rows: number });
          break;

        case MessageType.STATE_REQUEST:
          this.sendBufferedOutput();
          break;

        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Failed to decrypt message:', error);
    }
  }

  /**
   * Handle terminal input from web client
   */
  private handleTerminalInput(data: string): void {
    if (this.terminal && this.terminal.isRunning()) {
      this.terminal.write(data);
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

    const terminalOptions: TerminalOptions = {
      command: this.options.command,
      args: this.options.args,
      cwd: process.cwd(),
      cols: process.stdout.columns || 80,
      rows: process.stdout.rows || 24,
    };

    this.terminal = new Terminal(terminalOptions);

    this.terminal.on('data', (data: string) => {
      // Write to local stdout
      process.stdout.write(data);

      // Buffer for late joiners
      this.terminalBuffer += data;
      if (this.terminalBuffer.length > this.maxBufferSize) {
        this.terminalBuffer = this.terminalBuffer.slice(-this.maxBufferSize);
      }

      // Send to web clients
      this.sendTerminalOutput(data);
    });

    this.terminal.on('exit', (exitCode: number) => {
      console.log(chalk.blue(`\n✓ Process exited with code ${exitCode}`));
      this.emit('terminal:exit', exitCode);
      this.close();
    });

    this.terminal.on('error', (error: Error) => {
      console.error(chalk.red('Terminal error:'), error);
      this.emit('error', error);
    });

    // Handle local stdin
    this.setupLocalInput();

    // Handle terminal resize
    process.stdout.on('resize', () => {
      const { columns, rows } = process.stdout;
      if (this.terminal && columns && rows) {
        this.terminal.resize(columns, rows);
      }
    });

    // Start the terminal
    this.terminal.start();
    this.isReady = true;
    this.emit('ready');

    console.log(chalk.green('\n✓ Terminal started. You can now use it locally and remotely.\n'));
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

    try {
      const envelope = this.encryption.encrypt(MessageType.TERMINAL_OUTPUT, data);
      this.wsClient.sendEncrypted(envelope);
    } catch (error) {
      console.error('Failed to send terminal output:', error);
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
        console.error('Failed to send state sync:', error);
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
   * Close the session
   */
  close(): void {
    console.log(chalk.blue('\n🔌 Closing session...'));

    // Restore stdin
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();

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

    this.emit('closed');
  }
}
