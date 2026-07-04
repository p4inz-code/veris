/**
 * @veris/report — VERIS canonical report construction.
 *
 * Converts PipelineResult into a CanonicalReport suitable for export,
 * storage, or further processing.
 *
 * ## Conversion Path
 *
 * PipelineResult → ReportBuilder → CanonicalReport
 *
 * The ReportBuilder gathers:
 *   - Artifact metadata from PipelineInput (passed through)
 *   - Findings from RuleMatches + Evidence
 *   - Behavior chains from Correlations
 *   - Risk assessment from RiskAssessment
 *   - Recommendations (when available)
 *   - Summary statistics
 *
 * ## Invariants
 * - Reports are immutable after construction (frozen)
 * - Reports are reproducible from the same analysis
 * - All IDs are deterministic
 *
 * @module @veris/report
 */

import type {
  CanonicalReport,
  ScanSession,
  ReportSummary,
  TrustProfile,
  RiskProfile,
  Finding,
  BehaviorChain,
  Evidence,
  Recommendation,
  Artifact,
  ArtifactRef,
} from '@veris/core';
import {
  createSeverity,
  severityLevelFromScore,
  SCHEMA_VERSION,
  ENGINE_VERSION,
} from '@veris/core';
import type { PipelineResult, PipelineInput } from '@veris/pipeline';
import type { RiskAssessment } from '@veris/risk';
import { deterministicId } from '@veris/shared';

// ── Report Builder ──

/** Options for building a CanonicalReport. */
export interface ReportBuilderOptions {
  /** Session ID (generated if not provided). */
  readonly sessionId?: string;
  /** Report generation timestamp (ISO 8601). */
  readonly generatedAt?: string;
  /** Target directory of the scan. */
  readonly target?: string;
  /** Profile name used for the scan. */
  readonly profile?: string;
}

/**
 * Build a CanonicalReport from pipeline results.
 *
 * @param pipelineResult - The output of the analysis pipeline.
 * @param input - The original pipeline input (for artifacts).
 * @param options - Optional overrides for session metadata.
 * @returns A frozen CanonicalReport.
 */
