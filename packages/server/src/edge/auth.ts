/**
 * Lambda@Edge function for Cognito JWT authentication
 * Validates JWT tokens from cookies and redirects unauthenticated users to Cognito Hosted UI
 */

import type {
  CloudFrontRequestEvent,
  CloudFrontRequestResult,
  CloudFrontRequest,
} from 'aws-lambda';

// Configuration injected at build time
const CONFIG = {
  COGNITO_REGION: '__COGNITO_REGION__',
  USER_POOL_ID: '__USER_POOL_ID__',
  CLIENT_ID: '__CLIENT_ID__',
  COGNITO_DOMAIN: '__COGNITO_DOMAIN__',
  CALLBACK_PATH: '/auth/callback',
  LOGOUT_PATH: '/auth/logout',
};

// Static assets that don't require authentication
const STATIC_ASSET_EXTENSIONS = [
  '.js',
  '.css',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.svg',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.map',
];

// JWKS cache
interface JWK {
  kid: string;
  kty: string;
  alg: string;
  use: string;
  n: string;
  e: string;
}

interface JWKS {
  keys: JWK[];
}

let jwksCache: JWKS | null = null;
let jwksCacheTime = 0;
const JWKS_CACHE_TTL = 3600000; // 1 hour

/**
 * Base64URL decode
 */
function base64UrlDecode(str: string): string {
  // Replace URL-safe characters and add padding
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  if (padding) {
    base64 += '='.repeat(4 - padding);
  }
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Parse JWT without verification (for extracting header and payload)
 */
function parseJwt(token: string): { header: Record<string, string>; payload: Record<string, unknown> } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    return {
      header: JSON.parse(base64UrlDecode(parts[0])),
      payload: JSON.parse(base64UrlDecode(parts[1])),
    };
  } catch {
    return null;
  }
}

/**
 * Convert base64url to ArrayBuffer for Web Crypto API
 */
function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  if (padding) {
    base64 += '='.repeat(4 - padding);
  }
  const binary = Buffer.from(base64, 'base64');
  return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
}

/**
 * Fetch JWKS from Cognito
 */
async function fetchJwks(): Promise<JWKS> {
  const now = Date.now();
  if (jwksCache && now - jwksCacheTime < JWKS_CACHE_TTL) {
    return jwksCache;
  }

  const jwksUrl = `https://cognito-idp.${CONFIG.COGNITO_REGION}.amazonaws.com/${CONFIG.USER_POOL_ID}/.well-known/jwks.json`;
  const response = await fetch(jwksUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.status}`);
  }

  jwksCache = await response.json() as JWKS;
  jwksCacheTime = now;
  return jwksCache;
}

/**
 * Verify JWT signature using Web Crypto API
 */
async function verifyJwtSignature(token: string, jwks: JWKS): Promise<boolean> {
  const parsed = parseJwt(token);
  if (!parsed) {
    return false;
  }

  const { header } = parsed;
  const kid = header.kid;

  // Find the matching key
  const key = jwks.keys.find((k) => k.kid === kid);
  if (!key) {
    console.error('No matching key found for kid:', kid);
    return false;
  }

  try {
    // Import the public key
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      {
        kty: key.kty,
        n: key.n,
        e: key.e,
        alg: key.alg,
        use: key.use,
      },
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: { name: 'SHA-256' },
      },
      false,
      ['verify']
    );

    // Get signature and data
    const parts = token.split('.');
    const signatureBuffer = base64UrlToArrayBuffer(parts[2]);
    const dataBuffer = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);

    // Verify signature
    const isValid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      signatureBuffer,
      dataBuffer
    );

    return isValid;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Validate JWT claims
 */
function validateClaims(payload: Record<string, unknown>): { valid: boolean; error?: string } {
  const now = Math.floor(Date.now() / 1000);

  // Check expiration
  const exp = payload.exp as number;
  if (!exp || now >= exp) {
    return { valid: false, error: 'Token expired' };
  }

  // Check not before (if present)
  const nbf = payload.nbf as number;
  if (nbf && now < nbf) {
    return { valid: false, error: 'Token not yet valid' };
  }

  // Check issuer
  const expectedIssuer = `https://cognito-idp.${CONFIG.COGNITO_REGION}.amazonaws.com/${CONFIG.USER_POOL_ID}`;
  if (payload.iss !== expectedIssuer) {
    return { valid: false, error: 'Invalid issuer' };
  }

  // Check audience (for id_token, it's the client_id)
  // Cognito uses 'aud' for id_token and 'client_id' for access_token
  const aud = payload.aud as string;
  const clientId = payload.client_id as string;
  if (aud !== CONFIG.CLIENT_ID && clientId !== CONFIG.CLIENT_ID) {
    return { valid: false, error: 'Invalid audience' };
  }

  // Check token_use (should be 'id' for id_token)
  const tokenUse = payload.token_use as string;
  if (tokenUse !== 'id' && tokenUse !== 'access') {
    return { valid: false, error: 'Invalid token_use' };
  }

  return { valid: true };
}

/**
 * Parse cookies from request headers
 */
