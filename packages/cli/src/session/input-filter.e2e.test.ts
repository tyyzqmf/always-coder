/**
 * End-to-End Tests for Input Filtering
 *
 * These tests verify the InputFilter integration with handleTerminalInput
 * to ensure session persistence when control signals are received.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InputFilter, DEFAULT_INPUT_FILTER_CONFIG } from '@always-coder/shared';

describe('Input Filter E2E', () => {
  describe('Real-world terminal input scenarios', () => {
    let filter: InputFilter;

    beforeEach(() => {
      filter = new InputFilter();
    });

    it('Scenario: User accidentally presses Ctrl+C during long-running command', () => {
      // User is typing a command and accidentally hits Ctrl+C
      const userInput = 'npm run build\x03';

      const result = filter.filter(userInput);

      expect(result.blocked).toBe(true);
      expect(result.blockedSignals).toContain('SIGINT');
      expect(result.data).toBe('npm run build'); // Command preserved
    });

    it('Scenario: User tries to exit with Ctrl+D', () => {
      // User presses Ctrl+D to try to exit
      const userInput = '\x04';

      const result = filter.filter(userInput);

      expect(result.blocked).toBe(true);
      expect(result.blockedSignals).toContain('EOF');
      expect(result.data).toBe('');
    });

    it('Scenario: User suspends process with Ctrl+Z', () => {
      // User presses Ctrl+Z to suspend
      const userInput = '\x1A';

      const result = filter.filter(userInput);

      expect(result.blocked).toBe(true);
      expect(result.blockedSignals).toContain('SIGTSTP');
      expect(result.data).toBe('');
    });

    it('Scenario: Rapid key presses including accidental signals', () => {
      // Simulating rapid typing with accidental control keys
      const rapidInput = 'ls -la\x03\x04git status\x1Aecho done';

      const result = filter.filter(rapidInput);

      expect(result.blocked).toBe(true);
      expect(result.blockedSignals).toContain('SIGINT');
      expect(result.blockedSignals).toContain('EOF');
      expect(result.blockedSignals).toContain('SIGTSTP');
      expect(result.data).toBe('ls -lagit statusecho done');
    });

    it('Scenario: Normal command execution with Enter', () => {
      // Normal command with Enter key
      const normalInput = 'ls -la\r';

      const result = filter.filter(normalInput);

      expect(result.blocked).toBe(false);
      expect(result.data).toBe('ls -la\r');
    });

    it('Scenario: Tab completion', () => {
      // Tab completion request
      const tabInput = 'cd /home/user/doc\t';

      const result = filter.filter(tabInput);

      expect(result.blocked).toBe(false);
      expect(result.data).toBe('cd /home/user/doc\t');
    });

    it('Scenario: Arrow key navigation (command history)', () => {
      // Up arrow for command history
      const arrowInput = '\x1B[A'; // Up arrow

      const result = filter.filter(arrowInput);

      expect(result.blocked).toBe(false);
      expect(result.data).toBe('\x1B[A');
    });

    it('Scenario: Complex vim-like escape sequences', () => {
      // Various escape sequences used in vim
      const vimInput = '\x1B[H\x1B[2J\x1B[?25h'; // Clear screen, show cursor

      const result = filter.filter(vimInput);

      expect(result.blocked).toBe(false);
      expect(result.data).toBe('\x1B[H\x1B[2J\x1B[?25h');
    });

    it('Scenario: Backspace for corrections', () => {
      // User makes typo and uses backspace
      const backspaceInput = 'gti\x7F\x7Fit status'; // DEL (0x7F) for backspace

      const result = filter.filter(backspaceInput);

      expect(result.blocked).toBe(false);
      expect(result.data).toBe('gti\x7F\x7Fit status');
    });
  });

  describe('Web client reconnection simulation', () => {
    it('should maintain consistent filtering across multiple sessions', () => {
      const filter1 = new InputFilter();
      const filter2 = new InputFilter(); // New filter (simulating reconnect)

      // Both should filter the same way
      const input = 'hello\x03world';

      const result1 = filter1.filter(input);
      const result2 = filter2.filter(input);

      expect(result1.data).toBe(result2.data);
      expect(result1.blocked).toBe(result2.blocked);
      expect(result1.blockedSignals).toEqual(result2.blockedSignals);
    });
  });

  describe('Custom configuration scenarios', () => {
    it('Scenario: Allow Ctrl+C for interactive apps', () => {
      // Some apps need Ctrl+C to work (e.g., canceling a search in less)
      const filter = new InputFilter({
        blockCtrlC: false,
        blockCtrlD: true,
      });

      // Ctrl+C should pass through
      expect(filter.filter('\x03').data).toBe('\x03');

      // Ctrl+D should be blocked
      expect(filter.filter('\x04').data).toBe('');
    });

    it('Scenario: Disable all filtering', () => {
      const filter = new InputFilter({
        blockCtrlC: false,
        blockCtrlD: false,
        blockCtrlZ: false,
        blockCtrlBackslash: false,
      });

      const allSignals = '\x03\x04\x1A\x1C';
      const result = filter.filter(allSignals);

      expect(result.blocked).toBe(false);
      expect(result.data).toBe(allSignals);
    });
  });

  describe('Performance scenarios', () => {
    it('should handle large input efficiently', () => {
      const filter = new InputFilter();

      // 1MB of data with occasional control signals
      const largeInput = 'x'.repeat(1024 * 1024) + '\x03' + 'y'.repeat(1024);

      const start = performance.now();
      const result = filter.filter(largeInput);
      const duration = performance.now() - start;

      expect(result.blocked).toBe(true);
      expect(duration).toBeLessThan(100); // Should complete within 100ms
    });

    it('should handle many small inputs quickly', () => {
      const filter = new InputFilter();

      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        filter.filter('a\x03b');
      }
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(500); // Should complete within 500ms
    });
  });

  describe('Edge cases', () => {
    it('should handle empty input', () => {
      const filter = new InputFilter();
      const result = filter.filter('');

      expect(result.blocked).toBe(false);
      expect(result.data).toBe('');
    });

    it('should handle input with only signals', () => {
      const filter = new InputFilter();
      const result = filter.filter('\x03\x04\x1A\x1C');

      expect(result.blocked).toBe(true);
      expect(result.data).toBe('');
      expect(result.blockedSignals).toHaveLength(4);
    });

    it('should handle unicode characters', () => {
      const filter = new InputFilter();
      const result = filter.filter('你好世界\x03🎉');

      expect(result.blocked).toBe(true);
      expect(result.data).toBe('你好世界🎉');
    });

    it('should handle newlines and carriage returns', () => {
      const filter = new InputFilter();
      const result = filter.filter('line1\nline2\rline3\r\n');

      expect(result.blocked).toBe(false);
      expect(result.data).toBe('line1\nline2\rline3\r\n');
    });
  });
});

describe('SessionManager-like Input Handler E2E', () => {
  /**
   * Simulates the handleTerminalInput method from SessionManager
   */
  class MockSessionHandler {
    private inputFilter: InputFilter;
    public terminalWriteLog: string[] = [];
    public blockedSignalsLog: string[][] = [];

    constructor(filterConfig?: Partial<typeof DEFAULT_INPUT_FILTER_CONFIG>) {
      this.inputFilter = new InputFilter(filterConfig);
    }

    handleTerminalInput(data: string): void {
      const result = this.inputFilter.filter(data);

      if (result.blocked) {
        this.blockedSignalsLog.push(result.blockedSignals);
      }

      if (result.data.length > 0) {
        this.terminalWriteLog.push(result.data);
      }
    }

    getTerminalOutput(): string {
      return this.terminalWriteLog.join('');
    }

    getBlockedSignals(): string[] {
      return this.blockedSignalsLog.flat();
    }
  }

  it('should process a series of web client inputs', () => {
    const handler = new MockSessionHandler();

    // Simulate user typing commands
    handler.handleTerminalInput('ls -la\r');
    handler.handleTerminalInput('\x03'); // Ctrl+C (should be blocked)
    handler.handleTerminalInput('cd /home\r');
    handler.handleTerminalInput('\x04'); // Ctrl+D (should be blocked)
    handler.handleTerminalInput('pwd\r');

    // Verify terminal received safe commands
    expect(handler.getTerminalOutput()).toBe('ls -la\rcd /home\rpwd\r');

    // Verify signals were blocked
    expect(handler.getBlockedSignals()).toContain('SIGINT');
    expect(handler.getBlockedSignals()).toContain('EOF');
  });

  it('should allow signals when filter is disabled', () => {
    const handler = new MockSessionHandler({
      blockCtrlC: false,
      blockCtrlD: false,
      blockCtrlZ: false,
      blockCtrlBackslash: false,
    });

    handler.handleTerminalInput('test\x03\x04');

    expect(handler.getTerminalOutput()).toBe('test\x03\x04');
    expect(handler.getBlockedSignals()).toHaveLength(0);
  });

  it('should handle rapid input from web client', () => {
    const handler = new MockSessionHandler();

    // Simulate rapid typing with occasional signals
    for (let i = 0; i < 100; i++) {
      if (i % 10 === 0) {
        handler.handleTerminalInput(`command${i}\x03`);
      } else {
        handler.handleTerminalInput(`command${i}\r`);
      }
    }

    // Verify all commands processed
    expect(handler.terminalWriteLog.length).toBe(100);

    // Verify signals were blocked
    expect(handler.getBlockedSignals().length).toBe(10);
  });
});
