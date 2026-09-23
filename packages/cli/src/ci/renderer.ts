/**
 * @veris/cli/ci/renderer — Terminal UI presentation for CI runner results.
 *
 * Adheres to VERIS design system:
 * - Color-theme consistency with --no-color support
 * - Unicode symbols with ASCII fallback for --no-unicode
 * - Structured tables and status badges
 * - Silent mode support for piping
 *
 * @module @veris/cli/ci/renderer
 */

import { renderBadge } from '../ui/components/badge.js';
import { renderTable, type TableColumn, type TableRow } from '../ui/components/table.js';
import { getSymbolSet } from '../ui/renderer/index.js';
import { horizontalDivider } from '../ui/styles/index.js';
import { ansiReset, getResolvedTheme } from '../ui/theme/index.js';

import type { CiSummary } from './types.js';

/** Options for CI terminal output rendering. */
export interface CiRenderOptions {
  readonly verbose?: boolean;
  readonly silent?: boolean;
}

/**
 * Render complete CI gate execution results to stdout/stderr.
 */
export function renderCiTerminalOutput(summary: CiSummary, options: CiRenderOptions = {}): void {
  const { silent } = options;

  if (silent) {
    if (summary.status === 'passed') {
      process.stdout.write(`VERIS CI: PASSED (exit code ${summary.exitCode})\n`);
    } else {
      process.stderr.write(`VERIS CI: FAILED (exit code ${summary.exitCode})\n`);
    }
    return;
  }

  const theme = getResolvedTheme();
  const symbols = getSymbolSet();
  const R = ansiReset();
  const termWidth = Math.min(process.stdout.columns ?? 80, 100);

  const out = (text: string): void => {
    process.stdout.write(text + '\n');
  };
  const err = (text: string): void => {
    process.stderr.write(text + '\n');
  };

  out('');
  out(horizontalDivider(termWidth));
  out(`  ${theme.ui.brand}VERIS CI — AUTOMATED SECURITY GATES${R}`);
  out(horizontalDivider(termWidth));

  // Metadata block
  const statusBadge = renderBadge({
    label: summary.status === 'passed' ? 'PASSED' : 'VIOLATION',
    variant: 'status',
    status: summary.status === 'passed' ? 'success' : 'error',
    showSymbol: true,
  });

  out(`  ${theme.ui.textDim}Target:${R}    ${summary.target}`);
  if (summary.baselinePath) {
    out(`  ${theme.ui.textDim}Baseline:${R}  ${summary.baselinePath}`);
  } else {
    out(`  ${theme.ui.textDim}Baseline:${R}  None (standalone scan)`);
  }

  const deltaStr =
    summary.metrics.baselineRiskScore !== undefined
      ? ` (Δ ${summary.metrics.riskScoreDelta >= 0 ? '+' : ''}${summary.metrics.riskScoreDelta.toFixed(1)})`
      : '';
  out(
    `  ${theme.ui.textDim}Risk Score:${R} ${summary.metrics.currentRiskScore.toFixed(1)}${theme.ui.textDim}${deltaStr}${R}`,
  );
  out(`  ${theme.ui.textDim}Status:${R}    ${statusBadge}`);
  out('');

  // ── Security Gates Table ──
  out(`  ${theme.ui.accent}Security Gate Evaluations:${R}`);

  const gateColumns: TableColumn[] = [
    { header: 'Gate', minWidth: 26, align: 'left' },
    { header: 'Policy Target', minWidth: 16, align: 'left' },
    { header: 'Observed Value', minWidth: 18, align: 'left' },
    { header: 'Status', minWidth: 10, align: 'center' },
  ];

  const gateRows: TableRow[] = summary.gateResult.evaluations.map((e) => {
    const statusText = e.passed
      ? `${theme.status.success}${symbols.success} PASS${R}`
      : `${theme.status.error}${symbols.error} FAIL${R}`;
    return [e.name, String(e.threshold), String(e.actual), statusText];
  });

  const tableLines = renderTable({
    columns: gateColumns,
    rows: gateRows,
    maxWidth: termWidth,
    showHeader: true,
    showSeparators: false,
  });

  for (const line of tableLines) {
    out(`  ${line}`);
  }
  out('');

  // ── Differential Finding Summary ──
  out(`  ${theme.ui.accent}Finding Inventory & Delta:${R}`);
  const m = summary.metrics;
  const metricsRow = [
    `Total: ${theme.ui.text}${m.currentFindingCount}${R}`,
    `New: ${m.newFindingCount > 0 ? theme.status.error : theme.ui.textDim}${m.newFindingCount}${R}`,
    `Regressed: ${m.regressedFindingCount > 0 ? theme.status.warning : theme.ui.textDim}${m.regressedFindingCount}${R}`,
    `Evidence Changed: ${theme.ui.textDim}${m.evidenceChangedFindingCount}${R}`,
    `Unchanged: ${theme.ui.textDim}${m.unchangedFindingCount}${R}`,
    `Resolved: ${m.resolvedFindingCount > 0 ? theme.status.success : theme.ui.textDim}${m.resolvedFindingCount}${R}`,
  ];
  out(`  ${metricsRow.join('  │  ')}`);
  out('');

  // ── Violations Detail ──
  if (summary.gateResult.violations.length > 0) {
    err(`  ${theme.status.error}${symbols.error} Gate Violations Detected:${R}`);
    for (const v of summary.gateResult.violations) {
      err(`    ${theme.status.error}•${R} ${theme.ui.text}${v.name}:${R} ${v.details}`);
      if (v.violatingItems && v.violatingItems.length > 0) {
        for (const item of v.violatingItems.slice(0, 5)) {
          err(`      ${theme.ui.textDim}-${R} ${item}`);
        }
        if (v.violatingItems.length > 5) {
          err(`      ${theme.ui.textDim}...and ${v.violatingItems.length - 5} more${R}`);
        }
      }
    }
    out('');
  }

  // ── Emitted Output Artifacts ──
  if (summary.outputFiles && summary.outputFiles.length > 0) {
    out(`  ${theme.ui.accent}Artifacts Emitted:${R}`);
    for (const file of summary.outputFiles) {
      out(`    ${theme.ui.textDim}${symbols.bullet}${R} ${file}`);
    }
    out('');
  }

  out(horizontalDivider(termWidth));
  if (summary.status === 'passed') {
    out(`  ${theme.status.success}${symbols.success} All configured security gates passed.${R}\n`);
  } else {
    err(
      `  ${theme.status.error}${symbols.error} Security gate check failed with exit code ${summary.exitCode}.${R}\n`,
    );
  }
}
