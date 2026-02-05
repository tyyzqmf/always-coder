'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';

/**
 * VS Code Dark Modern Theme
 * Extracted from: https://github.com/microsoft/vscode/blob/main/extensions/theme-defaults/themes/dark_modern.json
 * This provides pixel-perfect visual consistency with VS Code's integrated terminal.
 */
const VSCODE_DARK_MODERN_THEME = {
  background: '#181818',
  foreground: '#CCCCCC',
  cursor: '#FFFFFF',
  cursorAccent: '#000000',
  selectionBackground: '#264F78',
  selectionForeground: '#FFFFFF',
  // Standard ANSI colors
  black: '#000000',
  red: '#CD3131',
  green: '#0DBC79',
  yellow: '#E5E510',
  blue: '#2472C8',
  magenta: '#BC3FBC',
  cyan: '#11A8CD',
  white: '#E5E5E5',
  // Bright ANSI colors
  brightBlack: '#666666',
  brightRed: '#F14C4C',
  brightGreen: '#23D18B',
  brightYellow: '#F5F543',
  brightBlue: '#3B8EEA',
  brightMagenta: '#D670D6',
  brightCyan: '#29B8DB',
  brightWhite: '#E5E5E5',
};

/**
 * Terminal configuration options optimized for Claude Code output.
 * Based on xterm.js best practices and VS Code terminal settings.
 */
const TERMINAL_OPTIONS = {
  // Font settings - VS Code default monospace stack
  fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
  fontSize: 14,
  lineHeight: 1.2,
  letterSpacing: 0,

  // Cursor behavior
  cursorBlink: true,
  cursorStyle: 'block' as const,

  // Theme
  theme: VSCODE_DARK_MODERN_THEME,

  // Performance and rendering
  allowProposedApi: true,
  scrollback: 5000, // Balanced memory usage
  drawBoldTextInBrightColors: true, // Proper ANSI bold rendering

  // Critical: EOL handling to prevent "staircase" text bug
  convertEol: true,

  // Scroll behavior
  scrollOnUserInput: true,
  fastScrollModifier: 'alt' as const,

  // Windows compatibility (not needed for Unix-based Claude Code)
  windowsMode: false,
};

interface TerminalProps {
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
}

export interface TerminalHandle {
  write: (data: string) => void;
  clear: () => void;
  focus: () => void;
}

export function Terminal({ onData, onResize }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const webglAddonRef = useRef<WebglAddon | null>(null);

  // Write data to terminal
  const write = useCallback((data: string) => {
    xtermRef.current?.write(data);
  }, []);

  // Clear terminal
  const clear = useCallback(() => {
    xtermRef.current?.clear();
  }, []);

  // Focus terminal
  const focus = useCallback(() => {
    xtermRef.current?.focus();
  }, []);

  // Expose methods via ref
  useEffect(() => {
    // Attach methods to window for parent component access
    (window as unknown as Record<string, unknown>).__terminalHandle = { write, clear, focus };
    return () => {
      delete (window as unknown as Record<string, unknown>).__terminalHandle;
    };
  }, [write, clear, focus]);

  // Initialize terminal
  useEffect(() => {
    // Defensive check: prevent double initialization in React 18 Strict Mode
    if (!containerRef.current || xtermRef.current) return;

    // A. Create terminal instance with optimized options
    const term = new XTerm(TERMINAL_OPTIONS);

    // B. Load essential addons
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    // C. Mount terminal to DOM (must happen before WebGL addon)
    term.open(containerRef.current);

    // D. Load WebGL addon for GPU-accelerated rendering
    // This provides 60FPS rendering even with high-volume Claude Code output
    try {
      const webglAddon = new WebglAddon();

      // Handle WebGL context loss gracefully
      webglAddon.onContextLoss(() => {
        console.warn('Terminal: WebGL context lost, disposing addon');
        webglAddon.dispose();
        webglAddonRef.current = null;
      });

      term.loadAddon(webglAddon);
      webglAddonRef.current = webglAddon;
      console.log('Terminal: WebGL renderer active (GPU accelerated)');
    } catch (e) {
      // Graceful degradation to Canvas renderer
      console.warn('Terminal: WebGL unavailable, using Canvas fallback', e);
    }

    // Store references
    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // E. Handle user input
    term.onData((data) => {
      onData?.(data);
    });

    // F. Optimized resize handling with ResizeObserver + requestAnimationFrame
    // This prevents layout thrashing and ResizeObserver loop errors
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    let lastCols = 0;
    let lastRows = 0;

    const handleResize = () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      // Debounce resize events (100ms)
      resizeTimeout = setTimeout(() => {
        // Wrap in requestAnimationFrame to avoid layout thrashing
        requestAnimationFrame(() => {
          try {
            fitAddon.fit();
            const { cols, rows } = term;
            // Only notify if size actually changed
            if (cols !== lastCols || rows !== lastRows) {
              lastCols = cols;
              lastRows = rows;
              onResize?.(cols, rows);
            }
          } catch {
            // Ignore errors during resize (e.g., disposed terminal)
          }
        });
      }, 100);
    };

    // G. Use ResizeObserver for pixel-level layout response
    // This handles sidebar collapse, panel resize, etc. (not just window resize)
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(containerRef.current);

    // Also listen to window resize for edge cases
    window.addEventListener('resize', handleResize);

    // H. Initial fit after a short delay to ensure container is properly sized
    // This prevents geometry mismatch bugs on initial render
    setTimeout(() => {
      // Use requestAnimationFrame for initial fit as well
      requestAnimationFrame(() => {
        try {
          fitAddon.fit();
          const { cols, rows } = term;
          lastCols = cols;
          lastRows = rows;
          onResize?.(cols, rows);
        } catch {
          // Ignore errors during initial fit
        }
      });
    }, 50);

    // Focus terminal on mount
    term.focus();

    // I. Cleanup function - critical for React 18 Strict Mode
    return () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);

      // Dispose WebGL addon first to release GPU resources
      if (webglAddonRef.current) {
        webglAddonRef.current.dispose();
        webglAddonRef.current = null;
      }

      // Dispose terminal instance
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [onData, onResize]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{
        backgroundColor: VSCODE_DARK_MODERN_THEME.background,
        overflow: 'hidden', // Prevent double scrollbars
      }}
      onClick={() => xtermRef.current?.focus()}
    />
  );
}
