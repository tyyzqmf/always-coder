#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import { execFileSync } from 'child_process';
import { SessionManager } from './session/manager.js';
import {
  loadConfig,
  getConfigValue,
  setConfigValue,
  fetchServerConfig,
  saveServerConfig,
  isServerConfigured,
} from './config/index.js';
import { login, logout, getCurrentUser } from './auth/cognito.js';
import {
  startDaemon,
  listDaemonSessions,
  stopDaemonSession,
  cleanupStaleSessions,
  cleanAllSessions,
  isProcessRunning,
  waitForSession,
} from './daemon/index.js';
import { getInstanceInfo, getInstanceDisplayName } from './utils/instance.js';
import { fetchRemoteSessions } from './session/remote.js';
import type { RemoteSessionInfo } from '@always-coder/shared';

// In daemon mode, ignore SIGHUP early to prevent termination
if (process.env.ALWAYS_CODER_DAEMON === 'true') {
  process.on('SIGHUP', () => {
    // Ignore SIGHUP in daemon mode
  });
}

// Check if a command exists in PATH
// SECURITY: Uses execFileSync with array args to prevent command injection
function commandExists(cmd: string): boolean {
  // Validate input - only allow safe characters in command names
  if (!/^[a-zA-Z0-9_\-./]+$/.test(cmd)) {
    return false;
  }

  try {
    // Use execFileSync which doesn't spawn a shell, preventing injection
    execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Format uptime duration as human-readable string
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

const program = new Command();

program
  .name('always')
  .description('Always Coder - Remote AI coding agent control')
  .version('1.0.0');

// Main command: wrap a command (using default command to avoid conflict with subcommands)
program
  .command('run [command] [args...]', { isDefault: true })
  .description('Run a command with remote terminal access (default: claude)')
  .option('-s, --server <url>', 'WebSocket server URL')
  .option('-d, --daemon', 'Run in background (daemon mode)')
  .option('--daemon-child', 'Internal flag for daemon child process')
  .allowUnknownOption()  // Pass unknown options through to the child command
  .action(async (command: string | undefined, args: string[], options: { server?: string; daemon?: boolean; daemonChild?: boolean }) => {
    // Handle command that contains spaces (e.g., "sleep 300")
    let cmd = command || 'claude';
    let cmdArgs = args;

    // Check if command exists (skip check for daemon child processes)
    const isDaemonChildEarly = options.daemonChild || process.env.ALWAYS_CODER_DAEMON === 'true';
    if (!isDaemonChildEarly && cmd !== 'claude' && !commandExists(cmd.split(/\s+/)[0])) {
      console.error(chalk.red(`Error: Command '${cmd}' not found`));
      console.log('');
      program.help();
      return;
    }
    if (cmd.includes(' ')) {
      const parts = cmd.split(/\s+/);
      cmd = parts[0];
      cmdArgs = [...parts.slice(1), ...args];
    }

    // Check if this is a daemon child process
    const isDaemonChild = options.daemonChild || process.env.ALWAYS_CODER_DAEMON === 'true';
    const logFile = process.env.ALWAYS_CODER_LOG_FILE;

    // If --daemon flag is set, start a daemon and exit
    if (options.daemon && !isDaemonChild) {
      console.log(chalk.cyan('╔═══════════════════════════════════════════════════════════╗'));
      console.log(chalk.cyan('║           Always Coder - Daemon Mode                      ║'));
      console.log(chalk.cyan('╚═══════════════════════════════════════════════════════════╝'));

      try {
        const result = startDaemon(cmd, cmdArgs, options.server);
        console.log(chalk.green('✓ Daemon started'));
        console.log(chalk.gray(`   PID: ${result.pid}`));
        console.log(chalk.gray(`   Log: ${result.logFile}`));
        console.log('');
        console.log(chalk.yellow('Waiting for session to initialize...'));

        // Wait for session info to be created
        const session = await waitForSession(result.pid, 15000);

        if (session) {
          console.log('');
          console.log(chalk.green(`✓ Session ready: ${chalk.bold(session.sessionId)}`));
          console.log('');
          console.log(chalk.cyan('Web URL:'));
          console.log(chalk.white(`   ${session.webUrl}`));
          console.log('');
          console.log(chalk.gray('Commands:'));
          console.log(chalk.gray(`   always sessions              - List active sessions`));
          console.log(chalk.gray(`   always stop ${session.sessionId}          - Stop this session`));
          console.log(chalk.gray(`   always logs ${session.sessionId}          - View session logs`));
        } else {
          console.log('');
          console.log(chalk.yellow('Session is still starting...'));
          console.log(chalk.gray('Run "always sessions" to see the web URL when ready.'));
        }

        process.exit(0);
      } catch (error) {
        console.error(chalk.red('Failed to start daemon:'), error);
        process.exit(1);
      }
    }

    // Normal session startup (interactive or daemon child)
    if (!isDaemonChild) {
      console.log(chalk.cyan('╔═══════════════════════════════════════════════════════════╗'));
      console.log(chalk.cyan('║           Always Coder - Remote Terminal Access           ║'));
      console.log(chalk.cyan('╚═══════════════════════════════════════════════════════════╝'));
    }

    // Add global error handlers for daemon mode
    if (isDaemonChild) {
      process.on('uncaughtException', (error) => {
        if (logFile) {
          fs.appendFileSync(logFile, `[${new Date().toISOString()}] UNCAUGHT EXCEPTION: ${error.stack || error}\n`);
          fs.appendFileSync(logFile, `[${new Date().toISOString()}] Exiting due to uncaught exception\n`);
        }
        console.error('UNCAUGHT:', error);
        process.exit(1);
      });

      process.on('unhandledRejection', (reason) => {
        if (logFile) {
          const stack = reason instanceof Error ? reason.stack : String(reason);
          fs.appendFileSync(logFile, `[${new Date().toISOString()}] UNHANDLED REJECTION: ${stack}\n`);
        }
      });

      process.on('exit', (code) => {
        if (logFile) {
          fs.appendFileSync(logFile, `[${new Date().toISOString()}] PROCESS EXIT with code: ${code}\n`);
        }
      });
    }

    const session = new SessionManager({
      command: cmd,
      args: cmdArgs.length > 0 ? cmdArgs : undefined,
      serverUrl: options.server,
      daemon: isDaemonChild,
      logFile: logFile,
    });

    // Handle graceful shutdown
    const shutdown = () => {
      if (!isDaemonChild) {
        console.log(chalk.yellow('\n\nReceived shutdown signal...'));
      }
      session.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // In daemon mode, ignore SIGHUP to prevent termination when terminal closes
    if (isDaemonChild) {
      process.on('SIGHUP', () => {
        if (logFile) {
          fs.appendFileSync(logFile, `[${new Date().toISOString()}] Received SIGHUP, ignoring...\n`);
        }
      });
    }

    session.on('terminal:exit', (exitCode: number) => {
      if (isDaemonChild && logFile) {
        fs.appendFileSync(logFile, `[${new Date().toISOString()}] terminal:exit event received with code: ${exitCode}\n`);
      }
      process.exit(exitCode);
    });

    session.on('error', (error: Error) => {
      if (!isDaemonChild) {
        console.error(chalk.red('Session error:'), error.message);
      }
    });

    try {
      await session.start();
    } catch (error) {
      if (!isDaemonChild) {
        console.error(chalk.red('Failed to start session:'), error);
      }
      process.exit(1);
    }
  });

// Config command
const configCmd = program.command('config').description('Manage configuration');

configCmd
  .command('set <key> <value>')
  .description('Set a configuration value')
  .action((key: string, value: string) => {
    if (key === 'server') {
      setConfigValue('server', value);
      console.log(chalk.green(`✓ Set ${key} = ${value}`));
    } else if (key === 'webUrl') {
      setConfigValue('webUrl', value);
      console.log(chalk.green(`✓ Set ${key} = ${value}`));
    } else if (key === 'instanceLabel') {
      setConfigValue('instanceLabel', value);
      console.log(chalk.green(`✓ Set ${key} = ${value}`));
    } else {
      console.error(chalk.red(`Unknown config key: ${key}`));
      console.log('Available keys: server, webUrl, instanceLabel');
      process.exit(1);
    }
  });

configCmd
  .command('get <key>')
  .description('Get a configuration value')
  .action((key: string) => {
    if (key === 'server') {
      const value = getConfigValue('server');
      console.log(value);
    } else if (key === 'webUrl') {
      const value = getConfigValue('webUrl');
      console.log(value);
    } else if (key === 'instanceLabel') {
      const value = getConfigValue('instanceLabel');
      console.log(value || '');
    } else {
      console.error(chalk.red(`Unknown config key: ${key}`));
      console.log('Available keys: server, webUrl, instanceLabel');
      process.exit(1);
    }
  });

configCmd
  .command('list')
  .description('List all configuration')
  .action(() => {
    const config = loadConfig();
    console.log(chalk.cyan('Current configuration:'));
    Object.entries(config).forEach(([key, value]) => {
      if (value) {
        console.log(`  ${key}: ${value}`);
      }
    });
  });

// Init command - quick setup for server and webUrl
program
  .command('init <server> <webUrl>')
  .description('Initialize configuration with server and web URL')
  .action((server: string, webUrl: string) => {
    setConfigValue('server', server);
    setConfigValue('webUrl', webUrl);
    console.log(chalk.green('✓ Configuration initialized'));
    console.log(chalk.gray(`  server: ${server}`));
    console.log(chalk.gray(`  webUrl: ${webUrl}`));
    console.log('');
    console.log(chalk.cyan('You can now run: pnpm always claude'));
  });

// Login command with Cognito authentication
program
  .command('login')
  .description('Login with your account (enables remote session management)')
  .option('-s, --server <url>', 'Server URL (e.g., https://app.example.com)')
  .option('-u, --username <username>', 'Username')
  .option('-p, --password <password>', 'Password (not recommended, use interactive prompt)')
  .action(async (options: { server?: string; username?: string; password?: string }) => {
    // Check if already logged in
    const currentUser = getCurrentUser();
    if (currentUser) {
      console.log(chalk.yellow(`Already logged in as ${currentUser.email || currentUser.userId}`));
      console.log(chalk.gray('Run "always logout" first to switch accounts.'));
      return;
    }

    let { server, username, password } = options;

    // Interactive prompts for missing credentials
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const question = (prompt: string): Promise<string> =>
      new Promise((resolve) => rl.question(prompt, resolve));

    try {
      // Step 1: Get server configuration
      if (!isServerConfigured() && !server) {
        // Check if there's a saved webUrl we can use
        const config = loadConfig();
        if (config.webUrl) {
          server = config.webUrl;
          console.log(chalk.gray(`Using saved server: ${server}`));
        } else {
          console.log(chalk.cyan('First time setup - enter your server URL'));
          console.log(chalk.gray('Example: https://app.always-coder.com'));
          console.log('');
          server = await question(chalk.cyan('Server URL: '));
          if (!server.trim()) {
            console.error(chalk.red('Server URL is required'));
            rl.close();
            process.exit(1);
          }
        }
      }

      // Fetch server configuration if needed
      if (server || !isServerConfigured()) {
        const serverUrl = server || loadConfig().webUrl;
        if (!serverUrl) {
          console.error(chalk.red('Server URL is required'));
          rl.close();
          process.exit(1);
        }

        console.log(chalk.yellow('Fetching server configuration...'));
        try {
          const serverConfig = await fetchServerConfig(serverUrl);
          saveServerConfig(serverConfig);
          console.log(chalk.green('✓ Server configuration saved'));
          console.log(chalk.gray(`   WebSocket: ${serverConfig.server}`));
          console.log(chalk.gray(`   Web URL: ${serverConfig.webUrl}`));
        } catch (error) {
          console.error(chalk.red('Failed to fetch server configuration:'), error instanceof Error ? error.message : String(error));
          rl.close();
          process.exit(1);
        }
      }

      // Step 2: Get credentials
      if (!username) {
        username = await question(chalk.cyan('Username or Email: '));
      }

      if (!password) {
        // Hide password input
        process.stdout.write(chalk.cyan('Password: '));
        password = await new Promise((resolve) => {
          let pwd = '';
          process.stdin.setRawMode(true);
          process.stdin.resume();
          process.stdin.on('data', function handler(char: Buffer) {
            const c = char.toString();
            if (c === '\n' || c === '\r') {
              process.stdin.setRawMode(false);
              process.stdin.pause();
              process.stdin.removeListener('data', handler);
              console.log('');
              resolve(pwd);
            } else if (c === '\u0003') {
              // Ctrl+C
              process.exit();
            } else if (c === '\u007f') {
              // Backspace
              pwd = pwd.slice(0, -1);
            } else {
              pwd += c;
            }
          });
        });
      }

      rl.close();

      // Validate credentials
      if (!username || username.trim().length === 0) {
        console.error(chalk.red('Username cannot be empty'));
        process.exit(1);
      }
      if (!password || password.length === 0) {
        console.error(chalk.red('Password cannot be empty'));
        process.exit(1);
      }
      // Basic username format validation (allow email or alphanumeric)
      const trimmedUsername = username.trim();
      if (trimmedUsername.length > 128) {
        console.error(chalk.red('Username is too long (max 128 characters)'));
        process.exit(1);
      }

      console.log(chalk.yellow('Authenticating...'));

      // At this point both username and password are guaranteed to be set
      const result = await login(trimmedUsername, password);

      console.log(chalk.green('✓ Login successful'));
      console.log(chalk.gray(`   User ID: ${result.userId}`));
      if (result.email) {
        console.log(chalk.gray(`   Email: ${result.email}`));
      }
      console.log('');
      console.log(chalk.cyan('You can now use Always Coder:'));
      console.log(chalk.gray('   always claude              Start a Claude session'));
      console.log(chalk.gray('   always sessions --remote   List sessions from all instances'));
    } catch (error) {
      rl.close();
      if (error instanceof Error) {
        console.error(chalk.red('Login failed:'), error.message);
      } else {
        console.error(chalk.red('Login failed'));
      }
      process.exit(1);
    }
  });

// Logout command
program
  .command('logout')
  .description('Logout from your account')
  .action(async () => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      console.log(chalk.yellow('Not logged in.'));
      return;
    }

    logout();
    console.log(chalk.green('✓ Logged out'));
  });

// Whoami command - show current user
program
  .command('whoami')
  .description('Show current logged-in user')
  .action(async () => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      console.log(chalk.yellow('Not logged in.'));
      console.log(chalk.gray('Run "always login" to authenticate.'));
      return;
    }

    console.log(chalk.cyan('Current user:'));
    console.log(`   User ID: ${currentUser.userId}`);
    if (currentUser.email) {
      console.log(`   Email: ${currentUser.email}`);
    }
  });

