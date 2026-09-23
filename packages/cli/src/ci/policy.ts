/**
 * @veris/cli/ci/policy — Security policy gate evaluation engine.
 *
 * Implements Section 6 of ADR-015:
 *   Evaluates configurable security gates against scan reports and diffs:
 *   - failOn: Minimum finding severity threshold.
 *   - failOnNew: Zero-tolerance for new findings.
 *   - maxNew: Numerical ceiling on new findings.
 *   - failOnRegressions: Prohibits severity degradation and risk score increases.
 *   - maxRisk: Overall risk score ceiling [0.0 - 10.0].
 *   - failOnPluginQuarantine: Prohibits plugin crashes or quarantines.
 *
 * @module @veris/cli/ci/policy
 */

import type { CanonicalReport } from '@veris/core';

import { ExitCode } from '../wirer.js';

import {
  type CiGateResult,
  type CiPolicy,
  type FindingDiffResult,
  type GateEvaluation,
  type SeverityLevel,
  SEVERITY_RANKS,
} from './types.js';

/** Options for policy evaluation. */
export interface PolicyEvaluationOptions {
  /** IDs of plugins quarantined or failed during scan. */
  readonly quarantinedPlugins?: readonly string[];
}

/**
 * Evaluate security policies against current scan results and baseline diffs.
 *
 * @param policy - Security policy rules.
 * @param currentReport - CanonicalReport from current scan.
 * @param diffResult - Output of differential comparison.
 * @param options - Additional runtime context (e.g. plugin status).
 * @returns Complete CiGateResult with deterministic exit code.
 */
