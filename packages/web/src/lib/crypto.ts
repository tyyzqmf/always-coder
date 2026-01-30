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
 * - Only the derived shared key is stored (session-specific, useless without knowing the session)
 * - CLI's public key is stored to detect if CLI restarted (requires re-establishing shared key)
 * - On page refresh: if CLI's public key matches, we can reuse the shared key
 * - If CLI restarted with new keys, we must re-derive the shared key
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
        this.sharedKey = restored.sharedKey;
        this.storedCliPublicKey = restored.cliPublicKey;
        console.log('Restored shared key from sessionStorage');
      }
    }
  }

  private restoreFromStorage(): RestoredState | null {
    if (typeof window === 'undefined') return null;

    try {
      const storedSharedKey = sessionStorage.getItem(STORAGE_KEY_SHARED);
      const storedCliPublicKey = sessionStorage.getItem(STORAGE_KEY_CLI_PUBLIC);

      if (!storedSharedKey || !storedCliPublicKey) {
        return null;
      }

      const sharedKey = decodeBase64(storedSharedKey);

      // Validate shared key length
      if (sharedKey.length !== nacl.box.sharedKeyLength) {
        console.warn('Invalid shared key length in storage, clearing');
        WebCrypto.clearStorage();
        return null;
      }

      return { sharedKey, cliPublicKey: storedCliPublicKey };
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
