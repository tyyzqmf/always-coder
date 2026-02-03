import { describe, it, expect } from 'vitest';
import {
  InputFilter,
  type InputFilterConfig,
  DEFAULT_INPUT_FILTER_CONFIG,
} from './filter.js';

describe('InputFilter', () => {
  describe('constructor', () => {
    it('should use default config when no config provided', () => {
      const filter = new InputFilter();
      expect(filter.getConfig()).toEqual(DEFAULT_INPUT_FILTER_CONFIG);
    });

    it('should merge partial config with defaults', () => {
      const filter = new InputFilter({ blockCtrlC: false });
      expect(filter.getConfig().blockCtrlC).toBe(false);
      expect(filter.getConfig().blockCtrlD).toBe(true); // default
    });

    it('should accept full custom config', () => {
      const customConfig: InputFilterConfig = {
        blockCtrlC: false,
        blockCtrlD: false,
        blockCtrlZ: false,
        blockCtrlBackslash: false,
      };
      const filter = new InputFilter(customConfig);
      expect(filter.getConfig()).toEqual(customConfig);
    });
  });

  describe('filter', () => {
    describe('Ctrl+C (SIGINT - 0x03)', () => {
      it('should block Ctrl+C by default', () => {
        const filter = new InputFilter();
        const result = filter.filter('\x03');
        expect(result.blocked).toBe(true);
        expect(result.data).toBe('');
        expect(result.blockedSignals).toContain('SIGINT');
      });

      it('should pass through Ctrl+C when blockCtrlC is false', () => {
        const filter = new InputFilter({ blockCtrlC: false });
        const result = filter.filter('\x03');
        expect(result.blocked).toBe(false);
        expect(result.data).toBe('\x03');
        expect(result.blockedSignals).toHaveLength(0);
      });

      it('should block Ctrl+C embedded in longer string', () => {
        const filter = new InputFilter();
        const result = filter.filter('hello\x03world');
        expect(result.blocked).toBe(true);
        expect(result.data).toBe('helloworld');
        expect(result.blockedSignals).toContain('SIGINT');
      });
    });

    describe('Ctrl+D (EOF - 0x04)', () => {
      it('should block Ctrl+D by default', () => {
        const filter = new InputFilter();
        const result = filter.filter('\x04');
        expect(result.blocked).toBe(true);
        expect(result.data).toBe('');
        expect(result.blockedSignals).toContain('EOF');
      });

      it('should pass through Ctrl+D when blockCtrlD is false', () => {
        const filter = new InputFilter({ blockCtrlD: false });
        const result = filter.filter('\x04');
        expect(result.blocked).toBe(false);
        expect(result.data).toBe('\x04');
      });
    });

    describe('Ctrl+Z (SIGTSTP - 0x1A)', () => {
      it('should block Ctrl+Z by default', () => {
        const filter = new InputFilter();
        const result = filter.filter('\x1A');
        expect(result.blocked).toBe(true);
        expect(result.data).toBe('');
        expect(result.blockedSignals).toContain('SIGTSTP');
      });

      it('should pass through Ctrl+Z when blockCtrlZ is false', () => {
        const filter = new InputFilter({ blockCtrlZ: false });
        const result = filter.filter('\x1A');
        expect(result.blocked).toBe(false);
        expect(result.data).toBe('\x1A');
      });
    });

    describe('Ctrl+\\ (SIGQUIT - 0x1C)', () => {
      it('should block Ctrl+\\ by default', () => {
        const filter = new InputFilter();
        const result = filter.filter('\x1C');
        expect(result.blocked).toBe(true);
        expect(result.data).toBe('');
        expect(result.blockedSignals).toContain('SIGQUIT');
      });

      it('should pass through Ctrl+\\ when blockCtrlBackslash is false', () => {
        const filter = new InputFilter({ blockCtrlBackslash: false });
        const result = filter.filter('\x1C');
        expect(result.blocked).toBe(false);
        expect(result.data).toBe('\x1C');
      });
    });

    describe('multiple signals in one input', () => {
      it('should block all configured signals in one string', () => {
        const filter = new InputFilter();
        const result = filter.filter('\x03\x04\x1A\x1C');
        expect(result.blocked).toBe(true);
        expect(result.data).toBe('');
        expect(result.blockedSignals).toContain('SIGINT');
        expect(result.blockedSignals).toContain('EOF');
        expect(result.blockedSignals).toContain('SIGTSTP');
        expect(result.blockedSignals).toContain('SIGQUIT');
      });

      it('should preserve non-signal characters when filtering', () => {
        const filter = new InputFilter();
        const result = filter.filter('a\x03b\x04c');
        expect(result.blocked).toBe(true);
        expect(result.data).toBe('abc');
      });
    });

    describe('safe input', () => {
      it('should pass through normal text', () => {
        const filter = new InputFilter();
        const result = filter.filter('hello world');
        expect(result.blocked).toBe(false);
        expect(result.data).toBe('hello world');
        expect(result.blockedSignals).toHaveLength(0);
      });

      it('should pass through Enter key (0x0D)', () => {
        const filter = new InputFilter();
        const result = filter.filter('\r');
        expect(result.blocked).toBe(false);
        expect(result.data).toBe('\r');
      });

      it('should pass through Newline (0x0A)', () => {
        const filter = new InputFilter();
        const result = filter.filter('\n');
        expect(result.blocked).toBe(false);
        expect(result.data).toBe('\n');
      });

      it('should pass through Escape sequences', () => {
        const filter = new InputFilter();
        // Arrow up escape sequence
        const result = filter.filter('\x1B[A');
        expect(result.blocked).toBe(false);
        expect(result.data).toBe('\x1B[A');
      });

      it('should pass through Tab (0x09)', () => {
        const filter = new InputFilter();
        const result = filter.filter('\t');
        expect(result.blocked).toBe(false);
        expect(result.data).toBe('\t');
      });

      it('should pass through Backspace (0x7F and 0x08)', () => {
        const filter = new InputFilter();
        const result1 = filter.filter('\x7F');
        expect(result1.blocked).toBe(false);
        expect(result1.data).toBe('\x7F');

        const result2 = filter.filter('\x08');
        expect(result2.blocked).toBe(false);
        expect(result2.data).toBe('\x08');
      });
    });

    describe('empty input', () => {
      it('should handle empty string', () => {
        const filter = new InputFilter();
        const result = filter.filter('');
        expect(result.blocked).toBe(false);
        expect(result.data).toBe('');
        expect(result.blockedSignals).toHaveLength(0);
      });
    });

    describe('null/undefined input', () => {
      it('should handle null input gracefully', () => {
        const filter = new InputFilter();
        const result = filter.filter(null as unknown as string);
        expect(result.blocked).toBe(false);
        expect(result.data).toBe('');
        expect(result.blockedSignals).toHaveLength(0);
      });

      it('should handle undefined input gracefully', () => {
        const filter = new InputFilter();
        const result = filter.filter(undefined as unknown as string);
        expect(result.blocked).toBe(false);
        expect(result.data).toBe('');
        expect(result.blockedSignals).toHaveLength(0);
      });
    });
  });

  describe('isBlocked', () => {
    it('should return true for blocked signal', () => {
      const filter = new InputFilter();
      expect(filter.isBlocked('\x03')).toBe(true);
    });

    it('should return false for safe input', () => {
      const filter = new InputFilter();
      expect(filter.isBlocked('hello')).toBe(false);
    });

    it('should return false for null input', () => {
      const filter = new InputFilter();
      expect(filter.isBlocked(null as unknown as string)).toBe(false);
    });

    it('should return false for undefined input', () => {
      const filter = new InputFilter();
      expect(filter.isBlocked(undefined as unknown as string)).toBe(false);
    });
  });

  describe('updateConfig', () => {
    it('should update config and affect filtering', () => {
      const filter = new InputFilter();
      expect(filter.filter('\x03').blocked).toBe(true);

      filter.updateConfig({ blockCtrlC: false });
      expect(filter.filter('\x03').blocked).toBe(false);
    });
  });
});
