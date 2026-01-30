#!/usr/bin/env bun
import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import { SessionManager } from './session/manager.js';
import { loadConfig, saveConfig, getConfigValue, setConfigValue } from './config/index.js';
import {
  startDaemon,
  listDaemonSessions,
  stopDaemonSession,
  cleanupStaleSessions,
  isProcessRunning,
  waitForSession,
} from './daemon/index.js';

// In daemon mode, ignore SIGHUP early to prevent termination
if (process.env.ALWAYS_CODER_DAEMON === 'true') {
  process.on('SIGHUP', () => {
    // Ignore SIGHUP in daemon mode
  });
}

const program = new Command();

program
  .name('always')
  .description('Always Coder - Remote AI coding agent control')
  .version('1.0.0');

// Main command: wrap a command
program
  .argument('[command]', 'Command to run (default: claude)')
  .argument('[args...]', 'Arguments to pass to the command')
  .option('-s, --server <url>', 'WebSocket server URL')
  .option('-d, --daemon', 'Run in background (daemon mode)')
  .option('--daemon-child', 'Internal flag for daemon child process')
  .allowUnknownOption()  // Pass unknown options through to the child command
  .action(async (command: string | undefined, args: string[], options: { server?: string; daemon?: boolean; daemonChild?: boolean }) => {
    // Handle command that contains spaces (e.g., "sleep 300")
    let cmd = command || 'claude';
    let cmdArgs = args;
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
    } else {
      console.error(chalk.red(`Unknown config key: ${key}`));
      console.log('Available keys: server');
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
    } else {
      console.error(chalk.red(`Unknown config key: ${key}`));
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

// Login command (placeholder for Cognito integration)
program
  .command('login')
  .description('Login with your account (enables session history)')
  .action(async () => {
    console.log(chalk.yellow('Login is not yet implemented.'));
    console.log('Sessions work in anonymous mode.');
    // TODO: Implement Cognito login flow
  });

// Logout command
program
  .command('logout')
  .description('Logout from your account')
  .action(async () => {
    saveConfig({ authToken: undefined, userId: undefined });
    console.log(chalk.green('✓ Logged out'));
  });

// Sessions command - list active daemon sessions
program
  .command('sessions')
  .description('List active daemon sessions')
  .action(async () => {
    // Clean up stale sessions first
    cleanupStaleSessions();

    const sessions = listDaemonSessions();

    if (sessions.length === 0) {
      console.log(chalk.yellow('No active sessions.'));
      console.log(chalk.gray('Start a daemon session with: always claude --daemon'));
      return;
    }

    console.log(chalk.cyan('Active Sessions:'));
    console.log('');

    for (const session of sessions) {
      const running = isProcessRunning(session.pid);
      const status = running ? chalk.green('● running') : chalk.red('● stopped');
      const startedAt = new Date(session.startedAt).toLocaleString();

      console.log(`${status}  ${chalk.bold(session.sessionId)}`);
      console.log(chalk.gray(`    Command: ${session.command} ${session.args.join(' ')}`));
      console.log(chalk.gray(`    PID: ${session.pid}`));
      console.log(chalk.gray(`    Started: ${startedAt}`));
      console.log(chalk.blue(`    Web URL: ${session.webUrl}`));
      console.log(chalk.gray(`    Log: ${session.logFile}`));
      console.log('');
    }

    console.log(chalk.gray('To stop a session: always stop <session-id>'));
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
