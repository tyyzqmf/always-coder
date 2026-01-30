'use client';

import { useCallback, useRef } from 'react';
import { MessageType, type EncryptedEnvelope, type Message } from '@always-coder/shared';
import { useSessionStore } from '@/stores/session';
import { useCrypto } from './useCrypto';
import { useWebSocket } from './useWebSocket';

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

  const { getPublicKey, establishSharedKey, isReady, encrypt, decrypt, clearCrypto } = useCrypto();
  const seqRef = useRef(0);

  const handleEncrypted = useCallback((envelope: EncryptedEnvelope) => {
    if (!isReady()) return;

    try {
      const message = decrypt(envelope);

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
      console.error('Failed to decrypt message:', error);
    }
  }, [isReady, decrypt, options]);

  const handleSessionJoined = useCallback((data: { sessionId: string; cliPublicKey: string }) => {
    console.log('Session joined:', data.sessionId);
    setCliPublicKey(data.cliPublicKey);

    // Only establish shared key if not already ready (handles reconnection case)
    if (!isReady()) {
      establishSharedKey(data.cliPublicKey);
    }

    setEncryptionReady(true);
    setConnectionStatus('connected');
  }, [setCliPublicKey, establishSharedKey, setEncryptionReady, setConnectionStatus, isReady]);

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

  const connectToSession = useCallback(async (targetSessionId: string, isReconnect = false) => {
    setSessionId(targetSessionId);
    setConnectionStatus('connecting');

    try {
      await connect();

      // Check if we have stored encryption state (page refresh scenario)
      // The shared key was already restored from sessionStorage by WebCrypto
      if (isReconnect && isReady()) {
        console.log('Reconnecting with stored encryption state');
        setEncryptionReady(true);
      }

      // Always send SESSION_JOIN to server - it will handle both new connections
      // and reconnections (after page refresh). Server uses the same public key
      // to verify the web client.
      joinSession(targetSessionId, getPublicKey());
    } catch (error) {
      console.error('Failed to connect:', error);
      setError('Failed to connect to server');
    }
  }, [connect, joinSession, getPublicKey, setSessionId, setConnectionStatus, setError, isReady, setEncryptionReady]);

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
