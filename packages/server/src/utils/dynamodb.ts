import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
  QueryCommand,
  type GetCommandInput,
  type PutCommandInput,
  type DeleteCommandInput,
  type UpdateCommandInput,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import type { Connection, Session, CachedMessage } from '@always-coder/shared';
import { PROTOCOL } from '@always-coder/shared';

// Initialize DynamoDB client
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

// Table names from environment
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || 'always-coder-connections';
const SESSIONS_TABLE = process.env.SESSIONS_TABLE || 'always-coder-sessions';
const MESSAGES_TABLE = process.env.MESSAGES_TABLE || 'always-coder-messages';

/**
 * Calculate TTL timestamp
 */
function getTTL(seconds: number = PROTOCOL.SESSION_TTL): number {
  return Math.floor(Date.now() / 1000) + seconds;
}

// ==================== Connection Operations ====================

export async function createConnection(connection: Omit<Connection, 'ttl'>): Promise<void> {
  const input: PutCommandInput = {
    TableName: CONNECTIONS_TABLE,
    Item: {
      ...connection,
      ttl: getTTL(),
    },
  };
  await docClient.send(new PutCommand(input));
}

export async function getConnection(connectionId: string): Promise<Connection | null> {
  const input: GetCommandInput = {
    TableName: CONNECTIONS_TABLE,
    Key: { connectionId },
  };
  const result = await docClient.send(new GetCommand(input));
  return (result.Item as Connection) || null;
}

export async function deleteConnection(connectionId: string): Promise<void> {
  const input: DeleteCommandInput = {
    TableName: CONNECTIONS_TABLE,
    Key: { connectionId },
  };
  await docClient.send(new DeleteCommand(input));
}

export async function getConnectionsBySession(sessionId: string): Promise<Connection[]> {
  const input: QueryCommandInput = {
    TableName: CONNECTIONS_TABLE,
    IndexName: 'sessionId-index',
    KeyConditionExpression: 'sessionId = :sid',
    ExpressionAttributeValues: { ':sid': sessionId },
  };
  const result = await docClient.send(new QueryCommand(input));
  return (result.Items as Connection[]) || [];
}

// ==================== Session Operations ====================

export async function createSession(session: Omit<Session, 'ttl'>): Promise<void> {
  const input: PutCommandInput = {
    TableName: SESSIONS_TABLE,
    Item: {
      ...session,
      ttl: getTTL(),
    },
  };
  await docClient.send(new PutCommand(input));
}

export async function getSession(sessionId: string): Promise<Session | null> {
  const input: GetCommandInput = {
    TableName: SESSIONS_TABLE,
    Key: { sessionId },
  };
  const result = await docClient.send(new GetCommand(input));
  return (result.Item as Session) || null;
}

export async function updateSession(
  sessionId: string,
  updates: Partial<Session>
): Promise<Session | null> {
  const updateExpressions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, unknown> = {};

  // Track which fields are being updated to avoid duplicates
  const updatedFields = new Set<string>();

  Object.entries(updates).forEach(([key, value]) => {
    if (value !== undefined && key !== 'sessionId') {
      const attrName = `#${key}`;
      const attrValue = `:${key}`;
      updateExpressions.push(`${attrName} = ${attrValue}`);
      expressionAttributeNames[attrName] = key;
      expressionAttributeValues[attrValue] = value;
      updatedFields.add(key);
    }
  });

  // Always update lastActiveAt and ttl (unless already provided in updates)
  if (!updatedFields.has('lastActiveAt')) {
    updateExpressions.push('#lastActiveAt = :lastActiveAt');
    expressionAttributeNames['#lastActiveAt'] = 'lastActiveAt';
    expressionAttributeValues[':lastActiveAt'] = Date.now();
  }

  if (!updatedFields.has('ttl')) {
    updateExpressions.push('#ttl = :ttl');
    expressionAttributeNames['#ttl'] = 'ttl';
    expressionAttributeValues[':ttl'] = getTTL();
  }

  const input: UpdateCommandInput = {
    TableName: SESSIONS_TABLE,
    Key: { sessionId },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW',
  };

  const result = await docClient.send(new UpdateCommand(input));
  return (result.Attributes as Session) || null;
}

