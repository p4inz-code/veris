/**
 * Progress bar component for VERIS CLI.
 *
 * Features:
 * - Animated with configurable width
 * - Percentage display
 * - ETA calculation
 * - Completed/remaining count
 * - Multiple bar styles
 * - Indeterminate mode
 *
 * @module @veris/cli/ui/components
 */

import { getSymbolSet } from '../renderer/index.js';
import { type TerminalCapabilities, detectTerminal } from '../terminal/index.js';
import { getResolvedTheme } from '../theme/index.js';

// ── Bar Styles ──

/** Available progress bar visual styles. */
export type ProgressBarStyle = 'default' | 'filled' | 'shaded' | 'minimal' | 'retro';

// ── Progress Bar Options ──

/** Options for configuring a progress bar. */
export interface ProgressBarOptions {
  /** Width of the progress bar in characters (default: terminal width / 3). */
  readonly width?: number;
  /** Visual style of the bar. */
  readonly style?: ProgressBarStyle;
  /** Label text shown before the bar. */
  readonly label?: string;
  /** Whether to show percentage. */
  readonly showPercent?: boolean;
  /** Whether to show count (e.g., "42/100"). */
  readonly showCount?: boolean;
  /** Whether to show ETA. */
  readonly showEta?: boolean;
  /** Whether to show the current item name. */
  readonly showCurrent?: boolean;
  /** Whether to show files per second rate. */
  readonly showRate?: boolean;
  /** Terminal capabilities (auto-detected if not provided). */
  readonly caps?: TerminalCapabilities;
}

// ── Progress State ──

/** Internal progress state. */
export interface ProgressState {
  readonly current: number;
  readonly total: number;
  readonly currentItem?: string;
  readonly elapsedMs: number;
  readonly rate?: number;
}

// ── Helpers ──

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatEta(ms: number): string {
  if (ms <= 0 || !Number.isFinite(ms)) return '--';
  return formatDuration(ms);
}

// ── Progress Bar Renderer ──

/**
 * Render a progress bar as a string.
 *
 * Returns a multi-line string ready for writing to stdout.
 */
export function renderProgressBar(
  state: ProgressState,
  options: ProgressBarOptions = {},
): string[] {
  const caps = options.caps ?? detectTerminal();
  const theme = getResolvedTheme();
  const symbols = getSymbolSet();
  const width = options.width ?? Math.max(10, Math.floor(caps.width / 3));
  const style = options.style ?? 'default';

  const lines: string[] = [];

  // ── Label line ──
  if (options.label) {
    lines.push(options.label);
  }

  // ── Progress bar ──
  const percent = state.total > 0 ? Math.min(state.current / state.total, 1) : 0;
  const filledWidth = Math.round(percent * width);
  const emptyWidth = width - filledWidth;

  // Determine bar characters based on style
  let full: string;
  let empty: string;
  let start: string = '';
  let end: string = '';

  switch (style) {
    case 'filled':
      full = symbols.progressFull;
      empty = symbols.progressEmpty;
      break;
    case 'shaded':
      full = symbols.progressFull;
      empty = symbols.progressEmpty;
      break;
    case 'minimal':
      full = symbols.progressFull;
      empty = ' ';
      break;
    case 'retro':
      full = '#';
      empty = '-';
      start = '[';
      end = ']';
      break;
    default:
      full = symbols.progressFull;
      empty = symbols.progressEmpty;
      start = symbols.progressStart;
      end = symbols.progressEnd;
  }

  const bar = `${start}${full.repeat(filledWidth)}${empty.repeat(emptyWidth)}${end}`;
  const pct = ` ${(percent * 100).toFixed(0)}%`;

  lines.push(`${bar}${pct}`);

  // ── Count line ──
  if (options.showCount) {
    lines.push(`  ${state.current} / ${state.total}`);
  }

  // ── Current item ──
  if (options.showCurrent && state.currentItem) {
    const maxWidth = caps.width - 4;
    const item =
      state.currentItem.length > maxWidth
        ? state.currentItem.slice(0, maxWidth - 3) + symbols.ellipsis
        : state.currentItem;
    lines.push(`  ${symbols.arrow} ${item}`);
  }

  // ── Statistics line ──
  const stats: string[] = [];

  if (options.showEta) {
    const elapsed = formatDuration(state.elapsedMs);
    stats.push(`Elapsed: ${elapsed}`);

    if (percent > 0) {
      const etaMs = state.elapsedMs / percent - state.elapsedMs;
      stats.push(`ETA: ${formatEta(etaMs)}`);
    }
  }

  if (options.showRate && state.rate !== undefined) {
    stats.push(`${state.rate.toFixed(1)}/s`);
  }

  if (stats.length > 0) {
    lines.push(`  ${stats.join('  |  ')}`);
  }

  return lines;
}

/**
 * Clear previously rendered progress lines (move cursor up).
 *
 * @param lineCount - Number of lines to clear.
 */
export function clearProgressLines(lineCount: number): string {
  if (lineCount <= 0) return '';
  // Move cursor up `lineCount` lines, clear each line
  const caps = detectTerminal();
  if (!caps.isTty) return '';

  // ANSI: move up, clear line, move up, clear line, ...
  const lines: string[] = [];
  for (let i = 0; i < lineCount; i++) {
    lines.push('\x1b[1A\x1b[2K');
  }
  return lines.join('');
}