export function evaluateCiPolicy(
  policy: CiPolicy,
  currentReport: CanonicalReport,
  diffResult: FindingDiffResult,
  options: PolicyEvaluationOptions = {},
): CiGateResult {
  const evaluations: GateEvaluation[] = [];

  // ── Gate 1: Severity Threshold (`failOn`) ──
  if (policy.failOn) {
    const targetRank = SEVERITY_RANKS[policy.failOn] ?? 0;
    const violatingFindings = (currentReport.findings ?? []).filter((f) => {
      const level = (f.severity?.level ?? 'info') as SeverityLevel;
      const rank = SEVERITY_RANKS[level] ?? 0;
      return rank >= targetRank;
    });

    const passed = violatingFindings.length === 0;
    let highestSeverityFound: SeverityLevel = 'info';
    let highestRank = -1;

    for (const f of currentReport.findings ?? []) {
      const level = (f.severity?.level ?? 'info') as SeverityLevel;
      const rank = SEVERITY_RANKS[level] ?? 0;
      if (rank > highestRank) {
        highestRank = rank;
        highestSeverityFound = level;
      }
    }

    evaluations.push(
      Object.freeze({
        gate: 'severity_threshold',
        name: `Severity Threshold (>= ${policy.failOn})`,
        passed,
        threshold: policy.failOn,
        actual: highestSeverityFound,
        details: passed
          ? `No findings met or exceeded severity threshold '${policy.failOn}'.`
          : `${violatingFindings.length} finding(s) met or exceeded severity threshold '${policy.failOn}' (highest: '${highestSeverityFound}').`,
        violatingItems: passed
          ? undefined
          : Object.freeze(
              violatingFindings.map(
                (f) => `[${f.severity?.level ?? 'unknown'}] ${f.ruleId}: ${f.title}`,
              ),
            ),
      }),
    );
  }

  // ── Gate 2: Fail on New Findings (`failOnNew`) ──
  if (policy.failOnNew) {
    const passed = diffResult.newCount === 0;
    const newItems = diffResult.diffs.filter((d) => d.status === 'new');

    evaluations.push(
      Object.freeze({
        gate: 'fail_on_new',
        name: 'New Findings Check',
        passed,
        threshold: 0,
        actual: diffResult.newCount,
        details: passed
          ? 'Zero new findings introduced compared to baseline.'
          : `${diffResult.newCount} new finding(s) introduced compared to baseline.`,
        violatingItems: passed
          ? undefined
          : Object.freeze(
              newItems.map(
                (d) =>
                  `[${d.currentSeverity ?? 'unknown'}] ${d.ruleId}: ${d.title} (${d.artifactPath || 'root'})`,
              ),
            ),
      }),
    );
  }

  // ── Gate 3: Maximum Allowed New Findings (`maxNew`) ──
  if (typeof policy.maxNew === 'number' && !policy.failOnNew) {
    const passed = diffResult.newCount <= policy.maxNew;
    const newItems = diffResult.diffs.filter((d) => d.status === 'new');

    evaluations.push(
      Object.freeze({
        gate: 'max_new',
        name: `Max New Findings (<= ${policy.maxNew})`,
        passed,
        threshold: policy.maxNew,
        actual: diffResult.newCount,
        details: passed
          ? `New finding count (${diffResult.newCount}) within acceptable limit (${policy.maxNew}).`
          : `New finding count (${diffResult.newCount}) exceeded maximum limit (${policy.maxNew}).`,
        violatingItems: passed
          ? undefined
          : Object.freeze(
              newItems.map(
                (d) =>
                  `[${d.currentSeverity ?? 'unknown'}] ${d.ruleId}: ${d.title} (${d.artifactPath || 'root'})`,
              ),
            ),
      }),
    );
  }

  // ── Gate 4: Fail on Regressions (`failOnRegressions`) ──
  if (policy.failOnRegressions) {
    const hasFindingRegressions = diffResult.regressedCount > 0;
    const hasRiskRegression = diffResult.riskScoreDelta > 0.001;
    const passed = !hasFindingRegressions && !hasRiskRegression;

    const regressedItems = diffResult.diffs.filter((d) => d.status === 'regressed');

    let details = 'No severity regressions or risk score increases detected.';
    if (!passed) {
      const parts: string[] = [];
      if (hasFindingRegressions) {
        parts.push(`${diffResult.regressedCount} finding(s) increased in severity`);
      }
      if (hasRiskRegression) {
        parts.push(
          `risk score increased from ${diffResult.baselineRiskScore?.toFixed(1) ?? '0.0'} to ${diffResult.currentRiskScore.toFixed(1)} (+${diffResult.riskScoreDelta.toFixed(1)})`,
        );
      }
      details = `Security regression detected: ${parts.join('; ')}.`;
    }

    evaluations.push(
      Object.freeze({
        gate: 'fail_on_regressions',
        name: 'Regression Check',
        passed,
        threshold: '0 regressions / delta <= 0',
        actual: `${diffResult.regressedCount} regressed findings, delta: ${diffResult.riskScoreDelta >= 0 ? '+' : ''}${diffResult.riskScoreDelta.toFixed(1)}`,
        details,
        violatingItems: passed
          ? undefined
          : Object.freeze(
              regressedItems.map(
                (d) =>
                  `[${d.baselineSeverity ?? 'unknown'} -> ${d.currentSeverity ?? 'unknown'}] ${d.ruleId}: ${d.title}`,
              ),
            ),
      }),
    );
  }

  // ── Gate 5: Maximum Risk Score (`maxRisk`) ──
  if (typeof policy.maxRisk === 'number') {
    const currentScore = diffResult.currentRiskScore;
    const passed = currentScore <= policy.maxRisk;

    evaluations.push(
      Object.freeze({
        gate: 'max_risk',
        name: `Max Risk Score (<= ${policy.maxRisk.toFixed(1)})`,
        passed,
        threshold: policy.maxRisk,
        actual: Math.round(currentScore * 10) / 10,
        details: passed
          ? `Overall risk score (${currentScore.toFixed(1)}) within limit (${policy.maxRisk.toFixed(1)}).`
          : `Overall risk score (${currentScore.toFixed(1)}) exceeded limit (${policy.maxRisk.toFixed(1)}).`,
      }),
    );
  }

  // ── Gate 6: Plugin Quarantine / Crash Gate (`failOnPluginQuarantine`) ──
  if (policy.failOnPluginQuarantine) {
    const quarantined = options.quarantinedPlugins ?? [];
    const passed = quarantined.length === 0;

    evaluations.push(
      Object.freeze({
        gate: 'plugin_health',
        name: 'Plugin Health Gate',
        passed,
        threshold: 0,
        actual: quarantined.length,
        details: passed
          ? 'All loaded plugins operating normally.'
          : `${quarantined.length} plugin(s) crashed or quarantined: ${quarantined.join(', ')}.`,
        violatingItems: passed ? undefined : Object.freeze([...quarantined]),
      }),
    );
  }

  const violations = evaluations.filter((e) => !e.passed);
  const passed = violations.length === 0;

  // Determine exit code
  let exitCode: number = ExitCode.SUCCESS;
  if (!passed) {
    const hasPluginFailure = violations.some((v) => v.gate === 'plugin_health');
    exitCode = hasPluginFailure ? ExitCode.PLUGIN_ERROR : ExitCode.GATE_VIOLATION;
  }

  return Object.freeze({
    passed,
    exitCode,
    evaluations: Object.freeze(evaluations),
    violations: Object.freeze(violations),
  });
}
