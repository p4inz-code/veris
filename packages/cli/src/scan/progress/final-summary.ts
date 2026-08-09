/**
 * Final Scan Summary — release-quality completion screen.
 *
 * Renders a restrained, professional closing screen using only data already
 * produced by the pipeline:
 *
 *   RESULT       scan completed / completed with warnings / failed / cancelled
 *   SUMMARY      files, evidence, findings, risk, confidence, warnings/errors
 *   FINDINGS     per-severity counts (only when findings exist)
 *   PERFORMANCE  elapsed time and existing throughput
 *   ANALYSIS     knowledge enrichments / packs when already available
 *   OUTPUT       report locations when already available
 *   NEXT         useful existing VERIS commands only
 *
 * Design rules:
 * - Simple aligned text; borders only as section dividers.
 * - Severity is never communicated by color alone (symbol + level word).
 * - Long values wrap with aligned continuation lines — never truncated.
 * - Adapts to Unicode/ASCII, color/no-color, and narrow/wide terminals.
 *
 * @module @veris/cli/scan/progress
 */

import { getSymbolSet } from '../../ui/renderer/index.js';
import { horizontalDivider } from '../../ui/styles/index.js';
import { detectTerminal } from '../../ui/terminal/index.js';
import { getResolvedTheme, severityFromScore, type SeverityLevel } from '../../ui/theme/index.js';
import { wrapText } from '../../ui/utilities/index.js';
import type { ScanSummary, ScanSession } from '../scan-session.js';

/** Options for final summary. */
export interface FinalSummaryOptions {
  readonly outputFiles?: readonly string[];
  readonly cancelled?: boolean;
}

/** Maximum summary width in characters. */
const MAX_WIDTH = 100;

const ROW_INDENT = '   ';

/** Width reserved for the command column in the NEXT section. */
const COMMAND_WIDTH = 20;

/** Length of the longest suggested command (never truncated). */
const LONGEST_COMMAND = 17; // 'veris scan --help'

/** Static "next steps" — existing VERIS commands only. */
const NEXT_STEPS: ReadonlyArray<{ readonly command: string; readonly hint: string }> =
  Object.freeze([
    { command: 'veris report', hint: 'Re-export report files from an existing scan' },
    { command: 'veris summarize', hint: 'Summarize the latest scan report' },
    { command: 'veris scan --help', hint: 'Show all scan options' },
  ]);

/**
 * Render the final summary screen as an array of lines.
 *
 * The returned lines are plain strings (theme colors already applied) and
 * can be written to stdout line by line.
 */
