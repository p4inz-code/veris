/**
 * @veris/cli/ci/summary — Machine-readable summary & GitHub Step Summary generator.
 *
 * Implements Section 8 of ADR-015:
 *   - Canonical ci-summary.json generation
 *   - GitHub Actions $GITHUB_STEP_SUMMARY markdown generation
 *   - Offline-first atomic file emission
 *
 * @module @veris/cli/ci/summary
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

import type { CanonicalReport } from '@veris/core';

import { CLI_VERSION } from '../wirer.js';

import type {
  CiGateResult,
  CiPolicy,
  CiSummary,
  CiSummaryMetrics,
  FindingDiffResult,
} from './types.js';

/** Options for creating a CI summary. */
export interface CreateCiSummaryParams {
  readonly target: string;
  readonly baselinePath?: string;
  readonly policy: CiPolicy;
  readonly gateResult: CiGateResult;
  readonly diffResult: FindingDiffResult;
  readonly currentReport: CanonicalReport;
  readonly timestamp?: string;
  readonly outputFiles?: readonly string[];
}

/**
 * Construct the canonical CiSummary object.
 */
export function createCiSummary(params: CreateCiSummaryParams): CiSummary {
  const timestamp =
    params.timestamp ?? params.currentReport.generatedAt ?? new Date().toISOString();

  // Severity breakdown
  const findingsBySeverity: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  for (const f of params.currentReport.findings ?? []) {
    const lvl = f.severity?.level ?? 'info';
    findingsBySeverity[lvl] = (findingsBySeverity[lvl] ?? 0) + 1;
  }

  const metrics: CiSummaryMetrics = Object.freeze({
    currentRiskScore: params.diffResult.currentRiskScore,
    baselineRiskScore: params.diffResult.baselineRiskScore,
    riskScoreDelta: params.diffResult.riskScoreDelta,
    currentFindingCount: params.diffResult.totalCurrent,
    baselineFindingCount: params.baselinePath ? params.diffResult.totalBaseline : undefined,
    newFindingCount: params.diffResult.newCount,
    regressedFindingCount: params.diffResult.regressedCount,
    evidenceChangedFindingCount: params.diffResult.evidenceChangedCount,
    unchangedFindingCount: params.diffResult.unchangedCount,
    resolvedFindingCount: params.diffResult.resolvedCount,
    findingsBySeverity: Object.freeze(findingsBySeverity),
  });

  return Object.freeze({
    schemaVersion: '1.0.0',
    status: params.gateResult.passed ? 'passed' : 'failed',
    exitCode: params.gateResult.exitCode,
    timestamp,
    target: params.target,
    baselinePath: params.baselinePath,
    policy: Object.freeze({ ...params.policy }),
    gateResult: params.gateResult,
    metrics,
    diffs: params.diffResult.diffs,
    outputFiles: Object.freeze([...(params.outputFiles ?? [])]),
  });
}

/**
 * Render Markdown content suitable for GitHub Actions `$GITHUB_STEP_SUMMARY`.
 */
