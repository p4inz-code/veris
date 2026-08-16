/**
 * Tests for the persistent SessionHeader — the session-scoped animated VERIS
 * header that renders exactly once and stays on screen for the whole
 * interactive session (never wiped by scan lifecycle events).
 *
 * Covers:
 * - Exactly-once initialization (start() is idempotent)
 * - Animation timer lifecycle (active only while the session is active)
 * - Exactly-once disposal (repeated dispose() is a no-op)
 * - No leaked timers after disposal
 * - Static render helpers (logo, status line) for Unicode/ASCII
 * - 40/80/180-column rendering stays within the terminal width
 * - Non-TTY: zero cursor-control sequences, no animation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SessionHeader,
  renderSessionHeaderLines,
  renderLogo,
  renderStatusLine,
  isUnicodeSymbols,
  HEADER_FRAME_INTERVAL_MS,
} from '../../src/scan/progress/session-header.js';
import {
  getSymbolSet,
  getResolvedTheme,
  setSymbolSet,
  resetSymbolSet,
  type TerminalCapabilities,
} from '../../src/ui/index.js';

// ── Test Helpers ──

function makeCaps(overrides: Partial<TerminalCapabilities> = {}): TerminalCapabilities {
  return Object.freeze<TerminalCapabilities>({
    width: 80,
    height: 24,
    colorDepth: 'none',
    unicode: false,
    isTty: false,
    isCi: false,
    ciEnvironment: 'none',
    isWindows: false,
    os: 'linux',
    emulator: 'xterm',
    isVsCode: false,
    prefersReducedMotion: false,
    nodeVersion: [22, 0],
    ...overrides,
  });
}

/** A fully animated interactive TTY: animation permitted. */
function animatableTtyCaps(width = 80): TerminalCapabilities {
  return makeCaps({ width, isTty: true, prefersReducedMotion: false, unicode: true });
}

function captureStdout(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((str: string) => {
    lines.push(str);
    return true;
  }) as typeof process.stdout.write;
  return {
    lines,
    restore: () => {
      process.stdout.write = orig;
    },
  };
}

/** Visible width of a line with ANSI escapes stripped. */
function visibleWidth(line: string): number {
  return line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').length;
}

