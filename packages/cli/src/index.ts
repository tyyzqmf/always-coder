#!/usr/bin/env bun
import { Command } from 'commander';
import chalk from 'chalk';
import { SessionManager } from './session/manager.js';
import { loadConfig, saveConfig, getConfigValue, setConfigValue } from './config/index.js';

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
  .action(async (command: string | undefined, args: string[], options: { server?: string }) => {
    const cmd = command || 'claude';

    console.log(chalk.cyan('╔═══════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║           Always Coder - Remote Terminal Access           ║'));
    console.log(chalk.cyan('╚═══════════════════════════════════════════════════════════╝'));

    const session = new SessionManager({
      command: cmd,
      args: args.length > 0 ? args : undefined,
      serverUrl: options.server,
    });

    // Handle graceful shutdown
    const shutdown = () => {
      console.log(chalk.yellow('\n\nReceived shutdown signal...'));
      session.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    session.on('terminal:exit', (exitCode: number) => {
      process.exit(exitCode);
    });

    session.on('error', (error: Error) => {
      console.error(chalk.red('Session error:'), error.message);
    });

    try {
      await session.start();
    } catch (error) {
      console.error(chalk.red('Failed to start session:'), error);
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

// Sessions command (placeholder for listing history)
program
  .command('sessions')
  .description('List your session history')
  .action(async () => {
    const config = loadConfig();
    if (!config.authToken) {
      console.log(chalk.yellow('You are not logged in.'));
      console.log('Login with "always login" to access session history.');
      return;
    }
    console.log(chalk.yellow('Session history is not yet implemented.'));
    // TODO: Implement session history retrieval
  });

// Parse and run
program.parse();
