'use client';

import { useRef, useCallback, useEffect } from 'react';
import { WebSocketManager } from '@/lib/websocket';
import type { EncryptedEnvelope } from '@always-coder/shared';

const WS_ENDPOINT = process.env.NEXT_PUBLIC_WS_ENDPOINT || 'wss://your-api.execute-api.us-east-1.amazonaws.com/prod';

interface UseWebSocketOptions {
  onSessionJoined?: (data: { sessionId: string; cliPublicKey: string }) => void;
  onEncrypted?: (envelope: EncryptedEnvelope) => void;
  onCliDisconnected?: () => void;
  onStatusChange?: (connected: boolean) => void;
  onServerError?: (code: string, message: string) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const wsRef = useRef<WebSocketManager | null>(null);
  const isConnectedRef = useRef(false);
  // Store options in ref to avoid recreating connect callback
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const connect = useCallback(async () => {
    if (wsRef.current?.isConnected()) {
      return;
    }

    const ws = new WebSocketManager(WS_ENDPOINT, {
      onOpen: () => {
        isConnectedRef.current = true;
        optionsRef.current.onStatusChange?.(true);
      },
      onClose: () => {
        isConnectedRef.current = false;
        optionsRef.current.onStatusChange?.(false);
      },
      onSessionJoined: (data) => optionsRef.current.onSessionJoined?.(data),
      onEncrypted: (envelope) => optionsRef.current.onEncrypted?.(envelope),
      onCliDisconnected: () => optionsRef.current.onCliDisconnected?.(),
      onServerError: (code, message) => optionsRef.current.onServerError?.(code, message),
    });

    wsRef.current = ws;
    await ws.connect();
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    isConnectedRef.current = false;
  }, []);

  const joinSession = useCallback((sessionId: string, publicKey: string) => {
    wsRef.current?.sendSessionJoin(sessionId, publicKey);
  }, []);

  const sendEncrypted = useCallback((envelope: EncryptedEnvelope) => {
    wsRef.current?.sendEncrypted(envelope);
  }, []);

  const isConnected = useCallback(() => {
    return wsRef.current?.isConnected() ?? false;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  return {
    connect,
    disconnect,
    joinSession,
    sendEncrypted,
    isConnected,
  };
}
