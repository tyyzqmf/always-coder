import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionStatus, type Session } from '@always-coder/shared';
import {
  createSession,
  getSession,
  joinSession,
  leaveSession,
  handleCliDisconnect,
  reconnectSession,
  updateSessionStatus,
  deleteSession,
  isSessionActive,
} from './session.js';

// Mock the DynamoDB utilities
vi.mock('../utils/dynamodb.js', () => ({
  createSession: vi.fn(),
  getSession: vi.fn(),
  updateSession: vi.fn(),
  addWebConnection: vi.fn(),
  removeWebConnection: vi.fn(),
  deleteSession: vi.fn(),
}));

import {
  createSession as dbCreateSession,
  getSession as dbGetSession,
  updateSession as dbUpdateSession,
  addWebConnection as dbAddWebConnection,
  removeWebConnection as dbRemoveWebConnection,
  deleteSession as dbDeleteSession,
} from '../utils/dynamodb.js';

describe('Session Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createSession', () => {
    it('should create a new session with correct initial values', async () => {
      const sessionId = 'ABC123';
      const cliConnectionId = 'conn-cli-001';
      const cliPublicKey = 'publickey123';
      const userId = 'user-001';

      vi.mocked(dbCreateSession).mockResolvedValue(undefined);

      const session = await createSession(sessionId, cliConnectionId, cliPublicKey, userId);

      expect(dbCreateSession).toHaveBeenCalledTimes(1);
      const callArg = vi.mocked(dbCreateSession).mock.calls[0][0];

      expect(callArg.sessionId).toBe(sessionId);
      expect(callArg.cliConnectionId).toBe(cliConnectionId);
      expect(callArg.cliPublicKey).toBe(cliPublicKey);
      expect(callArg.userId).toBe(userId);
      expect(callArg.webConnectionIds).toEqual([]);
      expect(callArg.status).toBe(SessionStatus.PENDING);
      expect(callArg.createdAt).toBeDefined();
      expect(callArg.lastActiveAt).toBeDefined();

      expect(session.sessionId).toBe(sessionId);
      expect(session.status).toBe(SessionStatus.PENDING);
    });

    it('should create session without userId', async () => {
      vi.mocked(dbCreateSession).mockResolvedValue(undefined);

      await createSession('ABC123', 'conn-001', 'pubkey');

      const callArg = vi.mocked(dbCreateSession).mock.calls[0][0];
      expect(callArg.userId).toBeUndefined();
    });
  });

  describe('getSession', () => {
    it('should return session when found', async () => {
      const mockSession: Session = {
        sessionId: 'ABC123',
        cliConnectionId: 'conn-001',
        cliPublicKey: 'pubkey',
        webConnectionIds: [],
        status: SessionStatus.ACTIVE,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        ttl: 0,
      };

      vi.mocked(dbGetSession).mockResolvedValue(mockSession);

      const result = await getSession('ABC123');

      expect(dbGetSession).toHaveBeenCalledWith('ABC123');
      expect(result).toEqual(mockSession);
    });

    it('should return null when session not found', async () => {
      vi.mocked(dbGetSession).mockResolvedValue(null);

      const result = await getSession('NOTFOUND');

      expect(result).toBeNull();
    });
  });

  describe('joinSession', () => {
    it('should add web connection and activate session', async () => {
      const mockSession: Session = {
        sessionId: 'ABC123',
        cliConnectionId: 'conn-cli-001',
        cliPublicKey: 'pubkey',
        webConnectionIds: ['conn-web-001'],
        status: SessionStatus.PENDING,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        ttl: 0,
      };

      vi.mocked(dbAddWebConnection).mockResolvedValue(mockSession);
      vi.mocked(dbUpdateSession).mockResolvedValue({ ...mockSession, status: SessionStatus.ACTIVE });

      const result = await joinSession('ABC123', 'conn-web-001');

      expect(dbAddWebConnection).toHaveBeenCalledWith('ABC123', 'conn-web-001');
      expect(dbUpdateSession).toHaveBeenCalledWith('ABC123', { status: SessionStatus.ACTIVE });
      expect(result?.status).toBe(SessionStatus.ACTIVE);
    });

    it('should not activate if CLI is not connected', async () => {
      const mockSession: Session = {
        sessionId: 'ABC123',
        cliConnectionId: '', // CLI disconnected
        cliPublicKey: 'pubkey',
        webConnectionIds: ['conn-web-001'],
        status: SessionStatus.PENDING,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        ttl: 0,
      };

      vi.mocked(dbAddWebConnection).mockResolvedValue(mockSession);

      const result = await joinSession('ABC123', 'conn-web-001');

      expect(dbUpdateSession).not.toHaveBeenCalled();
      expect(result).toEqual(mockSession);
    });

    it('should return null when session not found', async () => {
      vi.mocked(dbAddWebConnection).mockResolvedValue(null);

      const result = await joinSession('NOTFOUND', 'conn-001');

      expect(result).toBeNull();
    });
  });

  describe('leaveSession', () => {
    it('should remove web connection and pause session when no more connections', async () => {
      const mockSession: Session = {
        sessionId: 'ABC123',
        cliConnectionId: 'conn-cli-001',
        cliPublicKey: 'pubkey',
        webConnectionIds: [], // Empty after removal
        status: SessionStatus.ACTIVE,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        ttl: 0,
      };

      vi.mocked(dbRemoveWebConnection).mockResolvedValue(mockSession);
      vi.mocked(dbUpdateSession).mockResolvedValue({ ...mockSession, status: SessionStatus.PAUSED });

      const result = await leaveSession('ABC123', 'conn-web-001');

      expect(dbRemoveWebConnection).toHaveBeenCalledWith('ABC123', 'conn-web-001');
      expect(dbUpdateSession).toHaveBeenCalledWith('ABC123', { status: SessionStatus.PAUSED });
      expect(result?.status).toBe(SessionStatus.PAUSED);
    });

    it('should not pause session when other connections remain', async () => {
      const mockSession: Session = {
        sessionId: 'ABC123',
        cliConnectionId: 'conn-cli-001',
        cliPublicKey: 'pubkey',
        webConnectionIds: ['conn-web-002'], // Still has a connection
        status: SessionStatus.ACTIVE,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        ttl: 0,
      };

      vi.mocked(dbRemoveWebConnection).mockResolvedValue(mockSession);

      const result = await leaveSession('ABC123', 'conn-web-001');

      expect(dbUpdateSession).not.toHaveBeenCalled();
      expect(result).toEqual(mockSession);
    });
  });

  describe('handleCliDisconnect', () => {
    it('should close session and clear CLI connection', async () => {
      const mockSession: Session = {
        sessionId: 'ABC123',
        cliConnectionId: '',
        cliPublicKey: 'pubkey',
        webConnectionIds: [],
        status: SessionStatus.CLOSED,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        ttl: 0,
      };

      vi.mocked(dbUpdateSession).mockResolvedValue(mockSession);

      const result = await handleCliDisconnect('ABC123');

      expect(dbUpdateSession).toHaveBeenCalledWith('ABC123', {
        status: SessionStatus.CLOSED,
        cliConnectionId: '',
      });
      expect(result?.status).toBe(SessionStatus.CLOSED);
    });
  });

  describe('reconnectSession', () => {
    it('should update CLI connection and reset to pending', async () => {
      const mockSession: Session = {
        sessionId: 'ABC123',
        cliConnectionId: 'new-conn-001',
        cliPublicKey: 'pubkey',
        webConnectionIds: [],
        status: SessionStatus.PENDING,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        ttl: 0,
      };

      vi.mocked(dbUpdateSession).mockResolvedValue(mockSession);

      const result = await reconnectSession('ABC123', 'new-conn-001');

      expect(dbUpdateSession).toHaveBeenCalledWith('ABC123', {
        cliConnectionId: 'new-conn-001',
        status: SessionStatus.PENDING,
        lastActiveAt: expect.any(Number),
      });
      expect(result?.cliConnectionId).toBe('new-conn-001');
    });
  });

  describe('updateSessionStatus', () => {
    it('should update session status', async () => {
      const mockSession: Session = {
        sessionId: 'ABC123',
        cliConnectionId: 'conn-001',
        cliPublicKey: 'pubkey',
        webConnectionIds: [],
        status: SessionStatus.ACTIVE,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        ttl: 0,
      };

      vi.mocked(dbUpdateSession).mockResolvedValue(mockSession);

      await updateSessionStatus('ABC123', SessionStatus.ACTIVE);

      expect(dbUpdateSession).toHaveBeenCalledWith('ABC123', { status: SessionStatus.ACTIVE });
    });
  });

  describe('deleteSession', () => {
    it('should delete session', async () => {
      vi.mocked(dbDeleteSession).mockResolvedValue(undefined);

      await deleteSession('ABC123');

      expect(dbDeleteSession).toHaveBeenCalledWith('ABC123');
    });
  });

  describe('isSessionActive', () => {
    it('should return true for PENDING session', async () => {
      vi.mocked(dbGetSession).mockResolvedValue({
        sessionId: 'ABC123',
        cliConnectionId: 'conn-001',
        cliPublicKey: 'pubkey',
        webConnectionIds: [],
        status: SessionStatus.PENDING,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        ttl: 0,
      });

      const result = await isSessionActive('ABC123');

      expect(result).toBe(true);
    });

    it('should return true for ACTIVE session', async () => {
      vi.mocked(dbGetSession).mockResolvedValue({
        sessionId: 'ABC123',
        cliConnectionId: 'conn-001',
        cliPublicKey: 'pubkey',
        webConnectionIds: ['web-001'],
        status: SessionStatus.ACTIVE,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        ttl: 0,
      });

      const result = await isSessionActive('ABC123');

      expect(result).toBe(true);
    });

    it('should return true for PAUSED session', async () => {
      vi.mocked(dbGetSession).mockResolvedValue({
        sessionId: 'ABC123',
        cliConnectionId: 'conn-001',
        cliPublicKey: 'pubkey',
        webConnectionIds: [],
        status: SessionStatus.PAUSED,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        ttl: 0,
      });

      const result = await isSessionActive('ABC123');

      expect(result).toBe(true);
    });

    it('should return false for CLOSED session', async () => {
      vi.mocked(dbGetSession).mockResolvedValue({
        sessionId: 'ABC123',
        cliConnectionId: '',
        cliPublicKey: 'pubkey',
        webConnectionIds: [],
        status: SessionStatus.CLOSED,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        ttl: 0,
      });

      const result = await isSessionActive('ABC123');

      expect(result).toBe(false);
    });

    it('should return false when session not found', async () => {
      vi.mocked(dbGetSession).mockResolvedValue(null);

      const result = await isSessionActive('NOTFOUND');

      expect(result).toBe(false);
    });
  });
});