// Sessions command - list active daemon sessions
program
  .command('sessions')
  .description('List active daemon sessions')
  .option('-r, --remote', 'Include sessions from other instances (requires login)')
  .option('-a, --all', 'Include closed/inactive sessions')
  .action(async (options: { remote?: boolean; all?: boolean }) => {
    // Clean up stale sessions first
    cleanupStaleSessions();

    const localSessions = listDaemonSessions();
    const currentInstance = await getInstanceInfo();
    const localSessionIds = new Set(localSessions.map(s => s.sessionId));

    // Display local sessions
    if (localSessions.length > 0) {
      console.log(chalk.cyan(`Local Sessions (${getInstanceDisplayName(currentInstance)}):`));
      console.log('');

      for (const session of localSessions) {
        const running = isProcessRunning(session.pid);
        const status = running ? chalk.green('● running') : chalk.red('● stopped');
        const startedAt = new Date(session.startedAt).toLocaleString();

        // Display instance info if available
        const instanceDisplay = session.instanceLabel
          ? session.instanceLabel
          : session.instanceId && session.instanceId !== session.hostname
            ? `${session.hostname} (${session.instanceId})`
            : session.hostname || 'local';

        console.log(`${status}  ${chalk.bold(session.sessionId)}`);
        console.log(chalk.gray(`    Instance: ${instanceDisplay}`));
        console.log(chalk.gray(`    Command: ${session.command} ${session.args.join(' ')}`));
        console.log(chalk.gray(`    PID: ${session.pid}`));
        console.log(chalk.gray(`    Started: ${startedAt}`));
        console.log(chalk.blue(`    Web URL: ${session.webUrl}`));
        console.log(chalk.gray(`    Log: ${session.logFile}`));
        console.log('');
      }
    }

    // Fetch and display remote sessions if requested
    if (options.remote) {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        console.log(chalk.yellow('Login required for remote sessions.'));
        console.log(chalk.gray('Run "always login" to authenticate.'));
        if (localSessions.length === 0) {
          console.log('');
          console.log(chalk.gray('Start a daemon session with: always claude --daemon'));
        }
        return;
      }

      try {
        console.log(chalk.gray('Fetching remote sessions...'));
        const remoteSessions = await fetchRemoteSessions(options.all || false);

        // Filter out local sessions (already shown above)
        const otherSessions = remoteSessions.filter(s => !localSessionIds.has(s.sessionId));

        if (otherSessions.length > 0) {
          console.log('');
          console.log(chalk.cyan('Remote Sessions (other instances):'));
          console.log('');

          for (const session of otherSessions) {
            displayRemoteSession(session);
          }
        } else if (localSessions.length === 0) {
          console.log(chalk.yellow('No sessions found.'));
          console.log(chalk.gray('Start a daemon session with: always claude --daemon'));
        } else {
          console.log(chalk.gray('No remote sessions from other instances.'));
        }
      } catch (error) {
        if (error instanceof Error) {
          console.error(chalk.red('Failed to fetch remote sessions:'), error.message);
        } else {
          console.error(chalk.red('Failed to fetch remote sessions'));
        }
      }
    } else if (localSessions.length === 0) {
      console.log(chalk.yellow('No active local sessions.'));
      console.log(chalk.gray('Start a daemon session with: always claude --daemon'));
      console.log('');
      const currentUser = getCurrentUser();
      if (currentUser) {
        console.log(chalk.gray('Use --remote to see sessions from other instances.'));
      } else {
        console.log(chalk.gray('Login with "always login" to see sessions from other instances.'));
      }
      return;
    }

    console.log(chalk.gray('Commands:'));
    console.log(chalk.gray('   always info <session-id>   Show detailed session info'));
    console.log(chalk.gray('   always stop <session-id>   Stop a local session'));
    if (!options.remote) {
      console.log(chalk.gray('   always sessions --remote   Include sessions from other instances'));
    }
  });

