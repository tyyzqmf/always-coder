'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { MessageType, type RemoteSessionInfo } from '@always-coder/shared';

const WS_ENDPOINT = process.env.NEXT_PUBLIC_WS_ENDPOINT || '';

function handleLogout() {
  window.location.href = '/auth/logout';
}

function getUserEmail(): string {
  const match = document.cookie.match(/user_email=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function getAccessToken(): string {
  const match = document.cookie.match(/access_token=([^;]+)/);
  return match ? match[1] : '';
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function formatStatus(status: string): { label: string; color: string } {
  switch (status) {
    case 'active':
      return { label: 'Active', color: 'bg-terminal-green' };
    case 'pending':
      return { label: 'Pending', color: 'bg-terminal-yellow' };
    case 'paused':
      return { label: 'Paused', color: 'bg-terminal-yellow' };
    case 'closed':
      return { label: 'Closed', color: 'bg-terminal-fg/30' };
    default:
      return { label: status, color: 'bg-terminal-fg/30' };
  }
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<RemoteSessionInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    setUserEmail(getUserEmail());
  }, []);

  const fetchSessions = useCallback(async (isManualRefresh = false) => {
    // Only show full loading state on initial load, not on refresh
    if (!isManualRefresh && !hasLoadedOnce.current) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);

    const token = getAccessToken();
    if (!token) {
      setError('Not authenticated. Please log in.');
      setIsLoading(false);
      return;
    }

    try {
      const wsUrl = `${WS_ENDPOINT}?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);

      const timeout = setTimeout(() => {
        ws.close();
        setError('Request timed out');
        setIsLoading(false);
      }, 10000);

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: MessageType.SESSION_LIST_REQUEST,
            includeInactive,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === MessageType.SESSION_LIST_RESPONSE) {
            clearTimeout(timeout);
            setSessions(message.sessions || []);
            setIsLoading(false);
            setIsRefreshing(false);
            hasLoadedOnce.current = true;
            ws.close();
          } else if (message.type === MessageType.ERROR) {
            clearTimeout(timeout);
            setError(message.message || 'Server error');
            setIsLoading(false);
            setIsRefreshing(false);
            ws.close();
          }
        } catch (e) {
          // Ignore parse errors
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        setError('WebSocket connection failed');
        setIsLoading(false);
        setIsRefreshing(false);
      };

      ws.onclose = (event) => {
        clearTimeout(timeout);
        if (event.code !== 1000) {
          setError(`Connection closed: ${event.reason || 'Unknown reason'}`);
          setIsLoading(false);
          setIsRefreshing(false);
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setIsLoading(false);
      setIsRefreshing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeInactive]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const activeSessions = sessions.filter(
    (s) => s.status === 'active' || s.status === 'pending' || s.status === 'paused'
  );
  const inactiveSessions = sessions.filter((s) => s.status === 'closed');

  return (
    <main className="min-h-screen flex flex-col p-4 bg-terminal-bg">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-terminal-fg/60 hover:text-terminal-fg transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-terminal-blue via-terminal-magenta to-terminal-cyan bg-clip-text text-transparent">
            My Sessions
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {userEmail && (
            <span className="text-sm text-terminal-fg/60">{userEmail}</span>
          )}
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-sm text-terminal-fg/60 hover:text-terminal-fg border border-terminal-fg/20 rounded-lg transition-colors"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <label className="flex items-center gap-2 text-sm text-terminal-fg/70 cursor-pointer">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="w-4 h-4 rounded border-terminal-fg/30 bg-terminal-black/50 text-terminal-blue focus:ring-terminal-blue"
          />
          Show closed sessions
        </label>
        <button
          onClick={() => fetchSessions(true)}
          disabled={isLoading || isRefreshing}
          className="px-3 py-1 text-sm text-terminal-blue hover:text-terminal-blue/80 disabled:text-terminal-fg/30 transition-colors flex items-center gap-2"
        >
          {isRefreshing && (
            <div className="animate-spin w-3 h-3 border border-terminal-blue border-t-transparent rounded-full" />
          )}
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 p-4 bg-terminal-red/10 border border-terminal-red/30 rounded-lg text-terminal-red">
          {error}
        </div>
      )}

      {/* Loading state */}
      {isLoading && !error && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin w-8 h-8 border-2 border-terminal-blue border-t-transparent rounded-full" />
            <p className="text-terminal-fg/60">Loading sessions...</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && sessions.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-terminal-fg/60 mb-4">No sessions found</p>
            <p className="text-terminal-fg/40 text-sm mb-6">
              Start a session on your computer with:
            </p>
            <code className="block p-3 bg-terminal-black/50 rounded-lg font-mono text-terminal-fg/80">
              always claude --daemon
            </code>
          </div>
        </div>
      )}

      {/* Session list */}
      {!isLoading && !error && sessions.length > 0 && (
        <div className="space-y-6">
          {/* Active Sessions */}
          {activeSessions.length > 0 && (
            <div>
              <h2 className="text-lg font-medium text-terminal-fg/80 mb-3">
                Active Sessions ({activeSessions.length})
              </h2>
              <div className="space-y-3">
                {activeSessions.map((session) => (
                  <SessionCard key={session.sessionId} session={session} />
                ))}
              </div>
            </div>
          )}

          {/* Inactive Sessions */}
          {includeInactive && inactiveSessions.length > 0 && (
            <div>
              <h2 className="text-lg font-medium text-terminal-fg/50 mb-3">
                Closed Sessions ({inactiveSessions.length})
              </h2>
              <div className="space-y-3">
                {inactiveSessions.map((session) => (
                  <SessionCard
                    key={session.sessionId}
                    session={session}
                    disabled
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function SessionCard({
  session,
  disabled = false,
}: {
  session: RemoteSessionInfo;
  disabled?: boolean;
}) {
  const status = formatStatus(session.status);
  const instanceDisplay = session.instanceLabel
    ? session.instanceLabel
    : session.instanceId && session.instanceId !== session.hostname
      ? `${session.hostname} (${session.instanceId})`
      : session.hostname || 'Unknown';

  const commandDisplay = session.command
    ? `${session.command}${session.commandArgs?.length ? ' ' + session.commandArgs.join(' ') : ''}`
    : 'Unknown command';

  const handleConnect = () => {
    if (session.webUrl) {
      window.location.href = session.webUrl;
    }
  };

  return (
    <div
      className={`p-4 rounded-lg border transition-colors ${
        disabled
          ? 'bg-terminal-black/20 border-terminal-fg/10'
          : 'bg-terminal-black/50 border-terminal-fg/20 hover:border-terminal-fg/30'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Session ID and Status */}
          <div className="flex items-center gap-3 mb-2">
            <span
              className={`w-2 h-2 rounded-full ${status.color}`}
              title={status.label}
            />
            <span className="font-mono text-terminal-fg font-medium truncate">
              {session.sessionId}
            </span>
            <span className="text-xs text-terminal-fg/50 px-2 py-0.5 rounded bg-terminal-fg/10">
              {status.label}
            </span>
          </div>

          {/* Instance */}
          <div className="flex items-center gap-2 text-sm text-terminal-fg/60 mb-1">
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2"
              />
            </svg>
            <span className="truncate">{instanceDisplay}</span>
          </div>

          {/* Command */}
          <div className="flex items-center gap-2 text-sm text-terminal-fg/60 mb-1">
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span className="font-mono truncate">{commandDisplay}</span>
          </div>

          {/* Time */}
          <div className="flex items-center gap-2 text-sm text-terminal-fg/40">
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>Started {formatDate(session.createdAt)}</span>
          </div>
        </div>

        {/* Connect button */}
        {!disabled && session.webUrl && (
          <button
            onClick={handleConnect}
            className="px-4 py-2 bg-terminal-blue hover:bg-terminal-blue/80 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
          >
            Connect
          </button>
        )}
      </div>
    </div>
  );
}
