import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from './manager.js';

// Mock dependencies
vi.mock('../websocket/client.js', () => ({
  WebSocketClient: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    sendSessionCreate: vi.fn(),
    sendSessionReconnect: vi.fn(),
    sendSessionUpdate: vi.fn(),
    sendEncrypted: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock('../pty/terminal.js', () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    start: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    isRunning: vi.fn().mockReturnValue(true),
    getDimensions: vi.fn().mockReturnValue({ cols: 80, rows: 24 }),
  })),
}));

vi.mock('../qrcode/generator.js', () => ({
  displayQRCode: vi.fn(),
}));

vi.mock('../config/index.js', () => ({
  getWSEndpoint: vi.fn().mockReturnValue('wss://test.example.com'),
  getWebUrl: vi.fn().mockReturnValue('https://test.example.com'),
  loadConfig: vi.fn().mockReturnValue({}),
}));

vi.mock('../utils/instance.js', () => ({
  getInstanceInfo: vi.fn().mockResolvedValue({
    instanceId: 'test-instance',
    hostname: 'test-host',
    label: 'Test',
  }),
}));

describe('SessionManager', () => {
  describe('input filtering', () => {
    it('should have input filter enabled by default', () => {
      const manager = new SessionManager({
        command: 'bash',
      });

      // Access private property for testing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inputFilter = (manager as any).inputFilter;
      expect(inputFilter).toBeDefined();

      const config = inputFilter.getConfig();
      expect(config.blockCtrlC).toBe(true);
      expect(config.blockCtrlD).toBe(true);
    });

    it('should allow disabling input filter via options', () => {
      const manager = new SessionManager({
        command: 'bash',
        filterWebInput: false,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inputFilter = (manager as any).inputFilter;
      const config = inputFilter.getConfig();
      expect(config.blockCtrlC).toBe(false);
      expect(config.blockCtrlD).toBe(false);
    });

    it('should allow custom input filter config', () => {
      const manager = new SessionManager({
        command: 'bash',
        inputFilterConfig: {
          blockCtrlC: false, // Allow Ctrl+C
          blockCtrlD: true, // Block Ctrl+D
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inputFilter = (manager as any).inputFilter;
      const config = inputFilter.getConfig();
      expect(config.blockCtrlC).toBe(false);
      expect(config.blockCtrlD).toBe(true);
    });
  });

  describe('filterWebInput', () => {
    let manager: SessionManager;

    beforeEach(() => {
      manager = new SessionManager({
        command: 'bash',
      });
    });

    afterEach(() => {
      manager.close();
    });

    it('should filter Ctrl+C from web input', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (manager as any).filterWebInput('\x03');
      expect(result.blocked).toBe(true);
      expect(result.data).toBe('');
      expect(result.blockedSignals).toContain('SIGINT');
    });

    it('should filter Ctrl+D from web input', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (manager as any).filterWebInput('\x04');
      expect(result.blocked).toBe(true);
      expect(result.data).toBe('');
      expect(result.blockedSignals).toContain('EOF');
    });

    it('should pass through normal text', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (manager as any).filterWebInput('hello world');
      expect(result.blocked).toBe(false);
      expect(result.data).toBe('hello world');
    });

    it('should preserve text while removing signals', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (manager as any).filterWebInput('hello\x03world');
      expect(result.blocked).toBe(true);
      expect(result.data).toBe('helloworld');
    });
  });
});