// Helper function to display a remote session
function displayRemoteSession(session: RemoteSessionInfo): void {
  const statusMap: Record<string, string> = {
    pending: chalk.yellow('○ pending'),
    active: chalk.green('● active'),
    paused: chalk.yellow('○ paused'),
    closed: chalk.gray('○ closed'),
  };
  const status = statusMap[session.status] || chalk.gray(`○ ${session.status}`);
  const startedAt = new Date(session.createdAt).toLocaleString();

  // Display instance info
  const instanceDisplay = session.instanceLabel
    ? session.instanceLabel
    : session.instanceId && session.instanceId !== session.hostname
      ? `${session.hostname} (${session.instanceId})`
      : session.hostname || 'unknown';

  const commandDisplay = session.command
    ? `${session.command}${session.commandArgs?.length ? ' ' + session.commandArgs.join(' ') : ''}`
    : 'unknown';

  console.log(`${status}  ${chalk.bold(session.sessionId)}`);
  console.log(chalk.gray(`    Instance: ${instanceDisplay}`));
  console.log(chalk.gray(`    Command: ${commandDisplay}`));
  console.log(chalk.gray(`    Started: ${startedAt}`));
  if (session.webUrl) {
    console.log(chalk.blue(`    Web URL: ${session.webUrl}`));
  }
  console.log('');
}

