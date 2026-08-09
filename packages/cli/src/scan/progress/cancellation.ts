/**
 * Graceful Cancellation — handles CTRL+C during scan.
 *
 * Behavior:
 * - Finishes the current file/task
 * - Saves partial report if possible
 * - Shows cancellation summary
 * - Never corrupts output
 *
 * @module @veris/cli/scan/progress
 */

import { getSymbolSet } from '../../ui/renderer/index.js';
import { horizontalDivider } from '../../ui/styles/index.js';
import { detectTerminal } from '../../ui/terminal/index.js';
import { getResolvedTheme, ansiReset } from '../../ui/theme/index.js';
import type { ScanSession } from '../scan-session.js';

/** Result of a cancelled scan. */
export interface CancellationResult {
  readonly session: ScanSession;
  readonly outputFiles: readonly string[];
  readonly partialReportSaved: boolean;
}

/**
 * Render a cancellation summary screen.
 */
export function renderCancellationSummary(result: CancellationResult): readonly string[] {
  const theme = getResolvedTheme();
  const symbols = getSymbolSet();
  const R = ansiReset();
  const caps = detectTerminal();
  const width = Math.min(caps.width, 100);

  const lines: string[] = [];
  lines.push('');

  // ── Header ──
  lines.push(` ${theme.status.warning}${symbols.warning}${R} ${theme.ui.text}Scan Cancelled${R}`);
  lines.push(` ${theme.ui.border}${horizontalDivider(width - 2)}${R}`);
  lines.push('');

  // ── Stats ──
  const session = result.session;
  const stats: Array<{ label: string; value: string }> = [
    { label: 'Files processed', value: String(session.filesProcessed) },
    { label: 'Total files', value: String(session.totalFiles) },
    { label: 'Elapsed time', value: formatDuration(session.elapsedMs) },
    { label: 'Progress', value: `${(session.progress * 100).toFixed(1)}%` },
  ];

  if (session.statistics.findings > 0) {
    stats.push({ label: 'Findings found', value: String(session.statistics.findings) });
    stats.push({
      label: 'Risk score',
      value: session.summary ? session.summary.riskScore.toFixed(1) : 'N/A',
    });
  }

  const maxLabelWidth = Math.max(...stats.map((s) => s.label.length));
  for (const stat of stats) {
    lines.push(`   ${theme.ui.highlight}${stat.label.padEnd(maxLabelWidth)}${R}  ${stat.value}`);
  }

  // ── Partial report info ──
  if (result.partialReportSaved && result.outputFiles.length > 0) {
    lines.push('');
    lines.push(` ${theme.ui.accent}Partial Results${R}`);
    lines.push('');
    for (const file of result.outputFiles) {
      lines.push(`   ${symbols.file} ${file}`);
    }
  }

  lines.push('');
  lines.push(
    ` ${theme.status.warning}${symbols.info}${R} ${theme.ui.textDim}Scan was cancelled. Partial results may be incomplete.${R}`,
  );
  lines.push('');

  return lines;
}

/**
 * Render a brief one-line cancellation message for non-interactive use.
 */
export function formatCancellationLine(session: ScanSession): string {
  const theme = getResolvedTheme();
  const R = ansiReset();
  return `${theme.status.warning}Cancelled${R} after ${session.filesProcessed} files (${session.elapsedMs > 0 ? `${(session.elapsedMs / 1000).toFixed(1)}s` : '0s'})`;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
