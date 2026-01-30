import * as pty from 'node-pty';
import { EventEmitter } from 'events';

/**
 * Terminal events
 */
export interface TerminalEvents {
  data: (data: string) => void;
  exit: (exitCode: number, signal?: number) => void;
  error: (error: Error) => void;
}

/**
 * Terminal options
 */
export interface TerminalOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

/**
 * PTY Terminal wrapper
 */
export class Terminal extends EventEmitter {
  private ptyProcess: pty.IPty | null = null;
  private options: TerminalOptions;
  private cols: number;
  private rows: number;

  constructor(options: TerminalOptions) {
    super();
    this.options = options;
    this.cols = options.cols || process.stdout.columns || 80;
    this.rows = options.rows || process.stdout.rows || 24;
  }

  /**
   * Start the PTY process
   */
  start(): void {
    let shell = this.options.command;
    let args = this.options.args || [];
    const cwd = this.options.cwd || process.cwd();

    // For bash/zsh, force interactive mode to prevent SIGHUP exit
    if ((shell === 'bash' || shell === 'zsh') && !args.includes('-i')) {
      args = ['-i', ...args];
    }

    // In daemon mode, wrap command in bash with trap to ignore SIGHUP
    const isDaemon = process.env.ALWAYS_CODER_DAEMON === 'true';
    if (isDaemon) {
      // Create a command that ignores SIGHUP and runs the original command
      // Need to properly escape the command and args for bash -c
      const escapedArgs = args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ');
      const originalCmd = shell + (args.length > 0 ? ' ' + escapedArgs : '');
      shell = 'bash';
      // Use single string for -c argument with trap and exec
      args = ['-c', `trap '' HUP; exec ${originalCmd}`];
    }
    const env = {
      ...process.env,
      ...this.options.env,
      TERM: 'xterm-256color',
      // Prevent bash from exiting on SIGHUP in daemon mode
      IGNOREEOF: '10',
    } as Record<string, string>;

    console.log(`Starting PTY: ${shell} ${args.join(' ')}`);
    console.log(`  CWD: ${cwd}`);
    console.log(`  Size: ${this.cols}x${this.rows}`);
    console.log(`  ENV TERM: ${env.TERM}`);

    try {
      this.ptyProcess = pty.spawn(shell, args, {
        name: 'xterm-256color',
        cols: this.cols,
        rows: this.rows,
        cwd,
        env,
        handleFlowControl: true,
      });

      this.ptyProcess.onData((data) => {
        this.emit('data', data);
      });

      this.ptyProcess.onExit(({ exitCode, signal }) => {
        console.log(`PTY onExit: code=${exitCode}, signal=${signal}`);
        this.emit('exit', exitCode, signal);
        this.ptyProcess = null;
      });
    } catch (error) {
      this.emit('error', error as Error);
      throw error;
    }
  }

  /**
   * Write input to the terminal
   */
  write(data: string): void {
    if (this.ptyProcess) {
      this.ptyProcess.write(data);
    }
  }

  /**
   * Resize the terminal
   */
  resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    if (this.ptyProcess) {
      this.ptyProcess.resize(cols, rows);
    }
  }

  /**
   * Get current dimensions
   */
  getDimensions(): { cols: number; rows: number } {
    return { cols: this.cols, rows: this.rows };
  }

  /**
   * Kill the terminal process
   */
  kill(signal?: string): void {
    if (this.ptyProcess) {
      this.ptyProcess.kill(signal);
    }
  }

  /**
   * Check if the terminal is running
   */
  isRunning(): boolean {
    return this.ptyProcess !== null;
  }

  /**
   * Get the PID of the PTY process
   */
  getPid(): number | null {
    return this.ptyProcess?.pid || null;
  }
}
