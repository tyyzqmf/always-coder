import { MessageType, type Message, type EncryptedEnvelope } from '../types/message.js';

/**
 * Protocol constants
 */
export const PROTOCOL = {
  VERSION: 1,
  MAX_MESSAGE_SIZE: 64 * 1024, // 64KB max message size
  HEARTBEAT_INTERVAL: 30000, // 30 seconds
  HEARTBEAT_TIMEOUT: 90000, // 90 seconds
  SESSION_TTL: 24 * 60 * 60, // 24 hours in seconds
  MESSAGE_CACHE_TTL: 60 * 60, // 1 hour in seconds
  MAX_CACHED_MESSAGES: 1000, // Max messages to cache per session
  RECONNECT_DELAY: 1000, // Initial reconnect delay in ms
  MAX_RECONNECT_DELAY: 30000, // Max reconnect delay in ms
} as const;

/**
 * Helper to create a message
 */
export function createMessage<T>(type: MessageType, payload: T, seq: number): Message<T> {
  return {
    type,
    payload,
    seq,
  };
}

/**
 * Type guard for encrypted envelope
 */
export function isEncryptedEnvelope(data: unknown): data is EncryptedEnvelope {
  if (typeof data !== 'object' || data === null) return false;
  const envelope = data as Record<string, unknown>;
  return (
    envelope.version === 1 &&
    typeof envelope.sessionId === 'string' &&
    typeof envelope.nonce === 'string' &&
    typeof envelope.ciphertext === 'string' &&
    typeof envelope.timestamp === 'number'
  );
}

/**
 * Type guard for session create request
 */
export function isSessionCreateRequest(
  data: unknown
): data is { type: MessageType.SESSION_CREATE; sessionId: string; publicKey: string } {
  if (typeof data !== 'object' || data === null) return false;
  const msg = data as Record<string, unknown>;
  return (
    msg.type === MessageType.SESSION_CREATE &&
    typeof msg.sessionId === 'string' &&
    typeof msg.publicKey === 'string'
  );
}

/**
 * Type guard for session reconnect request
 */
export function isSessionReconnectRequest(
  data: unknown
): data is { type: MessageType.SESSION_RECONNECT; sessionId: string; publicKey: string } {
  if (typeof data !== 'object' || data === null) return false;
  const msg = data as Record<string, unknown>;
  return (
    msg.type === MessageType.SESSION_RECONNECT &&
    typeof msg.sessionId === 'string' &&
    typeof msg.publicKey === 'string'
  );
}

/**
 * Type guard for session join request
 */
export function isSessionJoinRequest(
  data: unknown
): data is { type: MessageType.SESSION_JOIN; sessionId: string; publicKey: string } {
  if (typeof data !== 'object' || data === null) return false;
  const msg = data as Record<string, unknown>;
  return (
    msg.type === MessageType.SESSION_JOIN &&
    typeof msg.sessionId === 'string' &&
    typeof msg.publicKey === 'string'
  );
}

/**
 * Type guard for session list request
 */
export function isSessionListRequest(
  data: unknown
): data is { type: MessageType.SESSION_LIST_REQUEST; includeInactive?: boolean } {
  if (typeof data !== 'object' || data === null) return false;
  const msg = data as Record<string, unknown>;
  return msg.type === MessageType.SESSION_LIST_REQUEST;
}

/**
 * Type guard for session info request
 */
export function isSessionInfoRequest(
  data: unknown
): data is { type: MessageType.SESSION_INFO_REQUEST; sessionId: string } {
  if (typeof data !== 'object' || data === null) return false;
  const msg = data as Record<string, unknown>;
  return msg.type === MessageType.SESSION_INFO_REQUEST && typeof msg.sessionId === 'string';
}

/**
 * Type guard for session update request
 */
export function isSessionUpdateRequest(
  data: unknown
): data is {
  type: MessageType.SESSION_UPDATE;
  instanceId?: string;
  instanceLabel?: string;
  hostname?: string;
  command?: string;
  commandArgs?: string[];
  webUrl?: string;
} {
  if (typeof data !== 'object' || data === null) return false;
  const msg = data as Record<string, unknown>;
  return msg.type === MessageType.SESSION_UPDATE;
}

/**
 * Type guard for session delete request
 */
export function isSessionDeleteRequest(
  data: unknown
): data is { type: MessageType.SESSION_DELETE_REQUEST; sessionId: string } {
  if (typeof data !== 'object' || data === null) return false;
  const msg = data as Record<string, unknown>;
  return msg.type === MessageType.SESSION_DELETE_REQUEST && typeof msg.sessionId === 'string';
}

/**
 * Error codes
 */
export const ErrorCodes = {
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  SESSION_FULL: 'SESSION_FULL',
  INVALID_PUBLIC_KEY: 'INVALID_PUBLIC_KEY',
  ENCRYPTION_FAILED: 'ENCRYPTION_FAILED',
  DECRYPTION_FAILED: 'DECRYPTION_FAILED',
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
