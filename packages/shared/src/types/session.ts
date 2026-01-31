/**
 * Session-related type definitions
 */

/**
 * Session status
 */
export enum SessionStatus {
  PENDING = 'pending', // Created, waiting for web connection
  ACTIVE = 'active', // Both CLI and Web connected
  PAUSED = 'paused', // Web disconnected, CLI still active
  CLOSED = 'closed', // Session ended
}

/**
 * Session information stored in DynamoDB
 */
export interface Session {
  sessionId: string;
  cliConnectionId: string;
  cliPublicKey: string;
  webConnectionIds: string[];
  status: SessionStatus;
  createdAt: number;
  lastActiveAt: number;
  ttl: number;
  userId?: string; // Optional, for authenticated sessions
  // Instance identification (set by CLI)
  instanceId?: string;
  instanceLabel?: string;
  hostname?: string;
  command?: string;
  commandArgs?: string[];
  webUrl?: string;
}

/**
 * Connection information stored in DynamoDB
 */
export interface Connection {
  connectionId: string;
  sessionId: string;
  role: 'cli' | 'web';
  publicKey?: string;
  connectedAt: number;
  ttl: number;
  userId?: string;
}

/**
 * Message cache entry stored in DynamoDB
 */
export interface CachedMessage {
  sessionId: string;
  seq: number;
  encryptedData: string;
  timestamp: number;
  ttl: number;
}

/**
 * Session list item (for user's session history)
 */
export interface SessionListItem {
  sessionId: string;
  status: SessionStatus;
  createdAt: number;
  lastActiveAt: number;
}
