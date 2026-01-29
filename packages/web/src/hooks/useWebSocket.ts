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
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const wsRef = useRef<WebSocketManager | null>(null);
  const isConnectedRef = useRef(false);

  const connect = useCallback(async () => {
    if (wsRef.current?.isConnected()) {
      return;
    }

    const ws = new WebSocketManager(WS_ENDPOINT, {
      onOpen: () => {
        isConnectedRef.current = true;
        options.onStatusChange?.(true);
      },
      onClose: () => {
        isConnectedRef.current = false;
        options.onStatusChange?.(false);
      },
      onSessionJoined: options.onSessionJoined,
      onEncrypted: options.onEncrypted,
      onCliDisconnected: options.onCliDisconnected,
    });

    wsRef.current = ws;
    await ws.connect();
  }, [options]);

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
