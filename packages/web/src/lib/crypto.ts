import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';
import type { EncryptedEnvelope, Message } from '@always-coder/shared';

// Storage keys - SECURITY NOTE: We only store the shared key (derived, session-specific)
// and CLI's public key (to detect key changes). We NEVER store our private key.
const STORAGE_KEY_SHARED = 'always-coder:sharedKey';
const STORAGE_KEY_CLI_PUBLIC = 'always-coder:cliPublicKey';

interface RestoredState {
  sharedKey: Uint8Array;
  cliPublicKey: string;
}

/**
 * E2E Crypto for Web client
 *
 * Security model:
 * - Private key (secretKey) is NEVER persisted - regenerated on each page load
 * - CLI's public key is stored to detect if CLI restarted (for logging purposes)
 * - Since we always generate a fresh keypair, we MUST always derive a new shared key
 * - The shared key depends on our private key, so restoring an old shared key is invalid
 */
export class WebCrypto {
  private keyPair: nacl.BoxKeyPair;
  private sharedKey: Uint8Array | null = null;
  private storedCliPublicKey: string | null = null;

  constructor(restoreFromStorage = true) {
    // Always generate a fresh keypair - never restore private keys from storage
    this.keyPair = nacl.box.keyPair();

    if (restoreFromStorage) {
      const restored = this.restoreFromStorage();
      if (restored) {
        // Only restore CLI public key (for logging/debugging)
        // Do NOT restore shared key - it was derived with our OLD private key
        // and is mathematically invalid for our NEW private key
        this.storedCliPublicKey = restored.cliPublicKey;
        console.log('Restored CLI public key from sessionStorage (will re-derive shared key)');
      }
    }
  }

  private restoreFromStorage(): RestoredState | null {
    if (typeof window === 'undefined') return null;

    try {
      const storedCliPublicKey = sessionStorage.getItem(STORAGE_KEY_CLI_PUBLIC);

      if (!storedCliPublicKey) {
        return null;
      }

      // Note: We no longer restore/use the shared key since we always generate
      // a new keypair and must derive a new shared key. The stored shared key
      // (if any) was derived with our old private key and is invalid.
      return { sharedKey: new Uint8Array(0), cliPublicKey: storedCliPublicKey };
    } catch (error) {
      console.error('Failed to restore crypto state:', error);
      WebCrypto.clearStorage();
      return null;
    }
  }

  private saveToStorage(cliPublicKey: string): void {
    if (typeof window === 'undefined' || !this.sharedKey) return;

    try {
      sessionStorage.setItem(STORAGE_KEY_SHARED, encodeBase64(this.sharedKey));
      sessionStorage.setItem(STORAGE_KEY_CLI_PUBLIC, cliPublicKey);
    } catch (error) {
      // Storage failure is not critical - reconnection just won't work after refresh
      console.warn('Failed to save crypto state to storage:', error);
    }
  }

  static clearStorage(): void {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(STORAGE_KEY_SHARED);
    sessionStorage.removeItem(STORAGE_KEY_CLI_PUBLIC);
  }

  getPublicKey(): string {
    return encodeBase64(this.keyPair.publicKey);
  }

  /**
   * Check if CLI's public key matches what we have stored.
   * If it doesn't match, we need to re-establish the shared key.
   */
  isCliKeyChanged(cliPublicKey: string): boolean {
    if (!this.storedCliPublicKey) return false;
    return this.storedCliPublicKey !== cliPublicKey;
  }

  /**
   * Get the stored CLI public key (if any) for comparison
   */
  getStoredCliPublicKey(): string | null {
    return this.storedCliPublicKey;
  }

  establishSharedKey(cliPublicKeyBase64: string): void {
    const cliPublicKey = decodeBase64(cliPublicKeyBase64);

    // Validate CLI public key length
    if (cliPublicKey.length !== nacl.box.publicKeyLength) {
      throw new Error('Invalid CLI public key length');
    }

    this.sharedKey = nacl.box.before(cliPublicKey, this.keyPair.secretKey);
    this.storedCliPublicKey = cliPublicKeyBase64;
    this.saveToStorage(cliPublicKeyBase64);
  }

  /**
   * Force re-establishment of shared key (e.g., when CLI restarted)
   */
  reestablishSharedKey(cliPublicKeyBase64: string): void {
    // Clear existing state
    this.sharedKey = null;
    this.storedCliPublicKey = null;
    WebCrypto.clearStorage();

    // Establish new shared key
    this.establishSharedKey(cliPublicKeyBase64);
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
