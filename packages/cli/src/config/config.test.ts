import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// Mock os module
vi.mock('os', () => ({
  homedir: vi.fn(() => '/mock/home'),
}));

// Store original env
const originalEnv = process.env;

describe('Config Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    // Reset env for each test
    process.env = { ...originalEnv };
    delete process.env.ALWAYS_CODER_SERVER;
    delete process.env.ALWAYS_CODER_WEB_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getConfigDir', () => {
    it('should return config directory path', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(mkdirSync).mockReturnValue(undefined);

      const { getConfigDir } = await import('./index.js');
      const dir = getConfigDir();

      expect(dir).toBe('/mock/home/.always-coder');
    });

    it('should create directory if it does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(mkdirSync).mockReturnValue(undefined);

      const { getConfigDir } = await import('./index.js');
      getConfigDir();

      expect(mkdirSync).toHaveBeenCalledWith('/mock/home/.always-coder', { recursive: true });
    });

    it('should not create directory if it already exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const { getConfigDir } = await import('./index.js');
      getConfigDir();

      expect(mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('getConfigPath', () => {
    it('should return config file path', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const { getConfigPath } = await import('./index.js');
      const path = getConfigPath();

      expect(path).toBe('/mock/home/.always-coder/config.json');
    });
  });

  describe('loadConfig', () => {
    it('should return default config when no config file exists', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const { loadConfig } = await import('./index.js');
      const config = loadConfig();

      expect(config).toEqual({
        server: '',
        webUrl: '',
      });
    });

    it('should load and parse config from file', async () => {
      // First call for local config (false), second for user config dir, third for config file
      vi.mocked(existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('config.local.json')) return false;
        if (String(path).includes('.always-coder')) return true;
        return true;
      });
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          server: 'wss://example.com',
          webUrl: 'https://web.example.com',
        })
      );

      const { loadConfig } = await import('./index.js');
      const config = loadConfig();

      expect(config.server).toBe('wss://example.com');
      expect(config.webUrl).toBe('https://web.example.com');
    });

    it('should merge with default config', async () => {
      vi.mocked(existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('config.local.json')) return false;
        return true;
      });
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          server: 'wss://example.com',
          // webUrl not provided
        })
      );

      const { loadConfig } = await import('./index.js');
      const config = loadConfig();

      expect(config.server).toBe('wss://example.com');
      expect(config.webUrl).toBe(''); // Default value
    });

    it('should return default config on JSON parse error', async () => {
      vi.mocked(existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('config.local.json')) return false;
        return true;
      });
      vi.mocked(readFileSync).mockReturnValue('invalid json');

      const { loadConfig } = await import('./index.js');

      // Suppress console.warn
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const config = loadConfig();
      warnSpy.mockRestore();

      expect(config).toEqual({
        server: '',
        webUrl: '',
      });
    });
  });

  describe('saveConfig', () => {
    it('should merge and save config to file', async () => {
      vi.mocked(existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('config.local.json')) return false;
        return true;
      });
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          server: 'wss://old.com',
          webUrl: 'https://old-web.com',
        })
      );
      vi.mocked(writeFileSync).mockReturnValue(undefined);

      const { saveConfig } = await import('./index.js');
      saveConfig({ server: 'wss://new.com' });

      expect(writeFileSync).toHaveBeenCalledWith(
        '/mock/home/.always-coder/config.json',
        expect.stringContaining('"server": "wss://new.com"')
      );
      expect(writeFileSync).toHaveBeenCalledWith(
        '/mock/home/.always-coder/config.json',
        expect.stringContaining('"webUrl": "https://old-web.com"')
      );
    });
  });

  describe('getConfigValue', () => {
    it('should return specific config value', async () => {
      vi.mocked(existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('config.local.json')) return false;
        return true;
      });
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          server: 'wss://example.com',
          webUrl: 'https://web.example.com',
        })
      );

      const { getConfigValue } = await import('./index.js');

      expect(getConfigValue('server')).toBe('wss://example.com');
      expect(getConfigValue('webUrl')).toBe('https://web.example.com');
    });
  });

  describe('setConfigValue', () => {
    it('should set specific config value', async () => {
      vi.mocked(existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('config.local.json')) return false;
        return true;
      });
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          server: '',
          webUrl: '',
        })
      );
      vi.mocked(writeFileSync).mockReturnValue(undefined);

      const { setConfigValue } = await import('./index.js');
      setConfigValue('server', 'wss://new-server.com');

      expect(writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"server": "wss://new-server.com"')
      );
    });
  });

  describe('getWSEndpoint', () => {
    it('should return server from environment variable first', async () => {
      process.env.ALWAYS_CODER_SERVER = 'wss://env-server.com';

      const { getWSEndpoint } = await import('./index.js');
      const endpoint = getWSEndpoint();

      expect(endpoint).toBe('wss://env-server.com');
    });

    it('should return server from config when env not set', async () => {
      vi.mocked(existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('config.local.json')) return false;
        return true;
      });
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          server: 'wss://config-server.com',
          webUrl: '',
        })
      );

      const { getWSEndpoint } = await import('./index.js');
      const endpoint = getWSEndpoint();

      expect(endpoint).toBe('wss://config-server.com');
    });

    it('should throw error when server not configured', async () => {
      vi.mocked(existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('config.local.json')) return false;
        return true;
      });
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          server: '',
          webUrl: '',
        })
      );

      const { getWSEndpoint } = await import('./index.js');

      expect(() => getWSEndpoint()).toThrow('Server URL not configured');
    });
  });

  describe('getWebUrl', () => {
    it('should return webUrl from environment variable first', async () => {
      process.env.ALWAYS_CODER_WEB_URL = 'https://env-web.com';

      const { getWebUrl } = await import('./index.js');
      const url = getWebUrl();

      expect(url).toBe('https://env-web.com');
    });

    it('should return webUrl from config when env not set', async () => {
      vi.mocked(existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('config.local.json')) return false;
        return true;
      });
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          server: '',
          webUrl: 'https://config-web.com',
        })
      );

      const { getWebUrl } = await import('./index.js');
      const url = getWebUrl();

      expect(url).toBe('https://config-web.com');
    });

    it('should throw error when webUrl not configured', async () => {
      vi.mocked(existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('config.local.json')) return false;
        return true;
      });
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          server: '',
          webUrl: '',
        })
      );

      const { getWebUrl } = await import('./index.js');

      expect(() => getWebUrl()).toThrow('Web URL not configured');
    });
  });
});
