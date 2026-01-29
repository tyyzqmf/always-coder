'use client';

import { useEffect, useState } from 'react';
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

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // User is always logged in if they can see this page (Lambda@Edge blocks unauthenticated users)
  const isLoggedIn = true;
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    setUserEmail(getUserEmail());
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
      {/* User info and logout button in top right */}
      {isLoggedIn && (
        <div className="absolute top-4 right-4 flex items-center gap-3">
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
            href="/scan"
            className="block w-full py-4 px-6 bg-terminal-blue hover:bg-terminal-blue/80 text-white rounded-lg font-medium transition-colors"
          >
            Scan QR Code to Connect
          </Link>

          <div className="text-terminal-fg/50 text-sm">or</div>

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
