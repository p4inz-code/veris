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
 * RENDERING MODEL — ALTERNATE SCREEN + FULL-FRAME REDRAW
 * ------------------------------------------------------
 * The interactive session runs on the terminal's ALTERNATE SCREEN BUFFER
 * (`\x1b[?1049h`): a dedicated full-screen canvas that is discarded when the
 * session ends. The header and the body are repainted TOGETHER as one frame
 * on every update — the body renderer positions at the home position,
 * rewrites the header lines, writes the body, and erases everything below
 * the frame (`\x1b[0J`).
 *
 * Because every frame starts at row 1 and redraws the header from scratch,
 * the header CANNOT scroll away, be erased by the body, or be pushed into
 * scrollback — no matter how the terminal handles scrolling, buffers, or
 * resize. This is the same architecture used by tmux/vim/less-style TUIs and
 * is the ONLY mechanism that is structurally correct on Windows Terminal /
 * ConPTY, where DECSTBM scroll-region pinning is unreliable (open upstream
 * bugs: microsoft/terminal#19016, #3673).
 *
 * The body region is CLIPPED to the visible screen below the header, so a
 * frame never exceeds the terminal height and nothing scrolls mid-frame.
 *
 * CURSOR PROTOCOL
 * ---------------
 * - The SessionHeader owns the header content and its animation; it exposes
 *   renderLines(frame) so the body renderer can compose full frames.
 * - The body renderer (DashboardRenderer) owns the frame: `\x1b[H` + header
 *   + body + `\x1b[0J`. The header is therefore re-anchored on every paint.
 * - The status-line animation repaints only the last header row in place
 *   (absolute CUP + `\x1b[2K`) between full frames, then returns the cursor
 *   to the bottom of the body region.
 * - dispose() leaves the alternate screen (`\x1b[?1049l`), restoring the
 *   primary screen and the shell prompt.
 *
 * ANIMATION
 * ---------
 * The header animation has two deterministic phases, driven by ONE timer
 * owned exclusively by this class, purely time-driven, never tied to scan
 * progress:
 *
 * 1. INTRO — a left-to-right LOGO WIPE: the VERIS logo fills in column by
 *    column from a dim ghost silhouette (theme progressEmpty glyphs in the
 *    textDim color) into the sharp brand logo. Six distinct wipe frames,
 *    then one SETTLE frame in which the identity/meta/status rows appear
 *    and the header reaches exactly its static form. The identity rows are
 *    blanked during the wipe so the header height — and therefore the body
 *    region below — stays perfectly stable. Each tick repaints the FULL
 *    header region in place.
 * 2. STEADY STATE — the completed logo + identity header is held for the
 *    rest of the session; each tick repaints only the status line's spinner
 *    glyph in place.
 *
 * The wipe is CHARACTER-based (ghost glyphs transform into the real logo),
 * so it is visibly meaningful even with --no-color; it adapts to the ASCII
 * wordmark fallback too. The final frame equals the normal static logo
 * exactly.
 *
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

/**
 * Frames in the startup LOGO WIPE phase: the VERIS logo fills in
 * left-to-right from a dim ghost silhouette. 6 wipe frames + 1 settle
 * frame = 7 intro frames at 150ms ≈ 1.05s — a short, polished, clearly
 * perceptible identity reveal.
 */
export const SWEEP_FRAMES = 6;

/**
 * Total intro frames: the 6-frame logo wipe plus one settle frame in which
 * the identity/meta/status rows appear and the header reaches its final
 * static form. Frames >= INTRO_FRAME_COUNT are the steady state (spinner
 * only).
 */
export const INTRO_FRAME_COUNT = SWEEP_FRAMES + 1;

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
 * otherwise. The logo is rendered as part of every frame.
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

/**
 * Apply the left-to-right wipe to one pure-text logo row.
 *
 * Columns before the reveal edge keep their real glyph; columns at/after it
 * are shown as a dim GHOST glyph (progressEmpty) wherever the final logo has
 * a glyph, and as a space wherever the final logo has a space — so the
 * logo's silhouette is visible before the real glyphs fill it in. The
 * mapping is 1:1 per character, so the revealed prefix exactly matches the
 * static logo and the final wipe frame is the static logo.
 */
function wipeLogoRow(text: string, revealedCols: number, ghost: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    out += i < revealedCols ? ch : ch === ' ' ? ' ' : ghost;
  }
  return out;
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
 * before it are stable and re-rendered with every frame.
 *
 * ANIMATED LOGO WIPE — when `animated` is true, frames 0..SWEEP_FRAMES-1
 * show the logo filling in left-to-right from a dim ghost silhouette
 * (progressEmpty glyphs in the textDim color) into the sharp brand logo;
 * the identity/meta/status rows are blanked during the wipe so the header
 * HEIGHT — and therefore the body region below — stays perfectly stable.
 * Frame SWEEP_FRAMES is the SETTLE: the full header appears in exactly its
 * static form. Frames >= INTRO_FRAME_COUNT are the steady state: the full
 * header is held and only the status-line spinner cycles.
 *
 * When `animated` is false (non-TTY, reduced-motion, --no-animation) the
 * full header is rendered immediately on every frame — no wipe, no spinner
 * cycling.
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

  // Identity / meta / status are computed up front: their wrap counts pin
  // the header height during the logo wipe, keeping the body region below
  // stable across every frame.
  const identity = `VERIS v${options.version ?? CLI_VERSION}  ${dash(unicode)} Deterministic Security Analysis Platform`;
  const identityLines = wrapText(` ${theme.ui.text}${identity}${R}`, width - 1, ' ');

  const meta = [
    `Node ${options.nodeVersion ?? process.version}`,
    options.platform ?? describePlatform(caps),
    options.terminal ?? describeTerminal(caps.emulator),
    describeColor(caps),
  ].join(separator(unicode));
  const metaLines = wrapText(` ${theme.ui.textDim}${meta}${R}`, width - 1, ' ');

  // The spinner only cycles once the intro has completed; during the wipe
  // and settle it sits at index 0 (its row is blanked during the wipe).
  const spinnerIndex = animated
    ? frame < INTRO_FRAME_COUNT
      ? 0
      : (frame - INTRO_FRAME_COUNT) % symbols.spinner.length
    : 0;
  const statusLine = renderStatusLine(theme, symbols, R, spinnerIndex, animated, statusText);

  const lines: string[] = [];
  lines.push('');

  if (animated && frame < SWEEP_FRAMES) {
    // INTRO — logo wipe: the block logo (or ASCII wordmark) fills in
    // left-to-right from a dim ghost silhouette. Unrevealed identity/meta/
    // status rows stay blank, holding the header height stable.
    const logoText = unicode ? LOGO : ['V E R I S'];
    const logoWidth = Math.max(0, ...logoText.map((l) => l.length));
    const revealedCols = Math.ceil((logoWidth * (frame + 1)) / SWEEP_FRAMES);
    const ghost = symbols.progressEmpty;
    for (const lt of logoText) {
      const wiped = wipeLogoRow(lt, revealedCols, ghost);
      const revealedPart = wiped.slice(0, revealedCols);
      const ghostPart = wiped.slice(revealedCols);
      lines.push(
        ghostPart.length > 0
          ? ` ${theme.ui.brand}${revealedPart}${theme.ui.textDim}${ghostPart}${R}`
          : ` ${theme.ui.brand}${revealedPart}${R}`,
      );
    }
    lines.push(...identityLines.map(() => ''));
    lines.push(...metaLines.map(() => ''));
    lines.push('');
  } else {
    // Full header — the final wipe frame, the settle frame, steady state,
    // and every non-animated frame all render exactly the static header.
    lines.push(...renderLogo(theme, symbols, R));
    lines.push(...identityLines);
    lines.push(...metaLines);
    lines.push(statusLine);
  }

  return lines;
}

