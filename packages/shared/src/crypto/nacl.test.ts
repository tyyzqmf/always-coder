import { describe, it, expect } from 'vitest';
import { E2ECrypto, generateSessionId, generateRandomId } from './nacl.js';
import { MessageType, type Message } from '../types/message.js';

describe('E2ECrypto', () => {
  describe('key generation', () => {
    it('should generate a valid key pair', () => {
      const crypto = new E2ECrypto();
      const publicKey = crypto.getPublicKey();

      expect(publicKey).toBeDefined();
      expect(publicKey.length).toBeGreaterThan(0);
      // Base64 encoded 32-byte key should be about 44 chars
      expect(publicKey.length).toBe(44);
    });

    it('should generate different keys each time', () => {
      const crypto1 = new E2ECrypto();
      const crypto2 = new E2ECrypto();

      expect(crypto1.getPublicKey()).not.toBe(crypto2.getPublicKey());
    });
  });

  describe('key exchange', () => {
    it('should establish shared key between two parties', () => {
      const alice = new E2ECrypto();
      const bob = new E2ECrypto();

      alice.establishSharedKey(bob.getPublicKey());
      bob.establishSharedKey(alice.getPublicKey());

      expect(alice.hasSharedKey()).toBe(true);
      expect(bob.hasSharedKey()).toBe(true);
    });

    it('should throw for invalid public key', () => {
      const crypto = new E2ECrypto();

      // 'invalid' is not valid base64, so it throws an encoding error
      expect(() => crypto.establishSharedKey('invalid')).toThrow();
    });
  });

  describe('encryption and decryption', () => {
    it('should encrypt and decrypt messages correctly', () => {
      const alice = new E2ECrypto();
      const bob = new E2ECrypto();

      alice.establishSharedKey(bob.getPublicKey());
      bob.establishSharedKey(alice.getPublicKey());

      const message: Message<string> = {
        type: MessageType.TERMINAL_OUTPUT,
        payload: 'Hello, World!',
        seq: 1,
      };

      const encrypted = alice.encrypt(message, 'session123');
      const decrypted = bob.decrypt(encrypted);

      expect(decrypted.type).toBe(MessageType.TERMINAL_OUTPUT);
      expect(decrypted.payload).toBe('Hello, World!');
      expect(decrypted.seq).toBe(1);
    });

    it('should encrypt and decrypt complex payloads', () => {
      const alice = new E2ECrypto();
      const bob = new E2ECrypto();

      alice.establishSharedKey(bob.getPublicKey());
      bob.establishSharedKey(alice.getPublicKey());

      const message: Message<{ cols: number; rows: number }> = {
        type: MessageType.TERMINAL_RESIZE,
        payload: { cols: 120, rows: 40 },
        seq: 42,
      };

      const encrypted = alice.encrypt(message, 'session456');
      const decrypted = bob.decrypt(encrypted) as Message<{ cols: number; rows: number }>;

      expect(decrypted.type).toBe(MessageType.TERMINAL_RESIZE);
      expect(decrypted.payload.cols).toBe(120);
      expect(decrypted.payload.rows).toBe(40);
    });

    it('should throw when encrypting without shared key', () => {
      const crypto = new E2ECrypto();
      const message: Message<string> = {
        type: MessageType.TERMINAL_OUTPUT,
        payload: 'test',
        seq: 1,
      };

      expect(() => crypto.encrypt(message)).toThrow('Shared key not established');
    });

    it('should produce different ciphertexts for same message (due to random nonce)', () => {
      const alice = new E2ECrypto();
      const bob = new E2ECrypto();

      alice.establishSharedKey(bob.getPublicKey());

      const message: Message<string> = {
        type: MessageType.TERMINAL_OUTPUT,
        payload: 'Same message',
        seq: 1,
      };

      const encrypted1 = alice.encrypt(message, 'session');
      const encrypted2 = alice.encrypt(message, 'session');

      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
      expect(encrypted1.nonce).not.toBe(encrypted2.nonce);
    });
  });

  describe('key persistence', () => {
    it('should restore crypto from secret key', () => {
      const original = new E2ECrypto();
      const secretKey = original.getSecretKey();

      const restored = new E2ECrypto(secretKey);

      expect(restored.getPublicKey()).toBe(original.getPublicKey());
    });
  });
});

describe('generateSessionId', () => {
  it('should generate 6 character IDs', () => {
    const id = generateSessionId();
    expect(id.length).toBe(6);
  });

  it('should only contain allowed characters', () => {
    const allowedChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let i = 0; i < 100; i++) {
      const id = generateSessionId();
      for (const char of id) {
        expect(allowedChars.includes(char)).toBe(true);
      }
    }
  });

  it('should generate unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateSessionId());
    }
    // Should be highly unlikely to have collisions with 1000 IDs
    expect(ids.size).toBeGreaterThan(990);
  });
});

describe('generateRandomId', () => {
  it('should generate IDs of specified length', () => {
    const id8 = generateRandomId(8);
    const id16 = generateRandomId(16);
    const id32 = generateRandomId(32);

    expect(id8.length).toBe(8);
    expect(id16.length).toBe(16);
    expect(id32.length).toBe(32);
  });
});