export function renderFinalSummary(
  session: ScanSession,
  summary: ScanSummary,
  options: FinalSummaryOptions = {},
): readonly string[] {
  const caps = detectTerminal();
  const theme = getResolvedTheme();
  const symbols = getSymbolSet();
  const width = Math.min(caps.width, MAX_WIDTH);
  const cancelled = options.cancelled ?? summary.cancelled ?? false;
  const outputFiles = options.outputFiles ?? summary.outputFiles ?? [];
  const findings = totalFindings(summary);

  const lines: string[] = [];
  lines.push('');

  // ── RESULT ──
  lines.push(...renderResultHeader(cancelled, summary, theme, symbols, width));

  // ── SUMMARY ──
  lines.push(` ${theme.ui.accent}SUMMARY\x1b[0m`);
  const summaryRows: Array<{ label: string; value: string; color?: string }> = [
    { label: 'files', value: formatNumber(summary.filesScanned) },
    { label: 'evidence', value: formatNumber(summary.evidenceCollected) },
    {
      label: 'findings',
      value: formatNumber(findings),
      color: findings > 0 ? theme.ui.text : theme.ui.textDim,
    },
  ];
  if (summary.riskScore !== undefined) {
    const level = severityFromScore(summary.riskScore);
    // Level first so it survives truncation — severity is never color-only.
    summaryRows.push({
      label: 'risk',
      value: `${levelLabel(level).toLowerCase()}  ${summary.riskScore.toFixed(1)} / 10.0`,
      color: theme.severity[level],
    });
    summaryRows.push({ label: 'confidence', value: `${(summary.confidence * 100).toFixed(1)}%` });
  }
  if (summary.warnings > 0) {
    summaryRows.push({
      label: 'warnings',
      value: formatNumber(summary.warnings),
      color: theme.status.warning,
    });
  }
  if (summary.errors > 0) {
    summaryRows.push({
      label: 'errors',
      value: formatNumber(summary.errors),
      color: theme.status.error,
    });
  }
  if (summary.skippedFiles > 0) {
    summaryRows.push({
      label: 'skipped',
      value: formatNumber(summary.skippedFiles),
      color: theme.ui.textDim,
    });
  }
  lines.push(...renderAlignedRows(summaryRows, theme, symbols, width));

  // ── FINDINGS ──
  const severityRows = renderSeverityRows(summary, theme, symbols);
  if (severityRows.length > 0) {
    lines.push(` ${theme.ui.accent}FINDINGS\x1b[0m`);
    lines.push(...severityRows);
  }

  // ── PERFORMANCE ──
  lines.push(` ${theme.ui.accent}PERFORMANCE\x1b[0m`);
  const perfRows: Array<{ label: string; value: string; color?: string }> = [
    { label: 'elapsed', value: formatDuration(summary.durationMs) },
  ];
  if (session.throughput > 0) {
    perfRows.push({ label: 'throughput', value: `${session.throughput.toFixed(1)} files/s` });
  }
  lines.push(...renderAlignedRows(perfRows, theme, symbols, width));

  // ── ANALYSIS ──
  const analysisRows: Array<{ label: string; value: string; color?: string }> = [];
  if (summary.knowledgeEnrichments !== undefined && summary.knowledgeEnrichments > 0) {
    analysisRows.push({ label: 'enrichments', value: formatNumber(summary.knowledgeEnrichments) });
  }
  if (summary.knowledgePacksLoaded !== undefined && summary.knowledgePacksLoaded > 0) {
    analysisRows.push({ label: 'packs', value: formatNumber(summary.knowledgePacksLoaded) });
  }
  if (analysisRows.length > 0) {
    lines.push(` ${theme.ui.accent}ANALYSIS\x1b[0m`);
    lines.push(...renderAlignedRows(analysisRows, theme, symbols, width));
  }

  // ── OUTPUT ──
  if (outputFiles.length > 0) {
    lines.push(` ${theme.ui.accent}OUTPUT\x1b[0m`);
    lines.push(...renderOutputRows(outputFiles, theme, width));
  }

  // ── NEXT ──
  lines.push(` ${theme.ui.accent}NEXT\x1b[0m`);
  // Commands are never truncated: the column fits the longest suggestion,
  // and the hint (secondary) is trimmed or dropped first.
  const commandWidth = Math.min(COMMAND_WIDTH, Math.max(LONGEST_COMMAND, width - 26));
  const hintWidth = Math.max(0, width - 1 - (commandWidth + 5));
  for (const step of NEXT_STEPS) {
    const command = step.command; // commands are short — never truncated
    const hint =
      hintWidth <= 4
        ? ''
        : step.hint.length > hintWidth
          ? step.hint.slice(0, Math.max(1, hintWidth - symbols.ellipsis.length)) + symbols.ellipsis
          : step.hint;
    lines.push(
      ` ${ROW_INDENT}${theme.ui.text}${command.padEnd(commandWidth)}\x1b[0m ${theme.ui.textDim}${hint}\x1b[0m`,
    );
  }

  // ── Footer divider ──
  lines.push(` ${theme.ui.border}${horizontalDivider(width - 2)}\x1b[0m`);
  lines.push('');

  return lines;
}

// ── RESULT Header ──

function renderResultHeader(
  cancelled: boolean,
  summary: ScanSummary,
  theme: ReturnType<typeof getResolvedTheme>,
  symbols: ReturnType<typeof getSymbolSet>,
  width: number,
): readonly string[] {
  const lines: string[] = [];

  if (cancelled) {
    lines.push(
      ` ${theme.status.warning}${symbols.warning}\x1b[0m ${theme.ui.text}Scan Cancelled\x1b[0m`,
    );
  } else if (summary.errors > 0) {
    lines.push(` ${theme.status.error}${symbols.error}\x1b[0m ${theme.ui.text}Scan Failed\x1b[0m`);
  } else {
    lines.push(
      ` ${theme.status.success}${symbols.success}\x1b[0m ${theme.ui.text}Scan Complete\x1b[0m`,
    );
    if (summary.warnings > 0) {
      const plural = summary.warnings === 1 ? 'warning' : 'warnings';
      lines.push(
        ` ${theme.status.warning}${symbols.warning}\x1b[0m ${theme.ui.textDim}Completed with ${formatNumber(summary.warnings)} ${plural}\x1b[0m`,
      );
    }
  }

  lines.push(` ${theme.ui.border}${horizontalDivider(width - 2)}\x1b[0m`);
  lines.push('');
  return lines;
}