export function buildReport(
  pipelineResult: PipelineResult,
  input?: PipelineInput,
  options?: ReportBuilderOptions,
): CanonicalReport {
  const now = new Date().toISOString();
  const generatedAt = options?.generatedAt ?? pipelineResult.executedAt ?? now;
  const sessionId =
    options?.sessionId ??
    pipelineResult.assessment?.sessionId ??
    deterministicId('sess', generatedAt);

  // Build session
  const session: ScanSession = Object.freeze({
    id: sessionId,
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    startedAt: generatedAt,
    completedAt: generatedAt,
    durationMs: 0,
    config: Object.freeze({
      target: options?.target,
      profile: options?.profile,
    }),
    environment: Object.freeze({
      os: process.platform,
      arch: process.arch,
      runtimeVersion: process.version,
      engineVersion: ENGINE_VERSION,
    }),
    artifactCount: input?.artifacts.length ?? 0,
    findingCount: 0,
    status: 'completed',
  });

  // Build findings from rule matches
  const findings: Finding[] = [];
  const evidenceList: Evidence[] = [];
  const behaviorChains: BehaviorChain[] = [];

  if (pipelineResult.ruleMatches) {
    for (const match of pipelineResult.ruleMatches) {
      const findingId = deterministicId('fin', match.ruleId, sessionId ?? '');
      const score = match.confidenceContribution * 10;
      const severity = createSeverity(severityLevelFromScore(score), score);

      const artifactRefs: ArtifactRef[] = [];

      const finding: Finding = Object.freeze({
        id: findingId,
        sessionId: sessionId ?? '',
        ruleId: match.ruleId,
        behaviorChainId: null,
        title: match.title ?? `Rule match: ${match.ruleId}`,
        description: match.description ?? '',
        severity,
        confidence: match.confidenceContribution,
        evidenceIds: Object.freeze([...match.matchedEvidenceIds]),
        affectedArtifacts: Object.freeze(artifactRefs),
        taxonomyIds: Object.freeze([]),
        createdAt: generatedAt,
      });

      findings.push(finding);
    }
  }

  // Build behavior chains from correlations
  if (pipelineResult.correlations) {
    for (const correlation of pipelineResult.correlations) {
      const chainId = deterministicId('bc', correlation.id);
      const chain: BehaviorChain = Object.freeze({
        id: chainId,
        sessionId: sessionId ?? '',
        relationshipType: 'correlated',
        behaviorIds: Object.freeze([...correlation.evidenceIds]),
        findingIds: Object.freeze([]),
        trustImpact: correlation.confidence,
        description: `Correlation: ${correlation.id}`,
      });
      behaviorChains.push(chain);
    }
  }

  // Build summary
  const assessment = pipelineResult.assessment;
  const summary: ReportSummary = Object.freeze({
    totalArtifacts: input?.artifacts.length ?? 0,
    totalFindings: findings.length,
    findingsBySeverity: Object.freeze(
      findings.reduce<Record<string, number>>((acc, f) => {
        acc[f.severity.level] = (acc[f.severity.level] ?? 0) + 1;
        return acc;
      }, {}),
    ),
    findingsByCategory: Object.freeze({}),
    riskScore: assessment?.riskScore ?? 0,
    trustScore: 1 - (assessment?.riskScore ?? 0) / 10,
    scanDurationMs: pipelineResult.diagnostics?.matchCount ?? 0,
    rulesApplied: pipelineResult.diagnostics?.matchCount ?? 0,
    behaviorsDetected: behaviorChains.length,
  });

  // Build trust profile
  const trustProfile: TrustProfile = Object.freeze({
    id: deterministicId('tp', sessionId ?? ''),
    sessionId: sessionId ?? '',
    artifactId: input?.artifacts[0]?.id ?? 'unknown',
    trustScore: summary.trustScore,
    findingDensity: findings.length / Math.max(input?.artifacts.length ?? 1, 1),
    severityBreakdown: Object.freeze(summary.findingsBySeverity),
    computedAt: generatedAt,
  });

  // Build risk profile
  const riskLevel = assessment?.riskLevel ?? 'negligible';
  const riskProfile: RiskProfile = Object.freeze({
    id: deterministicId('rp', sessionId ?? ''),
    sessionId: sessionId ?? '',
    trustProfileId: trustProfile.id,
    riskScore: assessment?.riskScore ?? 0,
    riskLevel: riskLevel as RiskProfile['riskLevel'],
    maxSeverity: createSeverity(
      severityLevelFromScore(assessment?.riskScore ?? 0),
      assessment?.riskScore ?? 0,
    ),
    computedAt: generatedAt,
  });

  // Build final report
  const reportId = deterministicId('rep', sessionId ?? '');
  const report: CanonicalReport = Object.freeze({
    id: reportId,
    session,
    artifacts: Object.freeze([...(input?.artifacts ?? [])]),
    findings: Object.freeze(findings),
    behaviorChains: behaviorChains.length > 0 ? Object.freeze(behaviorChains) : undefined,
    trustProfile,
    riskProfile,
    summary,
    generatedAt,
  });

  return report;
}

// ── Pipeline Result Type (duplicated here for convenience) ──

/**
 * PipelineResult type alias for consumers who don't want to import from @veris/pipeline.
 * Re-exported here so downstream packages only need @veris/report.
 */

export type { PipelineResult, PipelineInput } from '@veris/pipeline';

/**
 * ReportBuilder class for programmatic report construction.
 */
export class ReportBuilder {
  /**
   * Build a report from pipeline results.
   */
  build(
    pipelineResult: PipelineResult,
    input?: PipelineInput,
    options?: ReportBuilderOptions,
  ): CanonicalReport {
    return buildReport(pipelineResult, input, options);
  }

  /**
   * Build a report from raw data (for testing or external use).
   */
  buildFromData(data: {
    pipelineResult: PipelineResult;
    input?: PipelineInput;
    options?: ReportBuilderOptions;
  }): CanonicalReport {
    return buildReport(data.pipelineResult, data.input, data.options);
  }
}
