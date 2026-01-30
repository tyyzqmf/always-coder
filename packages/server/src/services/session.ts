import { SessionStatus, type Session } from '@always-coder/shared';
import {
  createSession as dbCreateSession,
  getSession as dbGetSession,
  updateSession as dbUpdateSession,
  addWebConnection as dbAddWebConnection,
  removeWebConnection as dbRemoveWebConnection,
  deleteSession as dbDeleteSession,
} from '../utils/dynamodb.js';

/**
 * Create a new session (called by CLI)
 */
export async function createSession(
  sessionId: string,
  cliConnectionId: string,
  cliPublicKey: string,
  userId?: string
): Promise<Session> {
  const session: Omit<Session, 'ttl'> = {
    sessionId,
    cliConnectionId,
    cliPublicKey,
    webConnectionIds: [],
    status: SessionStatus.PENDING,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    userId,
  };

  await dbCreateSession(session);
  return { ...session, ttl: 0 };
}

/**
 * Get a session by ID
 */
export async function getSession(sessionId: string): Promise<Session | null> {
  return dbGetSession(sessionId);
}

/**
 * Add a web connection to a session
 */
export async function joinSession(
  sessionId: string,
  webConnectionId: string
): Promise<Session | null> {
  const session = await dbAddWebConnection(sessionId, webConnectionId);
  if (session) {
    // Update status to active if CLI is still connected
    if (session.cliConnectionId) {
      await dbUpdateSession(sessionId, { status: SessionStatus.ACTIVE });
      return { ...session, status: SessionStatus.ACTIVE };
    }
  }
  return session;
}

/**
 * Remove a web connection from a session
 */
export async function leaveSession(
  sessionId: string,
  webConnectionId: string
): Promise<Session | null> {
  const session = await dbRemoveWebConnection(sessionId, webConnectionId);
  if (session && session.webConnectionIds.length === 0) {
    // Update status to paused if no more web connections
    await dbUpdateSession(sessionId, { status: SessionStatus.PAUSED });
    return { ...session, status: SessionStatus.PAUSED };
  }
  return session;
}

/**
 * Handle CLI disconnection
 */
export async function handleCliDisconnect(sessionId: string): Promise<Session | null> {
  return dbUpdateSession(sessionId, {
    status: SessionStatus.CLOSED,
    cliConnectionId: '',
  });
}

/**
 * Handle CLI reconnection (update cliConnectionId)
 */
export async function reconnectSession(
  sessionId: string,
  newCliConnectionId: string
): Promise<Session | null> {
  return dbUpdateSession(sessionId, {
    cliConnectionId: newCliConnectionId,
    status: SessionStatus.PENDING, // Reset to pending until web reconnects
    lastActiveAt: Date.now(),
  });
}

/**
 * Update session status
 */
export async function updateSessionStatus(
  sessionId: string,
  status: SessionStatus
): Promise<Session | null> {
  return dbUpdateSession(sessionId, { status });
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await dbDeleteSession(sessionId);
}

/**
 * Check if a session is valid and active
 */
export async function isSessionActive(sessionId: string): Promise<boolean> {
  const session = await getSession(sessionId);
  if (!session) return false;
  return session.status === SessionStatus.PENDING || session.status === SessionStatus.ACTIVE;
}