// ── Aligned Rows ──

/**
 * Render aligned label/value rows.
 *
 * Labels are dimmed and padded to a fixed column; values start at the same
 * column on every row. Values are short (numbers, percentages, risk), so a
 * width cap with an ellipsis is only a safety net for extreme widths.
 */
function renderAlignedRows(
  rows: ReadonlyArray<{ label: string; value: string; color?: string }>,
  theme: ReturnType<typeof getResolvedTheme>,
  symbols: ReturnType<typeof getSymbolSet>,
  width: number,
): readonly string[] {
  const { labelWidth, valueWidth } = columnLayout(width);

  const lines: string[] = [];
  for (const row of rows) {
    const prefix = `${ROW_INDENT}${theme.ui.textDim}${row.label.padEnd(labelWidth)}\x1b[0m  `;
    const value =
      row.value.length <= valueWidth
        ? row.value
        : row.value.slice(0, Math.max(1, valueWidth - symbols.ellipsis.length)) + symbols.ellipsis;
    lines.push(`${prefix}${row.color ?? theme.ui.text}${value}\x1b[0m`);
  }
  return lines;
}

/** Shared label/value column layout for the summary screen. */
function columnLayout(width: number): {
  labelWidth: number;
  valueColumn: number;
  valueWidth: number;
} {
  const labelWidth = Math.min(14, Math.max(8, width - 30));
  const valueColumn = ROW_INDENT.length + labelWidth + 2;
  const valueWidth = Math.max(8, width - 1 - valueColumn);
  return { labelWidth, valueColumn, valueWidth };
}

// ── Findings ──

/** Total findings across all severity buckets. */
function totalFindings(summary: ScanSummary): number {
  return Object.values(summary.findingsBySeverity).reduce((sum, n) => sum + (n || 0), 0);
}

/**
 * Render per-severity finding counts (non-zero buckets only).
 * Severity is indicated by symbol AND level word — never color alone.
 */
function renderSeverityRows(
  summary: ScanSummary,
  theme: ReturnType<typeof getResolvedTheme>,
  symbols: ReturnType<typeof getSymbolSet>,
): readonly string[] {
  const order: readonly SeverityLevel[] = ['critical', 'high', 'medium', 'low', 'info'];
  const rows: string[] = [];

  for (const level of order) {
    const count = summary.findingsBySeverity[level] ?? 0;
    if (count <= 0) continue;
    const color = theme.severity[level];
    const indicator = levelSymbol(level, symbols);
    rows.push(
      `   ${color}${indicator}\x1b[0m ${levelLabel(level).toLowerCase().padEnd(9)}${color}${formatNumber(count)}\x1b[0m`,
    );
  }

  return rows;
}

/** Severity symbol: Unicode emoji or fixed-width ASCII tag. */
function levelSymbol(level: SeverityLevel, symbols: ReturnType<typeof getSymbolSet>): string {
  switch (level) {
    case 'critical':
      return symbols.critical;
    case 'high':
      return symbols.high;
    case 'medium':
      return symbols.medium;
    case 'low':
      return symbols.low;
    case 'info':
      return symbols.info;
  }
}

/** Human-readable severity level label. */
function levelLabel(level: SeverityLevel): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

// ── Output ──

/**
 * Render output file paths. Paths wrap (hard-break) with a continuation
 * indent aligned to the value column; important information is never
 * silently truncated.
 */
function renderOutputRows(
  files: readonly string[],
  theme: ReturnType<typeof getResolvedTheme>,
  width: number,
): readonly string[] {
  const { labelWidth, valueColumn, valueWidth } = columnLayout(width);
  const continuation = ' '.repeat(valueColumn);

  const lines: string[] = [];
  for (const file of files) {
    const prefix = `${ROW_INDENT}${theme.ui.textDim}${'report'.padEnd(labelWidth)}\x1b[0m  `;
    if (file.length <= valueWidth) {
      lines.push(`${prefix}${theme.ui.text}${file}\x1b[0m`);
      continue;
    }
    const chunks = wrapText(file, valueWidth, '');
    chunks.forEach((chunk, index) => {
      lines.push(
        index === 0
          ? `${prefix}${theme.ui.text}${chunk}\x1b[0m`
          : ` ${continuation}${theme.ui.text}${chunk}\x1b[0m`,
      );
    });
  }
  return lines;
}

// ── Helpers ──

/** Deterministic thousands separator (locale-independent). */
function formatNumber(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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
