/**
 * Pipeline Visualization — compact deterministic stage display.
 *
 * Renders the five core pipeline phases as stable rows, Unicode mode:
 *
 *   ✓ Discover
 *   ✓ Extract
 *   ● Analyze
 *   ○ Correlate
 *   ○ Report
 *
 * ASCII fallback (equally readable):
 *
 *   [done] Discover
 *   [run ] Analyze
 *   [    ] Correlate
 *   [fail] Extract
 *
 * Each display phase maps to one or more real pipeline stages. A phase is
 * only marked complete when every mapped stage has genuinely completed, so
 * the visualization never claims completion before the work is done.
 *
 * All colors come from the theme system; all symbols from the symbol system.
 *
 * @module @veris/cli/scan/progress
 */

import { getSymbolSet } from '../../ui/renderer/index.js';
import { getResolvedTheme, ansiReset } from '../../ui/theme/index.js';
import type { StageState, StageStatus } from '../scan-session.js';

/** Options for pipeline visualization. */
export interface PipelineVizOptions {
  /** Maximum row width; rows are capped with an ellipsis rather than wrapping. */
  readonly width?: number;
  /** Optional plain section header emitted before the phase rows. */
  readonly title?: string;
  /** Show item counts for completed phases (e.g., "100 items"). */
  readonly showItems?: boolean;
}

/** A display phase mapped to the real pipeline stages it represents. */
export interface PipelinePhase {
  readonly id: string;
  readonly label: string;
  readonly stages: readonly string[];
}

/**
 * The canonical display phases shown during a scan.
 *
 * Mapping (display phase → real pipeline stages):
 * - Discover   → discovery, classification
 * - Extract    → extraction, knowledge
 * - Analyze    → analysis, rules
 * - Correlate  → correlation
 * - Report     → reporting, export
 */
export const PIPELINE_PHASES: readonly PipelinePhase[] = Object.freeze([
  { id: 'discover', label: 'Discover', stages: ['discovery', 'classification'] },
  { id: 'extract', label: 'Extract', stages: ['extraction', 'knowledge'] },
  { id: 'analyze', label: 'Analyze', stages: ['analysis', 'rules'] },
  { id: 'correlate', label: 'Correlate', stages: ['correlation'] },
  { id: 'report', label: 'Report', stages: ['reporting', 'export'] },
]);

/**
 * Resolve the aggregate status of a display phase from its stage states.
 *
 * - failed    — any mapped stage failed
 * - running   — any mapped stage is currently running, or the phase is
 *               partially complete (some stages done, others not yet)
 * - completed — every mapped stage has completed
 * - waiting   — no mapped stage has started
 */
export function phaseStatus(stages: Record<string, StageState>, phase: PipelinePhase): StageStatus {
  let anyFailed = false;
  let anyRunning = false;
  let anyStarted = false;

  for (const id of phase.stages) {
    const stage = stages[id];
    if (!stage || stage.status === 'waiting') continue;
    anyStarted = true;
    if (stage.status === 'failed') anyFailed = true;
    else if (stage.status === 'running') anyRunning = true;
  }

  if (anyFailed) return 'failed';
  if (anyRunning) return 'running';
  if (anyStarted) {
    const allCompleted = phase.stages.every((id) => stages[id]?.status === 'completed');
    return allCompleted ? 'completed' : 'running';
  }
  return 'waiting';
}

/**
 * Render a pipeline visualization as an array of lines.
 *
 * Returns only the phase rows (no surrounding box); callers may add their
 * own section headers. The `title` option emits a plain section header line.
 */
export function renderPipelineVisualization(
  stages: Record<string, StageState>,
  options: PipelineVizOptions = {},
): readonly string[] {
  const theme = getResolvedTheme();
  const symbols = getSymbolSet();
  const R = ansiReset();
  const ascii = symbols.hLine === '-';
  const { showItems = false, width, title } = options;

  const lines: string[] = [];
  if (title) {
    lines.push(` ${theme.ui.accent}${title}${R}`);
  }

  for (const phase of PIPELINE_PHASES) {
    const status = phaseStatus(stages, phase);
    const marker = ascii ? asciiMarker(status) : unicodeMarker(status);
    const color = statusColor(status, theme);
    // Wide enough for the longest ASCII tag row: "  [done] Discover" (16 cols).
    const maxWidth = Math.max(16, (width ?? 80) - 4);

    let row = `  ${color}${marker}${R} ${theme.ui.text}${phase.label}${R}`;

    if (showItems && status === 'completed') {
      const items = phaseItems(stages, phase);
      if (items > 0) {
        row += `  ${theme.ui.textDim}${formatNumber(items)} items${R}`;
      }
    }

    if (row.length > maxWidth) {
      row = row.slice(0, maxWidth - 3) + symbols.ellipsis;
    }
    lines.push(row);
  }

  return lines;
}

/** Get the unicode marker for a stage status. */
function unicodeMarker(status: StageStatus): string {
  const symbols = getSymbolSet();
  switch (status) {
    case 'completed':
      return symbols.check;
    case 'running':
      return symbols.running;
    case 'failed':
      return symbols.error;
    case 'waiting':
      return symbols.waiting;
  }
}

/** Get the fixed-width ASCII marker tag for a stage status. */
function asciiMarker(status: StageStatus): string {
  switch (status) {
    case 'completed':
      return '[done]';
    case 'running':
      return '[run ]';
    case 'failed':
      return '[fail]';
    case 'waiting':
      return '[    ]';
  }
}

/** Get the theme color for a stage status. */
function statusColor(status: StageStatus, theme: ReturnType<typeof getResolvedTheme>): string {
  switch (status) {
    case 'completed':
      return theme.status.success;
    case 'running':
      return theme.ui.accent;
    case 'failed':
      return theme.status.error;
    case 'waiting':
      return theme.ui.textDim;
  }
}

/** Sum the items processed across a phase's stages. */
function phaseItems(stages: Record<string, StageState>, phase: PipelinePhase): number {
  return phase.stages.reduce((sum, id) => sum + (stages[id]?.itemsProcessed ?? 0), 0);
}

/** Deterministic thousands separator (locale-independent). */
function formatNumber(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
