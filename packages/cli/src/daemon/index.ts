import { spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import { getConfigDir } from '../config/index.js';

/**
 * Daemon session info
 */
export interface DaemonSession {
  sessionId: string;
  pid: number;
  command: string;
  args: string[];
  startedAt: number;
  webUrl: string;
  logFile: string;
}

/**
 * Get the sessions directory path
 */
export function getSessionsDir(): string {
  const dir = join(getConfigDir(), 'sessions');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Get the logs directory path
 */
export function getLogsDir(): string {
  const dir = join(getConfigDir(), 'logs');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Get session file path
 */
export function getSessionFile(sessionId: string): string {
  return join(getSessionsDir(), `${sessionId}.json`);
}

/**
 * Save daemon session info
 */
export function saveDaemonSession(session: DaemonSession): void {
  const filePath = getSessionFile(session.sessionId);
  writeFileSync(filePath, JSON.stringify(session, null, 2));
}

/**
 * Load daemon session info
 */
export function loadDaemonSession(sessionId: string): DaemonSession | null {
  const filePath = getSessionFile(sessionId);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Delete daemon session info
 */
export function deleteDaemonSession(sessionId: string): void {
  const filePath = getSessionFile(sessionId);
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

/**
 * List all daemon sessions
 */
export function listDaemonSessions(): DaemonSession[] {
  const sessionsDir = getSessionsDir();
  const sessions: DaemonSession[] = [];

  try {
    const files = readdirSync(sessionsDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = join(sessionsDir, file);
        try {
          const session = JSON.parse(readFileSync(filePath, 'utf-8')) as DaemonSession;
          sessions.push(session);
        } catch {
          // Skip invalid files
        }
      }
    }
  } catch {
    // Directory might not exist
  }

  return sessions;
}

/**
 * Check if a process is running
 */
export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clean up stale sessions (processes that are no longer running)
 */
export function cleanupStaleSessions(): void {
  const sessions = listDaemonSessions();
  for (const session of sessions) {
    if (!isProcessRunning(session.pid)) {
      deleteDaemonSession(session.sessionId);
    }
  }
}

/**
 * Stop a daemon session
 */
export function stopDaemonSession(sessionId: string): boolean {
  const session = loadDaemonSession(sessionId);
  if (!session) {
    return false;
  }

  try {
    process.kill(session.pid, 'SIGTERM');
    deleteDaemonSession(sessionId);
    return true;
  } catch {
    // Process might already be dead
    deleteDaemonSession(sessionId);
    return false;
  }
}

/**
 * Start a daemon process
 */
export function startDaemon(
  command: string,
  args: string[],
  serverUrl?: string
): { sessionId: string; pid: number; logFile: string } {
  const logsDir = getLogsDir();
  const timestamp = Date.now();
  const logFile = join(logsDir, `session-${timestamp}.log`);

  // Get the path to the current script
  const scriptPath = process.argv[1];

  // Build arguments for the daemon process
  const daemonArgs = [
    scriptPath,
    command,
    ...args,
    '--daemon-child', // Internal flag to indicate this is a daemon child
  ];

  if (serverUrl) {
    daemonArgs.push('--server', serverUrl);
  }

  // Pass log file path via environment
  const env = {
    ...process.env,
    ALWAYS_CODER_DAEMON: 'true',
    ALWAYS_CODER_LOG_FILE: logFile,
  };

  // Spawn detached process
  const child = spawn(process.execPath, daemonArgs, {
    detached: true,
    stdio: 'ignore',
    env,
  });

  child.unref();

  // Generate a temporary session ID (will be replaced by actual session ID)
  const tempSessionId = `daemon-${timestamp}`;

  return {
    sessionId: tempSessionId,
    pid: child.pid!,
    logFile,
  };
}
