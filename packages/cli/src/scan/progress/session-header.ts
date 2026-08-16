/**
 * Session Header — persistent animated header for an interactive VERIS session.
 *
 * OWNERSHIP (session vs scan lifecycle)
 * --------------------------------------
 * The VERIS logo/header is a SESSION-scoped element, NOT a scan-scoped one.
 * It is created exactly once when an interactive session starts and remains
 * on screen for the entire session: the scan dashboard, errors, cancellation,
 * and the final summary all render BELOW it. Only dispose() — the moment the
 * process/session actually closes — stops the animation and releases the
 * header.
 *
 * This is the architectural fix for the post-v1.0.0 regression where the logo
 * was part of the scan's startup screen and was wiped by the first dashboard
 * repaint (band-aided with STARTUP_MIN_DISPLAY_MS). The header is now owned
 * by the session lifecycle; no scan lifecycle event can erase it.
 *
 * RENDERING MODEL
 * ---------------
 * - The logo + identity lines are rendered EXACTLY ONCE (start()) and are
 *   never re-written, erased, or overwritten for the whole session.
 * - Only the STATUS LINE animates: a spinner cycles in place on the last
 *   header row. The animation is purely time-driven and NEVER depends on
 *   scan progress.
 *
 * CURSOR / SCROLL PROTOCOL
 * ------------------------
 * The header is pinned at the top of the terminal with a DECSTBM scroll
 * region (`\x1b[<H+1>;<rows>r`): the body renders INSIDE the region, so when
 * the body grows taller than the screen the terminal scrolls ONLY the body
 * region — the header rows above the region can never scroll away. This is
 * the mechanism terminals themselves use to pin status lines (vim, less,
 * top) and it is supported by Windows Terminal/ConPTY.
 *
 * - The header owns the top `lineCount` rows; they are outside the scroll
 *   region and never move.
 * - The body renderer (DashboardRenderer) owns the rows below and reports its
 *   current line count via setBodyLineCount().
 * - The body renderer positions at the region top (`\x1b[<H+1>;1H`) and
 *   erases to the end of the display before every repaint, so leftover rows
 *   from the previous body vanish without ever touching the header.
 * - The status-line animation reaches the status row with ABSOLUTE
 *   positioning (`\x1b[<H>;1H` — CUP is screen-absolute, DECOM off), erases
 *   + rewrites it in place, then restores the cursor to the bottom of the
 *   body region. It never touches logo rows or body rows.
 * - dispose() resets the region (`\x1b[r`) so the terminal returns to normal
 *   scrolling for the shell prompt.
 *
 * ANIMATION
 * ---------
 * - Exactly one timer, owned exclusively by this class, purely time-driven.
 * - Disabled on non-TTY, reduced-motion, or --no-animation (static render).
 *
 * @module @veris/cli/scan/progress
 */

import { getSymbolSet } from '../../ui/renderer/index.js';
import { detectTerminal, type TerminalCapabilities } from '../../ui/terminal/index.js';
import { getResolvedTheme, ansiReset, type ResolvedTheme } from '../../ui/theme/index.js';
import { wrapText } from '../../ui/utilities/index.js';
import { CLI_VERSION } from '../../wirer.js';

// ── Constants ──

/** Default animation frame interval (ms). */
export const HEADER_FRAME_INTERVAL_MS = 150;

/** Maximum header width in characters (matches the other summary screens). */
export const HEADER_MAX_WIDTH = 100;

/** Friendly names for detected terminal emulators. */
const TERMINAL_NAMES: Record<string, string> = Object.freeze({
  'windows-terminal': 'Windows Terminal',
  vscode: 'VS Code',
  iterm2: 'iTerm2',
  kitty: 'Kitty',
  alacritty: 'Alacritty',
  wezterm: 'WezTerm',
  ghostty: 'Ghostty',
  tmux: 'tmux',
  screen: 'screen',
  xterm: 'xterm',
  unknown: 'unknown',
});

/** The VERIS Unicode block logo. */
const LOGO = [
  '██╗   ██╗███████╗██████╗ ██╗███████╗',
  '██║   ██║██╔════╝██╔══██╗██║██╔════╝',
  '██║   ██║█████╗  ██████╔╝██║███████╗',
  '╚██╗ ██╔╝██╔══╝  ██╔══██╗██║╚════██║',
  ' ╚████╔╝ ███████╗██║  ██║██║███████║',
  '  ╚═══╝  ╚══════╝╚═╝  ╚═╝╚═╝╚══════╝',
];

// ── Options ──

/** Options for the session header. */
export interface SessionHeaderOptions {
  /** Terminal capabilities (injected for tests; auto-detected otherwise). */
  readonly caps?: TerminalCapabilities;
  /** Status text shown on the animated status line. */
  readonly statusText?: string;
  /** Animation frame interval in ms. */
  readonly frameIntervalMs?: number;
  /** Force a static (non-animated) header, e.g. --no-animation. */
  readonly noAnimation?: boolean;
}

