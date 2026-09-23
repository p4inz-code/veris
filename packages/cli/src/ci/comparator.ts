/**
 * @veris/cli/ci/comparator — Deterministic differential finding comparator.
 *
 * Implements Section 5 of ADR-015:
 *   Categorizes findings relative to baseline into:
 *   - unchanged: Present in both with matching severity and score.
 *   - new: Present in current scan, absent from baseline.
 *   - regressed: Present in both, but severity level or risk score worsened.
 *   - evidence_changed: Present in both, severity unchanged, but evidence count differs.
 *   - resolved: Present in baseline, no longer detected in current scan.
 *
 * @module @veris/cli/ci/comparator
 */

import type { Artifact, CanonicalReport, Finding } from '@veris/core';

import { computeFindingFingerprint } from './fingerprint.js';
import {
  type BaselineData,
  type BaselineFinding,
  type FindingDiffEntry,
  type FindingDiffResult,
  type FindingDiffStatus,
  type SeverityLevel,
  SEVERITY_RANKS,
} from './types.js';

/** Sort order for finding diff statuses. */
const STATUS_PRIORITY: Readonly<Record<FindingDiffStatus, number>> = Object.freeze({
  new: 0,
  regressed: 1,
  evidence_changed: 2,
  unchanged: 3,
  resolved: 4,
});

/**
 * Compare current scan report findings against baseline findings.
 *
 * @param currentReport - CanonicalReport from the current scan.
 * @param baseline - Parsed baseline data (or null if no baseline was supplied).
 * @returns Deterministic FindingDiffResult.
 */