function parseCookies(request: CloudFrontRequest): Record<string, string> {
  const cookies: Record<string, string> = {};
  const cookieHeader = request.headers['cookie'];

  if (cookieHeader) {
    for (const header of cookieHeader) {
      const pairs = header.value.split(';');
      for (const pair of pairs) {
        const [name, ...valueParts] = pair.trim().split('=');
        if (name) {
          cookies[name] = valueParts.join('=');
        }
      }
    }
  }

  return cookies;
}

/**
 * Check if the request is for a static asset
 */
function isStaticAsset(uri: string): boolean {
  const lowerUri = uri.toLowerCase();
  return STATIC_ASSET_EXTENSIONS.some((ext) => lowerUri.endsWith(ext));
}

/**
 * Generate cookie to clear (expire immediately)
 */
function generateClearCookie(name: string, path: string = '/'): string {
  return `${name}=; Max-Age=0; Path=${path}; Secure; SameSite=Lax`;
}

/**
 * Generate logout response - clears all auth cookies and redirects to Cognito logout
 */
function generateLogoutResponse(request: CloudFrontRequest): CloudFrontRequestResult {
  const host = request.headers['host']?.[0]?.value || '';

  // Clear all authentication cookies
  const clearCookies = [
    { key: 'Set-Cookie', value: generateClearCookie('id_token') },
    { key: 'Set-Cookie', value: generateClearCookie('access_token') },
    { key: 'Set-Cookie', value: generateClearCookie('refresh_token', '/auth') },
    { key: 'Set-Cookie', value: generateClearCookie('logged_in') },
    { key: 'Set-Cookie', value: generateClearCookie('user_email') },
  ];

  // Build Cognito logout URL - this will invalidate the Cognito session
  // and redirect back to our app (which will then redirect to login)
  // Note: Cognito hosted UI requires client_id, logout_uri AND redirect_uri
  const logoutUrl = new URL(`https://${CONFIG.COGNITO_DOMAIN}/logout`);
  logoutUrl.searchParams.set('client_id', CONFIG.CLIENT_ID);
  logoutUrl.searchParams.set('logout_uri', `https://${host}`);
  logoutUrl.searchParams.set('redirect_uri', `https://${host}`);

  return {
    status: '302',
    statusDescription: 'Found',
    headers: {
      location: [{ key: 'Location', value: logoutUrl.toString() }],
      'set-cookie': clearCookies,
      'cache-control': [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
    },
  };
}

/**
 * Generate redirect response to Cognito Hosted UI
 */
function generateLoginRedirect(request: CloudFrontRequest): CloudFrontRequestResult {
  const host = request.headers['host']?.[0]?.value || '';
  const protocol = 'https';
  const originalUrl = `${protocol}://${host}${request.uri}`;
  const querystring = request.querystring ? `?${request.querystring}` : '';
  const state = Buffer.from(JSON.stringify({ returnUrl: `${originalUrl}${querystring}` })).toString('base64');

  const callbackUrl = `${protocol}://${host}${CONFIG.CALLBACK_PATH}`;

  const loginUrl = new URL(`https://${CONFIG.COGNITO_DOMAIN}/login`);
  loginUrl.searchParams.set('client_id', CONFIG.CLIENT_ID);
  loginUrl.searchParams.set('response_type', 'code');
  loginUrl.searchParams.set('scope', 'email openid profile');
  loginUrl.searchParams.set('redirect_uri', callbackUrl);
  loginUrl.searchParams.set('state', state);

  return {
    status: '302',
    statusDescription: 'Found',
    headers: {
      location: [{ key: 'Location', value: loginUrl.toString() }],
      'cache-control': [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
    },
  };
}

/**
 * Main handler for Lambda@Edge viewer request
 */
export async function handler(event: CloudFrontRequestEvent): Promise<CloudFrontRequestResult> {
  const request = event.Records[0].cf.request;
  const uri = request.uri;

  // Skip authentication for static assets
  if (isStaticAsset(uri)) {
    return request;
  }

  // Skip authentication for callback path
  if (uri === CONFIG.CALLBACK_PATH || uri.startsWith(CONFIG.CALLBACK_PATH + '?')) {
    return request;
  }

  // Handle logout - clear cookies and redirect to home
  if (uri === CONFIG.LOGOUT_PATH) {
    return generateLogoutResponse(request);
  }

  // Parse cookies and get id_token
  const cookies = parseCookies(request);
  const idToken = cookies['id_token'];

  if (!idToken) {
    console.log('No id_token found, redirecting to login');
    return generateLoginRedirect(request);
  }

  // Parse and validate JWT
  const parsed = parseJwt(idToken);
  if (!parsed) {
    console.log('Invalid JWT format, redirecting to login');
    return generateLoginRedirect(request);
  }

  // Validate claims first (cheaper than signature verification)
  const claimsValidation = validateClaims(parsed.payload);
  if (!claimsValidation.valid) {
    console.log('Invalid claims:', claimsValidation.error);
    return generateLoginRedirect(request);
  }

  // Fetch JWKS and verify signature
  try {
    const jwks = await fetchJwks();
    const isValid = await verifyJwtSignature(idToken, jwks);

    if (!isValid) {
      console.log('Invalid JWT signature, redirecting to login');
      return generateLoginRedirect(request);
    }
  } catch (error) {
    console.error('Error verifying JWT:', error);
    return generateLoginRedirect(request);
  }

  // Token is valid, forward the request
  return request;
}
