import type { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';

/**
 * Authorizer context from Lambda authorizer
 */
interface AuthorizerContext {
  userId: string;
  email: string;
  isAuthenticated: string;
}

/**
 * $connect handler - Called when a WebSocket connection is established
 *
 * At this point, we only record the connection exists.
 * Session association happens on the first message (SESSION_CREATE or SESSION_JOIN).
 */
export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId;
  const timestamp = event.requestContext.connectedAt;

  // Extract authorizer context
  const authorizer = event.requestContext.authorizer as AuthorizerContext | undefined;
  const userId = authorizer?.userId || 'anonymous';
  const isAuthenticated = authorizer?.isAuthenticated === 'true';

  console.log('WebSocket connected:', {
    connectionId,
    timestamp,
    sourceIp: event.requestContext.identity?.sourceIp,
    userId,
    isAuthenticated,
  });

  // We don't create the connection record here because we don't know
  // the session ID yet. The connection will be created when the client
  // sends SESSION_CREATE or SESSION_JOIN.

  return {
    statusCode: 200,
    body: 'Connected',
  };
};