// ── Session Header ──

/**
 * Persistent animated session header.
 *
 * Lifecycle:
 * - start(): enters the alternate screen buffer (TTY) and renders the first
 *   reveal frame. Exactly-once: repeated calls are no-ops.
 * - renderLines(frame): current header lines for full-frame composition.
 * - finalLines(): the COMPLETED header lines (full logo + identity) — used
 *   for the primary-screen dump so a session that ends mid-reveal still
 *   prints the finished identity.
 * - setBodyLineCount(): the body renderer reports how many lines currently
 *   sit below the header so the status-line animation can repaint in place.
 * - setSize(): the body renderer reports terminal resizes.
 * - dispose(): stops the animation and leaves the alternate screen exactly
 *   once. Repeated calls are no-ops. No output is ever written after
 *   dispose().
 */
export class SessionHeader {
  private caps: TerminalCapabilities;
  private readonly statusText: string;
  private readonly frameIntervalMs: number;
  private readonly noAnimation: boolean;
  private timer: ReturnType<typeof setInterval> | null = null;
  private frame = 0;
  private bodyLineCount = 0;
  private started = false;
  private disposed = false;

  constructor(options: SessionHeaderOptions = {}) {
    this.caps = options.caps ?? detectTerminal();
    this.statusText = options.statusText ?? 'VERIS session active';
    this.frameIntervalMs = options.frameIntervalMs ?? HEADER_FRAME_INTERVAL_MS;
    this.noAnimation = options.noAnimation ?? false;
  }

