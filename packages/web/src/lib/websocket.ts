import { MessageType, isEncryptedEnvelope, PROTOCOL, type EncryptedEnvelope } from '@always-coder/shared';

export type WebSocketEventHandler = {
  onOpen?: () => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (error: Event) => void;
  onSessionJoined?: (data: { sessionId: string; cliPublicKey: string }) => void;
  onEncrypted?: (envelope: EncryptedEnvelope) => void;
  onCliDisconnected?: () => void;
  onPong?: () => void;
};

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private endpoint: string;
  private handlers: WebSocketEventHandler;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isClosing = false;

  constructor(endpoint: string, handlers: WebSocketEventHandler) {
    this.endpoint = endpoint;
    this.handlers = handlers;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.endpoint);

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.reconnectAttempts = 0;
          this.startPingInterval();
          this.handlers.onOpen?.();
          resolve();
        };

        this.ws.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason);
          this.stopPingInterval();
          this.handlers.onClose?.(event.code, event.reason);

          if (!this.isClosing && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
        };

        this.ws.onerror = (event) => {
          console.error('WebSocket error:', event);
          this.handlers.onError?.(event);
          reject(new Error('WebSocket error'));
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      if (message.type === MessageType.SESSION_JOINED) {
        this.handlers.onSessionJoined?.(message);
      } else if (message.type === 'cli:disconnected') {
        this.handlers.onCliDisconnected?.();
      } else if (message.type === MessageType.PONG) {
        this.handlers.onPong?.();
      } else if (isEncryptedEnvelope(message)) {
        this.handlers.onEncrypted?.(message);
      }
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  }

  send(data: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    this.ws.send(JSON.stringify(data));
  }

  sendSessionJoin(sessionId: string, publicKey: string): void {
    this.send({
      type: MessageType.SESSION_JOIN,
      sessionId,
      publicKey,
    });
  }

  sendEncrypted(envelope: EncryptedEnvelope): void {
    this.send(envelope);
  }

  private startPingInterval(): void {
    this.stopPingInterval();
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: MessageType.PING, timestamp: Date.now() });
      }
    }, PROTOCOL.HEARTBEAT_INTERVAL);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = Math.min(
      PROTOCOL.RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1),
      PROTOCOL.MAX_RECONNECT_DELAY
    );

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      if (!this.isClosing) {
        this.connect().catch(console.error);
      }
    }, delay);
  }

  close(): void {
    this.isClosing = true;
    this.stopPingInterval();
    if (this.ws) {
      this.ws.close(1000, 'Client closing');
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
