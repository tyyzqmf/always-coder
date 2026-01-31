import { describe, it, expect } from 'vitest';
import {
  createMessage,
  isEncryptedEnvelope,
  isSessionCreateRequest,
  isSessionReconnectRequest,
  isSessionJoinRequest,
  PROTOCOL,
  ErrorCodes,
} from './messages.js';
import { MessageType } from '../types/message.js';

describe('Protocol Constants', () => {
  it('should have correct protocol version', () => {
    expect(PROTOCOL.VERSION).toBe(1);
  });

  it('should have sensible heartbeat intervals', () => {
    expect(PROTOCOL.HEARTBEAT_INTERVAL).toBe(30000);
    expect(PROTOCOL.HEARTBEAT_TIMEOUT).toBe(90000);
    expect(PROTOCOL.HEARTBEAT_TIMEOUT).toBeGreaterThan(PROTOCOL.HEARTBEAT_INTERVAL);
  });

  it('should have session TTL of 24 hours', () => {
    expect(PROTOCOL.SESSION_TTL).toBe(24 * 60 * 60);
  });

  it('should have message cache TTL of 1 hour', () => {
    expect(PROTOCOL.MESSAGE_CACHE_TTL).toBe(60 * 60);
  });
});

describe('createMessage', () => {
  it('should create a message with correct structure', () => {
    const msg = createMessage(MessageType.TERMINAL_OUTPUT, { data: 'test' }, 1);

    expect(msg).toEqual({
      type: MessageType.TERMINAL_OUTPUT,
      payload: { data: 'test' },
      seq: 1,
    });
  });

  it('should preserve complex payload types', () => {
    const payload = {
      nested: { value: 123 },
      array: [1, 2, 3],
    };
    const msg = createMessage(MessageType.STATE_SYNC, payload, 42);

    expect(msg.payload).toEqual(payload);
    expect(msg.seq).toBe(42);
  });
});

