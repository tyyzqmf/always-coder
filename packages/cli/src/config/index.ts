import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

/**
 * Configuration interface
 */
export interface Config {
  server: string;
  userId?: string;
  authToken?: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Config = {
  server: 'wss://your-api-id.execute-api.us-east-1.amazonaws.com/prod',
};

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
 */
export function loadConfig(): Config {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);
    return { ...DEFAULT_CONFIG, ...config };
  } catch (error) {
    console.warn('Failed to load config, using defaults:', error);
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
 */
export function getWSEndpoint(): string {
  // Environment variable takes precedence
  if (process.env.ALWAYS_CODER_SERVER) {
    return process.env.ALWAYS_CODER_SERVER;
  }
  return loadConfig().server;
}
