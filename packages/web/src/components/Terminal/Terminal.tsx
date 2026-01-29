'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';

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
    if (!containerRef.current || xtermRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
      lineHeight: 1.2,
      letterSpacing: 0,
      allowProposedApi: true,
      theme: {
        background: '#1a1b26',
        foreground: '#a9b1d6',
        cursor: '#c0caf5',
        cursorAccent: '#1a1b26',
        selectionBackground: '#33467c',
        selectionForeground: '#c0caf5',
        black: '#15161e',
        red: '#f7768e',
        green: '#9ece6a',
        yellow: '#e0af68',
        blue: '#7aa2f7',
        magenta: '#bb9af7',
        cyan: '#7dcfff',
        white: '#c0caf5',
        brightBlack: '#414868',
        brightRed: '#f7768e',
        brightGreen: '#9ece6a',
        brightYellow: '#e0af68',
        brightBlue: '#7aa2f7',
        brightMagenta: '#bb9af7',
        brightCyan: '#7dcfff',
        brightWhite: '#c0caf5',
      },
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(containerRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Handle user input
    term.onData((data) => {
      onData?.(data);
    });

    // Report initial size
    const { cols, rows } = term;
    onResize?.(cols, rows);

    // Handle window resize
    const handleResize = () => {
      fitAddon.fit();
      const { cols, rows } = term;
      onResize?.(cols, rows);
    };

    window.addEventListener('resize', handleResize);

    // Focus on mount
    term.focus();

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [onData, onResize]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-terminal-bg"
      onClick={() => xtermRef.current?.focus()}
    />
  );
}
