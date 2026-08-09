/**
 * Performance Panel — displays real-time performance metrics.
 *
 * Shows:
 * - Files/sec
 * - Average latency
 * - Slowest file
 * - Fastest file
 * - Pipeline stage timings
 * - Peak memory usage
 *
 * @module @veris/cli/scan/progress
 */

import { renderBox } from '../../ui/layout/index.js';
import { getSymbolSet } from '../../ui/renderer/index.js';
import { getResolvedTheme } from '../../ui/theme/index.js';
import { truncateStart } from '../../ui/utilities/index.js';
import type { ProfilerSnapshot } from '../profiler.js';
import type { PerformanceMetrics } from '../scan-session.js';
import { PIPELINE_STAGE_LABELS } from '../scan-session.js';

/** Options for the performance panel. */
export interface PerformancePanelOptions {
  readonly width?: number;
  readonly title?: string;
  readonly profilerSnapshot?: ProfilerSnapshot | null;
}

/**
 * Render the performance panel as an array of lines.
 */
export function renderPerformancePanel(
  perf: PerformanceMetrics,
  options: PerformancePanelOptions = {},
): readonly string[] {
  const theme = getResolvedTheme();
  const symbols = getSymbolSet();
  const width = options.width;
  const title = options.title ?? 'Performance';
  const profiler = options.profilerSnapshot;

  const contentLines: string[] = [];

  // Two-column layout: left (throughput), right (timing)
  // Left column
  contentLines.push(` ${theme.ui.textDim}Throughput:\\x1b[0m`);
  contentLines.push(
    `   Files/sec:        ${perf.filesPerSecond > 0 ? perf.filesPerSecond.toFixed(1) : '-'}`,
  );
  contentLines.push(
    `   Avg latency:      ${perf.averageFileDurationMs > 0 ? `${perf.averageFileDurationMs.toFixed(0)} ms` : '-'}`,
  );

  if (perf.slowestFile) {
    const path = truncateStart(perf.slowestFile.path, Math.max(15, (width ?? 80) - 40));
    contentLines.push(
      `   Slowest:          ${theme.status.warning}${perf.slowestFile.durationMs} ms\\x1b[0m ${path}`,
    );
  }

  if (perf.fastestFile) {
    const path = truncateStart(perf.fastestFile.path, Math.max(15, (width ?? 80) - 40));
    contentLines.push(
      `   Fastest:          ${theme.status.success}${perf.fastestFile.durationMs} ms\\x1b[0m ${path}`,
    );
  }

  contentLines.push(`   Peak memory:      ${formatMemory(perf.memoryPeakMB)}`);
  contentLines.push('');

  // Pipeline timings from profiler
  if (profiler && profiler.stats.length > 0) {
    contentLines.push(` ${theme.ui.textDim}Pipeline Timings:\\x1b[0m`);

    // Sort stages by start time
    const sortedStages = [...profiler.stages].sort((a, b) => a.startMs - b.startMs);
    const totalMs = profiler.totalDurationMs || 1;

    for (const stage of sortedStages) {
      const label = PIPELINE_STAGE_LABELS[stage.stage] ?? stage.stage;
      const pct = ((stage.durationMs / totalMs) * 100).toFixed(1);
      const bar = renderMiniBar(
        stage.durationMs / totalMs,
        15,
        stage.stage === 'total' ? theme.ui.accent : theme.ui.text,
      );
      contentLines.push(
        `   ${bar} ${label.padEnd(16)} ${String(stage.durationMs).padStart(6)} ms  ${pct.padStart(5)}%`,
      );
    }
  }

  return renderBox(contentLines, {
    title: `${symbols.star} ${title}`,
    width,
    padding: 0,
    showBottomBorder: true,
  });
}

/**
 * Render a tiny progress bar for timing visualization.
 */
function renderMiniBar(ratio: number, width: number, color: string): string {
  const symbols = getSymbolSet();
  const filled = Math.round(Math.min(ratio, 1) * width);
  const empty = width - filled;
  return `${color}${symbols.chartFull.repeat(filled)}${symbols.chartEmpty.repeat(empty)}\\x1b[0m`;
}

function formatMemory(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}
