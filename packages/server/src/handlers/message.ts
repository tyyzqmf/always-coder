import type { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import {
  MessageType,
  isSessionCreateRequest,
  isSessionJoinRequest,
  isEncryptedEnvelope,
  ErrorCodes,
} from '@always-coder/shared';
import { registerConnection, findConnection } from '../services/connection.js';
import {
  createSession,
  getSession,
  joinSession,
  isSessionActive,
} from '../services/session.js';
import {
  initializeApiClient,
  sendToConnection,
  relayToWeb,
  relayToCli,
  notifyWebConnected,
} from '../services/relay.js';
import { cacheMessage, getRecentMessages } from '../utils/dynamodb.js';

/**
 * $default handler - Routes and relays WebSocket messages
 *
 * Server does NOT decrypt messages - it only routes encrypted envelopes
 * between CLI and Web clients based on session ID.
 */
export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId!;
  const { domainName, stage } = event.requestContext;

  // Initialize API client for sending messages
  const endpoint = `https://${domainName}/${stage}`;
  initializeApiClient(endpoint);

  let body: unknown;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    console.error('Invalid JSON in message body');
    return sendError(connectionId, ErrorCodes.INVALID_MESSAGE, 'Invalid JSON');
  }

  console.log('Message received:', { connectionId, type: (body as Record<string, unknown>).type });

  try {
    // Handle session creation (from CLI)
    if (isSessionCreateRequest(body)) {
      return await handleSessionCreate(connectionId, body.sessionId, body.publicKey, endpoint);
    }

    // Handle session join (from Web)
    if (isSessionJoinRequest(body)) {
      return await handleSessionJoin(connectionId, body.sessionId, body.publicKey);
    }

    // Handle encrypted messages (relay without decryption)
    if (isEncryptedEnvelope(body)) {
      return await handleEncryptedMessage(connectionId, body);
    }

    // Handle ping/pong
    if ((body as Record<string, unknown>).type === MessageType.PING) {
      await sendToConnection(connectionId, { type: MessageType.PONG, timestamp: Date.now() });
      return { statusCode: 200, body: 'OK' };
    }

    // Handle state request (new web connection wants history)
    if ((body as Record<string, unknown>).type === MessageType.STATE_REQUEST) {
      return await handleStateRequest(connectionId, body as { sessionId: string; sinceSeq?: number });
    }

    console.warn('Unknown message type:', (body as Record<string, unknown>).type);
    return { statusCode: 200, body: 'OK' };
  } catch (error) {
    console.error('Error handling message:', error);
    return sendError(connectionId, ErrorCodes.INVALID_MESSAGE, 'Internal error');
  }
};

/**
 * Handle SESSION_CREATE from CLI
 */
async function handleSessionCreate(
  connectionId: string,
  sessionId: string,
  publicKey: string,
  wsEndpoint: string
): Promise<APIGatewayProxyResult> {
  console.log('Creating session:', { sessionId, connectionId });

  // Check if session already exists
  const existing = await getSession(sessionId);
  if (existing) {
    return sendError(connectionId, ErrorCodes.INVALID_MESSAGE, 'Session already exists');
  }

  // Create the session
  await createSession(sessionId, connectionId, publicKey);

  // Register the CLI connection
  await registerConnection(connectionId, sessionId, 'cli', publicKey);

  // Send confirmation to CLI
  await sendToConnection(connectionId, {
    type: MessageType.SESSION_CREATED,
    sessionId,
    wsEndpoint,
  });

  return { statusCode: 200, body: 'Session created' };
}

/**
 * Handle SESSION_JOIN from Web
 */
async function handleSessionJoin(
  connectionId: string,
  sessionId: string,
  publicKey: string
): Promise<APIGatewayProxyResult> {
  console.log('Joining session:', { sessionId, connectionId });

  // Check if session is active
  const isActive = await isSessionActive(sessionId);
  if (!isActive) {
    return sendError(connectionId, ErrorCodes.SESSION_NOT_FOUND, 'Session not found or expired');
  }

  // Get the session
  const session = await getSession(sessionId);
  if (!session) {
    return sendError(connectionId, ErrorCodes.SESSION_NOT_FOUND, 'Session not found');
  }

  // Register the web connection
  await registerConnection(connectionId, sessionId, 'web', publicKey);

  // Add web connection to session
  await joinSession(sessionId, connectionId);

  // Notify CLI about new web connection (with web's public key)
  await notifyWebConnected(session, publicKey, connectionId);

  // Send session info to web (with CLI's public key for key exchange)
  await sendToConnection(connectionId, {
    type: MessageType.SESSION_JOINED,
    sessionId,
    cliPublicKey: session.cliPublicKey,
  });

  return { statusCode: 200, body: 'Session joined' };
}

/**
 * Handle encrypted messages (relay without decryption)
 */
async function handleEncryptedMessage(
  connectionId: string,
  envelope: { version: 1; sessionId: string; nonce: string; ciphertext: string; timestamp: number }
): Promise<APIGatewayProxyResult> {
  // Get connection info
  const connection = await findConnection(connectionId);
  if (!connection) {
    return sendError(connectionId, ErrorCodes.CONNECTION_FAILED, 'Connection not found');
  }

  // Get session
  const session = await getSession(connection.sessionId);
  if (!session) {
    return sendError(connectionId, ErrorCodes.SESSION_NOT_FOUND, 'Session not found');
  }

  // Relay message based on sender's role
  if (connection.role === 'cli') {
    // CLI -> Web: relay to all web connections
    await relayToWeb(session, envelope);

    // Cache the message for late-joining web clients (only terminal output)
    // We can't inspect the content, so we cache all CLI->Web messages
    try {
      await cacheMessage({
        sessionId: session.sessionId,
        seq: envelope.timestamp, // Use timestamp as sequence for simplicity
        encryptedData: JSON.stringify(envelope),
        timestamp: envelope.timestamp,
      });
    } catch (error) {
      console.warn('Failed to cache message:', error);
      // Don't fail the relay if caching fails
    }
  } else {
    // Web -> CLI: relay to CLI connection
    const sent = await relayToCli(session, envelope);
    if (!sent) {
      return sendError(connectionId, ErrorCodes.CONNECTION_FAILED, 'CLI not connected');
    }
  }

  return { statusCode: 200, body: 'OK' };
}

/**
 * Handle STATE_REQUEST from new web connections
 */
async function handleStateRequest(
  connectionId: string,
  _request: { sessionId: string; sinceSeq?: number }
): Promise<APIGatewayProxyResult> {
  const connection = await findConnection(connectionId);
  if (!connection) {
    return sendError(connectionId, ErrorCodes.CONNECTION_FAILED, 'Connection not found');
  }

  // Get cached messages
  const messages = await getRecentMessages(connection.sessionId);

  // Send cached messages to the requesting connection
  for (const msg of messages) {
    try {
      const envelope = JSON.parse(msg.encryptedData);
      await sendToConnection(connectionId, envelope);
    } catch (error) {
      console.warn('Failed to send cached message:', error);
    }
  }

  return { statusCode: 200, body: 'OK' };
}

/**
 * Send an error response to a connection
 */
async function sendError(
  connectionId: string,
  code: string,
  message: string
): Promise<APIGatewayProxyResult> {
  try {
    await sendToConnection(connectionId, {
      type: MessageType.ERROR,
      code,
      message,
    });
  } catch (error) {
    console.error('Failed to send error:', error);
  }

  return { statusCode: 400, body: message };
}
