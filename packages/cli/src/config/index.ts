import { homedir } from 'os';
import { join, dirname } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'fs';
import { fileURLToPath } from 'url';

/**
 * Configuration interface
 */
export interface Config {
  server: string;
  webUrl: string;
  userId?: string;
  authToken?: string;
  refreshToken?: string;
  instanceLabel?: string;
  // Cognito configuration (fetched from server)
  cognitoUserPoolId?: string;
  cognitoClientId?: string;
  cognitoRegion?: string;
}

/**
 * Server configuration returned by the server's /api/config endpoint
 */
export interface ServerConfig {
  server: string;
  webUrl: string;
  cognito: {
    userPoolId: string;
    clientId: string;
    region: string;
  };
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
 * Merges local config (server/webUrl) with user config (auth tokens)
 * User config auth tokens take precedence
 */
export function loadConfig(): Config {
  let config = { ...DEFAULT_CONFIG };

  // Try local config first (for development - server/webUrl)
  const localConfigPath = getLocalConfigPath();
  if (existsSync(localConfigPath)) {
    try {
      const content = readFileSync(localConfigPath, 'utf-8');
      const localConfig = JSON.parse(content);
      config = { ...config, ...localConfig };
    } catch (error) {
      console.warn('Failed to load local config:', error);
    }
  }

  // Merge user config (auth tokens override local config)
  const configPath = getConfigPath();
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, 'utf-8');
      const userConfig = JSON.parse(content);
      config = { ...config, ...userConfig };
    } catch (error) {
      console.warn('Failed to load user config:', error);
    }
  }

  return config;
}

/**
 * Save configuration to file
 * Sets file permissions to 0600 (owner read/write only) for security
 */
export function saveConfig(config: Partial<Config>): void {
  const configPath = getConfigPath();
  const existing = loadConfig();
  const merged = { ...existing, ...config };

  writeFileSync(configPath, JSON.stringify(merged, null, 2));

  // Security: Set file permissions to 0600 (owner read/write only)
  // This protects auth tokens from being read by other users
  try {
    chmodSync(configPath, 0o600);
  } catch {
    // Ignore permission errors on Windows
  }
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
      'Web URL not configured. Please run: always login'
    );
  }
  return webUrl;
}

/**
 * Validate and normalize a URL
 * @throws Error if URL is invalid
 */
export function validateAndNormalizeUrl(url: string): string {
  const trimmed = url.trim();

  if (!trimmed) {
    throw new Error('URL cannot be empty');
  }

  // Add https if no protocol specified
  let normalized = trimmed;
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = `https://${normalized}`;
  }

  // Remove trailing slash
  normalized = normalized.replace(/\/+$/, '');

  // Validate URL format
  try {
    const parsed = new URL(normalized);
    // Only allow http/https protocols
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only HTTP/HTTPS URLs are allowed');
    }
    // Prevent localhost in production (optional security measure)
    // if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
    //   console.warn('Warning: Using localhost URL');
    // }
    return normalized;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Invalid URL format: ${trimmed}`);
    }
    throw error;
  }
}

/**
 * Fetch server configuration from a given URL
 * The server should expose /api/config.json with ServerConfig
 *
 * @param serverUrl - The base URL of the server (e.g., https://app.example.com)
 * @returns ServerConfig with all necessary configuration
 */
export async function fetchServerConfig(serverUrl: string): Promise<ServerConfig> {
  // Validate and normalize the URL
  const baseUrl = validateAndNormalizeUrl(serverUrl);

  const configUrl = `${baseUrl}/api/config.json`;

  try {
    const response = await fetch(configUrl, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const config = (await response.json()) as ServerConfig;

    // Validate required fields
    if (!config.server || !config.webUrl || !config.cognito) {
      throw new Error('Invalid server configuration: missing required fields');
    }

    return config;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Failed to connect to ${configUrl}. Please check the URL and try again.`);
    }
    throw new Error(
      `Failed to fetch server configuration from ${configUrl}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Save server configuration to local config
 */
export function saveServerConfig(serverConfig: ServerConfig): void {
  saveConfig({
    server: serverConfig.server,
    webUrl: serverConfig.webUrl,
    cognitoUserPoolId: serverConfig.cognito.userPoolId,
    cognitoClientId: serverConfig.cognito.clientId,
    cognitoRegion: serverConfig.cognito.region,
  });
}

/**
 * Check if server is configured
 */
export function isServerConfigured(): boolean {
  const config = loadConfig();
  return !!(config.server && config.webUrl && config.cognitoUserPoolId && config.cognitoClientId);
}
