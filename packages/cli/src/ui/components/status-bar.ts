/**
 * Status bar component for VERIS CLI.
 *
 * Displays a footer with real-time scan information:
 * - Current pipeline stage
 * - Memory usage
 * - Files processed / total
 * - ETA and elapsed time
 * - Current worker count
 *
 * @module @veris/cli/ui/components
 */

import { getSymbolSet } from '../renderer/index.js';
import { type TerminalCapabilities, detectTerminal } from '../terminal/index.js';
import { getResolvedTheme } from '../theme/index.js';

// ── Types ──

/** Pipeline stage identifiers. */
export type PipelineStage =
  | 'discovery'
  | 'classification'
  | 'extraction'
  | 'analysis'
  | 'rules'
  | 'correlation'
  | 'risk'
  | 'reporting'
  | 'export'
  | 'idle'
  | 'complete';

/** Stage display labels. */
export const STAGE_LABELS: Record<PipelineStage, string> = Object.freeze({
  discovery: 'Discovery',
  classification: 'Classify',
  extraction: 'Extraction',
  analysis: 'Analysis',
  rules: 'Rules',
  correlation: 'Correlation',
  risk: 'Risk',
  reporting: 'Report',
  export: 'Export',
  idle: 'Idle',
  complete: 'Complete',
});

/** Data for rendering a status bar. */
export interface StatusBarData {
  /** Current pipeline stage. */
  readonly stage: PipelineStage;
  /** Memory usage in MB. */
  readonly memoryMB?: number;
  /** Total system memory in MB. */
  readonly totalMemoryMB?: number;
  /** Number of files processed. */
  readonly filesProcessed?: number;
  /** Total number of files. */
  readonly totalFiles?: number;
  /** Elapsed time in milliseconds. */
  readonly elapsedMs?: number;
  /** Estimated time remaining in milliseconds. */
  readonly etaMs?: number;
  /** Current processing rate (items/second). */
  readonly rate?: number;
  /** Active worker count. */
  readonly workers?: number;
  /** Error count. */
  readonly errors?: number;
}

// ── Status Bar Options ──

/** Options for rendering a status bar. */
export interface StatusBarOptions {
  /** Terminal capabilities (auto-detected if not provided). */
  readonly caps?: TerminalCapabilities;
  /** Whether to show memory usage. */
  readonly showMemory?: boolean;
  /** Whether to show file count. */
  readonly showFiles?: boolean;
  /** Whether to show timing. */
  readonly showTiming?: boolean;
  /** Whether to show the current stage. */
  readonly showStage?: boolean;
  /** Whether to show worker count. */
  readonly showWorkers?: boolean;
  /** Whether to show error count. */
  readonly showErrors?: boolean;
}

// ── Helpers ──

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0)
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  if (minutes > 0) return `${minutes}:${String(seconds).padStart(2, '0')}`;
  return `0:${String(seconds).padStart(2, '0')}`;
}

function formatMemory(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

// ── Status Bar Renderer ──

/**
 * Render a status bar as a single line string.
 *
 * The status bar is designed to be displayed at the bottom of the terminal
 * and updates in-place using carriage return.
 */
export function renderStatusBar(data: StatusBarData, options: StatusBarOptions = {}): string {
  const caps = options.caps ?? detectTerminal();
  const theme = getResolvedTheme();
  const symbols = getSymbolSet();

  const segments: string[] = [];

  // ── Stage indicator ──
  if (options.showStage !== false) {
    const stageLabel = STAGE_LABELS[data.stage] ?? data.stage;
    const stageColor =
      data.stage === 'complete'
        ? theme.status.success
        : data.stage === 'idle'
          ? theme.ui.textDim
          : theme.ui.accent;
    segments.push(`${stageColor}${stageLabel}\x1b[0m`);
  }

  // ── File progress ──
  if (options.showFiles !== false && data.filesProcessed !== undefined) {
    const files =
      data.totalFiles !== undefined
        ? `${data.filesProcessed}/${data.totalFiles}`
        : `${data.filesProcessed}`;
    segments.push(`${symbols.file} ${files}`);
  }

  // ── Timing ──
  if (options.showTiming !== false) {
    const parts: string[] = [];

    if (data.elapsedMs !== undefined) {
      parts.push(formatDuration(data.elapsedMs));
    }

    if (data.etaMs !== undefined && data.etaMs > 0 && Number.isFinite(data.etaMs)) {
      parts.push(`-${formatDuration(data.etaMs)}`);
    }

    if (data.rate !== undefined) {
      parts.push(`${data.rate.toFixed(1)}/s`);
    }

    if (parts.length > 0) {
      segments.push(parts.join(' '));
    }
  }

  // ── Memory ──
  if (options.showMemory !== false && data.memoryMB !== undefined) {
    const memStr =
      data.totalMemoryMB !== undefined
        ? `${formatMemory(data.memoryMB)}/${formatMemory(data.totalMemoryMB)}`
        : formatMemory(data.memoryMB);
    segments.push(memStr);
  }

  // ── Workers ──
  if (options.showWorkers && data.workers !== undefined) {
    segments.push(`workers: ${data.workers}`);
  }

  // ── Errors ──
  if (options.showErrors && data.errors !== undefined && data.errors > 0) {
    segments.push(`${theme.status.error}errors: ${data.errors}\x1b[0m`);
  }

  // Assemble the status bar line
  const separator = ` ${theme.ui.textDim}|\x1b[0m `;
  const line = segments.join(separator);

  // Truncate to terminal width
  const maxWidth = caps.width;
  if (line.length > maxWidth) {
    return line.slice(0, maxWidth - 3) + symbols.ellipsis;
  }

  return line;
}

/**
 * Generate a full-width status bar line with proper padding.
 * For use at the bottom of the terminal.
 */
export function renderFullStatusBar(data: StatusBarData, options: StatusBarOptions = {}): string {
  const caps = options.caps ?? detectTerminal();
  const bar = renderStatusBar(data, options);

  // Pad to terminal width
  if (bar.length < caps.width) {
    return bar + ' '.repeat(caps.width - bar.length);
  }

  return bar;
}