  /** Number of terminal rows the header occupies (logo + identity + status). */
  get lineCount(): number {
    return this.renderLines(0).length;
  }

  /** Current terminal height in rows (bounds the body region below the header). */
  get height(): number {
    return this.caps.height > 0 ? this.caps.height : 24;
  }

  /** Current animation frame index (drives the spinner glyph). */
  get frameIndex(): number {
    return this.frame;
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
   * Render the current header lines (logo + identity + meta + status).
   *
   * Deterministic for a given (caps, frame); the status line is always the
   * LAST line. Recomputed on every call so terminal resizes are reflected.
   *
   * When animation is permitted the frame drives the startup reveal and the
   * steady-state spinner; otherwise (non-TTY, reduced-motion, no-animation)
   * every frame renders the full static header.
   */
  renderLines(frame: number): readonly string[] {
    return renderSessionHeaderLines(this.caps, frame, {
      animated: this.shouldAnimate(),
      statusText: this.statusText,
    });
  }

  /**
   * The COMPLETED header lines — full logo, identity, meta, status — as if
   * the intro had finished. Used for the primary-screen dump so a session
   * that ends mid-reveal still prints the finished identity on exit.
   */
  finalLines(): readonly string[] {
    return this.renderLines(this.introFrames());
  }

  /** Update the terminal size after a resize (re-renders at the new width). */
  setSize(columns: number, rows: number): void {
    if (columns > 0) this.caps = { ...this.caps, width: columns };
    if (rows > 0) this.caps = { ...this.caps, height: rows };
  }

  /**
   * Start the session header.
   *
   * TTY: enters the alternate screen buffer (a dedicated full-screen canvas
   * for the interactive session) and renders the header once. Non-TTY:
   * renders the header as deterministic sequential output (no cursor
   * control). Exactly-once: subsequent calls are no-ops.
   */
  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;

    if (this.caps.isTty) {
      // Dedicated full-screen canvas for the interactive session. The body
      // renderer repaints header + body together as one frame on every
      // update, so the header is re-anchored at the top of every frame and
      // can never scroll away.
      process.stdout.write('\x1b[?1049h');
    }
    this.writeLines(this.renderLines(0));

    if (this.shouldAnimate()) {
      this.timer = setInterval(() => {
        this.frame++;
        this.onAnimationFrame();
      }, this.frameIntervalMs);
    }
  }

