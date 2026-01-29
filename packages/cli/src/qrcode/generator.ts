import qrcode from 'qrcode-terminal';
import type { QRCodeData } from '@always-coder/shared';

/**
 * Generate and display QR code in terminal
 */
export function displayQRCode(data: QRCodeData): void {
  const jsonData = JSON.stringify(data);

  console.log('\n');
  console.log('📱 Scan this QR code with Always Coder Web to connect:');
  console.log('');

  qrcode.generate(jsonData, { small: true }, (qrString) => {
    console.log(qrString);
  });

  console.log('');
  console.log(`Session ID: ${data.sessionId}`);
  console.log('');
  console.log('Or open this URL in your browser:');
  console.log(`${getWebUrl(data)}`);
  console.log('');
}

/**
 * Generate web URL for manual access
 */
export function getWebUrl(data: QRCodeData): string {
  // Construct URL to web app with session info
  const baseUrl = process.env.ALWAYS_CODER_WEB_URL || 'http://localhost:3000';
  return `${baseUrl}/session?id=${data.sessionId}&key=${encodeURIComponent(data.publicKey)}`;
}

/**
 * Display session info without QR code
 */
export function displaySessionInfo(sessionId: string, publicKey: string): void {
  console.log('\n');
  console.log('🔗 Session Information:');
  console.log(`   Session ID: ${sessionId}`);
  console.log(`   Public Key: ${publicKey.substring(0, 20)}...`);
  console.log('');
}
