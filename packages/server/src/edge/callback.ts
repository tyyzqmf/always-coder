/**
 * Lambda@Edge function for handling OAuth callback
 * Exchanges authorization code for tokens and sets cookies
 */

import type {
  CloudFrontRequestEvent,
  CloudFrontRequestResult,
} from 'aws-lambda';

// Configuration injected at build time
const CONFIG = {
  COGNITO_REGION: '__COGNITO_REGION__',
  USER_POOL_ID: '__USER_POOL_ID__',
  CLIENT_ID: '__CLIENT_ID__',
  CLIENT_SECRET: '__CLIENT_SECRET__',
  COGNITO_DOMAIN: '__COGNITO_DOMAIN__',
  CALLBACK_PATH: '/auth/callback',
};

interface TokenResponse {
  id_token: string;
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
}

interface StatePayload {
  returnUrl?: string;
}

/**
 * Parse query string parameters
 */
function parseQueryString(querystring: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (!querystring) {
    return params;
  }

  const pairs = querystring.split('&');
  for (const pair of pairs) {
    const [key, ...valueParts] = pair.split('=');
    if (key) {
      params[decodeURIComponent(key)] = decodeURIComponent(valueParts.join('='));
    }
  }

  return params;
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<TokenResponse> {
  const tokenUrl = `https://${CONFIG.COGNITO_DOMAIN}/oauth2/token`;

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CONFIG.CLIENT_ID,
    code,
    redirect_uri: redirectUri,
  });

  // Add client secret if configured
  if (CONFIG.CLIENT_SECRET && CONFIG.CLIENT_SECRET !== '__CLIENT_SECRET__') {
    body.set('client_secret', CONFIG.CLIENT_SECRET);
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
  }

  return await response.json() as TokenResponse;
}

/**
 * Parse state parameter to get return URL
 */
function parseState(state: string | undefined): StatePayload {
  if (!state) {
    return {};
  }

  try {
    const decoded = Buffer.from(state, 'base64').toString('utf-8');
    return JSON.parse(decoded) as StatePayload;
  } catch {
    console.error('Failed to parse state parameter');
    return {};
  }
}

/**
 * Generate Set-Cookie header value
 */
function generateCookie(
  name: string,
  value: string,
  maxAge: number,
  options: { httpOnly?: boolean; path?: string } = {}
): string {
  const parts = [
    `${name}=${value}`,
    'Secure',
    `SameSite=Lax`,
    `Max-Age=${maxAge}`,
    `Path=${options.path || '/'}`,
  ];

  if (options.httpOnly !== false) {
    parts.push('HttpOnly');
  }

  return parts.join('; ');
}

/**
 * Generate error response
 */
function generateErrorResponse(message: string, statusCode = '500'): CloudFrontRequestResult {
  return {
    status: statusCode,
    statusDescription: statusCode === '400' ? 'Bad Request' : 'Internal Server Error',
    headers: {
      'content-type': [{ key: 'Content-Type', value: 'text/html; charset=utf-8' }],
      'cache-control': [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
    },
    body: `
<!DOCTYPE html>
<html>
<head>
  <title>Authentication Error</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
    .error { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 400px; text-align: center; }
    h1 { color: #e53e3e; margin-bottom: 1rem; }
    p { color: #666; }
    a { color: #3182ce; }
  </style>
</head>
<body>
  <div class="error">
    <h1>Authentication Error</h1>
    <p>${message}</p>
    <p><a href="/">Return to Home</a></p>
  </div>
</body>
</html>
    `.trim(),
  };
}

/**
 * Main handler for OAuth callback
 */
export async function handler(event: CloudFrontRequestEvent): Promise<CloudFrontRequestResult> {
  const request = event.Records[0].cf.request;
  const params = parseQueryString(request.querystring);

  // Check for OAuth error
  if (params['error']) {
    const errorDescription = params['error_description'] || params['error'];
    console.error('OAuth error:', errorDescription);
    return generateErrorResponse(`Login failed: ${errorDescription}`, '400');
  }

  // Get authorization code
  const code = params['code'];
  if (!code) {
    console.error('No authorization code in callback');
    return generateErrorResponse('No authorization code provided', '400');
  }

  // Parse state to get return URL
  const state = parseState(params['state']);
  const returnUrl = state.returnUrl || '/';

  // Build redirect URI (must match what was used in the authorization request)
  const host = request.headers['host']?.[0]?.value || '';
  const redirectUri = `https://${host}${CONFIG.CALLBACK_PATH}`;

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, redirectUri);

    // Build cookie headers
    const cookieHeaders = [
      { key: 'Set-Cookie', value: generateCookie('id_token', tokens.id_token, tokens.expires_in) },
      { key: 'Set-Cookie', value: generateCookie('access_token', tokens.access_token, tokens.expires_in) },
    ];

    // Add refresh token if present (with restricted path)
    if (tokens.refresh_token) {
      cookieHeaders.push({
        key: 'Set-Cookie',
        value: generateCookie('refresh_token', tokens.refresh_token, 30 * 24 * 3600, { path: '/auth' }),
      });
    }

    // Validate return URL to prevent open redirect
    let safeReturnUrl = '/';
    try {
      const returnUrlObj = new URL(returnUrl);
      const hostObj = new URL(`https://${host}`);
      // Only allow same-origin redirects
      if (returnUrlObj.origin === hostObj.origin) {
        safeReturnUrl = returnUrlObj.pathname + returnUrlObj.search;
      }
    } catch {
      // If parsing fails, use relative URL if it starts with /
      if (returnUrl.startsWith('/') && !returnUrl.startsWith('//')) {
        safeReturnUrl = returnUrl;
      }
    }

    // Redirect back to original URL
    return {
      status: '302',
      statusDescription: 'Found',
      headers: {
        location: [{ key: 'Location', value: safeReturnUrl }],
        'set-cookie': cookieHeaders,
        'cache-control': [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    };
  } catch (error) {
    console.error('Token exchange error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return generateErrorResponse(`Failed to complete authentication: ${message}`);
  }
}
