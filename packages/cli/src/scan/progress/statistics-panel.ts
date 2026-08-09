/**
 * Live Statistics Panel — renders real-time scan metrics.
 *
 * Shows:
 * - Files scanned, Directories, Archives
 * - Rules evaluated, Evidence collected
 * - Findings, Warnings, Errors
 * - Skipped files
 * - Memory usage, CPU time
 * - Files/sec, Average file duration
 *
 * @module @veris/cli/scan/progress
 */

import { renderBox } from '../../ui/layout/index.js';
import { getSymbolSet } from '../../ui/renderer/index.js';
import { getResolvedTheme } from '../../ui/theme/index.js';
import type { ScanStatistics } from '../scan-session.js';

/** Options for the statistics panel. */
export interface StatisticsPanelOptions {
  readonly width?: number;
  readonly title?: string;
}

/**
 * Render the statistics panel as an array of lines.
 */
export function renderStatisticsPanel(
  stats: ScanStatistics,
  options: StatisticsPanelOptions = {},
): readonly string[] {
  const theme = getResolvedTheme();
  const symbols = getSymbolSet();
  const width = options.width;
  const title = options.title ?? 'Live Statistics';

  // Layout: two columns of key-value pairs
  const leftItems: Array<{ label: string; value: string; color?: string }> = [
    { label: 'Files scanned', value: String(stats.filesScanned), color: theme.ui.text },
    { label: 'Directories', value: String(stats.directories) },
    { label: 'Archives', value: String(stats.archives) },
    { label: 'Rules eval.', value: String(stats.rulesEvaluated) },
    { label: 'Evidence', value: String(stats.evidenceCollected) },
    {
      label: 'Findings',
      value: String(stats.findings),
      color: getFindingsColor(stats.findings, theme),
    },
  ];

  const rightItems: Array<{ label: string; value: string; color?: string }> = [
    {
      label: 'Warnings',
      value: String(stats.warnings),
      color: stats.warnings > 0 ? theme.status.warning : undefined,
    },
    {
      label: 'Errors',
      value: String(stats.errors),
      color: stats.errors > 0 ? theme.status.error : undefined,
    },
    {
      label: 'Skipped',
      value: String(stats.skippedFiles),
      color: stats.skippedFiles > 0 ? theme.ui.textDim : undefined,
    },
    { label: 'Memory', value: formatMemory(stats.memoryUsageMB) },
    { label: 'CPU time', value: formatDuration(stats.cpuTimeMs), color: theme.ui.textDim },
    { label: 'Files/sec', value: stats.filesPerSecond > 0 ? stats.filesPerSecond.toFixed(1) : '-' },
  ];

  // Build content rows
  const contentLines: string[] = [];
  const maxRows = Math.max(leftItems.length, rightItems.length);
  const labelWidth = 14;
  const valueWidth = 12;

  for (let i = 0; i < maxRows; i++) {
    const left = i < leftItems.length ? leftItems[i] : null;
    const right = i < rightItems.length ? rightItems[i] : null;

    const leftStr = left
      ? `${theme.ui.textDim}${left.label.padEnd(labelWidth)}\\x1b[0m ${left.color ?? theme.ui.text}${left.value.padStart(valueWidth)}\\x1b[0m`
      : ' '.repeat(labelWidth + valueWidth + 2);

    const rightStr = right
      ? `${theme.ui.textDim}${right.label.padEnd(labelWidth)}\\x1b[0m ${right.color ?? theme.ui.text}${right.value.padStart(valueWidth)}\\x1b[0m`
      : '';

    const separator = right ? '  ' : '';
    contentLines.push(` ${leftStr}${separator}${rightStr}`);
  }

  return renderBox(contentLines, {
    title: `${symbols.bullet} ${title}`,
    width,
    padding: 0,
    showBottomBorder: true,
  });
}

/**
 * Get color for findings count based on severity.
 */
function getFindingsColor(count: number, theme: ReturnType<typeof getResolvedTheme>): string {
  if (count > 50) return theme.severity.critical;
  if (count > 20) return theme.severity.high;
  if (count > 5) return theme.severity.medium;
  return theme.ui.text;
}

function formatMemory(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '-';
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}
