'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { Terminal } from '@/components/Terminal/Terminal';
import { TerminalToolbar } from '@/components/Terminal/TerminalToolbar';
import { useSession } from '@/hooks/useSession';
import { useSessionStore } from '@/stores/session';

export default function SessionPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const sessionId = params.id as string;
  const publicKey = searchParams.get('key');

  const { connectionStatus, errorMessage } = useSessionStore();
  const terminalRef = useRef<{ write: (data: string) => void } | null>(null);

  // Handle terminal output from CLI
  const handleTerminalOutput = useCallback((data: string) => {
    // Access terminal via window
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

  // Connect to session on mount
  useEffect(() => {
    if (!publicKey) {
      router.push('/join');
      return;
    }

    connectToSession(sessionId);

    return () => {
      disconnectSession();
    };
  }, [sessionId, publicKey, connectToSession, disconnectSession, router]);

  // Handle terminal input
  const handleTerminalData = useCallback((data: string) => {
    sendInput(data);
  }, [sendInput]);

  // Handle terminal resize
  const handleTerminalResize = useCallback((cols: number, rows: number) => {
    sendResize(cols, rows);
  }, [sendResize]);

  // Handle disconnect
  const handleDisconnect = useCallback(() => {
    disconnectSession();
    router.push('/');
  }, [disconnectSession, router]);

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
  if (connectionStatus === 'connecting') {
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
