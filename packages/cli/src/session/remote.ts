/**
 * Remote session management
 *
 * Provides functionality to query remote sessions from the server
 * for users who are logged in.
 */

import WebSocket from 'ws';
import { MessageType, type RemoteSessionInfo } from '@always-coder/shared';
import { getWSEndpoint, loadConfig } from '../config/index.js';

/**
 * Timeout for remote session queries (ms)
 */
const QUERY_TIMEOUT = 10000;

/**
 * Fetch remote sessions for the current user
 *
 * @param includeInactive - Include closed/expired sessions
 * @returns List of remote sessions
 */
export async function fetchRemoteSessions(
  includeInactive: boolean = false
): Promise<RemoteSessionInfo[]> {
  const config = loadConfig();

  if (!config.authToken) {
    throw new Error('Not logged in. Run "always login" to authenticate.');
  }

  const wsEndpoint = getWSEndpoint();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Request timed out'));
    }, QUERY_TIMEOUT);

    // Connect with auth token
    const url = `${wsEndpoint}?token=${encodeURIComponent(config.authToken!)}`;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      // Send session list request
      ws.send(
        JSON.stringify({
          type: MessageType.SESSION_LIST_REQUEST,
          includeInactive,
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data.toString());

        if (message.type === MessageType.SESSION_LIST_RESPONSE) {
          clearTimeout(timeout);
          ws.close();
          resolve(message.sessions || []);
        } else if (message.type === MessageType.ERROR) {
          clearTimeout(timeout);
          ws.close();
          reject(new Error(message.message || 'Server error'));
        }
      } catch (error) {
        // Ignore parse errors
      }
    };

    ws.onerror = (error) => {
      clearTimeout(timeout);
      reject(new Error('WebSocket error: ' + error.message));
    };

    ws.onclose = (event) => {
      clearTimeout(timeout);
      if (event.code !== 1000) {
        reject(new Error(`Connection closed: ${event.reason || 'Unknown reason'}`));
      }
    };
  });
}

/**
 * Fetch info for a specific remote session
 *
 * @param sessionId - Session ID to query
 * @returns Session info or null if not found
 */
export async function fetchRemoteSessionInfo(
  sessionId: string
): Promise<RemoteSessionInfo | null> {
  const config = loadConfig();

  if (!config.authToken) {
    throw new Error('Not logged in. Run "always login" to authenticate.');
  }

  const wsEndpoint = getWSEndpoint();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Request timed out'));
    }, QUERY_TIMEOUT);

    // Connect with auth token
    const url = `${wsEndpoint}?token=${encodeURIComponent(config.authToken!)}`;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      // Send session info request
      ws.send(
        JSON.stringify({
          type: MessageType.SESSION_INFO_REQUEST,
          sessionId,
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data.toString());

        if (message.type === MessageType.SESSION_INFO_RESPONSE) {
          clearTimeout(timeout);
          ws.close();
          resolve(message.session || null);
        } else if (message.type === MessageType.ERROR) {
          clearTimeout(timeout);
          ws.close();
          reject(new Error(message.message || 'Server error'));
        }
      } catch (error) {
        // Ignore parse errors
      }
    };

    ws.onerror = (error) => {
      clearTimeout(timeout);
      reject(new Error('WebSocket error: ' + error.message));
    };

    ws.onclose = (event) => {
      clearTimeout(timeout);
      if (event.code !== 1000) {
        reject(new Error(`Connection closed: ${event.reason || 'Unknown reason'}`));
      }
    };
  });
}