export async function addWebConnection(
  sessionId: string,
  webConnectionId: string
): Promise<Session | null> {
  const input: UpdateCommandInput = {
    TableName: SESSIONS_TABLE,
    Key: { sessionId },
    UpdateExpression:
      'SET webConnectionIds = list_append(if_not_exists(webConnectionIds, :empty), :newConn), lastActiveAt = :now, #ttl = :ttl',
    ExpressionAttributeNames: { '#ttl': 'ttl' },
    ExpressionAttributeValues: {
      ':newConn': [webConnectionId],
      ':empty': [],
      ':now': Date.now(),
      ':ttl': getTTL(),
    },
    ReturnValues: 'ALL_NEW',
  };

  const result = await docClient.send(new UpdateCommand(input));
  return (result.Attributes as Session) || null;
}

export async function removeWebConnection(
  sessionId: string,
  webConnectionId: string
): Promise<Session | null> {
  // First get the session to find the index
  const session = await getSession(sessionId);
  if (!session) return null;

  const index = session.webConnectionIds.indexOf(webConnectionId);
  if (index === -1) return session;

  const input: UpdateCommandInput = {
    TableName: SESSIONS_TABLE,
    Key: { sessionId },
    UpdateExpression: `REMOVE webConnectionIds[${index}] SET lastActiveAt = :now, #ttl = :ttl`,
    ExpressionAttributeNames: { '#ttl': 'ttl' },
    ExpressionAttributeValues: {
      ':now': Date.now(),
      ':ttl': getTTL(),
    },
    ReturnValues: 'ALL_NEW',
  };

  const result = await docClient.send(new UpdateCommand(input));
  return (result.Attributes as Session) || null;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const input: DeleteCommandInput = {
    TableName: SESSIONS_TABLE,
    Key: { sessionId },
  };
  await docClient.send(new DeleteCommand(input));
}

/**
 * Get all sessions for a user
 * Requires a GSI on userId
 */
export async function getSessionsByUser(
  userId: string,
  includeInactive: boolean = false
): Promise<Session[]> {
  const input: QueryCommandInput = {
    TableName: SESSIONS_TABLE,
    IndexName: 'userId-index',
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
    ScanIndexForward: false, // Most recent first
  };

  // Filter out closed sessions unless includeInactive is true
  if (!includeInactive) {
    input.FilterExpression = '#status <> :closed';
    input.ExpressionAttributeNames = { '#status': 'status' };
    input.ExpressionAttributeValues![':closed'] = 'closed';
  }

  const result = await docClient.send(new QueryCommand(input));
  return (result.Items as Session[]) || [];
}

// ==================== Message Cache Operations ====================

export async function cacheMessage(message: Omit<CachedMessage, 'ttl'>): Promise<void> {
  const input: PutCommandInput = {
    TableName: MESSAGES_TABLE,
    Item: {
      ...message,
      ttl: getTTL(PROTOCOL.MESSAGE_CACHE_TTL),
    },
  };
  await docClient.send(new PutCommand(input));
}

export async function getRecentMessages(
  sessionId: string,
  limit: number = PROTOCOL.MAX_CACHED_MESSAGES
): Promise<CachedMessage[]> {
  const input: QueryCommandInput = {
    TableName: MESSAGES_TABLE,
    KeyConditionExpression: 'sessionId = :sid',
    ExpressionAttributeValues: { ':sid': sessionId },
    ScanIndexForward: true, // Ascending order by seq
    Limit: limit,
  };

  const result = await docClient.send(new QueryCommand(input));
  return (result.Items as CachedMessage[]) || [];
}

export async function getMessagesSince(
  sessionId: string,
  sinceSeq: number
): Promise<CachedMessage[]> {
  const input: QueryCommandInput = {
    TableName: MESSAGES_TABLE,
    KeyConditionExpression: 'sessionId = :sid AND seq > :seq',
    ExpressionAttributeValues: {
      ':sid': sessionId,
      ':seq': sinceSeq,
    },
    ScanIndexForward: true,
  };

  const result = await docClient.send(new QueryCommand(input));
  return (result.Items as CachedMessage[]) || [];
}