// Info command - show detailed session information
program
  .command('info <sessionId>')
  .description('Show detailed information for a session')
  .action(async (sessionId: string) => {
    // Clean up stale sessions first
    cleanupStaleSessions();

    const sessions = listDaemonSessions();
    const session = sessions.find(s => s.sessionId === sessionId || s.sessionId.startsWith(sessionId));

    if (!session) {
      console.log(chalk.red(`Session ${sessionId} not found`));
      console.log(chalk.gray('Run "always sessions" to see active sessions'));
      process.exit(1);
    }

    const running = isProcessRunning(session.pid);
    const status = running ? chalk.green('running') : chalk.red('stopped');
    const startedAt = new Date(session.startedAt).toLocaleString();
    const uptime = running ? formatUptime(Date.now() - session.startedAt) : '-';

    console.log(chalk.cyan('Session Details:'));
    console.log('');
    console.log(`   ${chalk.bold('Session ID:')}  ${session.sessionId}`);
    console.log(`   ${chalk.bold('Status:')}      ${status}`);
    console.log(`   ${chalk.bold('Command:')}     ${session.command} ${session.args.join(' ')}`);
    console.log(`   ${chalk.bold('PID:')}         ${session.pid}`);
    console.log(`   ${chalk.bold('Started:')}     ${startedAt}`);
    console.log(`   ${chalk.bold('Uptime:')}      ${uptime}`);
    console.log('');
    console.log(chalk.cyan('Instance:'));
    if (session.instanceLabel) {
      console.log(`   ${chalk.bold('Label:')}       ${session.instanceLabel}`);
    }
    console.log(`   ${chalk.bold('Instance ID:')} ${session.instanceId || 'unknown'}`);
    console.log(`   ${chalk.bold('Hostname:')}    ${session.hostname || 'unknown'}`);
    console.log('');
    console.log(chalk.cyan('Connection:'));
    console.log(`   ${chalk.bold('Web URL:')}     ${chalk.blue(session.webUrl)}`);
    console.log(`   ${chalk.bold('Log File:')}    ${session.logFile}`);
  });