describe('isEncryptedEnvelope', () => {
  it('should return true for valid encrypted envelope', () => {
    const envelope = {
      version: 1,
      sessionId: 'ABC123',
      nonce: 'base64nonce==',
      ciphertext: 'base64ciphertext==',
      timestamp: Date.now(),
    };

    expect(isEncryptedEnvelope(envelope)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isEncryptedEnvelope(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isEncryptedEnvelope(undefined)).toBe(false);
  });

  it('should return false for non-object types', () => {
    expect(isEncryptedEnvelope('string')).toBe(false);
    expect(isEncryptedEnvelope(123)).toBe(false);
    expect(isEncryptedEnvelope(true)).toBe(false);
  });

  it('should return false for wrong version', () => {
    const envelope = {
      version: 2, // Wrong version
      sessionId: 'ABC123',
      nonce: 'base64nonce==',
      ciphertext: 'base64ciphertext==',
      timestamp: Date.now(),
    };

    expect(isEncryptedEnvelope(envelope)).toBe(false);
  });

  it('should return false for missing fields', () => {
    expect(isEncryptedEnvelope({ version: 1 })).toBe(false);
    expect(isEncryptedEnvelope({ version: 1, sessionId: 'ABC' })).toBe(false);
    expect(isEncryptedEnvelope({ version: 1, sessionId: 'ABC', nonce: 'n' })).toBe(false);
  });

  it('should return false for wrong field types', () => {
    expect(
      isEncryptedEnvelope({
        version: 1,
        sessionId: 123, // Should be string
        nonce: 'n',
        ciphertext: 'c',
        timestamp: Date.now(),
      })
    ).toBe(false);

    expect(
      isEncryptedEnvelope({
        version: 1,
        sessionId: 'ABC',
        nonce: 'n',
        ciphertext: 'c',
        timestamp: 'not-a-number', // Should be number
      })
    ).toBe(false);
  });
});

describe('isSessionCreateRequest', () => {
  it('should return true for valid session create request', () => {
    const request = {
      type: MessageType.SESSION_CREATE,
      sessionId: 'ABC123',
      publicKey: 'base64publickey==',
    };

    expect(isSessionCreateRequest(request)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isSessionCreateRequest(null)).toBe(false);
  });

  it('should return false for wrong message type', () => {
    const request = {
      type: MessageType.SESSION_JOIN,
      sessionId: 'ABC123',
      publicKey: 'base64publickey==',
    };

    expect(isSessionCreateRequest(request)).toBe(false);
  });

  it('should return false for missing sessionId', () => {
    const request = {
      type: MessageType.SESSION_CREATE,
      publicKey: 'base64publickey==',
    };

    expect(isSessionCreateRequest(request)).toBe(false);
  });

  it('should return false for missing publicKey', () => {
    const request = {
      type: MessageType.SESSION_CREATE,
      sessionId: 'ABC123',
    };

    expect(isSessionCreateRequest(request)).toBe(false);
  });
});

describe('isSessionReconnectRequest', () => {
  it('should return true for valid session reconnect request', () => {
    const request = {
      type: MessageType.SESSION_RECONNECT,
      sessionId: 'ABC123',
      publicKey: 'base64publickey==',
    };

    expect(isSessionReconnectRequest(request)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isSessionReconnectRequest(null)).toBe(false);
  });

  it('should return false for wrong message type', () => {
    const request = {
      type: MessageType.SESSION_CREATE,
      sessionId: 'ABC123',
      publicKey: 'base64publickey==',
    };

    expect(isSessionReconnectRequest(request)).toBe(false);
  });

  it('should return false for missing required fields', () => {
    expect(
      isSessionReconnectRequest({
        type: MessageType.SESSION_RECONNECT,
      })
    ).toBe(false);

    expect(
      isSessionReconnectRequest({
        type: MessageType.SESSION_RECONNECT,
        sessionId: 'ABC123',
      })
    ).toBe(false);
  });
});

describe('isSessionJoinRequest', () => {
  it('should return true for valid session join request', () => {
    const request = {
      type: MessageType.SESSION_JOIN,
      sessionId: 'ABC123',
      publicKey: 'base64publickey==',
    };

    expect(isSessionJoinRequest(request)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isSessionJoinRequest(null)).toBe(false);
  });

  it('should return false for wrong message type', () => {
    const request = {
      type: MessageType.SESSION_CREATE,
      sessionId: 'ABC123',
      publicKey: 'base64publickey==',
    };

    expect(isSessionJoinRequest(request)).toBe(false);
  });

  it('should return false for missing required fields', () => {
    expect(
      isSessionJoinRequest({
        type: MessageType.SESSION_JOIN,
      })
    ).toBe(false);

    expect(
      isSessionJoinRequest({
        type: MessageType.SESSION_JOIN,
        sessionId: 'ABC123',
      })
    ).toBe(false);
  });

  it('should return false for wrong field types', () => {
    expect(
      isSessionJoinRequest({
        type: MessageType.SESSION_JOIN,
        sessionId: 123, // Should be string
        publicKey: 'key',
      })
    ).toBe(false);
  });
});

describe('ErrorCodes', () => {
  it('should have all expected error codes', () => {
    expect(ErrorCodes.SESSION_NOT_FOUND).toBe('SESSION_NOT_FOUND');
    expect(ErrorCodes.SESSION_EXPIRED).toBe('SESSION_EXPIRED');
    expect(ErrorCodes.SESSION_FULL).toBe('SESSION_FULL');
    expect(ErrorCodes.INVALID_PUBLIC_KEY).toBe('INVALID_PUBLIC_KEY');
    expect(ErrorCodes.ENCRYPTION_FAILED).toBe('ENCRYPTION_FAILED');
    expect(ErrorCodes.DECRYPTION_FAILED).toBe('DECRYPTION_FAILED');
    expect(ErrorCodes.INVALID_MESSAGE).toBe('INVALID_MESSAGE');
    expect(ErrorCodes.CONNECTION_FAILED).toBe('CONNECTION_FAILED');
    expect(ErrorCodes.UNAUTHORIZED).toBe('UNAUTHORIZED');
  });
});
