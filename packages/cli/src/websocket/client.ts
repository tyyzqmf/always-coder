import { EventEmitter } from 'events';
import WebSocket, { type RawData } from 'ws';
import {
  MessageType,
  isEncryptedEnvelope,
  PROTOCOL,
  type EncryptedEnvelope,
} from '@always-coder/shared';

/**
 * WebSocket client events
 */
export interface WebSocketClientEvents {
  open: (data: { isReconnect: boolean }) => void;
  close: (code: number, reason: string) => void;
  error: (error: Error) => void;
  message: (data: unknown) => void;
  'session:created': (data: { sessionId: string; wsEndpoint: string }) => void;
  'session:reconnected': (data: { sessionId: string; wsEndpoint: string }) => void;
  'web:connected': (data: { publicKey: string; connectionId: string }) => void;
  'web:disconnected': (data: { connectionId: string }) => void;
  encrypted: (envelope: EncryptedEnvelope) => void;
  pong: () => void;
}

/**
 * WebSocket client options
 */
export interface WebSocketClientOptions {
  endpoint: string;
  authToken?: string;
}

/**
 * WebSocket client for CLI
 */
export class WebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private endpoint: string;
  private authToken?: string;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private pingInterval: NodeJS.Timeout | null = null;
  private isClosing: boolean = false;
  private hasConnectedBefore: boolean = false;

  constructor(options: WebSocketClientOptions | string) {
    super();
    if (typeof options === 'string') {
      // Backward compatibility: accept endpoint string
      this.endpoint = options;
    } else {
      this.endpoint = options.endpoint;
      this.authToken = options.authToken;
    }
  }

  /**
   * Get the connection URL with auth token if available
   */
  private getConnectionUrl(): string {
    if (!this.authToken) {
      return this.endpoint;
    }
    const separator = this.endpoint.includes('?') ? '&' : '?';
    return `${this.endpoint}${separator}token=${encodeURIComponent(this.authToken)}`;
  }

  /**
   * Connect to the WebSocket server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const url = this.getConnectionUrl();
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          const isReconnect = this.hasConnectedBefore;
          console.log(isReconnect ? 'WebSocket reconnected' : 'WebSocket connected');
          this.reconnectAttempts = 0;
          this.hasConnectedBefore = true;
          this.startPingInterval();
          this.emit('open', { isReconnect });
          resolve();
        };

        this.ws.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason);
          this.stopPingInterval();
          this.emit('close', event.code, event.reason);

          if (!this.isClosing && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
        };

        this.ws.onerror = (event) => {
          const error = new Error('WebSocket error');
          console.error('WebSocket error:', event);
          this.emit('error', error);
          reject(error);
        };

        this.ws.on('message', (data: RawData) => {
          this.handleMessage(data);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(data: RawData): void {
    try {
      const message = JSON.parse(data.toString());
      this.emit('message', message);

      // Route based on message type
      if (message.type === MessageType.SESSION_CREATED) {
        this.emit('session:created', message);
      } else if (message.type === MessageType.SESSION_RECONNECTED) {
        this.emit('session:reconnected', message);
      } else if (message.type === 'web:connected') {
        this.emit('web:connected', message);
      } else if (message.type === 'web:disconnected') {
        this.emit('web:disconnected', message);
      } else if (message.type === MessageType.PONG) {
        this.emit('pong');
      } else if (isEncryptedEnvelope(message)) {
        this.emit('encrypted', message);
      }
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  }

  /**
   * Send a message
   */
  send(data: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    this.ws.send(JSON.stringify(data));
  }

  /**
   * Send session create request
   */
  sendSessionCreate(sessionId: string, publicKey: string): void {
    this.send({
      type: MessageType.SESSION_CREATE,
      sessionId,
      publicKey,
    });
  }

  /**
   * Send session reconnect request
   */
  sendSessionReconnect(sessionId: string, publicKey: string): void {
    this.send({
      type: MessageType.SESSION_RECONNECT,
      sessionId,
      publicKey,
    });
  }

  /**
   * Send an encrypted envelope
   */
  sendEncrypted(envelope: EncryptedEnvelope): void {
    this.send(envelope);
  }

  /**
   * Send session update (CLI updating session metadata)
   */
  sendSessionUpdate(update: {
    instanceId?: string;
    instanceLabel?: string;
    hostname?: string;
    command?: string;
    commandArgs?: string[];
    webUrl?: string;
  }): void {
    this.send({
      type: MessageType.SESSION_UPDATE,
      ...update,
    });
  }

  /**
   * Send ping
   */
  private sendPing(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: MessageType.PING, timestamp: Date.now() });
    }
  }

  /**
   * Start ping interval
   */
  private startPingInterval(): void {
    this.stopPingInterval();
    this.pingInterval = setInterval(() => {
      this.sendPing();
    }, PROTOCOL.HEARTBEAT_INTERVAL);
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Schedule reconnection
   */
  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = Math.min(
      PROTOCOL.RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1),
      PROTOCOL.MAX_RECONNECT_DELAY
    );

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      if (!this.isClosing) {
        this.connect().catch((error) => {
          console.error('Reconnection failed:', error);
        });
      }
    }, delay);
  }

  /**
   * Close the connection
   */
  close(): void {
    this.isClosing = true;
    this.stopPingInterval();
    if (this.ws) {
      this.ws.close(1000, 'Client closing');
      this.ws = null;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
