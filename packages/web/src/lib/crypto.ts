import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';
import type { EncryptedEnvelope, Message } from '@always-coder/shared';

/**
 * E2E Crypto for Web client
 */
export class WebCrypto {
  private keyPair: nacl.BoxKeyPair;
  private sharedKey: Uint8Array | null = null;

  constructor() {
    this.keyPair = nacl.box.keyPair();
  }

  getPublicKey(): string {
    return encodeBase64(this.keyPair.publicKey);
  }

  establishSharedKey(cliPublicKeyBase64: string): void {
    const cliPublicKey = decodeBase64(cliPublicKeyBase64);
    this.sharedKey = nacl.box.before(cliPublicKey, this.keyPair.secretKey);
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
