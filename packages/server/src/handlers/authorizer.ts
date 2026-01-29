import type { APIGatewayRequestAuthorizerHandler, APIGatewayAuthorizerResult } from 'aws-lambda';

/**
 * Optional Cognito authorizer for authenticated sessions
 *
 * This authorizer is optional - the system supports both:
 * 1. Anonymous mode: No authorization required
 * 2. Authenticated mode: Cognito JWT validation
 *
 * Configure API Gateway to use this authorizer only if authentication is required.
 */
export const handler: APIGatewayRequestAuthorizerHandler = async (
  event
): Promise<APIGatewayAuthorizerResult> => {
  const token = event.queryStringParameters?.token || event.headers?.Authorization;

  console.log('Authorizer invoked:', {
    methodArn: event.methodArn,
    hasToken: !!token,
  });

  // If no token is provided, allow anonymous access
  // This enables anonymous mode while still supporting authenticated sessions
  if (!token) {
    return generatePolicy('anonymous', 'Allow', event.methodArn, {
      userId: 'anonymous',
      isAuthenticated: 'false',
    });
  }

  try {
    // In a real implementation, validate the Cognito JWT here
    // For now, we'll accept any token and extract the user ID
    // You would typically use:
    // 1. Fetch Cognito JWKS
    // 2. Verify token signature
    // 3. Check token expiration
    // 4. Extract claims

    // Placeholder: Accept token and use it as user ID for demo
    // In production, decode and validate the JWT
    const userId = extractUserIdFromToken(token);

    return generatePolicy(userId, 'Allow', event.methodArn, {
      userId,
      isAuthenticated: 'true',
    });
  } catch (error) {
    console.error('Authorization failed:', error);
    return generatePolicy('unauthorized', 'Deny', event.methodArn);
  }
};

/**
 * Extract user ID from token (placeholder implementation)
 */
function extractUserIdFromToken(token: string): string {
  // In production, decode the JWT and extract the 'sub' claim
  // For now, just return the token as the user ID
  try {
    const parts = token.replace('Bearer ', '').split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      return payload.sub || payload.username || 'unknown';
    }
  } catch {
    // Ignore parse errors
  }
  return 'unknown';
}

/**
 * Generate IAM policy for API Gateway
 */
function generatePolicy(
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string,
  context?: Record<string, string>
): APIGatewayAuthorizerResult {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource,
        },
      ],
    },
    context,
  };
}
