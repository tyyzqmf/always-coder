'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';

function handleLogout() {
  // Redirect to server-side logout endpoint to clear HttpOnly cookies
  window.location.href = '/auth/logout';
}

function getUserEmail(): string {
  const match = document.cookie.match(/user_email=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

interface CLIModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverUrl: string;
}

function CLIModal({ isOpen, onClose, serverUrl }: CLIModalProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyToClipboard = useCallback(async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    }
  }, []);

  if (!isOpen) return null;

  const commands = [
    { label: 'Installation', command: 'npm install -g @always-coder/cli' },
    { label: 'Login to server', command: `always login --server ${serverUrl}` },
    { label: 'Start Claude session', command: 'always claude' },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-terminal-black border border-terminal-fg/20 rounded-xl max-w-lg w-full p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-terminal-fg">CLI Connect</h2>
          <button
            onClick={onClose}
            className="text-terminal-fg/60 hover:text-terminal-fg transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-terminal-fg/70 text-sm mb-6">
          Remote AI coding agent control - access Claude, Codex, and other AI assistants from anywhere via secure WebSocket connections.
        </p>

        <div className="space-y-4">
          {commands.map((item, index) => (
            <div key={index}>
              <label className="block text-sm text-terminal-fg/60 mb-2">{item.label}</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-3 bg-terminal-black/80 border border-terminal-fg/10 rounded-lg font-mono text-sm text-terminal-green overflow-x-auto">
                  {item.command}
                </code>
                <button
                  onClick={() => copyToClipboard(item.command, index)}
                  className="p-3 bg-terminal-fg/10 hover:bg-terminal-fg/20 rounded-lg transition-colors flex-shrink-0"
                  title="Copy to clipboard"
                >
                  {copiedIndex === index ? (
                    <svg className="w-5 h-5 text-terminal-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-terminal-fg/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t border-terminal-fg/10">
          <p className="text-xs text-terminal-fg/40">
            After logging in, run <code className="text-terminal-cyan">always claude</code> to start a session, then return here to connect.
          </p>
        </div>
      </div>
    </div>
  );
}

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // User is always logged in if they can see this page (Lambda@Edge blocks unauthenticated users)
  const isLoggedIn = true;
  const [userEmail, setUserEmail] = useState('');
  const [showCLIModal, setShowCLIModal] = useState(false);
  const [serverUrl, setServerUrl] = useState('');

  useEffect(() => {
    setUserEmail(getUserEmail());
    // Fetch server config to get the webUrl
    fetch('/api/config.json')
      .then((res) => res.json())
      .then((config) => setServerUrl(config.webUrl || window.location.origin))
      .catch(() => setServerUrl(window.location.origin));
  }, []);

  // Auto-redirect if session params are present in URL
  useEffect(() => {
    const sessionId = searchParams.get('id');
    const publicKey = searchParams.get('key');

    if (sessionId && publicKey) {
      const params = new URLSearchParams({
        id: sessionId.toUpperCase(),
        key: publicKey,
      });
      router.push(`/session?${params.toString()}`);
    }
  }, [searchParams, router]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      {/* CLI Modal */}
      <CLIModal isOpen={showCLIModal} onClose={() => setShowCLIModal(false)} serverUrl={serverUrl} />

      {/* User info and buttons in top right */}
      {isLoggedIn && (
        <div className="absolute top-4 right-4 flex items-center gap-3">
          <button
            onClick={() => setShowCLIModal(true)}
            className="px-4 py-2 text-sm text-terminal-cyan hover:text-terminal-cyan/80 border border-terminal-cyan/40 hover:border-terminal-cyan/60 rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            CLI Connect
          </button>
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
      )}

      <div className="max-w-2xl w-full text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-terminal-blue via-terminal-magenta to-terminal-cyan bg-clip-text text-transparent">
          Always Coder
        </h1>
        <p className="text-xl text-terminal-fg/70 mb-8">
          Remote AI Coding Agent Control
        </p>

        <div className="space-y-4">
          <Link
            href="/sessions"
            className="block w-full py-4 px-6 bg-terminal-green hover:bg-terminal-green/80 text-white rounded-lg font-medium transition-colors"
          >
            View My Sessions
          </Link>

          <div className="text-terminal-fg/50 text-sm">or connect to a new session</div>

          <Link
            href="/scan"
            className="block w-full py-4 px-6 bg-terminal-blue hover:bg-terminal-blue/80 text-white rounded-lg font-medium transition-colors"
          >
            Scan QR Code to Connect
          </Link>

          <Link
            href="/join"
            className="block w-full py-4 px-6 bg-terminal-black/50 hover:bg-terminal-black/70 border border-terminal-fg/20 text-terminal-fg rounded-lg font-medium transition-colors"
          >
            Enter Session ID Manually
          </Link>
        </div>

        <div className="mt-12 text-sm text-terminal-fg/40">
          <p>Start a session on your computer with:</p>
          <code className="block mt-2 p-3 bg-terminal-black/50 rounded-lg font-mono">
            always claude
          </code>
        </div>
      </div>
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="animate-spin w-8 h-8 border-2 border-terminal-blue border-t-transparent rounded-full" />
      </main>
    }>
      <HomeContent />
    </Suspense>
  );
}
