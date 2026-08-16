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
  SWEEP_FRAMES,
  INTRO_FRAME_COUNT,
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

// ── Logo Wipe Animation (the VERIS logo itself transforms) ──

describe('logo wipe animation', () => {
  beforeEach(() => {
    resetSymbolSet();
    setSymbolSet('unicode');
  });

  /** Animated Unicode caps at the default 80 columns (10 header rows). */
  const caps = (): TerminalCapabilities => makeCaps({ isTty: true, unicode: true, width: 80 });

  /** Count real (non-ghost, non-space) logo glyphs visible in a frame. */
  const realGlyphCount = (frame: number): number => {
    const staticLogo = renderSessionHeaderLines(caps(), 0, { animated: false }).slice(1, 7);
    const lines = renderSessionHeaderLines(caps(), frame, { animated: true });
    let n = 0;
    for (let r = 0; r < staticLogo.length; r++) {
      const row = lines[1 + r];
      const srow = staticLogo[r];
      for (let c = 0; c < srow.length; c++) {
        if (srow[c] !== ' ' && row[c] === srow[c]) n++;
      }
    }
    return n;
  };

  it('emits at least 4 distinct logo frames — the logo itself transforms', () => {
    const frames = [0, 1, 2, 3].map((f) => renderSessionHeaderLines(caps(), f, { animated: true }));
    for (let i = 1; i < frames.length; i++) {
      // Consecutive frames differ in the LOGO region — not just the spinner.
      expect(frames[i].slice(1, 7).join('')).not.toBe(frames[i - 1].slice(1, 7).join(''));
      // The logo is already visible from the very first frame (leading edge).
      expect(frames[i - 1].slice(1, 7).join('')).toContain('\u2588');
    }
    // All 6 wipe frames are mutually distinct (left-to-right progress).
    const unique = new Set(frames.map((f) => f.slice(1, 7).join(''))).size;
    expect(unique).toBeGreaterThanOrEqual(4);
  });

  it('reveals the logo progressively — real glyphs never revert to ghost', () => {
    const counts = [0, 1, 2, 3, 4, SWEEP_FRAMES - 1].map(realGlyphCount);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    }
    expect(counts[0]).toBeGreaterThan(0); // the wipe starts immediately
    expect(counts[SWEEP_FRAMES - 1]).toBeGreaterThan(counts[0]); // and progresses
  });

  it('holds a stable header height through the whole intro', () => {
    const frames = [0, 2, SWEEP_FRAMES - 1, INTRO_FRAME_COUNT].map((f) =>
      renderSessionHeaderLines(caps(), f, { animated: true }),
    );
    const heights = frames.map((f) => f.length);
    expect(new Set(heights).size).toBe(1); // every frame is the same height
    expect(heights[0]).toBeGreaterThanOrEqual(10);
  });

  it('the final wipe frame shows the full logo exactly (matches the static logo)', () => {
    const lastWipe = renderSessionHeaderLines(caps(), SWEEP_FRAMES - 1, { animated: true });
    const staticLogo = renderSessionHeaderLines(caps(), 0, { animated: false });
    // Logo region (blank spacer + 6 logo rows) is byte-identical to static.
    expect(lastWipe.slice(0, 7)).toEqual(staticLogo.slice(0, 7));
    // The ghost is fully gone by the end of the wipe.
    expect(lastWipe.slice(1, 7).join('')).not.toContain('\u2591');
  });

  it('completes to the full persistent header (logo + identity) after the intro', () => {
    const steady = renderSessionHeaderLines(caps(), INTRO_FRAME_COUNT, { animated: true });
    const out = steady.join('\n');
    expect(out).toContain('VERIS v1.0.0');
    // All six logo rows are present (the block rows carry the full-block
    // glyph; the bottom row is pure box-drawing, so assert presence, not
    // block glyphs, on that one).
    expect(steady.slice(1, 7).every((l) => l.trim() !== '')).toBe(true);
    expect(steady.slice(1, 6).every((l) => l.includes('\u2588'))).toBe(true);
    // The completed header matches the non-animated render (except the
    // status indicator glyph: spinner vs static marker).
    expect(steady.slice(0, -1)).toEqual(
      renderSessionHeaderLines(caps(), 0, { animated: false }).slice(0, -1),
    );
  });

  it('is identical across frames when animation is disabled (no wipe)', () => {
    const f0 = renderSessionHeaderLines(caps(), 0, { animated: false });
    const f3 = renderSessionHeaderLines(caps(), 3, { animated: false });
    expect(f0).toEqual(f3);
    expect(f0.join('\n')).toContain('VERIS v1.0.0');
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

  it('completes the intro and holds the full header with NO scan activity', () => {
    vi.useFakeTimers();
    setSymbolSet('unicode');
    const caps = captureStdout();
    const header = new SessionHeader({ caps: animatableTtyCaps() });
    try {
      header.start();
      // Advance through the entire intro (wipe + settle) — no progress
      // events involved; the animation is purely time-driven.
      vi.advanceTimersByTime(HEADER_FRAME_INTERVAL_MS * INTRO_FRAME_COUNT);
      expect(header.frameIndex).toBeGreaterThanOrEqual(INTRO_FRAME_COUNT);
      const out = header.renderLines(header.frameIndex).join('\n');
      expect(out).toContain('VERIS v1.0.0');
      expect(out).toContain('\u2588');
      // The intro emitted distinct frames on the way (the wipe began with
      // the ghost logo and filled in).
      const joined = caps.lines.join('');
      expect(joined).toContain('\u2591'); // ghost glyph was rendered
      expect(joined).toContain('\u2588'); // and the real logo too
    } finally {
      caps.restore();
      header.dispose();
    }
  });

  it('finalLines renders the COMPLETED header even when disposed mid-reveal', () => {
    vi.useFakeTimers();
    setSymbolSet('unicode');
    const caps = captureStdout();
    const header = new SessionHeader({ caps: animatableTtyCaps() });
    try {
      header.start();
      // Session ends after one reveal tick — the intro never finished.
      vi.advanceTimersByTime(HEADER_FRAME_INTERVAL_MS);
      header.dispose();
      const final = header.finalLines();
      expect(final.join('\n')).toContain('VERIS v1.0.0');
      expect(final.join('\n')).toContain('\u2588');
      expect(final.slice(1, 7).every((l) => l.trim() !== '')).toBe(true);
      expect(final.slice(1, 6).every((l) => l.includes('\u2588'))).toBe(true);
    } finally {
      caps.restore();
      header.dispose();
    }
  });
});

// ── Real-Terminal Alternate-Screen Protocol ──

describe('SessionHeader alternate-screen protocol (real-terminal pinning)', () => {
  /** Header height for the default 80-col render: 10 rows. */
  const H = renderSessionHeaderLines(animatableTtyCaps(), 0).length;
  const R = 24; // caps height

  it('enters the alternate screen buffer on TTY start and begins the logo reveal', () => {
    setSymbolSet('unicode');
    const caps = captureStdout();
    const header = new SessionHeader({ caps: animatableTtyCaps() });
    try {
      header.start();
      const joined = caps.lines.join('');
      // The interactive session runs on the alternate screen buffer: the
      // stream starts with the entry sequence, followed by the header lines.
      expect(joined.startsWith('\x1b[?1049h')).toBe(true);
      // The reveal starts drawing the VERIS block logo immediately (the
      // identity line fills in once the intro completes).
      expect(joined).toContain('\u2588');
    } finally {
      caps.restore();
      header.dispose();
    }
  });

  it('leaves the alternate screen buffer on dispose (TTY)', () => {
    const caps = captureStdout();
    const header = new SessionHeader({ caps: animatableTtyCaps() });
    try {
      header.start();
      header.dispose();
      const joined = caps.lines.join('');
      // Leaving the alternate screen restores the primary screen (shell).
      expect(joined.endsWith('\x1b[?1049l')).toBe(true);
      // Repeated dispose emits nothing further.
      const len = caps.lines.length;
      header.dispose();
      header.dispose();
      expect(caps.lines.length).toBe(len);
    } finally {
      caps.restore();
    }
  });

  it('does not emit control sequences in non-TTY mode', () => {
    const caps = captureStdout();
    const header = new SessionHeader({ caps: makeCaps({ isTty: false }) });
    try {
      header.start();
      header.dispose();
      const joined = caps.lines.join('');
      expect(joined).not.toContain('\x1b[');
    } finally {
      caps.restore();
    }
  });

  it('repaints the full header during the intro, then the status line with absolute CUP', () => {
    vi.useFakeTimers();
    const caps = captureStdout();
    const header = new SessionHeader({ caps: animatableTtyCaps() });
    try {
      header.start();
      header.setBodyLineCount(12);

      // The intro wipes the logo: each tick repaints the FULL header region
      // anchored at the home position (never cursor-up).
      const before = caps.lines.length;
      vi.advanceTimersByTime(HEADER_FRAME_INTERVAL_MS);
      const revealRepaint = caps.lines.slice(before).join('');
      expect(revealRepaint).toContain('\x1b[H');
      expect(revealRepaint).not.toMatch(/\x1b\[\d+A/);

      // Advance through the rest of the intro (wipe + settle) into steady
      // state, then one tick: only the status line is repainted in place.
      vi.advanceTimersByTime(HEADER_FRAME_INTERVAL_MS * (INTRO_FRAME_COUNT - 1));
      const steadyStart = caps.lines.length;
      vi.advanceTimersByTime(HEADER_FRAME_INTERVAL_MS);
      const repaint = caps.lines.slice(steadyStart).join('');
      // CUP to the status row (row H), erase line, rewrite, CUP to the body
      // write position (row H+1+12 clamped to the screen).
      expect(repaint).toContain(`\x1b[${H};1H\x1b[2K`);
      expect(repaint).toContain(`\x1b[${Math.min(H + 1 + 12, R)};1H`);
      // No cursor-up sequences may be used to reach the status row.
      expect(repaint).not.toMatch(/\x1b\[\d+A/);
    } finally {
      caps.restore();
      header.dispose();
    }
  });

  it('animates the reveal even when the header fills the screen, then idles (degenerate)', () => {
    vi.useFakeTimers();
    const caps = captureStdout();
    const header = new SessionHeader({
      caps: makeCaps({ height: H, isTty: true, prefersReducedMotion: false }),
    });
    try {
      header.start();
      // The intro still draws itself (the header region repaints safely
      // even when it fills the whole screen).
      const afterStart = caps.lines.length;
      vi.advanceTimersByTime(HEADER_FRAME_INTERVAL_MS * INTRO_FRAME_COUNT);
      expect(caps.lines.length).toBeGreaterThan(afterStart);
      // Steady state: no room below the header, so no further repaints.
      const afterIntro = caps.lines.length;
      vi.advanceTimersByTime(HEADER_FRAME_INTERVAL_MS * 3);
      expect(caps.lines.length).toBe(afterIntro);
    } finally {
      caps.restore();
      header.dispose();
    }
  });

  it('re-renders header lines at the new terminal size on resize', () => {
    const caps = captureStdout();
    const header = new SessionHeader({ caps: animatableTtyCaps(80) });
    try {
      header.start();
      header.setSize(40, 30);
      const lines = header.renderLines(0);
      for (const line of lines) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(40);
      }
      // The header height is still reported consistently.
      expect(header.lineCount).toBe(lines.length);
      expect(header.height).toBe(30);
    } finally {
      caps.restore();
      header.dispose();
    }
  });
});
