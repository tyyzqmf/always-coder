import qrcode from 'qrcode-terminal';
import type { QRCodeData } from '@always-coder/shared';
import { getWebUrl as getWebUrlFromConfig } from '../config/index.js';

/**
 * Generate and display QR code in terminal
 */
export function displayQRCode(data: QRCodeData): void {
  // Use URL instead of JSON so phone cameras can directly open the link
  const webUrl = getWebUrl(data);

  console.log('\n');
  console.log('📱 Scan this QR code to connect:');
  console.log('');

  qrcode.generate(webUrl, { small: true }, (qrString) => {
    console.log(qrString);
  });

  console.log('');
  console.log(`Session ID: ${data.sessionId}`);
  console.log('');
  console.log('Or open this URL in your browser:');
  console.log(`${webUrl}`);
  console.log('');
}

/**
 * Generate web URL for manual access
 */
export function getWebUrl(data: QRCodeData): string {
  // Construct URL to web app with session info
  const baseUrl = getWebUrlFromConfig();
  return `${baseUrl}/session?id=${data.sessionId}&key=${encodeURIComponent(data.publicKey)}`;
}

