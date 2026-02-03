import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
  GoneException,
} from '@aws-sdk/client-apigatewaymanagementapi';
import type { Session } from '@always-coder/shared';
import { deleteConnection } from '../utils/dynamodb.js';

// API Gateway endpoint will be set from event context
let apiClient: ApiGatewayManagementApiClient | null = null;

/**
 * Initialize the API Gateway Management client
 */
export function initializeApiClient(endpoint: string): void {
  apiClient = new ApiGatewayManagementApiClient({
    endpoint,
  });
}

/**
 * Get the API client (throws if not initialized)
 */
function getApiClient(): ApiGatewayManagementApiClient {
  if (!apiClient) {
    throw new Error('API Gateway client not initialized. Call initializeApiClient() first.');
  }
  return apiClient;
}

/**
 * Send a message to a specific connection
 */
export async function sendToConnection(connectionId: string, data: unknown): Promise<boolean> {
  const client = getApiClient();

  try {
    await client.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(data)),
      })
    );
    return true;
  } catch (error) {
    if (error instanceof GoneException) {
      // Connection is gone, clean up
      console.log(`Connection ${connectionId} is gone, cleaning up`);
      await deleteConnection(connectionId);
      return false;
    }
    throw error;
  }
}

/**
 * Relay a message from CLI to all Web connections
 */
export async function relayToWeb(session: Session, data: unknown): Promise<void> {
  const promises = session.webConnectionIds.map((connectionId) =>
    sendToConnection(connectionId, data).catch((error) => {
      console.error(`Failed to relay to web connection ${connectionId}:`, error);
      return false;
    })
  );

  await Promise.all(promises);
}

/**
 * Relay a message from Web to CLI
 */
export async function relayToCli(session: Session, data: unknown): Promise<boolean> {
  if (!session.cliConnectionId) {
    console.warn(`No CLI connection for session ${session.sessionId}`);
    return false;
  }

  return sendToConnection(session.cliConnectionId, data);
}

/**
 * Broadcast a message to all connections in a session (both CLI and Web)
 */
export async function broadcastToSession(
  session: Session,
  data: unknown,
  excludeConnectionId?: string
): Promise<void> {
  const connectionIds = [session.cliConnectionId, ...session.webConnectionIds].filter(
    (id) => id && id !== excludeConnectionId
  );

  const promises = connectionIds.map((connectionId) =>
    sendToConnection(connectionId, data).catch((error) => {
      console.error(`Failed to broadcast to connection ${connectionId}:`, error);
      return false;
    })
  );

  await Promise.all(promises);
}

/**
 * Notify CLI that a web client connected
 */
export async function notifyWebConnected(
  session: Session,
  webPublicKey: string,
  webConnectionId: string
): Promise<boolean> {
  const data = {
    type: 'web:connected',
    publicKey: webPublicKey,
    connectionId: webConnectionId,
  };

  return sendToConnection(session.cliConnectionId, data);
}

/**
 * Notify CLI that a web client disconnected
 */
export async function notifyWebDisconnected(
  session: Session,
  webConnectionId: string
): Promise<boolean> {
  if (!session.cliConnectionId) return false;

  const data = {
    type: 'web:disconnected',
    connectionId: webConnectionId,
  };

  return sendToConnection(session.cliConnectionId, data);
}

/**
 * Notify web clients that CLI disconnected
 */
export async function notifyCliDisconnected(session: Session): Promise<void> {
  const data = {
    type: 'cli:disconnected',
  };

  await relayToWeb(session, data);
}

/**
 * Notify web clients that CLI reconnected
 */
export async function notifyCliReconnected(session: Session): Promise<void> {
  const data = {
    type: 'cli:reconnected',
    cliPublicKey: session.cliPublicKey,
  };

  await relayToWeb(session, data);
}