export function compareFindings(
  currentReport: CanonicalReport,
  baseline: BaselineData | null,
): FindingDiffResult {
  const artifactsById = new Map<string, Artifact>();
  if (Array.isArray(currentReport.artifacts)) {
    for (const art of currentReport.artifacts) {
      if (art && art.id) {
        artifactsById.set(art.id, art);
      }
    }
  }

  // Index baseline findings by fingerprint
  const baselineMap = new Map<string, BaselineFinding>();
  if (baseline && Array.isArray(baseline.findings)) {
    for (const b of baseline.findings) {
      baselineMap.set(b.fingerprint, b);
    }
  }

  // Index current findings by fingerprint
  const currentFindings = currentReport.findings ?? [];
  const currentFingerprints = new Map<
    string,
    {
      finding: Finding;
      ruleId: string;
      artifactPath: string;
      title: string;
      severity: SeverityLevel;
      score: number;
      evidenceCount: number;
    }
  >();

  for (const f of currentFindings) {
    const fp = computeFindingFingerprint(f, artifactsById);
    const severity = (f.severity?.level ?? 'info') as SeverityLevel;
    const score = typeof f.severity?.score === 'number' ? f.severity.score : 0;
    const evidenceCount = Array.isArray(f.evidenceIds) ? f.evidenceIds.length : 0;

    currentFingerprints.set(fp.hash, {
      finding: f,
      ruleId: fp.ruleId,
      artifactPath: fp.artifactPath,
      title: fp.title,
      severity,
      score,
      evidenceCount,
    });
  }

  const diffEntries: FindingDiffEntry[] = [];
  const seenBaselineFingerprints = new Set<string>();

  // Process all current findings
  for (const [hash, curr] of currentFingerprints.entries()) {
    const base = baselineMap.get(hash);

    if (!baseline) {
      // No baseline provided: current finding represents initial state
      diffEntries.push(
        Object.freeze({
          fingerprint: hash,
          ruleId: curr.ruleId,
          artifactPath: curr.artifactPath,
          title: curr.title,
          status: 'unchanged',
          currentSeverity: curr.severity,
          currentScore: curr.score,
          currentFindingId: curr.finding.id,
          changeDetails: `Current inventory finding (${curr.severity})`,
        }),
      );
      continue;
    }

    if (!base) {
      // In current scan, absent from baseline -> NEW
      diffEntries.push(
        Object.freeze({
          fingerprint: hash,
          ruleId: curr.ruleId,
          artifactPath: curr.artifactPath,
          title: curr.title,
          status: 'new',
          currentSeverity: curr.severity,
          currentScore: curr.score,
          currentFindingId: curr.finding.id,
          changeDetails: `New finding introduced (${curr.severity})`,
        }),
      );
    } else {
      seenBaselineFingerprints.add(hash);
      const rankCurr = SEVERITY_RANKS[curr.severity] ?? 0;
      const rankBase = SEVERITY_RANKS[base.severity] ?? 0;

      if (rankCurr > rankBase || curr.score > base.score + 0.05) {
        // Severity or score worsened -> REGRESSED
        diffEntries.push(
          Object.freeze({
            fingerprint: hash,
            ruleId: curr.ruleId,
            artifactPath: curr.artifactPath,
            title: curr.title,
            status: 'regressed',
            currentSeverity: curr.severity,
            baselineSeverity: base.severity,
            currentScore: curr.score,
            baselineScore: base.score,
            currentFindingId: curr.finding.id,
            baselineFindingId: base.originalFindingId,
            changeDetails: `Severity regressed from ${base.severity} (${base.score.toFixed(1)}) to ${curr.severity} (${curr.score.toFixed(1)})`,
          }),
        );
      } else if (curr.evidenceCount !== base.evidenceCount) {
        // Severity unchanged, evidence count changed -> EVIDENCE_CHANGED
        diffEntries.push(
          Object.freeze({
            fingerprint: hash,
            ruleId: curr.ruleId,
            artifactPath: curr.artifactPath,
            title: curr.title,
            status: 'evidence_changed',
            currentSeverity: curr.severity,
            baselineSeverity: base.severity,
            currentScore: curr.score,
            baselineScore: base.score,
            currentFindingId: curr.finding.id,
            baselineFindingId: base.originalFindingId,
            changeDetails: `Evidence count changed from ${base.evidenceCount} to ${curr.evidenceCount}`,
          }),
        );
      } else {
        // Identical in baseline and current -> UNCHANGED
        diffEntries.push(
          Object.freeze({
            fingerprint: hash,
            ruleId: curr.ruleId,
            artifactPath: curr.artifactPath,
            title: curr.title,
            status: 'unchanged',
            currentSeverity: curr.severity,
            baselineSeverity: base.severity,
            currentScore: curr.score,
            baselineScore: base.score,
            currentFindingId: curr.finding.id,
            baselineFindingId: base.originalFindingId,
            changeDetails: `Unchanged (${curr.severity})`,
          }),
        );
      }
    }
  }

  // Process baseline findings that are NO LONGER in current scan -> RESOLVED
  if (baseline) {
    for (const [hash, base] of baselineMap.entries()) {
      if (!seenBaselineFingerprints.has(hash)) {
        diffEntries.push(
          Object.freeze({
            fingerprint: hash,
            ruleId: base.ruleId,
            artifactPath: base.artifactPath,
            title: base.title,
            status: 'resolved',
            baselineSeverity: base.severity,
            baselineScore: base.score,
            baselineFindingId: base.originalFindingId,
            changeDetails: `Resolved: no longer detected in current scan (was ${base.severity})`,
          }),
        );
      }
    }
  }

  // Deterministically sort diff entries:
  // 1. Status priority: new -> regressed -> evidence_changed -> unchanged -> resolved
  // 2. Severity rank (descending)
  // 3. Artifact path (ascending)
  // 4. Rule ID (ascending)
  // 5. Title (ascending)
  diffEntries.sort((a, b) => {
    const prioA = STATUS_PRIORITY[a.status] ?? 99;
    const prioB = STATUS_PRIORITY[b.status] ?? 99;
    if (prioA !== prioB) return prioA - prioB;

    const sevA = a.currentSeverity ?? a.baselineSeverity ?? 'info';
    const sevB = b.currentSeverity ?? b.baselineSeverity ?? 'info';
    const rankDiff = (SEVERITY_RANKS[sevB] ?? 0) - (SEVERITY_RANKS[sevA] ?? 0);
    if (rankDiff !== 0) return rankDiff;

    const pathDiff = a.artifactPath.localeCompare(b.artifactPath);
    if (pathDiff !== 0) return pathDiff;

    const ruleDiff = a.ruleId.localeCompare(b.ruleId);
    if (ruleDiff !== 0) return ruleDiff;

    return a.title.localeCompare(b.title);
  });

  // Calculate metrics
  const newCount = diffEntries.filter((d) => d.status === 'new').length;
  const regressedCount = diffEntries.filter((d) => d.status === 'regressed').length;
  const evidenceChangedCount = diffEntries.filter((d) => d.status === 'evidence_changed').length;
  const unchangedCount = diffEntries.filter((d) => d.status === 'unchanged').length;
  const resolvedCount = diffEntries.filter((d) => d.status === 'resolved').length;

  const currentRiskScore =
    currentReport.riskProfile?.riskScore ?? currentReport.summary?.riskScore ?? 0;
  const baselineRiskScore = baseline ? baseline.riskScore : undefined;
  const riskScoreDelta = baselineRiskScore !== undefined ? currentRiskScore - baselineRiskScore : 0;

  return Object.freeze({
    totalCurrent: currentFindings.length,
    totalBaseline: baseline ? baseline.findings.length : 0,
    newCount,
    regressedCount,
    evidenceChangedCount,
    unchangedCount,
    resolvedCount,
    currentRiskScore,
    baselineRiskScore,
    riskScoreDelta: Math.round(riskScoreDelta * 1000) / 1000,
    diffs: Object.freeze(diffEntries),
  });
}