  /**
   * Number of frames the startup intro lasts (logo wipe + settle).
   *
   * Deterministic and independent of terminal size: 6 wipe frames plus one
   * settle frame (see INTRO_FRAME_COUNT).
   */
  private introFrames(): number {
    return INTRO_FRAME_COUNT;
  }

  /**
   * One animation tick: advance the frame and repaint the right region.
   *
   * During the intro the logo changes every frame, so the FULL header
   * region is repainted in place; once the intro completes only the status
   * line's spinner changes, so only that row is repainted.
   */
  private onAnimationFrame(): void {
    if (!this.caps.isTty) return;
    if (this.frame < this.introFrames()) {
      this.repaintHeaderRegion();
    } else {
      this.repaintStatusLine();
    }
  }

  /** Report how many lines the body region currently occupies below. */
  setBodyLineCount(n: number): void {
    this.bodyLineCount = Math.max(0, n);
  }

  /**
   * Stop the animation and release the header.
   *
   * Exactly-once: repeated calls are no-ops. On TTY, leaves the alternate
   * screen buffer (`\x1b[?1049l`) so the primary screen (shell prompt) is
   * restored. The session owner (DashboardRenderer) prints the final frame
   * on the primary screen after this returns. No timer is left running.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.caps.isTty) {
      process.stdout.write('\x1b[?1049l');
    }
  }

  // ── Internal ──

  /**
   * Write lines to the terminal without ever triggering a bottom-row scroll.
   *
   * A newline written while the cursor sits on the bottom row scrolls the
   * whole screen up by one. If the content fills the screen exactly, the
   * final newline is therefore suppressed so the frame stays anchored.
   */
  private writeLines(lines: readonly string[]): void {
    const R = this.height;
    for (let i = 0; i < lines.length; i++) {
      const isLast = i === lines.length - 1;
      process.stdout.write(lines[i] + (isLast && lines.length >= R ? '' : '\n'));
    }
  }

  /**
   * Repaint the FULL header region in place (startup reveal frames).
   *
   * Re-anchors at the home position and rewrites every header row, so the
   * logo draw-in is visible without touching the body region below
   * (rows H+1..R are never written or erased). The cursor is parked at the
   * bottom of the body region afterwards, matching repaintStatusLine().
   */
  private repaintHeaderRegion(): void {
    if (!this.caps.isTty) return;
    const lines = this.renderLines(this.frameIndex);
    const H = lines.length;
    const R = this.height;
    if (H > R) return; // Degenerate: header taller than the screen.

    process.stdout.write('\x1b[H');
    for (let i = 0; i < lines.length; i++) {
      process.stdout.write(lines[i] + (i === lines.length - 1 ? '' : '\n'));
    }
    const bodyRow = Math.min(H + 1 + this.bodyLineCount, R);
    process.stdout.write(`\x1b[${bodyRow};1H`);
  }

  /**
   * Repaint only the status line (the last header row) in place.
   *
   * Between full-frame repaints the spinner cycles here: CUP to the status
   * row (absolute — screen-absolute with DECOM off), erase the line, rewrite
   * the status, then return the cursor to the bottom of the body region so
   * stray stderr writes land below the dashboard. Logo rows and body rows
   * are never touched.
   */
  private repaintStatusLine(): void {
    if (!this.caps.isTty) return;
    const lines = this.renderLines(this.frameIndex);
    const H = lines.length;
    const R = this.height;
    if (H >= R) return; // Degenerate: header taller than the screen.

    const status = lines[lines.length - 1];
    process.stdout.write(`\x1b[${H};1H\x1b[2K`);
    process.stdout.write(status);
    const bodyRow = Math.min(H + 1 + this.bodyLineCount, R);
    process.stdout.write(`\x1b[${bodyRow};1H`);
  }
}
