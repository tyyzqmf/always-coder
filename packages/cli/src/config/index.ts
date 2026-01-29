import { homedir } from 'os';
import { join, dirname } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

/**
 * Configuration interface
 */
export interface Config {
  server: string;
  webUrl: string;
  userId?: string;
  authToken?: string;
}

/**
 * Default configuration (empty - must be configured by user)
 */
const DEFAULT_CONFIG: Config = {
  server: '',
  webUrl: '',
};

/**
 * Get the CLI package directory
 */
function getCliDir(): string {
  // Get directory relative to this file (src/config/index.ts -> packages/cli)
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return join(currentDir, '..', '..');
}

/**
 * Get path to local config file (for development)
 */
function getLocalConfigPath(): string {
  return join(getCliDir(), 'config.local.json');
}

/**
 * Get the config directory path
 */
export function getConfigDir(): string {
  const dir = join(homedir(), '.always-coder');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Get the config file path
 */
export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

/**
 * Load configuration from file
 * Priority: 1. Local config (config.local.json) 2. User config (~/.always-coder/config.json)
 */
export function loadConfig(): Config {
  // Try local config first (for development)
  const localConfigPath = getLocalConfigPath();
  if (existsSync(localConfigPath)) {
    try {
      const content = readFileSync(localConfigPath, 'utf-8');
      const config = JSON.parse(content);
      return { ...DEFAULT_CONFIG, ...config };
    } catch (error) {
      console.warn('Failed to load local config:', error);
    }
  }

  // Fall back to user config
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);
    return { ...DEFAULT_CONFIG, ...config };
  } catch (error) {
    console.warn('Failed to load config:', error);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save configuration to file
 */
export function saveConfig(config: Partial<Config>): void {
  const configPath = getConfigPath();
  const existing = loadConfig();
  const merged = { ...existing, ...config };

  writeFileSync(configPath, JSON.stringify(merged, null, 2));
}

/**
 * Get a specific config value
 */
export function getConfigValue<K extends keyof Config>(key: K): Config[K] {
  const config = loadConfig();
  return config[key];
}

/**
 * Set a specific config value
 */
export function setConfigValue<K extends keyof Config>(key: K, value: Config[K]): void {
  saveConfig({ [key]: value });
}

/**
 * Get WebSocket endpoint from config or environment
 * @throws Error if server is not configured
 */
export function getWSEndpoint(): string {
  // Environment variable takes precedence
  if (process.env.ALWAYS_CODER_SERVER) {
    return process.env.ALWAYS_CODER_SERVER;
  }
  const server = loadConfig().server;
  if (!server) {
    throw new Error(
      'Server URL not configured. Please set it via:\n' +
        '  - Environment variable: ALWAYS_CODER_SERVER=wss://your-server-url\n' +
        '  - Or run: always-coder config set server <your-server-url>'
    );
  }
  return server;
}

/**
 * Get Web URL from config or environment
 * @throws Error if web URL is not configured
 */
export function getWebUrl(): string {
  // Environment variable takes precedence
  if (process.env.ALWAYS_CODER_WEB_URL) {
    return process.env.ALWAYS_CODER_WEB_URL;
  }
  const webUrl = loadConfig().webUrl;
  if (!webUrl) {
    throw new Error(
      'Web URL not configured. Please set it via:\n' +
        '  - Environment variable: ALWAYS_CODER_WEB_URL=https://your-web-url\n' +
        '  - Or run: always-coder config set webUrl <your-web-url>'
    );
  }
  return webUrl;
}
