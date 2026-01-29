'use client';

import { useState, useCallback, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function JoinPage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback((e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedSessionId = sessionId.trim().toUpperCase();
    const trimmedPublicKey = publicKey.trim();

    if (!trimmedSessionId) {
      setError('Session ID is required');
      return;
    }

    if (trimmedSessionId.length !== 6) {
      setError('Session ID should be 6 characters');
      return;
    }

    if (!trimmedPublicKey) {
      setError('Public key is required');
      return;
    }

    // Navigate to session page
    const params = new URLSearchParams({
      key: trimmedPublicKey,
    });
    router.push(`/session/${trimmedSessionId}?${params.toString()}`);
  }, [sessionId, publicKey, router]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-terminal-bg">
      <div className="max-w-md w-full">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-terminal-fg/60 hover:text-terminal-fg mb-8 transition-colors"
        >
          ← Back to Home
        </Link>

        <h1 className="text-2xl font-bold text-terminal-fg mb-2">
          Join Session
        </h1>
        <p className="text-terminal-fg/60 mb-8">
          Enter the session details from your terminal
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="sessionId"
              className="block text-sm text-terminal-fg/80 mb-1"
            >
              Session ID
            </label>
            <input
              id="sessionId"
              type="text"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              className="w-full px-4 py-3 bg-terminal-black/50 border border-terminal-fg/20 rounded-lg text-terminal-fg font-mono text-lg tracking-wider placeholder:text-terminal-fg/30 focus:outline-none focus:border-terminal-blue transition-colors"
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="publicKey"
              className="block text-sm text-terminal-fg/80 mb-1"
            >
              Public Key
            </label>
            <input
              id="publicKey"
              type="text"
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              placeholder="Base64 encoded public key..."
              className="w-full px-4 py-3 bg-terminal-black/50 border border-terminal-fg/20 rounded-lg text-terminal-fg font-mono text-sm placeholder:text-terminal-fg/30 focus:outline-none focus:border-terminal-blue transition-colors"
            />
            <p className="mt-1 text-xs text-terminal-fg/40">
              Copy this from the terminal output
            </p>
          </div>

          {error && (
            <p className="text-terminal-red text-sm">{error}</p>
          )}

          <button
            type="submit"
            className="w-full py-3 px-4 bg-terminal-blue hover:bg-terminal-blue/80 text-white rounded-lg font-medium transition-colors"
          >
            Connect to Session
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-terminal-fg/40 text-sm">
            Prefer scanning?{' '}
            <Link href="/scan" className="text-terminal-blue hover:underline">
              Scan QR code
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
