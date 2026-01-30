'use client';

import { useCallback, useRef } from 'react';
import { MessageType, type EncryptedEnvelope, type Message } from '@always-coder/shared';
import { useSessionStore } from '@/stores/session';
import { useCrypto } from './useCrypto';
import { useWebSocket } from './useWebSocket';

// Maximum consecutive decryption failures before alerting user
const MAX_DECRYPTION_FAILURES = 3;

interface UseSessionOptions {
  onTerminalOutput?: (data: string) => void;
  onStateSync?: (state: { cols: number; rows: number }) => void;
}

export function useSession(options: UseSessionOptions = {}) {
  const {
    sessionId,
    connectionStatus,
    setSessionId,
    setCliPublicKey,
    setConnectionStatus,
    setEncryptionReady,
    setError,
    reset,
  } = useSessionStore();

  const {
    getPublicKey,
    establishSharedKey,
    reestablishSharedKey,
    isCliKeyChanged,
    isReady,
    encrypt,
    decrypt,
    clearCrypto,
  } = useCrypto();

  const seqRef = useRef(0);
  const decryptionFailuresRef = useRef(0);

  const handleEncrypted = useCallback((envelope: EncryptedEnvelope) => {
    if (!isReady()) {
      console.warn('Received encrypted message before encryption is ready');
      return;
    }

    try {
      const message = decrypt(envelope);
      // Reset failure counter on successful decryption
      decryptionFailuresRef.current = 0;

      switch (message.type) {
        case MessageType.TERMINAL_OUTPUT:
          options.onTerminalOutput?.(message.payload as string);
          break;

        case MessageType.STATE_SYNC:
          options.onStateSync?.(message.payload as { cols: number; rows: number });
          break;

        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      decryptionFailuresRef.current++;
      console.error('Failed to decrypt message:', error, {
        consecutiveFailures: decryptionFailuresRef.current,
        maxFailures: MAX_DECRYPTION_FAILURES,
      });

      // Alert user after multiple consecutive failures - could indicate key mismatch or attack
      if (decryptionFailuresRef.current >= MAX_DECRYPTION_FAILURES) {
        setError(
          'Failed to decrypt multiple messages. The encryption keys may be out of sync. ' +
          'Please refresh the page or scan the QR code again.'
        );
        // Clear crypto state to force re-establishment on next connection
        clearCrypto();
      }
    }
  }, [isReady, decrypt, options, setError, clearCrypto]);

  const handleSessionJoined = useCallback((data: { sessionId: string; cliPublicKey: string }) => {
    console.log('Session joined:', data.sessionId);
    setCliPublicKey(data.cliPublicKey);

    // Always (re-)establish the shared key because:
    // 1. We always generate a new keypair on page load (for security)
    // 2. Even if CLI's public key is the same, our private key is different
    // 3. CLI will also re-establish when it sees our new public key
    if (isCliKeyChanged(data.cliPublicKey)) {
      console.log('CLI public key changed, re-establishing shared key');
      reestablishSharedKey(data.cliPublicKey);
    } else {
      // Either first time OR reconnecting with new keypair
      // Either way, we need to establish/re-establish because our private key is new
      console.log('Establishing shared key with current keypair');
      reestablishSharedKey(data.cliPublicKey);
    }

    // Reset decryption failure counter on successful connection
    decryptionFailuresRef.current = 0;
    setEncryptionReady(true);
    setConnectionStatus('connected');
  }, [
    setCliPublicKey,
    isCliKeyChanged,
    reestablishSharedKey,
    setEncryptionReady,
    setConnectionStatus,
  ]);

  const handleCliDisconnected = useCallback(() => {
    setError('CLI disconnected');
  }, [setError]);

  const handleStatusChange = useCallback((connected: boolean) => {
    // Use getState() to avoid dependency on connectionStatus which causes infinite loops
    const currentStatus = useSessionStore.getState().connectionStatus;
    if (!connected && currentStatus === 'connected') {
      setConnectionStatus('disconnected');
    }
  }, [setConnectionStatus]);

  const handleServerError = useCallback((code: string, message: string) => {
    console.error('Server error:', code, message);

    // If session not found, clear stored state so user can start fresh
    if (code === 'SESSION_NOT_FOUND') {
      clearCrypto();
      reset();
      setError('Session not found or expired. Please scan the QR code again.');
    } else if (code === 'CONNECTION_FAILED') {
      setError('CLI is not connected. Please ensure the CLI is running.');
    } else {
      setError(message || 'An error occurred');
    }
  }, [clearCrypto, reset, setError]);

  const { connect, disconnect, joinSession, sendEncrypted } = useWebSocket({
    onSessionJoined: handleSessionJoined,
    onEncrypted: handleEncrypted,
    onCliDisconnected: handleCliDisconnected,
    onStatusChange: handleStatusChange,
    onServerError: handleServerError,
  });

  const connectToSession = useCallback(async (targetSessionId: string, _isReconnect = false) => {
    setSessionId(targetSessionId);
    setConnectionStatus('connecting');

    try {
      await connect();

      // Always send SESSION_JOIN to server with our fresh public key.
      // Since we regenerate our keypair on each page load for security,
      // the shared key will be established in handleSessionJoined.
      joinSession(targetSessionId, getPublicKey());
    } catch (error) {
      console.error('Failed to connect:', error);
      setError('Failed to connect to server');
      setConnectionStatus('error');
    }
  }, [connect, joinSession, getPublicKey, setSessionId, setConnectionStatus, setError]);

  const sendInput = useCallback((data: string) => {
    if (!isReady() || !sessionId) return;

    const message: Message<string> = {
      type: MessageType.TERMINAL_INPUT,
      payload: data,
      seq: ++seqRef.current,
    };

    const envelope = encrypt(message, sessionId);
    sendEncrypted(envelope);
  }, [isReady, sessionId, encrypt, sendEncrypted]);

  const sendResize = useCallback((cols: number, rows: number) => {
    if (!isReady() || !sessionId) return;

    const message: Message<{ cols: number; rows: number }> = {
      type: MessageType.TERMINAL_RESIZE,
      payload: { cols, rows },
      seq: ++seqRef.current,
    };

    const envelope = encrypt(message, sessionId);
    sendEncrypted(envelope);
  }, [isReady, sessionId, encrypt, sendEncrypted]);

  const disconnectSession = useCallback((clearState = false) => {
    disconnect();
    setConnectionStatus('disconnected');

    // Optionally clear all stored state (e.g., when user explicitly disconnects)
    if (clearState) {
      clearCrypto();
      reset();
    }
  }, [disconnect, setConnectionStatus, clearCrypto, reset]);

  return {
    sessionId,
    connectionStatus,
    connectToSession,
    disconnectSession,
    sendInput,
    sendResize,
  };
}