export function renderCiStepSummaryMarkdown(summary: CiSummary): string {
  const lines: string[] = [];

  const passed = summary.status === 'passed';
  const statusEmoji = passed ? '✅' : '❌';
  const statusTitle = passed ? 'VERIS Security Gate Passed' : 'VERIS Security Gate Violation';

  lines.push(`## ${statusEmoji} ${statusTitle}`);
  lines.push('');
  lines.push(
    `**Target:** \`${summary.target}\` | **Exit Code:** \`${summary.exitCode}\` | **Scanned at:** \`${summary.timestamp}\``,
  );
  if (summary.baselinePath) {
    lines.push(`**Baseline:** \`${summary.baselinePath}\``);
  }
  lines.push('');

  // ── Metrics Table ──
  lines.push('### Overview Metrics');
  lines.push('');
  lines.push('| Metric | Current | Baseline | Delta |');
  lines.push('| :--- | :---: | :---: | :---: |');

  const deltaSign = summary.metrics.riskScoreDelta > 0 ? '+' : '';
  const baselineScoreStr =
    summary.metrics.baselineRiskScore !== undefined
      ? summary.metrics.baselineRiskScore.toFixed(1)
      : '—';
  const deltaScoreStr =
    summary.metrics.baselineRiskScore !== undefined
      ? `${deltaSign}${summary.metrics.riskScoreDelta.toFixed(1)}`
      : '—';

  lines.push(
    `| **Risk Score** | **${summary.metrics.currentRiskScore.toFixed(1)}** | ${baselineScoreStr} | ${deltaScoreStr} |`,
  );

  const baselineCountStr =
    summary.metrics.baselineFindingCount !== undefined
      ? String(summary.metrics.baselineFindingCount)
      : '—';
  const countDelta =
    summary.metrics.baselineFindingCount !== undefined
      ? summary.metrics.currentFindingCount - summary.metrics.baselineFindingCount
      : 0;
  const countDeltaStr =
    summary.metrics.baselineFindingCount !== undefined
      ? `${countDelta > 0 ? '+' : ''}${countDelta}`
      : '—';

  lines.push(
    `| **Total Findings** | ${summary.metrics.currentFindingCount} | ${baselineCountStr} | ${countDeltaStr} |`,
  );
  lines.push(`| **New Findings** | ${summary.metrics.newFindingCount} | — | — |`);
  lines.push(`| **Regressed Findings** | ${summary.metrics.regressedFindingCount} | — | — |`);
  lines.push(`| **Resolved Findings** | ${summary.metrics.resolvedFindingCount} | — | — |`);
  lines.push('');

  // ── Security Gate Checklist ──
  lines.push('### Security Gate Checklist');
  lines.push('');
  lines.push('| Gate | Required Policy | Actual Value | Status |');
  lines.push('| :--- | :--- | :--- | :---: |');

  for (const evaluation of summary.gateResult.evaluations) {
    const statusIcon = evaluation.passed ? '✅ Passed' : '❌ Failed';
    lines.push(
      `| **${evaluation.name}** | \`${evaluation.threshold}\` | \`${evaluation.actual}\` | ${statusIcon} |`,
    );
  }
  lines.push('');

  // ── Violations List (if any) ──
  if (summary.gateResult.violations.length > 0) {
    lines.push('### ⚠️ Policy Violations');
    lines.push('');
    for (const v of summary.gateResult.violations) {
      lines.push(`- **${v.name}:** ${v.details}`);
      if (v.violatingItems && v.violatingItems.length > 0) {
        for (const item of v.violatingItems.slice(0, 10)) {
          lines.push(`  - \`${item}\``);
        }
        if (v.violatingItems.length > 10) {
          lines.push(`  - *...and ${v.violatingItems.length - 10} more items*`);
        }
      }
    }
    lines.push('');
  }

  // ── New Findings Table ──
  const newFindings = summary.diffs.filter((d) => d.status === 'new');
  if (newFindings.length > 0) {
    lines.push(`### 🆕 New Findings Introduced (${newFindings.length})`);
    lines.push('');
    lines.push('| Severity | Rule ID | Location | Title |');
    lines.push('| :---: | :--- | :--- | :--- |');
    for (const nf of newFindings.slice(0, 20)) {
      lines.push(
        `| **${(nf.currentSeverity ?? 'info').toUpperCase()}** | \`${nf.ruleId}\` | \`${nf.artifactPath || '.'}\` | ${nf.title} |`,
      );
    }
    if (newFindings.length > 20) {
      lines.push(
        `\n*Displaying top 20 of ${newFindings.length} new findings. See ci-summary.json for full inventory.*`,
      );
    }
    lines.push('');
  }

  // ── Regressed Findings Table ──
  const regressed = summary.diffs.filter((d) => d.status === 'regressed');
  if (regressed.length > 0) {
    lines.push(`### 📈 Regressed Findings (${regressed.length})`);
    lines.push('');
    lines.push('| Baseline | Current | Rule ID | Location | Title |');
    lines.push('| :---: | :---: | :--- | :--- | :--- |');
    for (const rf of regressed.slice(0, 20)) {
      lines.push(
        `| ${(rf.baselineSeverity ?? 'info').toUpperCase()} | **${(rf.currentSeverity ?? 'info').toUpperCase()}** | \`${rf.ruleId}\` | \`${rf.artifactPath || '.'}\` | ${rf.title} |`,
      );
    }
    lines.push('');
  }

  // ── Resolved Findings ──
  const resolved = summary.diffs.filter((d) => d.status === 'resolved');
  if (resolved.length > 0) {
    lines.push(`### 🎉 Resolved Findings (${resolved.length})`);
    lines.push('');
    lines.push('| Former Severity | Rule ID | Location | Title |');
    lines.push('| :---: | :--- | :--- | :--- |');
    for (const res of resolved.slice(0, 15)) {
      lines.push(
        `| ${(res.baselineSeverity ?? 'info').toUpperCase()} | \`${res.ruleId}\` | \`${res.artifactPath || '.'}\` | ${res.title} |`,
      );
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(`*Generated by VERIS v${CLI_VERSION} — Offline-First Deterministic Security Engine*`);

  return lines.join('\n');
}

/**
 * Write canonical ci-summary.json to disk.
 */
export async function writeCiSummary(summary: CiSummary, summaryFilePath: string): Promise<void> {
  const dir = path.dirname(summaryFilePath);
  await fsp.mkdir(dir, { recursive: true });
  const content = JSON.stringify(summary, null, 2);
  await fsp.writeFile(summaryFilePath, content, 'utf-8');
}

/**
 * Append Markdown summary to GitHub Actions step summary file.
 *
 * @param markdown - Formatted Markdown text.
 * @param overridePath - Optional path overriding GITHUB_STEP_SUMMARY environment variable.
 * @returns true if successfully written, false if no destination configured.
 */
export async function writeGitHubStepSummary(
  markdown: string,
  overridePath?: string,
): Promise<boolean> {
  const targetPath = overridePath ?? process.env.GITHUB_STEP_SUMMARY;
  if (!targetPath) {
    return false;
  }

  try {
    const dir = path.dirname(targetPath);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.appendFile(targetPath, markdown + '\n\n', 'utf-8');
    return true;
  } catch {
    // Non-fatal: CI continues even if step summary write fails
    return false;
  }
}
