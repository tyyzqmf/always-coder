import type { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';

/**
 * $connect handler - Called when a WebSocket connection is established
 *
 * At this point, we only record the connection exists.
 * Session association happens on the first message (SESSION_CREATE or SESSION_JOIN).
 */
export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId;
  const timestamp = event.requestContext.connectedAt;

  console.log('WebSocket connected:', {
    connectionId,
    timestamp,
    sourceIp: event.requestContext.identity?.sourceIp,
  });

  // We don't create the connection record here because we don't know
  // the session ID yet. The connection will be created when the client
  // sends SESSION_CREATE or SESSION_JOIN.

  return {
    statusCode: 200,
    body: 'Connected',
  };
};
