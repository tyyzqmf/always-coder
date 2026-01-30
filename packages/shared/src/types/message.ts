/**
 * Message types for communication between CLI, Server, and Web
 */
export enum MessageType {
  // Session management
  SESSION_CREATE = 'session:create',
  SESSION_RECONNECT = 'session:reconnect',
  SESSION_JOIN = 'session:join',
  SESSION_LEAVE = 'session:leave',
  SESSION_CREATED = 'session:created',
  SESSION_RECONNECTED = 'session:reconnected',
  SESSION_JOINED = 'session:joined',
  SESSION_ERROR = 'session:error',

  // Connection events
  WEB_CONNECTED = 'web:connected',
  WEB_DISCONNECTED = 'web:disconnected',
  CLI_DISCONNECTED = 'cli:disconnected',

  // Terminal data
  TERMINAL_OUTPUT = 'terminal:output',
  TERMINAL_INPUT = 'terminal:input',
  TERMINAL_RESIZE = 'terminal:resize',

  // State synchronization
  STATE_SYNC = 'state:sync',
  STATE_REQUEST = 'state:request',

  // Heartbeat
  PING = 'ping',
  PONG = 'pong',

  // Error
  ERROR = 'error',
}

/**
 * Encrypted message envelope sent over WebSocket
 */
export interface EncryptedEnvelope {
  version: 1;
  sessionId: string;
  nonce: string; // Base64 encoded random nonce
  ciphertext: string; // Base64 encoded ciphertext
  timestamp: number;
}

/**
 * Decrypted message structure
 */
export interface Message<T = unknown> {
  type: MessageType;
  payload: T;
  seq: number; // Sequence number for ordering
}

/**
 * Terminal resize payload
 */
export interface TerminalResizePayload {
  cols: number;
  rows: number;
}

/**
 * Session create request (unencrypted, used for initial handshake)
 */
export interface SessionCreateRequest {
  type: MessageType.SESSION_CREATE;
  sessionId: string;
  publicKey: string;
}

/**
 * Session reconnect request (CLI reconnecting to existing session)
 */
export interface SessionReconnectRequest {
  type: MessageType.SESSION_RECONNECT;
  sessionId: string;
  publicKey: string;
}

/**
 * Session join request (unencrypted, used for initial handshake)
 */
export interface SessionJoinRequest {
  type: MessageType.SESSION_JOIN;
  sessionId: string;
  publicKey: string;
}

/**
 * Web connected notification (sent to CLI with web's public key)
 */
export interface WebConnectedPayload {
  publicKey: string;
  connectionId: string;
}

/**
 * Session created response
 */
export interface SessionCreatedPayload {
  sessionId: string;
  wsEndpoint: string;
}

/**
 * Session joined response
 */
export interface SessionJoinedPayload {
  sessionId: string;
  cliPublicKey: string;
}

/**
 * Error payload
 */
export interface ErrorPayload {
  code: string;
  message: string;
}

/**
 * State sync payload (for new web connections to receive recent output)
 */
export interface StateSyncPayload {
  terminalHistory: string;
  cols: number;
  rows: number;
}

/**
 * Connection role
 */
export type ConnectionRole = 'cli' | 'web';

/**
 * QR code data structure
 */
export interface QRCodeData {
  sessionId: string;
  publicKey: string;
  wsEndpoint: string;
}
