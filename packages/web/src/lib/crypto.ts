import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';
import type { EncryptedEnvelope, Message } from '@always-coder/shared';

const STORAGE_KEY_KEYPAIR = 'always-coder:keypair';
const STORAGE_KEY_SHARED = 'always-coder:sharedKey';

interface StoredKeyPair {
  publicKey: string;
  secretKey: string;
}

/**
 * E2E Crypto for Web client with sessionStorage persistence
 */
export class WebCrypto {
  private keyPair: nacl.BoxKeyPair;
  private sharedKey: Uint8Array | null = null;

  constructor(restoreFromStorage = true) {
    if (restoreFromStorage) {
      const restored = this.restoreFromStorage();
      if (restored) {
        this.keyPair = restored.keyPair;
        this.sharedKey = restored.sharedKey;
        return;
      }
    }
    this.keyPair = nacl.box.keyPair();
    this.saveKeyPairToStorage();
  }

  private restoreFromStorage(): { keyPair: nacl.BoxKeyPair; sharedKey: Uint8Array | null } | null {
    if (typeof window === 'undefined') return null;

    try {
      const storedKeyPair = sessionStorage.getItem(STORAGE_KEY_KEYPAIR);
      if (!storedKeyPair) return null;

      const parsed: StoredKeyPair = JSON.parse(storedKeyPair);
      const keyPair: nacl.BoxKeyPair = {
        publicKey: decodeBase64(parsed.publicKey),
        secretKey: decodeBase64(parsed.secretKey),
      };

      // Also restore shared key if available
      let sharedKey: Uint8Array | null = null;
      const storedSharedKey = sessionStorage.getItem(STORAGE_KEY_SHARED);
      if (storedSharedKey) {
        sharedKey = decodeBase64(storedSharedKey);
      }

      console.log('Restored crypto keys from sessionStorage');
      return { keyPair, sharedKey };
    } catch (error) {
      console.error('Failed to restore crypto keys:', error);
      return null;
    }
  }

  private saveKeyPairToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const stored: StoredKeyPair = {
        publicKey: encodeBase64(this.keyPair.publicKey),
        secretKey: encodeBase64(this.keyPair.secretKey),
      };
      sessionStorage.setItem(STORAGE_KEY_KEYPAIR, JSON.stringify(stored));
    } catch (error) {
      console.error('Failed to save keypair to storage:', error);
    }
  }

  private saveSharedKeyToStorage(): void {
    if (typeof window === 'undefined' || !this.sharedKey) return;

    try {
      sessionStorage.setItem(STORAGE_KEY_SHARED, encodeBase64(this.sharedKey));
    } catch (error) {
      console.error('Failed to save shared key to storage:', error);
    }
  }

  static clearStorage(): void {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(STORAGE_KEY_KEYPAIR);
    sessionStorage.removeItem(STORAGE_KEY_SHARED);
  }

  getPublicKey(): string {
    return encodeBase64(this.keyPair.publicKey);
  }

  establishSharedKey(cliPublicKeyBase64: string): void {
    const cliPublicKey = decodeBase64(cliPublicKeyBase64);
    this.sharedKey = nacl.box.before(cliPublicKey, this.keyPair.secretKey);
    this.saveSharedKeyToStorage();
  }

  hasSharedKey(): boolean {
    return this.sharedKey !== null;
  }

  encrypt<T>(message: Message<T>, sessionId: string): EncryptedEnvelope {
    if (!this.sharedKey) {
      throw new Error('Shared key not established');
    }

    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const messageBytes = decodeUTF8(JSON.stringify(message));
    const ciphertext = nacl.box.after(messageBytes, nonce, this.sharedKey);

    return {
      version: 1,
      sessionId,
      nonce: encodeBase64(nonce),
      ciphertext: encodeBase64(ciphertext),
      timestamp: Date.now(),
    };
  }

  decrypt(envelope: EncryptedEnvelope): Message {
    if (!this.sharedKey) {
      throw new Error('Shared key not established');
    }

    const nonce = decodeBase64(envelope.nonce);
    const ciphertext = decodeBase64(envelope.ciphertext);
    const decrypted = nacl.box.open.after(ciphertext, nonce, this.sharedKey);

    if (!decrypted) {
      throw new Error('Decryption failed');
    }

    return JSON.parse(encodeUTF8(decrypted)) as Message;
  }
}
