'use client';

import { Suspense, useEffect, useCallback, useState, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { TerminalToolbar } from '@/components/Terminal/TerminalToolbar';
import { useSession } from '@/hooks/useSession';
import { useSessionStore } from '@/stores/session';

// Dynamic import Terminal to avoid SSR issues with xterm.js
const Terminal = dynamic(
  () => import('@/components/Terminal/Terminal').then((mod) => mod.Terminal),
  { ssr: false, loading: () => <div className="flex-1 bg-terminal-bg" /> }
);

function SessionContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const sessionIdFromUrl = searchParams.get('id');
  const publicKey = searchParams.get('key');

  // Get stored session state (for reconnection after refresh)
  const { connectionStatus, errorMessage, sessionId: storedSessionId, cliPublicKey: storedCliPublicKey } = useSessionStore();
  const [initialized, setInitialized] = useState(false);

  // Use URL session ID, or fall back to stored session ID (for reconnection)
  const sessionId = sessionIdFromUrl || storedSessionId;

  // Detect if this is a reconnection scenario (have stored encryption state)
  const isReconnect = !!(storedSessionId && storedCliPublicKey && sessionId === storedSessionId);

  // Handle terminal output from CLI
  const handleTerminalOutput = useCallback((data: string) => {
    const handle = (window as unknown as Record<string, unknown>).__terminalHandle as { write: (data: string) => void } | undefined;
    handle?.write(data);
  }, []);

  // Handle state sync
  const handleStateSync = useCallback((state: { cols: number; rows: number }) => {
    console.log('Received state sync:', state);
  }, []);

  const { connectToSession, disconnectSession, sendInput, sendResize } = useSession({
    onTerminalOutput: handleTerminalOutput,
    onStateSync: handleStateSync,
  });

  // Store functions in refs to avoid dependency issues causing reconnects
  const connectRef = useRef(connectToSession);
  connectRef.current = connectToSession;
  const disconnectRef = useRef(disconnectSession);
  disconnectRef.current = disconnectSession;

  // Track if we've started connecting to avoid double connections
  const hasConnectedRef = useRef(false);
  // Track if component is mounted to prevent cleanup during StrictMode double-render
  const isMountedRef = useRef(true);

  // Store session params in ref for use in effects
  const sessionParamsRef = useRef({ sessionId, publicKey, isReconnect });
  sessionParamsRef.current = { sessionId, publicKey, isReconnect };

  // Connect to session - runs only once on mount
  useEffect(() => {
    isMountedRef.current = true;

    const { sessionId, publicKey, isReconnect } = sessionParamsRef.current;

    // For initial connection, need both sessionId and publicKey from URL
    // For reconnection, only need sessionId (either from URL or stored)
    if (!sessionId) {
      router.push('/join');
      return;
    }

    // If no public key in URL and not a reconnection scenario, redirect
    if (!publicKey && !isReconnect) {
      router.push('/join');
      return;
    }

    // Only connect once per component lifecycle
    if (!hasConnectedRef.current) {
      hasConnectedRef.current = true;
      console.log('Connecting to session:', { sessionId, isReconnect });
      connectRef.current(sessionId, isReconnect);
    }

    // Cleanup on unmount - use setTimeout to allow React StrictMode to re-mount
    return () => {
      isMountedRef.current = false;
      // Delay cleanup slightly to allow StrictMode re-mount
      setTimeout(() => {
        if (!isMountedRef.current) {
          hasConnectedRef.current = false;
          disconnectRef.current(false);
        }
      }, 100);
    };
  }, [router]); // Only depend on router for navigation

  // Handle terminal input
  const handleTerminalData = useCallback((data: string) => {
    sendInput(data);
  }, [sendInput]);

  // Handle terminal resize
  const handleTerminalResize = useCallback((cols: number, rows: number) => {
    sendResize(cols, rows);
  }, [sendResize]);

  // Handle disconnect - clear all state when user explicitly disconnects
  const handleDisconnect = useCallback(() => {
    disconnectSession(true); // Clear stored state
    router.push('/');
  }, [disconnectSession, router]);

  // Validate params - need sessionId (and either publicKey for initial connection or stored state for reconnection)
  if (!sessionId || (!publicKey && !isReconnect)) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-terminal-bg">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-terminal-blue border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-terminal-fg/60">Redirecting...</p>
        </div>
      </main>
    );
  }

  // Show error state
  if (errorMessage) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-terminal-bg">
        <div className="max-w-md w-full text-center">
          <div className="text-6xl mb-4">😕</div>
          <h1 className="text-2xl font-bold text-terminal-fg mb-2">
            Connection Error
          </h1>
          <p className="text-terminal-fg/60 mb-8">{errorMessage}</p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-terminal-blue hover:bg-terminal-blue/80 text-white rounded-lg font-medium transition-colors"
          >
            Back to Home
          </button>
        </div>
      </main>
    );
  }

  // Show connecting state
  if (connectionStatus === 'connecting' || connectionStatus === 'disconnected') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-terminal-bg">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-terminal-blue border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-terminal-fg/60">Connecting to session...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen flex flex-col bg-terminal-bg">
      <TerminalToolbar
        sessionId={sessionId}
        connectionStatus={connectionStatus}
        onDisconnect={handleDisconnect}
      />
      <div className="flex-1 overflow-hidden">
        <Terminal
          onData={handleTerminalData}
          onResize={handleTerminalResize}
        />
      </div>
    </main>
  );
}

function LoadingFallback() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-terminal-bg">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-2 border-terminal-blue border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-terminal-fg/60">Loading...</p>
      </div>
    </main>
  );
}

export default function SessionPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SessionContent />
    </Suspense>
  );
}
