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
  } = useSessionStore();

  const { getPublicKey, establishSharedKey, isReady, encrypt, decrypt } = useCrypto();
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
    establishSharedKey(data.cliPublicKey);
    setEncryptionReady(true);
    setConnectionStatus('connected');
  }, [setCliPublicKey, establishSharedKey, setEncryptionReady, setConnectionStatus]);

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

  const { connect, disconnect, joinSession, sendEncrypted } = useWebSocket({
    onSessionJoined: handleSessionJoined,
    onEncrypted: handleEncrypted,
    onCliDisconnected: handleCliDisconnected,
    onStatusChange: handleStatusChange,
  });

  const connectToSession = useCallback(async (targetSessionId: string) => {
    setSessionId(targetSessionId);
    setConnectionStatus('connecting');

    try {
      await connect();
      joinSession(targetSessionId, getPublicKey());
    } catch (error) {
      console.error('Failed to connect:', error);
      setError('Failed to connect to server');
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

  const disconnectSession = useCallback(() => {
    disconnect();
    setConnectionStatus('disconnected');
  }, [disconnect, setConnectionStatus]);

  return {
    sessionId,
    connectionStatus,
    connectToSession,
    disconnectSession,
    sendInput,
    sendResize,
  };
}
