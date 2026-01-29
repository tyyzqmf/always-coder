import type { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { findConnection, unregisterConnection } from '../services/connection.js';
import { getSession, leaveSession, handleCliDisconnect } from '../services/session.js';
import {
  initializeApiClient,
  notifyWebDisconnected,
  notifyCliDisconnected,
} from '../services/relay.js';

/**
 * $disconnect handler - Called when a WebSocket connection is closed
 */
export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId;
  const { domainName, stage } = event.requestContext;

  console.log('WebSocket disconnected:', { connectionId });

  // Initialize API client for sending notifications
  const endpoint = `https://${domainName}/${stage}`;
  initializeApiClient(endpoint);

  try {
    // Get the connection info
    const connection = await findConnection(connectionId!);
    if (!connection) {
      console.log('Connection not found, may not have been associated with a session');
      return { statusCode: 200, body: 'OK' };
    }

    // Get the session
    const session = await getSession(connection.sessionId);
    if (!session) {
      console.log('Session not found for connection');
      await unregisterConnection(connectionId!);
      return { statusCode: 200, body: 'OK' };
    }

    // Handle based on role
    if (connection.role === 'cli') {
      // CLI disconnected - notify all web clients and update session
      console.log(`CLI disconnected from session ${session.sessionId}`);
      await notifyCliDisconnected(session);
      await handleCliDisconnect(session.sessionId);
    } else {
      // Web client disconnected - notify CLI and remove from session
      console.log(`Web client disconnected from session ${session.sessionId}`);
      await notifyWebDisconnected(session, connectionId!);
      await leaveSession(session.sessionId, connectionId!);
    }

    // Remove the connection record
    await unregisterConnection(connectionId!);
  } catch (error) {
    console.error('Error handling disconnect:', error);
    // Still try to clean up the connection
    try {
      await unregisterConnection(connectionId!);
    } catch {
      // Ignore cleanup errors
    }
  }

  return {
    statusCode: 200,
    body: 'Disconnected',
  };
};