/** True when the stream contains any CSI cursor/erase control sequence. */
function hasCursorControl(text: string): boolean {
  return /\x1b\[[0-9;]*[ABCDEFGHJK]/.test(text);
}

afterEach(() => {
  vi.useRealTimers();
  resetSymbolSet();
});

// ── Static Render Helpers ──

describe('renderSessionHeaderLines', () => {
  beforeEach(() => {
    resetSymbolSet();
  });

  it('renders the logo, identity, meta, and a trailing status line', () => {
    setSymbolSet('unicode');
    const lines = renderSessionHeaderLines(makeCaps({ isTty: true, unicode: true }), 0, {
      version: '1.2.3',
      nodeVersion: 'v22.0.0',
      platform: 'linux',
      terminal: 'xterm',
    });
    const out = lines.join('\n');
    expect(out).toContain('VERIS v1.2.3');
    expect(out).toContain('Node v22.0.0');
    expect(out).toContain('linux');
    // Status line is the LAST line and contains the status text.
    expect(lines[lines.length - 1]).toContain('VERIS session active');
  });

  it('uses the Unicode block logo when Unicode symbols are active', () => {
    setSymbolSet('unicode');
    const lines = renderSessionHeaderLines(makeCaps({ unicode: true }), 0);
    expect(lines.join('\n')).toContain('\u2588'); // block element
    expect(lines.join('\n')).not.toContain('V E R I S');
  });

  it('falls back to the ASCII wordmark when Unicode is unavailable', () => {
    setSymbolSet('ascii');
    const lines = renderSessionHeaderLines(makeCaps({ unicode: false }), 0);
    expect(lines.join('\n')).toContain('V E R I S');
    expect(lines.join('\n')).not.toContain('\u2588');
  });

  it('is deterministic: identical inputs produce identical output', () => {
    setSymbolSet('ascii');
    const caps = makeCaps({ width: 100, unicode: false });
    const a = renderSessionHeaderLines(caps, 3, { statusText: 'scanning' });
    const b = renderSessionHeaderLines(caps, 3, { statusText: 'scanning' });
    expect(a).toEqual(b);
  });

  it('keeps every line within the terminal width at 40/80/180 columns', () => {
    setSymbolSet('ascii');
    for (const width of [40, 80, 180]) {
      const lines = renderSessionHeaderLines(makeCaps({ width, unicode: false }), 0);
      for (const line of lines) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});

describe('renderLogo / renderStatusLine', () => {
  beforeEach(() => {
    resetSymbolSet();
  });

  it('renderLogo returns the ASCII wordmark for the ASCII set', () => {
    setSymbolSet('ascii');
    const theme = getResolvedTheme();
    const lines = renderLogo(theme, getSymbolSet(), '');
    expect(lines).toEqual([' V E R I S']);
  });

  it('isUnicodeSymbols distinguishes the sets', () => {
    setSymbolSet('unicode');
    expect(isUnicodeSymbols(getSymbolSet())).toBe(true);
    setSymbolSet('ascii');
    expect(isUnicodeSymbols(getSymbolSet())).toBe(false);
  });

  it('renderStatusLine cycles the spinner by frame when animated', () => {
    setSymbolSet('ascii');
    const theme = getResolvedTheme();
    const symbols = getSymbolSet();
    const frame0 = renderStatusLine(theme, symbols, '', 0, true, 'scanning');
    const frame2 = renderStatusLine(theme, symbols, '', 2, true, 'scanning');
    expect(frame0).not.toBe(frame2);
    expect(frame0).toContain('scanning');
  });

  it('renderStatusLine uses a static marker when not animated', () => {
    setSymbolSet('ascii');
    const theme = getResolvedTheme();
    const symbols = getSymbolSet();
    const a = renderStatusLine(theme, symbols, '', 0, false, 'scanning');
    const b = renderStatusLine(theme, symbols, '', 3, false, 'scanning');
    expect(a).toBe(b); // static — no spinner cycling
  });
});

// ── SessionHeader Lifecycle ──

describe('SessionHeader lifecycle', () => {
  it('renders exactly once across repeated start() calls', () => {
    const caps = captureStdout();
    const header = new SessionHeader({ caps: animatableTtyCaps() });
    try {
      header.start();
      const afterFirst = caps.lines.length;
      header.start(); // second call must be a no-op
      header.start();
      expect(caps.lines.length).toBe(afterFirst);
      expect(header.isStarted).toBe(true);
    } finally {
      caps.restore();
      header.dispose();
    }
  });

  it('stays animating while the session is active and stops on dispose', () => {
    vi.useFakeTimers();
    const caps = captureStdout();
    const header = new SessionHeader({ caps: animatableTtyCaps() });
    try {
      header.start();
      expect(header.isAnimating).toBe(true);
      const writtenWhileActive = caps.lines.length;

      // Advance several frames — the status line repaints in place.
      vi.advanceTimersByTime(HEADER_FRAME_INTERVAL_MS * 3);
      expect(caps.lines.length).toBeGreaterThan(writtenWhileActive);
      expect(header.isAnimating).toBe(true);

      // Dispose stops the animation; further ticks produce nothing.
      header.dispose();
      expect(header.isAnimating).toBe(false);
      expect(header.isDisposed).toBe(true);
      const writtenAfterDispose = caps.lines.length;
      vi.advanceTimersByTime(HEADER_FRAME_INTERVAL_MS * 10);
      expect(caps.lines.length).toBe(writtenAfterDispose);
    } finally {
      caps.restore();
      header.dispose();
    }
  });

  it('dispose() is idempotent — repeated calls emit no output', () => {
    const caps = captureStdout();
    const header = new SessionHeader({ caps: animatableTtyCaps() });
    try {
      header.start();
      header.dispose();
      const afterFirstDispose = caps.lines.length;
      header.dispose();
      header.dispose();
      expect(caps.lines.length).toBe(afterFirstDispose);
    } finally {
      caps.restore();
    }
  });

  it('renders static output on non-TTY with zero cursor-control sequences and no timer', () => {
    vi.useFakeTimers();
    const caps = captureStdout();
    const header = new SessionHeader({ caps: makeCaps({ isTty: false }) });
    try {
      header.start();
      expect(header.shouldAnimate()).toBe(false);
      expect(header.isAnimating).toBe(false);
      // The header IS rendered (deterministic sequential output) but the
      // stream must never contain cursor-control or erase sequences.
      expect(caps.lines.length).toBeGreaterThan(0);
      expect(hasCursorControl(caps.lines.join(''))).toBe(false);
      const afterRender = caps.lines.length;
      vi.advanceTimersByTime(HEADER_FRAME_INTERVAL_MS * 5);
      expect(caps.lines.length).toBe(afterRender); // no animation ticks
    } finally {
      caps.restore();
      header.dispose();
    }
  });

  it('does not animate when reduced motion is preferred', () => {
    const header = new SessionHeader({
      caps: makeCaps({ isTty: true, prefersReducedMotion: true }),
    });
    try {
      expect(header.shouldAnimate()).toBe(false);
    } finally {
      header.dispose();
    }
  });

  it('does not animate when noAnimation is forced', () => {
    const header = new SessionHeader({ caps: animatableTtyCaps(), noAnimation: true });
    try {
      expect(header.shouldAnimate()).toBe(false);
    } finally {
      header.dispose();
    }
  });

  it('reports the header line count matching the rendered lines', () => {
    const header = new SessionHeader({ caps: animatableTtyCaps() });
    try {
      const headerLines = renderSessionHeaderLines(animatableTtyCaps(), 0).length;
      expect(header.lineCount).toBe(headerLines);
      header.setBodyLineCount(7); // body region is tracked, never touched by header
      expect(header.isDisposed).toBe(false);
    } finally {
      header.dispose();
    }
  });

  it('never animates after dispose (no leaked timers)', () => {
    vi.useFakeTimers();
    const header = new SessionHeader({ caps: animatableTtyCaps() });
    header.start();
    header.dispose();
    // Advance far beyond the frame interval: no repaint output may occur.
    const caps = captureStdout();
    try {
      vi.advanceTimersByTime(HEADER_FRAME_INTERVAL_MS * 50);
      expect(caps.lines.length).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      caps.restore();
    }
  });
});
