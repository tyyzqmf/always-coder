'use client';

import { useEffect, useState } from 'react';
import type { ConnectionStatus } from '@/stores/session';

interface TerminalToolbarProps {
  sessionId: string;
  connectionStatus: ConnectionStatus;
  onDisconnect?: () => void;
}

function handleLogout() {
  // Redirect to server-side logout endpoint to clear HttpOnly cookies
  window.location.href = '/auth/logout';
}

function getUserEmail(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/user_email=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export function TerminalToolbar({
  sessionId,
  connectionStatus,
  onDisconnect,
}: TerminalToolbarProps) {
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    setUserEmail(getUserEmail());
  }, []);

  const statusColors: Record<ConnectionStatus, string> = {
    disconnected: 'bg-terminal-red',
    connecting: 'bg-terminal-yellow animate-pulse',
    connected: 'bg-terminal-green',
    error: 'bg-terminal-red',
  };

  const statusText: Record<ConnectionStatus, string> = {
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
    connected: 'Connected',
    error: 'Error',
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-terminal-black/80 border-b border-terminal-fg/10">
      <div className="flex items-center gap-4">
        {/* Traffic light buttons (decorative) */}
        <div className="flex items-center gap-1.5">
          <button
            className="w-3 h-3 rounded-full bg-terminal-red hover:opacity-80 transition-opacity"
            onClick={onDisconnect}
            title="Disconnect"
          />
          <div className="w-3 h-3 rounded-full bg-terminal-yellow" />
          <div className="w-3 h-3 rounded-full bg-terminal-green" />
        </div>

        {/* Session info */}
        <span className="text-sm text-terminal-fg/60 font-mono">
          Session: <span className="text-terminal-cyan">{sessionId}</span>
        </span>
      </div>

      {/* Connection status, user info and logout */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${statusColors[connectionStatus]}`} />
          <span className="text-sm text-terminal-fg/60">{statusText[connectionStatus]}</span>
        </div>
        {userEmail && (
          <span className="text-sm text-terminal-fg/40">{userEmail}</span>
        )}
        <button
          onClick={handleLogout}
          className="text-sm text-terminal-fg/60 hover:text-terminal-fg transition-colors"
          title="Logout"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
