import {
  E2ECrypto,
  generateSessionId,
  type Message,
  type EncryptedEnvelope,
} from '@always-coder/shared';

/**
 * Encryption manager for CLI
 * Wraps E2ECrypto with session-specific functionality
 */
export class EncryptionManager {
  private crypto: E2ECrypto;
  private sessionId: string;
  private sequenceNumber: number = 0;
  private webPublicKey: string | null = null;

  constructor(sessionId?: string) {
    this.crypto = new E2ECrypto();
    this.sessionId = sessionId || generateSessionId();
  }

  /**
   * Get the session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get the public key for QR code
   */
  getPublicKey(): string {
    return this.crypto.getPublicKey();
  }

  /**
   * Check if encryption is ready (shared key established)
   */
  isReady(): boolean {
    return this.crypto.hasSharedKey();
  }

  /**
   * Establish shared key with web client
   */
  establishSharedKey(webPublicKey: string): void {
    this.crypto.establishSharedKey(webPublicKey);
    this.webPublicKey = webPublicKey;
  }

  /**
   * Check if the web public key has changed (web client refreshed and has new keypair)
   */
  isWebKeyChanged(newWebPublicKey: string): boolean {
    return this.webPublicKey !== null && this.webPublicKey !== newWebPublicKey;
  }

  /**
   * Re-establish shared key with new web public key (for reconnection with new keypair)
   */
  reestablishSharedKey(webPublicKey: string): void {
    this.crypto.establishSharedKey(webPublicKey);
    this.webPublicKey = webPublicKey;
  }

  /**
   * Encrypt a message for sending
   */
  encrypt<T>(type: string, payload: T): EncryptedEnvelope {
    const message: Message<T> = {
      type: type as Message['type'],
      payload,
      seq: ++this.sequenceNumber,
    };
    return this.crypto.encrypt(message, this.sessionId);
  }

  /**
   * Decrypt a received message
   */
  decrypt(envelope: EncryptedEnvelope): Message {
    return this.crypto.decrypt(envelope);
  }

  /**
   * Get the current sequence number
   */
  getSequenceNumber(): number {
    return this.sequenceNumber;
  }
}
