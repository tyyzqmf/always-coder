import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';
import type { EncryptedEnvelope, Message } from '../types/message.js';

/**
 * End-to-end encryption using TweetNaCl (X25519 + XSalsa20-Poly1305)
 */
export class E2ECrypto {
  private keyPair: nacl.BoxKeyPair;
  private sharedKey: Uint8Array | null = null;

  constructor(existingSecretKey?: Uint8Array) {
    if (existingSecretKey) {
      this.keyPair = nacl.box.keyPair.fromSecretKey(existingSecretKey);
    } else {
      this.keyPair = nacl.box.keyPair();
    }
  }

  /**
   * Get the public key as base64 string (for QR code and key exchange)
   */
  getPublicKey(): string {
    return encodeBase64(this.keyPair.publicKey);
  }

  /**
   * Get the public key as Uint8Array
   */
  getPublicKeyBytes(): Uint8Array {
    return this.keyPair.publicKey;
  }

  /**
   * Get the secret key as Uint8Array (for persistence)
   */
  getSecretKey(): Uint8Array {
    return this.keyPair.secretKey;
  }

  /**
   * Establish shared secret using the other party's public key (X25519 ECDH)
   */
  establishSharedKey(theirPublicKeyBase64: string): void {
    const theirPublicKey = decodeBase64(theirPublicKeyBase64);
    if (theirPublicKey.length !== nacl.box.publicKeyLength) {
      throw new Error(`Invalid public key length: ${theirPublicKey.length}`);
    }
    // Compute shared secret using X25519 Diffie-Hellman
    this.sharedKey = nacl.box.before(theirPublicKey, this.keyPair.secretKey);
  }

  /**
   * Check if shared key has been established
   */
  hasSharedKey(): boolean {
    return this.sharedKey !== null;
  }

  /**
   * Encrypt a message using the shared key
   */
  encrypt(message: Message, sessionId: string = ''): EncryptedEnvelope {
    if (!this.sharedKey) {
      throw new Error('Shared key not established. Call establishSharedKey() first.');
    }

    // Generate random nonce (24 bytes for XSalsa20-Poly1305)
    const nonce = nacl.randomBytes(nacl.box.nonceLength);

    // Convert message to bytes
    const messageBytes = decodeUTF8(JSON.stringify(message));

    // Encrypt using XSalsa20-Poly1305 with precomputed shared key
    const ciphertext = nacl.box.after(messageBytes, nonce, this.sharedKey);

    return {
      version: 1,
      sessionId,
      nonce: encodeBase64(nonce),
      ciphertext: encodeBase64(ciphertext),
      timestamp: Date.now(),
    };
  }

  /**
   * Decrypt an encrypted envelope
   */
  decrypt(envelope: EncryptedEnvelope): Message {
    if (!this.sharedKey) {
      throw new Error('Shared key not established. Call establishSharedKey() first.');
    }

    const nonce = decodeBase64(envelope.nonce);
    const ciphertext = decodeBase64(envelope.ciphertext);

    // Decrypt using XSalsa20-Poly1305 with precomputed shared key
    const decrypted = nacl.box.open.after(ciphertext, nonce, this.sharedKey);

    if (!decrypted) {
      throw new Error('Decryption failed. Message may have been tampered with.');
    }

    return JSON.parse(encodeUTF8(decrypted)) as Message;
  }

  /**
   * Create a crypto instance from an existing secret key (for session restoration)
   */
  static fromSecretKey(secretKeyBase64: string): E2ECrypto {
    const secretKey = decodeBase64(secretKeyBase64);
    return new E2ECrypto(secretKey);
  }
}

/**
 * Generate a short session ID (6 characters, alphanumeric)
 */
export function generateSessionId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars (0, O, 1, I)
  const bytes = nacl.randomBytes(6);
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

/**
 * Generate a random ID of specified length
 */
export function generateRandomId(length: number = 16): string {
  const bytes = nacl.randomBytes(length);
  return encodeBase64(bytes).slice(0, length);
}
