import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import nacl from 'tweetnacl';
import { encodeBase64 } from 'tweetnacl-util';
import { MessageType, type Message } from '@always-coder/shared';
import { WebCrypto } from './crypto.js';

// Mock sessionStorage
const mockSessionStorage: Record<string, string> = {};
const sessionStorageMock = {
  getItem: vi.fn((key: string) => mockSessionStorage[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    mockSessionStorage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockSessionStorage[key];
  }),
  clear: vi.fn(() => {
    Object.keys(mockSessionStorage).forEach((key) => delete mockSessionStorage[key]);
  }),
};

// Setup global window and sessionStorage
const originalWindow = global.window;
beforeEach(() => {
  // @ts-expect-error - mocking window
  global.window = { sessionStorage: sessionStorageMock };
  // @ts-expect-error - mocking sessionStorage
  global.sessionStorage = sessionStorageMock;
  Object.keys(mockSessionStorage).forEach((key) => delete mockSessionStorage[key]);
  vi.clearAllMocks();
});

afterEach(() => {
  global.window = originalWindow;
});

describe('WebCrypto', () => {
  describe('constructor', () => {
    it('should generate a fresh keypair', () => {
      const crypto = new WebCrypto(false);
      const publicKey = crypto.getPublicKey();

      expect(publicKey).toBeDefined();
      expect(typeof publicKey).toBe('string');
      // Base64 encoded 32-byte key
      expect(publicKey.length).toBeGreaterThan(40);
    });

    it('should generate unique keypairs for each instance', () => {
      const crypto1 = new WebCrypto(false);
      const crypto2 = new WebCrypto(false);

      expect(crypto1.getPublicKey()).not.toBe(crypto2.getPublicKey());
    });

    it('should restore CLI public key from storage if available', () => {
      const cliPublicKey = 'stored-cli-public-key';
      mockSessionStorage['always-coder:cliPublicKey'] = cliPublicKey;

      const crypto = new WebCrypto(true);

      expect(crypto.getStoredCliPublicKey()).toBe(cliPublicKey);
    });

    it('should not restore shared key (security requirement)', () => {
      // Even if shared key is in storage, it should not be used
      mockSessionStorage['always-coder:sharedKey'] = encodeBase64(new Uint8Array(32));
      mockSessionStorage['always-coder:cliPublicKey'] = 'cli-key';

      const crypto = new WebCrypto(true);

      // Should not have a shared key - must derive new one
      expect(crypto.hasSharedKey()).toBe(false);
    });
  });

  describe('getPublicKey', () => {
    it('should return base64 encoded public key', () => {
      const crypto = new WebCrypto(false);
      const publicKey = crypto.getPublicKey();

      // Should be valid base64
      expect(() => atob(publicKey)).not.toThrow();
    });
  });

  describe('isCliKeyChanged', () => {
    it('should return false when no stored key', () => {
      const crypto = new WebCrypto(false);

      expect(crypto.isCliKeyChanged('any-key')).toBe(false);
    });

    it('should return false when CLI key matches stored', () => {
      mockSessionStorage['always-coder:cliPublicKey'] = 'cli-key-123';

      const crypto = new WebCrypto(true);

      expect(crypto.isCliKeyChanged('cli-key-123')).toBe(false);
    });

    it('should return true when CLI key differs from stored', () => {
      mockSessionStorage['always-coder:cliPublicKey'] = 'old-cli-key';

      const crypto = new WebCrypto(true);

      expect(crypto.isCliKeyChanged('new-cli-key')).toBe(true);
    });
  });

  describe('getStoredCliPublicKey', () => {
    it('should return null when no stored key', () => {
      const crypto = new WebCrypto(false);

      expect(crypto.getStoredCliPublicKey()).toBeNull();
    });

    it('should return stored CLI public key', () => {
      mockSessionStorage['always-coder:cliPublicKey'] = 'stored-key';

      const crypto = new WebCrypto(true);

      expect(crypto.getStoredCliPublicKey()).toBe('stored-key');
    });
  });

  describe('establishSharedKey', () => {
    it('should establish shared key from CLI public key', () => {
      const crypto = new WebCrypto(false);
      const cliKeyPair = nacl.box.keyPair();
      const cliPublicKeyBase64 = encodeBase64(cliKeyPair.publicKey);

      expect(crypto.hasSharedKey()).toBe(false);

      crypto.establishSharedKey(cliPublicKeyBase64);

      expect(crypto.hasSharedKey()).toBe(true);
    });

    it('should throw error for invalid public key length', () => {
      const crypto = new WebCrypto(false);
      const invalidKey = encodeBase64(new Uint8Array(16)); // Wrong length

      expect(() => crypto.establishSharedKey(invalidKey)).toThrow('Invalid CLI public key length');
    });

    it('should save CLI public key to storage', () => {
      const crypto = new WebCrypto(false);
      const cliKeyPair = nacl.box.keyPair();
      const cliPublicKeyBase64 = encodeBase64(cliKeyPair.publicKey);

      crypto.establishSharedKey(cliPublicKeyBase64);

      expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
        'always-coder:cliPublicKey',
        cliPublicKeyBase64
      );
    });
  });

  describe('reestablishSharedKey', () => {
    it('should clear existing state and establish new key', () => {
      const crypto = new WebCrypto(false);

      // First establish
      const cliKeyPair1 = nacl.box.keyPair();
      crypto.establishSharedKey(encodeBase64(cliKeyPair1.publicKey));
      expect(crypto.hasSharedKey()).toBe(true);

      // Re-establish with new key
      const cliKeyPair2 = nacl.box.keyPair();
      crypto.reestablishSharedKey(encodeBase64(cliKeyPair2.publicKey));

      expect(crypto.hasSharedKey()).toBe(true);
      expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('always-coder:sharedKey');
      expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('always-coder:cliPublicKey');
    });
  });

  describe('hasSharedKey', () => {
    it('should return false when no shared key', () => {
      const crypto = new WebCrypto(false);

      expect(crypto.hasSharedKey()).toBe(false);
    });

    it('should return true after establishing shared key', () => {
      const crypto = new WebCrypto(false);
      const cliKeyPair = nacl.box.keyPair();

      crypto.establishSharedKey(encodeBase64(cliKeyPair.publicKey));

      expect(crypto.hasSharedKey()).toBe(true);
    });
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt messages correctly', () => {
      // Create Web crypto instance
      const webCrypto = new WebCrypto(false);
      const webPublicKey = webCrypto.getPublicKey();

      // Create CLI keypair
      const cliKeyPair = nacl.box.keyPair();
      const cliPublicKeyBase64 = encodeBase64(cliKeyPair.publicKey);

      // Establish shared key
      webCrypto.establishSharedKey(cliPublicKeyBase64);

      // Create message
      const message: Message<{ data: string }> = {
        type: MessageType.TERMINAL_INPUT,
        payload: { data: 'test input' },
        seq: 1,
      };

      // Encrypt
      const encrypted = webCrypto.encrypt(message, 'session-123');

      expect(encrypted.version).toBe(1);
      expect(encrypted.sessionId).toBe('session-123');
      expect(encrypted.nonce).toBeDefined();
      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.timestamp).toBeDefined();

      // Decrypt (simulate CLI side using same shared key derivation)
      const cliSharedKey = nacl.box.before(
        Uint8Array.from(atob(webPublicKey), (c) => c.charCodeAt(0)),
        cliKeyPair.secretKey
      );

      const nonce = Uint8Array.from(atob(encrypted.nonce), (c) => c.charCodeAt(0));
      const ciphertext = Uint8Array.from(atob(encrypted.ciphertext), (c) => c.charCodeAt(0));
      const decrypted = nacl.box.open.after(ciphertext, nonce, cliSharedKey);

      expect(decrypted).not.toBeNull();
      const decryptedMessage = JSON.parse(new TextDecoder().decode(decrypted!));
      expect(decryptedMessage.type).toBe(MessageType.TERMINAL_INPUT);
      expect(decryptedMessage.payload.data).toBe('test input');
    });

    it('should throw error when encrypting without shared key', () => {
      const crypto = new WebCrypto(false);
      const message: Message<{ data: string }> = {
        type: MessageType.TERMINAL_INPUT,
        payload: { data: 'test' },
        seq: 1,
      };

      expect(() => crypto.encrypt(message, 'session-123')).toThrow('Shared key not established');
    });

    it('should throw error when decrypting without shared key', () => {
      const crypto = new WebCrypto(false);
      const envelope = {
        version: 1 as const,
        sessionId: 'session-123',
        nonce: encodeBase64(new Uint8Array(24)),
        ciphertext: encodeBase64(new Uint8Array(32)),
        timestamp: Date.now(),
      };

      expect(() => crypto.decrypt(envelope)).toThrow('Shared key not established');
    });

    it('should use unique nonce for each encryption', () => {
      const crypto = new WebCrypto(false);
      const cliKeyPair = nacl.box.keyPair();
      crypto.establishSharedKey(encodeBase64(cliKeyPair.publicKey));

      const message: Message<{ data: string }> = {
        type: MessageType.TERMINAL_INPUT,
        payload: { data: 'test' },
        seq: 1,
      };

      const encrypted1 = crypto.encrypt(message, 'session-123');
      const encrypted2 = crypto.encrypt(message, 'session-123');

      expect(encrypted1.nonce).not.toBe(encrypted2.nonce);
    });
  });

  describe('clearStorage', () => {
    it('should remove all crypto-related items from storage', () => {
      mockSessionStorage['always-coder:sharedKey'] = 'key';
      mockSessionStorage['always-coder:cliPublicKey'] = 'pubkey';

      WebCrypto.clearStorage();

      expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('always-coder:sharedKey');
      expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('always-coder:cliPublicKey');
    });
  });

  describe('bidirectional encryption', () => {
    it('should allow Web and CLI to communicate', () => {
      // Setup Web side
      const webCrypto = new WebCrypto(false);

      // Setup CLI side (simulated)
      const cliKeyPair = nacl.box.keyPair();
      const cliPublicKeyBase64 = encodeBase64(cliKeyPair.publicKey);

      // Key exchange
      webCrypto.establishSharedKey(cliPublicKeyBase64);
      const webPublicKeyBytes = Uint8Array.from(atob(webCrypto.getPublicKey()), (c) =>
        c.charCodeAt(0)
      );
      const cliSharedKey = nacl.box.before(webPublicKeyBytes, cliKeyPair.secretKey);

      // Web -> CLI
      const webMessage: Message<{ data: string }> = {
        type: MessageType.TERMINAL_INPUT,
        payload: { data: 'hello from web' },
        seq: 1,
      };

      const encrypted = webCrypto.encrypt(webMessage, 'session-123');
      const nonce = Uint8Array.from(atob(encrypted.nonce), (c) => c.charCodeAt(0));
      const ciphertext = Uint8Array.from(atob(encrypted.ciphertext), (c) => c.charCodeAt(0));
      const decrypted = nacl.box.open.after(ciphertext, nonce, cliSharedKey);

      expect(decrypted).not.toBeNull();
      const parsed = JSON.parse(new TextDecoder().decode(decrypted!));
      expect(parsed.payload.data).toBe('hello from web');

      // CLI -> Web
      const cliMessage = {
        type: MessageType.TERMINAL_OUTPUT,
        payload: { data: 'hello from cli' },
        seq: 2,
      };
      const cliNonce = nacl.randomBytes(24);
      const cliCiphertext = nacl.box.after(
        new TextEncoder().encode(JSON.stringify(cliMessage)),
        cliNonce,
        cliSharedKey
      );

      const cliEnvelope = {
        version: 1 as const,
        sessionId: 'session-123',
        nonce: encodeBase64(cliNonce),
        ciphertext: encodeBase64(cliCiphertext),
        timestamp: Date.now(),
      };

      const webDecrypted = webCrypto.decrypt(cliEnvelope);
      expect(webDecrypted.type).toBe(MessageType.TERMINAL_OUTPUT);
      expect((webDecrypted.payload as { data: string }).data).toBe('hello from cli');
    });
  });
});
