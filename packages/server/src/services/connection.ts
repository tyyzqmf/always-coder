import type { Connection, ConnectionRole } from '@always-coder/shared';
import {
  createConnection,
  getConnection,
  deleteConnection,
  getConnectionsBySession,
} from '../utils/dynamodb.js';

/**
 * Register a new WebSocket connection
 */
export async function registerConnection(
  connectionId: string,
  sessionId: string,
  role: ConnectionRole,
  publicKey?: string,
  userId?: string
): Promise<Connection> {
  const connection: Omit<Connection, 'ttl'> = {
    connectionId,
    sessionId,
    role,
    publicKey,
    connectedAt: Date.now(),
    userId,
  };

  await createConnection(connection);
  return { ...connection, ttl: 0 }; // ttl is set by dynamodb
}

/**
 * Get a connection by ID
 */
export async function findConnection(connectionId: string): Promise<Connection | null> {
  return getConnection(connectionId);
}

/**
 * Remove a connection
 */
export async function unregisterConnection(connectionId: string): Promise<void> {
  await deleteConnection(connectionId);
}

/**
 * Find all connections for a session
 */
export async function findConnectionsForSession(sessionId: string): Promise<Connection[]> {
  return getConnectionsBySession(sessionId);
}

/**
 * Find CLI connection for a session
 */
export async function findCliConnection(sessionId: string): Promise<Connection | null> {
  const connections = await getConnectionsBySession(sessionId);
  return connections.find((c) => c.role === 'cli') || null;
}

/**
 * Find all Web connections for a session
 */
export async function findWebConnections(sessionId: string): Promise<Connection[]> {
  const connections = await getConnectionsBySession(sessionId);
  return connections.filter((c) => c.role === 'web');
}