/** Options for rendering header lines (pure function). */
export interface SessionHeaderRenderOptions {
  /** Whether the status line is animated (affects the spinner glyph). */
  readonly animated?: boolean;
  /** Status text for the animated status line. */
  readonly statusText?: string;
  /** VERIS version string. Defaults to CLI_VERSION. */
  readonly version?: string;
  /** Node.js version string. Defaults to process.version. */
  readonly nodeVersion?: string;
  /** Platform label. Defaults to the detected OS. */
  readonly platform?: string;
  /** Terminal emulator label. Defaults to the detected emulator. */
  readonly terminal?: string;
}

// ── Pure Render Helpers ──

/** Whether the current symbol set is the Unicode variant. */
export function isUnicodeSymbols(symbols: ReturnType<typeof getSymbolSet>): boolean {
  // The ASCII fallback set uses '-' for horizontal lines.
  return symbols.hLine !== '-';
}

/**
 * Render the VERIS logo lines.
 *
 * Unicode block logo when the symbol set supports Unicode; ASCII wordmark
 * otherwise. The logo is rendered exactly once per session and never
 * re-written.
 */
export function renderLogo(
  theme: ResolvedTheme,
  symbols: ReturnType<typeof getSymbolSet>,
  R: string,
): readonly string[] {
  const brand = theme.ui.brand;

  if (!isUnicodeSymbols(symbols)) {
    return [` ${brand}V E R I S${R}`];
  }
  return LOGO.map((line) => ` ${brand}${line}${R}`);
}

/**
 * Render the animated status line.
 *
 * When animated, a spinner glyph cycles through the symbol set's frames;
 * otherwise a static marker is used (reduced-motion / non-TTY).
 */
export function renderStatusLine(
  theme: ResolvedTheme,
  symbols: ReturnType<typeof getSymbolSet>,
  R: string,
  frame: number,
  animated: boolean,
  statusText: string,
): string {
  const indicator = animated ? symbols.spinner[frame % symbols.spinner.length] : symbols.running;
  return ` ${theme.ui.accent}${indicator}${R} ${theme.ui.textDim}${statusText}${R}`;
}

function dash(unicode: boolean): string {
  return unicode ? '—' : '-';
}

function separator(unicode: boolean): string {
  return unicode ? ' · ' : ' | ';
}

function describePlatform(caps: TerminalCapabilities): string {
  return caps.isWindows ? `${caps.os} (Windows)` : caps.os;
}

function describeTerminal(emulator: TerminalCapabilities['emulator']): string {
  return TERMINAL_NAMES[emulator] ?? emulator;
}

function describeColor(caps: TerminalCapabilities): string {
  switch (caps.colorDepth) {
    case 'none':
      return 'No color';
    case 'ansi':
      return '16 colors';
    case 'ansi256':
      return '256 colors';
    case 'truecolor':
      return 'Truecolor';
  }
}

/**
 * Render the full session header lines (logo + identity + status line).
 *
 * Deterministic: the same (caps, frame, options) always produces the same
 * lines. The status line is always the LAST line; the logo + identity lines
 * before it are written exactly once and never change.
 */
export function renderSessionHeaderLines(
  caps: TerminalCapabilities,
  frame: number,
  options: SessionHeaderRenderOptions = {},
): readonly string[] {
  const theme = getResolvedTheme();
  const symbols = getSymbolSet();
  const R = ansiReset();
  const width = Math.min(caps.width, HEADER_MAX_WIDTH);
  const unicode = isUnicodeSymbols(symbols);
  const animated = options.animated ?? false;
  const statusText = options.statusText ?? 'VERIS session active';

  const lines: string[] = [];
  lines.push('');
  lines.push(...renderLogo(theme, symbols, R));

  const identity = `VERIS v${options.version ?? CLI_VERSION}  ${dash(unicode)} Deterministic Security Analysis Platform`;
  lines.push(...wrapText(` ${theme.ui.text}${identity}${R}`, width - 1, ' '));

  const meta = [
    `Node ${options.nodeVersion ?? process.version}`,
    options.platform ?? describePlatform(caps),
    options.terminal ?? describeTerminal(caps.emulator),
    describeColor(caps),
  ].join(separator(unicode));
  lines.push(...wrapText(` ${theme.ui.textDim}${meta}${R}`, width - 1, ' '));

  lines.push(renderStatusLine(theme, symbols, R, frame, animated, statusText));

  return lines;
}

// ── Session Header ──

/**
 * Persistent animated session header.
 *
 * Lifecycle:
 * - start(): renders the logo + identity + status line once and (when
 *   animation is allowed) starts the animation timer. Exactly-once: repeated
 *   calls are no-ops.
 * - setBodyLineCount(): the body renderer reports how many lines currently
 *   sit below the header so the status-line animation can repaint in place.
 * - dispose(): stops the animation exactly once. Repeated calls are no-ops.
 *   No output is ever written after dispose().
 */
export class SessionHeader {
  private readonly caps: TerminalCapabilities;
  private readonly statusText: string;
  private readonly frameIntervalMs: number;
  private readonly noAnimation: boolean;
  private timer: ReturnType<typeof setInterval> | null = null;
  private frameIndex = 0;
  private bodyLineCount = 0;
  private started = false;
  private disposed = false;
  /** Current terminal height in rows (updated on resize). */
  private height: number;
  /** Logo + identity + meta lines (static; written exactly once). */
  private readonly staticLines: readonly string[];

