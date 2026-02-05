import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Connection } from '@always-coder/shared';

// Mock the DynamoDB utilities
vi.mock('../utils/dynamodb.js', () => ({
  createConnection: vi.fn(),
  getConnection: vi.fn(),
  deleteConnection: vi.fn(),
  getConnectionsBySession: vi.fn(),
}));

import {
  createConnection,
  getConnection,
  deleteConnection,
  getConnectionsBySession,
} from '../utils/dynamodb.js';
import {
  registerConnection,
  findConnection,
  unregisterConnection,
  findConnectionsForSession,
  findCliConnection,
  findWebConnections,
} from './connection.js';

describe('Connection Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('registerConnection', () => {
    it('should create a new CLI connection', async () => {
      vi.mocked(createConnection).mockResolvedValue(undefined);

      const result = await registerConnection('conn-123', 'session-abc', 'cli', 'pubkey123', 'user-1');

      expect(createConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionId: 'conn-123',
          sessionId: 'session-abc',
          role: 'cli',
          publicKey: 'pubkey123',
          userId: 'user-1',
        })
      );
      expect(result.connectionId).toBe('conn-123');
      expect(result.sessionId).toBe('session-abc');
      expect(result.role).toBe('cli');
    });

    it('should create a web connection without userId', async () => {
      vi.mocked(createConnection).mockResolvedValue(undefined);

      const result = await registerConnection('conn-456', 'session-abc', 'web', 'pubkey456');

      expect(createConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionId: 'conn-456',
          sessionId: 'session-abc',
          role: 'web',
          publicKey: 'pubkey456',
          userId: undefined,
        })
      );
      expect(result.role).toBe('web');
    });

    it('should include connectedAt timestamp', async () => {
      vi.mocked(createConnection).mockResolvedValue(undefined);
      const before = Date.now();

      const result = await registerConnection('conn-789', 'session-xyz', 'cli');

      expect(result.connectedAt).toBeGreaterThanOrEqual(before);
      expect(result.connectedAt).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('findConnection', () => {
    it('should return connection when found', async () => {
      const mockConnection: Connection = {
        connectionId: 'conn-123',
        sessionId: 'session-abc',
        role: 'cli',
        connectedAt: Date.now(),
        ttl: 12345,
      };
      vi.mocked(getConnection).mockResolvedValue(mockConnection);

      const result = await findConnection('conn-123');

      expect(getConnection).toHaveBeenCalledWith('conn-123');
      expect(result).toEqual(mockConnection);
    });

    it('should return null when connection not found', async () => {
      vi.mocked(getConnection).mockResolvedValue(null);

      const result = await findConnection('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('unregisterConnection', () => {
    it('should delete the connection', async () => {
      vi.mocked(deleteConnection).mockResolvedValue(undefined);

      await unregisterConnection('conn-123');

      expect(deleteConnection).toHaveBeenCalledWith('conn-123');
    });
  });

  describe('findConnectionsForSession', () => {
    it('should return all connections for a session', async () => {
      const mockConnections: Connection[] = [
        { connectionId: 'conn-1', sessionId: 'session-abc', role: 'cli', connectedAt: Date.now(), ttl: 0 },
        { connectionId: 'conn-2', sessionId: 'session-abc', role: 'web', connectedAt: Date.now(), ttl: 0 },
      ];
      vi.mocked(getConnectionsBySession).mockResolvedValue(mockConnections);

      const result = await findConnectionsForSession('session-abc');

      expect(getConnectionsBySession).toHaveBeenCalledWith('session-abc');
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no connections found', async () => {
      vi.mocked(getConnectionsBySession).mockResolvedValue([]);

      const result = await findConnectionsForSession('no-connections');

      expect(result).toEqual([]);
    });
  });

  describe('findCliConnection', () => {
    it('should return CLI connection when present', async () => {
      const cliConnection: Connection = {
        connectionId: 'conn-cli',
        sessionId: 'session-abc',
        role: 'cli',
        connectedAt: Date.now(),
        ttl: 0,
      };
      const webConnection: Connection = {
        connectionId: 'conn-web',
        sessionId: 'session-abc',
        role: 'web',
        connectedAt: Date.now(),
        ttl: 0,
      };
      vi.mocked(getConnectionsBySession).mockResolvedValue([cliConnection, webConnection]);

      const result = await findCliConnection('session-abc');

      expect(result).toEqual(cliConnection);
    });

    it('should return null when no CLI connection', async () => {
      const webConnection: Connection = {
        connectionId: 'conn-web',
        sessionId: 'session-abc',
        role: 'web',
        connectedAt: Date.now(),
        ttl: 0,
      };
      vi.mocked(getConnectionsBySession).mockResolvedValue([webConnection]);

      const result = await findCliConnection('session-abc');

      expect(result).toBeNull();
    });
  });

  describe('findWebConnections', () => {
    it('should return only web connections', async () => {
      const cliConnection: Connection = {
        connectionId: 'conn-cli',
        sessionId: 'session-abc',
        role: 'cli',
        connectedAt: Date.now(),
        ttl: 0,
      };
      const webConnection1: Connection = {
        connectionId: 'conn-web-1',
        sessionId: 'session-abc',
        role: 'web',
        connectedAt: Date.now(),
        ttl: 0,
      };
      const webConnection2: Connection = {
        connectionId: 'conn-web-2',
        sessionId: 'session-abc',
        role: 'web',
        connectedAt: Date.now(),
        ttl: 0,
      };
      vi.mocked(getConnectionsBySession).mockResolvedValue([cliConnection, webConnection1, webConnection2]);

      const result = await findWebConnections('session-abc');

      expect(result).toHaveLength(2);
      expect(result.every((c) => c.role === 'web')).toBe(true);
    });

    it('should return empty array when no web connections', async () => {
      const cliConnection: Connection = {
        connectionId: 'conn-cli',
        sessionId: 'session-abc',
        role: 'cli',
        connectedAt: Date.now(),
        ttl: 0,
      };
      vi.mocked(getConnectionsBySession).mockResolvedValue([cliConnection]);

      const result = await findWebConnections('session-abc');

      expect(result).toEqual([]);
    });
  });
});
