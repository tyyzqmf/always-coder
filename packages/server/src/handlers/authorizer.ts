import type { APIGatewayRequestAuthorizerHandler, APIGatewayAuthorizerResult } from 'aws-lambda';

/**
 * JWKS (JSON Web Key Set) types
 */
interface JWK {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
}

interface JWKS {
  keys: JWK[];
}

/**
 * JWT Header and Payload types
 */
interface JWTHeader {
  alg: string;
  kid: string;
  typ?: string;
}

interface JWTPayload {
  sub: string;
  email?: string;
  exp: number;
  iat: number;
  iss: string;
  aud?: string;
  client_id?: string;
  token_use?: string;
  [key: string]: unknown;
}

/**
 * JWKS cache
 */
let jwksCache: { keys: Map<string, JWK>; fetchedAt: number } | null = null;
const JWKS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Environment variables
 */
const COGNITO_REGION = process.env.COGNITO_REGION!;
const USER_POOL_ID = process.env.USER_POOL_ID!;
const CLIENT_ID = process.env.CLIENT_ID!;

/**
 * WebSocket API Gateway Lambda Authorizer
 *
 * Validates Cognito JWT tokens from the query string.
 * Supports both authenticated and anonymous access.
 */
export const handler: APIGatewayRequestAuthorizerHandler = async (event): Promise<APIGatewayAuthorizerResult> => {
  const methodArn = event.methodArn;

  console.log('Authorizer invoked:', {
    methodArn,
    hasToken: !!event.queryStringParameters?.token,
  });

  try {
    const token = event.queryStringParameters?.token;

    // Anonymous access: allow connection without token
    if (!token) {
      console.log('No token provided, allowing anonymous access');
      return generatePolicy('anonymous', 'Allow', methodArn, {
        userId: 'anonymous',
        email: '',
        isAuthenticated: 'false',
      });
    }

    // Validate the JWT token
    const payload = await verifyToken(token);

    console.log('Token verified successfully:', {
      sub: payload.sub,
      email: payload.email,
    });

    return generatePolicy(payload.sub, 'Allow', methodArn, {
      userId: payload.sub,
      email: payload.email || '',
      isAuthenticated: 'true',
    });
  } catch (error) {
    console.error('Authorization failed:', error);

    // Deny access for invalid tokens
    return generatePolicy('unauthorized', 'Deny', methodArn, {
      userId: '',
      email: '',
      isAuthenticated: 'false',
    });
  }
};

/**
 * Verify a Cognito JWT token
 */
async function verifyToken(token: string): Promise<JWTPayload> {
  // Parse the token (without verification first)
  const { header, payload } = parseJWT(token);

  // Validate claims
  validateClaims(payload);

  // Get the public key for this token
  const publicKey = await getPublicKey(header.kid);

  // Verify the signature
  await verifySignature(token, publicKey);

  return payload;
}

/**
 * Parse a JWT token without verification
 */
function parseJWT(token: string): { header: JWTHeader; payload: JWTPayload; signature: string } {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const header = JSON.parse(base64UrlDecode(parts[0])) as JWTHeader;
  const payload = JSON.parse(base64UrlDecode(parts[1])) as JWTPayload;
  const signature = parts[2];

  return { header, payload, signature };
}

/**
 * Validate JWT claims
 */
function validateClaims(payload: JWTPayload): void {
  const now = Math.floor(Date.now() / 1000);

  // Check expiration
  if (!payload.exp || payload.exp < now) {
    throw new Error('Token has expired');
  }

  // Check issuer
  const expectedIssuer = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${USER_POOL_ID}`;
  if (payload.iss !== expectedIssuer) {
    throw new Error(`Invalid issuer: ${payload.iss}`);
  }

  // Check audience (client_id for access tokens, aud for id tokens)
  const audience = payload.client_id || payload.aud;
  if (audience !== CLIENT_ID) {
    throw new Error(`Invalid audience: ${audience}`);
  }

  // Check token_use (should be 'access' or 'id')
  if (payload.token_use && !['access', 'id'].includes(payload.token_use)) {
    throw new Error(`Invalid token_use: ${payload.token_use}`);
  }
}

/**
 * Get the public key for a specific key ID
 */
async function getPublicKey(kid: string): Promise<JWK> {
  // Check cache
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_CACHE_TTL) {
    const key = jwksCache.keys.get(kid);
    if (key) {
      return key;
    }
  }

  // Fetch JWKS from Cognito
  const jwksUrl = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`;

  console.log('Fetching JWKS from:', jwksUrl);

  const response = await fetch(jwksUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.status}`);
  }

  const jwks = (await response.json()) as JWKS;

  // Update cache
  jwksCache = {
    keys: new Map(jwks.keys.map((key) => [key.kid, key])),
    fetchedAt: Date.now(),
  };

  const key = jwksCache.keys.get(kid);
  if (!key) {
    throw new Error(`Key not found: ${kid}`);
  }

  return key;
}

/**
 * Verify JWT signature using Web Crypto API
 */
async function verifySignature(token: string, jwk: JWK): Promise<void> {
  if (jwk.alg !== 'RS256') {
    throw new Error(`Unsupported algorithm: ${jwk.alg}`);
  }

  const parts = token.split('.');
  const signedContent = `${parts[0]}.${parts[1]}`;
  const signature = base64UrlToArrayBuffer(parts[2]);

  // Import the public key
  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: jwk.kty,
      n: jwk.n,
      e: jwk.e,
      alg: jwk.alg,
      use: jwk.use,
    },
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['verify']
  );

  // Verify the signature
  const encoder = new TextEncoder();
  const isValid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    signature,
    encoder.encode(signedContent)
  );

  if (!isValid) {
    throw new Error('Invalid signature');
  }
}

/**
 * Base64URL decode to string
 */
function base64UrlDecode(input: string): string {
  // Convert base64url to base64
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');

  // Add padding if needed
  const padding = base64.length % 4;
  if (padding) {
    base64 += '='.repeat(4 - padding);
  }

  // Decode
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Base64URL to ArrayBuffer
 */
function base64UrlToArrayBuffer(input: string): ArrayBuffer {
  // Convert base64url to base64
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');

  // Add padding if needed
  const padding = base64.length % 4;
  if (padding) {
    base64 += '='.repeat(4 - padding);
  }

  // Decode to buffer
  const buffer = Buffer.from(base64, 'base64');
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

/**
 * Generate an IAM policy for the authorizer response
 */
function generatePolicy(
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string,
  context: { userId: string; email: string; isAuthenticated: string }
): APIGatewayAuthorizerResult {
  // Extract the base resource ARN (without the route)
  // Format: arn:aws:execute-api:region:account:api-id/stage/$connect
  const arnParts = resource.split('/');
  const baseArn = arnParts.slice(0, 2).join('/');

  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          // Allow all routes for this API stage
          Resource: `${baseArn}/*`,
        },
      ],
    },
    context,
  };
}