  constructor(options: SessionHeaderOptions = {}) {
    this.caps = options.caps ?? detectTerminal();
    this.statusText = options.statusText ?? 'VERIS session active';
    this.frameIntervalMs = options.frameIntervalMs ?? HEADER_FRAME_INTERVAL_MS;
    this.noAnimation = options.noAnimation ?? false;
    this.height = this.caps.height > 0 ? this.caps.height : 24;
    const full = renderSessionHeaderLines(this.caps, 0, {
      animated: false,
      statusText: this.statusText,
    });
    this.staticLines = full.slice(0, -1);
  }

  /** Number of terminal rows the header occupies (logo + identity + status). */
  get lineCount(): number {
    return this.staticLines.length + 1;
  }

  /** Whether the animation timer is currently active. */
  get isAnimating(): boolean {
    return this.timer !== null;
  }

  /** Whether start() has been called. */
  get isStarted(): boolean {
    return this.started;
  }

  /** Whether dispose() has been called. */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /** Whether animation is permitted in this environment. */
  shouldAnimate(): boolean {
    return this.caps.isTty && !this.caps.prefersReducedMotion && !this.noAnimation;
  }

  /**
   * Render the header once and start the animation.
   *
   * Exactly-once initialization: subsequent calls are no-ops (the header is
   * never re-rendered or re-created).
   */
  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;

    // Initial sequential render: logo + identity written exactly once.
    const full = renderSessionHeaderLines(this.caps, 0, {
      animated: false,
      statusText: this.statusText,
    });
    for (const line of full) {
      process.stdout.write(line + '\n');
    }

    if (this.caps.isTty) {
      // Pin the header: confine scrolling to the body region below it. The
      // cursor is already at the region top (one past the last header line).
      this.setScrollRegion();
    }

    if (this.shouldAnimate()) {
      this.timer = setInterval(() => {
        this.frameIndex++;
        this.repaintStatusLine();
      }, this.frameIntervalMs);
    }
  }

  /** Report how many lines the body region currently occupies below. */
  setBodyLineCount(n: number): void {
    this.bodyLineCount = Math.max(0, n);
  }

  /**
   * Stop the animation and release the header.
   *
   * Exactly-once disposal: repeated calls are no-ops. The DECSTBM scroll
   * region is reset (`\x1b[r`) so the terminal returns to normal scrolling
   * for the shell prompt. No output is written after the reset and no timer
   * is left running.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Restore the full-screen scroll region. Only on TTY (the region is
    // never set in non-TTY mode).
    if (this.caps.isTty) {
      process.stdout.write('\x1b[r');
    }
  }

  /**
   * Re-emit the DECSTBM scroll region after the terminal is resized.
   *
   * Called by the session owner (DashboardRenderer) on stdout 'resize'.
   * The header rows stay pinned; the body region follows the new height.
   */
  updateRegion(): void {
    if (!this.caps.isTty || this.disposed) return;
    if (typeof process.stdout.rows === 'number' && process.stdout.rows > 0) {
      this.height = process.stdout.rows;
    }
    this.setScrollRegion();
  }

  // ── Internal ──

  /**
   * Pin the header by confining scrolling to the body region below it.
   *
   * DECSTBM (`\x1b[<H+1>;<rows>r`) makes the terminal scroll only within
   * rows H+1..rows when newlines are written at the bottom. The header rows
   * 1..H are outside the region and can never scroll away, no matter how
   * tall the body grows. This is the structural fix for the header
   * scrolling into scrollback on real terminals.
   */
  private setScrollRegion(): void {
    if (!this.caps.isTty || this.disposed) return;
    const H = this.lineCount;
    const R = this.height;
    if (H >= R) return; // Degenerate: header taller than the screen.
    process.stdout.write(`\x1b[${H + 1};${R}r`);
  }

  /**
   * Repaint only the status line (the last header row) in place.
   *
   * The status row is ABOVE the DECSTBM scroll region, so relative cursor
   * movement (CUU/CUD) cannot reach it — CUP is used instead, which is
   * screen-absolute (DECOM off) and works regardless of the scroll region:
   * - CUP to the status row (row H), erase the line, rewrite the status.
   * - CUP back to the body write position: the row right after the last
   *   body line, clamped to the bottom of the screen.
   *
   * Logo rows 1..H-1 and body rows are never touched.
   */
  private repaintStatusLine(): void {
    if (!this.caps.isTty) return;
    const H = this.lineCount;
    const R = this.height;
    if (H >= R) return;

    const theme = getResolvedTheme();
    const symbols = getSymbolSet();
    const reset = ansiReset();
    const status = renderStatusLine(theme, symbols, reset, this.frameIndex, true, this.statusText);

    process.stdout.write(`\x1b[${H};1H\x1b[2K`);
    process.stdout.write(status);
    const bodyRow = Math.min(H + 1 + this.bodyLineCount, R);
    process.stdout.write(`\x1b[${bodyRow};1H`);
  }
}
