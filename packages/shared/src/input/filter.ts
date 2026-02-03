/**
 * Input filter configuration
 * Controls which control signals should be blocked from web client input
 */
export interface InputFilterConfig {
  /** Block Ctrl+C (SIGINT - 0x03) */
  blockCtrlC: boolean;
  /** Block Ctrl+D (EOF - 0x04) */
  blockCtrlD: boolean;
  /** Block Ctrl+Z (SIGTSTP - 0x1A) */
  blockCtrlZ: boolean;
  /** Block Ctrl+\ (SIGQUIT - 0x1C) */
  blockCtrlBackslash: boolean;
}

/**
 * Filter result containing filtered data and blocked signal info
 */
export interface FilterResult {
  /** Whether any signals were blocked */
  blocked: boolean;
  /** Filtered data with blocked signals removed */
  data: string;
  /** List of signal names that were blocked */
  blockedSignals: string[];
}

/**
 * Signal definition for internal use
 */
interface SignalDef {
  char: string;
  name: string;
  configKey: keyof InputFilterConfig;
}

/**
 * Default configuration - block all dangerous signals by default
 * This ensures session persistence when web clients send control signals
 */
export const DEFAULT_INPUT_FILTER_CONFIG: InputFilterConfig = {
  blockCtrlC: true,
  blockCtrlD: true,
  blockCtrlZ: true,
  blockCtrlBackslash: true,
};

/**
 * Control signal definitions
 */
const SIGNALS: SignalDef[] = [
  { char: '\x03', name: 'SIGINT', configKey: 'blockCtrlC' },
  { char: '\x04', name: 'EOF', configKey: 'blockCtrlD' },
  { char: '\x1A', name: 'SIGTSTP', configKey: 'blockCtrlZ' },
  { char: '\x1C', name: 'SIGQUIT', configKey: 'blockCtrlBackslash' },
];

/**
 * Input filter for web client terminal input
 *
 * This class filters dangerous control signals from web client input
 * to prevent accidental session termination. The CLI session should
 * remain active even when web clients disconnect or send Ctrl+C.
 *
 * @example
 * ```typescript
 * const filter = new InputFilter();
 * const result = filter.filter(webInput);
 * if (result.blocked) {
 *   console.log('Blocked signals:', result.blockedSignals);
 * }
 * terminal.write(result.data); // Safe to send to PTY
 * ```
 */
export class InputFilter {
  private config: InputFilterConfig;

  constructor(config: Partial<InputFilterConfig> = {}) {
    this.config = { ...DEFAULT_INPUT_FILTER_CONFIG, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): InputFilterConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<InputFilterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Filter input data, removing blocked control signals
   *
   * @param data - Raw input string from web client
   * @returns FilterResult with filtered data and blocked signal info
   */
  filter(data: string): FilterResult {
    // Defensive check for null/undefined at runtime boundaries
    if (data == null) {
      return { blocked: false, data: '', blockedSignals: [] };
    }

    const blockedSignals: string[] = [];
    let filteredData = data;

    for (const signal of SIGNALS) {
      if (this.config[signal.configKey] && filteredData.includes(signal.char)) {
        blockedSignals.push(signal.name);
        filteredData = filteredData.replaceAll(signal.char, '');
      }
    }

    return {
      blocked: blockedSignals.length > 0,
      data: filteredData,
      blockedSignals,
    };
  }

  /**
   * Quick check if input contains any blocked signals
   *
   * @param data - Raw input string to check
   * @returns true if any signals would be blocked
   */
  isBlocked(data: string): boolean {
    // Defensive check for null/undefined at runtime boundaries
    if (data == null) {
      return false;
    }

    for (const signal of SIGNALS) {
      if (this.config[signal.configKey] && data.includes(signal.char)) {
        return true;
      }
    }
    return false;
  }
}
