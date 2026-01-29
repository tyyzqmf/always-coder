'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface QRCodeData {
  sessionId: string;
  publicKey: string;
  wsEndpoint: string;
}

interface QRScannerProps {
  onScan: (data: QRCodeData) => void;
  onError?: (error: string) => void;
}

export function QRScanner({ onScan, onError }: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;

    const startScanning = async () => {
      try {
        setIsScanning(true);
        setError(null);

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            try {
              const data = JSON.parse(decodedText) as QRCodeData;

              // Validate data structure
              if (!data.sessionId || !data.publicKey) {
                throw new Error('Invalid QR code data');
              }

              scanner.stop().catch(console.error);
              setIsScanning(false);
              onScan(data);
            } catch {
              console.error('Invalid QR code format');
              setError('Invalid QR code. Please scan an Always Coder QR code.');
            }
          },
          () => {
            // Ignore decode failures (happens frequently while scanning)
          }
        );
      } catch (err) {
        console.error('Failed to start camera:', err);
        const message = err instanceof Error ? err.message : 'Failed to start camera';
        setError(message);
        onError?.(message);
        setIsScanning(false);
      }
    };

    startScanning();

    return () => {
      if (scanner.isScanning) {
        scanner.stop().catch(console.error);
      }
    };
  }, [onScan, onError]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        id="qr-reader"
        className="w-full max-w-sm rounded-xl overflow-hidden bg-terminal-black/50"
      />

      {isScanning && !error && (
        <p className="text-terminal-fg/60 text-sm">Point your camera at the QR code</p>
      )}

      {error && (
        <div className="text-terminal-red text-sm text-center max-w-sm">
          <p className="font-medium">Camera Error</p>
          <p className="mt-1 text-terminal-fg/60">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 px-4 py-2 bg-terminal-blue rounded-lg text-white text-sm"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