// Label command - set instance label
program
  .command('label [name]')
  .description('Set or show instance label')
  .action(async (name?: string) => {
    if (!name) {
      // Show current label
      const instanceInfo = await getInstanceInfo();
      console.log(chalk.cyan('Instance Information:'));
      console.log(`   Instance ID: ${instanceInfo.instanceId}`);
      console.log(`   Hostname: ${instanceInfo.hostname}`);
      if (instanceInfo.label) {
        console.log(`   Label: ${chalk.green(instanceInfo.label)}`);
      } else {
        console.log(`   Label: ${chalk.gray('(not set)')}`);
      }
      console.log('');
      console.log(chalk.gray('Set a label with: always label <name>'));
      return;
    }

    // Set label
    setConfigValue('instanceLabel', name);
    console.log(chalk.green(`✓ Instance label set to: ${name}`));
  });

// Stop command - stop a daemon session
program
  .command('stop <sessionId>')
  .description('Stop a daemon session')
  .action(async (sessionId: string) => {
    const stopped = stopDaemonSession(sessionId);

    if (stopped) {
      console.log(chalk.green(`✓ Session ${sessionId} stopped`));
    } else {
      console.log(chalk.yellow(`Session ${sessionId} not found or already stopped`));
    }
  });

// Clean command - stop all daemon sessions
program
  .command('clean')
  .description('Stop and clean up all daemon sessions')
  .option('-f, --force', 'Skip confirmation')
  .action(async (options: { force?: boolean }) => {
    const sessions = listDaemonSessions();

    if (sessions.length === 0) {
      console.log(chalk.yellow('No sessions to clean.'));
      return;
    }

    if (!options.force) {
      console.log(chalk.yellow(`This will stop ${sessions.length} session(s):`));
      for (const session of sessions) {
        console.log(chalk.gray(`  - ${session.sessionId} (PID: ${session.pid})`));
      }
      console.log('');

      // Simple confirmation using readline
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question(chalk.yellow('Are you sure? (y/N) '), resolve);
      });
      rl.close();

      if (answer.toLowerCase() !== 'y') {
        console.log(chalk.gray('Cancelled.'));
        return;
      }
    }

    const result = cleanAllSessions();
    console.log(chalk.green(`✓ Stopped ${result.stopped} running session(s)`));
    console.log(chalk.green(`✓ Cleaned up ${result.cleaned} session record(s)`));
  });

// Logs command - tail daemon session logs
program
  .command('logs <sessionId>')
  .description('View daemon session logs')
  .option('-f, --follow', 'Follow log output')
  .option('-n, --lines <number>', 'Number of lines to show', '50')
  .action(async (sessionId: string, options: { follow?: boolean; lines?: string }) => {
    // Clean up stale sessions first
    cleanupStaleSessions();

    const sessions = listDaemonSessions();
    const session = sessions.find(s => s.sessionId === sessionId || s.sessionId.startsWith(sessionId));

    if (!session) {
      console.log(chalk.red(`Session ${sessionId} not found`));
      console.log(chalk.gray('Run "always sessions" to see active sessions'));
      process.exit(1);
    }

    const { spawn } = await import('child_process');
    const tailArgs = options.follow ? ['-f', '-n', options.lines || '50', session.logFile] : ['-n', options.lines || '50', session.logFile];

    const tail = spawn('tail', tailArgs, { stdio: 'inherit' });
    tail.on('exit', (code) => process.exit(code || 0));
  });

// Parse and run
program.parse();
