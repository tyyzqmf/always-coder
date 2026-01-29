'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';

// Dynamic import QRScanner to avoid SSR issues with html5-qrcode
const QRScanner = dynamic(
  () => import('@/components/QRScanner/QRScanner').then((mod) => mod.QRScanner),
  { ssr: false, loading: () => <div className="w-full max-w-sm h-80 bg-terminal-black/50 rounded-xl animate-pulse" /> }
);

interface QRCodeData {
  sessionId: string;
  publicKey: string;
  wsEndpoint: string;
}

export default function ScanPage() {
  const router = useRouter();

  const handleScan = useCallback((data: QRCodeData) => {
    // Navigate to session page with the scanned data
    const params = new URLSearchParams({
      id: data.sessionId,
      key: data.publicKey,
    });
    router.push(`/session?${params.toString()}`);
  }, [router]);

  const handleError = useCallback((error: string) => {
    console.error('Scanner error:', error);
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-terminal-bg">
      <div className="max-w-lg w-full">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-terminal-fg/60 hover:text-terminal-fg mb-8 transition-colors"
        >
          ← Back to Home
        </Link>

        <h1 className="text-2xl font-bold text-terminal-fg mb-2">
          Scan QR Code
        </h1>
        <p className="text-terminal-fg/60 mb-8">
          Scan the QR code displayed in your terminal to connect
        </p>

        <QRScanner onScan={handleScan} onError={handleError} />

        <div className="mt-8 text-center">
          <p className="text-terminal-fg/40 text-sm">
            Or{' '}
            <Link href="/join" className="text-terminal-blue hover:underline">
              enter session ID manually
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
