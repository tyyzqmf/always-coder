/**
 * Cognito authentication module for CLI
 *
 * Provides login, logout, and token refresh functionality using
 * Amazon Cognito User Pools via username/password authentication.
 */

import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
  CognitoRefreshToken,
} from 'amazon-cognito-identity-js';
import { loadConfig, saveConfig } from '../config/index.js';

/**
 * Authentication result returned after successful login
 */
export interface AuthResult {
  userId: string;
  email?: string;
  authToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * Current user information
 */
export interface CurrentUser {
  userId: string;
  email?: string;
  isAuthenticated: boolean;
}

/**
 * Cognito configuration from environment or config
 */
interface CognitoConfig {
  userPoolId: string;
  clientId: string;
  region: string;
}

/**
 * Get Cognito configuration from local config or environment variables
 * Local config (from server) takes precedence
 */
function getCognitoConfig(): CognitoConfig {
  const config = loadConfig();

  // First try local config (fetched from server during login)
  if (config.cognitoUserPoolId && config.cognitoClientId) {
    return {
      userPoolId: config.cognitoUserPoolId,
      clientId: config.cognitoClientId,
      region: config.cognitoRegion || 'us-east-1',
    };
  }

  // Fall back to environment variables (for development)
  const userPoolId = process.env.ALWAYS_CODER_COGNITO_USER_POOL_ID || '';
  const clientId = process.env.ALWAYS_CODER_COGNITO_CLIENT_ID || '';
  const region = process.env.ALWAYS_CODER_COGNITO_REGION || 'us-east-1';

  if (!userPoolId || !clientId) {
    throw new Error(
      'Cognito configuration not found. Please run "always login" first.'
    );
  }

  return { userPoolId, clientId, region };
}

/**
 * Create a Cognito User Pool instance
 */
function createUserPool(): CognitoUserPool {
  const config = getCognitoConfig();
  return new CognitoUserPool({
    UserPoolId: config.userPoolId,
    ClientId: config.clientId,
  });
}

/**
 * Login with username and password
 *
 * @param username - Username (can be email if configured)
 * @param password - User password
 * @returns AuthResult with tokens and user information
 */
export async function login(username: string, password: string): Promise<AuthResult> {
  const userPool = createUserPool();

  const cognitoUser = new CognitoUser({
    Username: username,
    Pool: userPool,
  });

  const authenticationDetails = new AuthenticationDetails({
    Username: username,
    Password: password,
  });

  return new Promise((resolve, reject) => {
    cognitoUser.authenticateUser(authenticationDetails, {
      onSuccess: (session: CognitoUserSession) => {
        const idToken = session.getIdToken();
        const accessToken = session.getAccessToken();
        const refreshToken = session.getRefreshToken();

        // Extract user ID from the token
        const payload = idToken.decodePayload();
        const userId = payload.sub as string;
        const email = payload.email as string | undefined;

        const result: AuthResult = {
          userId,
          email,
          authToken: accessToken.getJwtToken(),
          refreshToken: refreshToken.getToken(),
          expiresAt: accessToken.getExpiration() * 1000,
        };

        // Save tokens to config
        saveConfig({
          userId,
          authToken: result.authToken,
          refreshToken: result.refreshToken,
        });

        resolve(result);
      },
      onFailure: (err) => {
        reject(new Error(err.message || 'Authentication failed'));
      },
      newPasswordRequired: () => {
        reject(
          new Error(
            'New password required. Please complete password reset in the AWS Console or web app.'
          )
        );
      },
    });
  });
}

/**
 * Logout - clear stored tokens
 */
export function logout(): void {
  const config = loadConfig();

  // If we have a valid session, sign out from Cognito
  if (config.authToken && config.userId) {
    try {
      const userPool = createUserPool();
      const cognitoUser = new CognitoUser({
        Username: config.userId,
        Pool: userPool,
      });
      cognitoUser.signOut();
    } catch {
      // Ignore errors during signout - we'll clear local tokens anyway
    }
  }

  // Clear local tokens
  saveConfig({
    userId: undefined,
    authToken: undefined,
    refreshToken: undefined,
  });
}

/**
 * Refresh the access token using the refresh token
 *
 * @returns New AuthResult with refreshed tokens
 */
export async function refreshTokens(): Promise<AuthResult> {
  const config = loadConfig();

  if (!config.refreshToken || !config.userId) {
    throw new Error('No refresh token available. Please login again.');
  }

  const userPool = createUserPool();
  const cognitoUser = new CognitoUser({
    Username: config.userId,
    Pool: userPool,
  });

  const refreshToken = new CognitoRefreshToken({
    RefreshToken: config.refreshToken,
  });

  return new Promise((resolve, reject) => {
    cognitoUser.refreshSession(refreshToken, (err, session: CognitoUserSession) => {
      if (err) {
        reject(new Error(err.message || 'Token refresh failed'));
        return;
      }

      const idToken = session.getIdToken();
      const accessToken = session.getAccessToken();
      const newRefreshToken = session.getRefreshToken();

      const payload = idToken.decodePayload();
      const userId = payload.sub as string;
      const email = payload.email as string | undefined;

      const result: AuthResult = {
        userId,
        email,
        authToken: accessToken.getJwtToken(),
        refreshToken: newRefreshToken.getToken(),
        expiresAt: accessToken.getExpiration() * 1000,
      };

      // Save new tokens
      saveConfig({
        userId,
        authToken: result.authToken,
        refreshToken: result.refreshToken,
      });

      resolve(result);
    });
  });
}

/**
 * Get current user information without making network calls
 * Returns null if not logged in
 */
export function getCurrentUser(): CurrentUser | null {
  const config = loadConfig();

  if (!config.authToken || !config.userId) {
    return null;
  }

  // Try to decode the token to get user info
  try {
    const payload = JSON.parse(
      Buffer.from(config.authToken.split('.')[1], 'base64').toString('utf-8')
    );

    return {
      userId: config.userId,
      email: payload.email,
      isAuthenticated: true,
    };
  } catch {
    // Token is invalid or expired
    return {
      userId: config.userId,
      email: undefined,
      isAuthenticated: true,
    };
  }
}

/**
 * Check if the current token is expired
 */
export function isTokenExpired(): boolean {
  const config = loadConfig();

  if (!config.authToken) {
    return true;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(config.authToken.split('.')[1], 'base64').toString('utf-8')
    );

    const exp = payload.exp as number;
    // Consider expired if less than 5 minutes remaining
    return Date.now() >= (exp - 300) * 1000;
  } catch {
    return true;
  }
}

/**
 * Ensure we have a valid token, refreshing if necessary
 *
 * @returns Valid auth token or null if login required
 */
export async function ensureValidToken(): Promise<string | null> {
  const config = loadConfig();

  if (!config.authToken) {
    return null;
  }

  if (!isTokenExpired()) {
    return config.authToken;
  }

  // Try to refresh
  try {
    const result = await refreshTokens();
    return result.authToken;
  } catch {
    // Refresh failed, need to login again
    return null;
  }
}
