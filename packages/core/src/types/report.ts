/**
 * Report types for VERIS.
 *
 * The CanonicalReport is the complete, self-contained output of a VERIS scan session.
 *
 * @module @veris/core/types/report
 */

import type { ScanSession, SessionError } from './analysis.js';
import type { Artifact } from './artifact.js';
import type { Finding, BehaviorChain, Recommendation } from './finding.js';
import type { Severity } from './severity.js';
import type { TaxonomyId } from './taxonomy.js';

/** Report ID (prefix: "rep_"). */
export type ReportId = string;

/** High-level summary of a scan report. */
export interface ReportSummary {
  /** Total artifacts analyzed. */
  readonly totalArtifacts: number;
  /** Total findings. */
  readonly totalFindings: number;
  /** Findings by severity level. */
  readonly findingsBySeverity: Record<string, number>;
  /** Findings by taxonomy category. */
  readonly findingsByCategory: Record<TaxonomyId, number>;
  /** Overall risk score [0.0, 10.0]. */
  readonly riskScore: number;
  /** Overall trust score [0.0, 1.0]. */
  readonly trustScore: number;
  /** Total scan duration in milliseconds. */
  readonly scanDurationMs: number;
  /** Number of rules applied. */
  readonly rulesApplied: number;
  /** Number of behaviors detected. */
  readonly behaviorsDetected: number;
}

/** Trust factor contributing to the trust score. */
export interface TrustFactor {
  /** Factor name (e.g., "high-severity-findings", "behavior-chains"). */
  readonly factor: string;
  /** Directional impact [-1.0, 1.0]. */
  readonly impact: number;
  /** Weight in the overall calculation. */
  readonly weight: number;
  /** Human-readable explanation. */
  readonly explanation: string;
}

/** TrustProfile — per-artifact trust assessment. */
export interface TrustProfile {
  /** Deterministic trust profile ID. */
  readonly id: string;
  /** Owning session ID. */
  readonly sessionId: string;
  /** Artifact this trust profile applies to. */
  readonly artifactId: string;
  /** Normalized trust score [0.0 (malicious) – 1.0 (trusted)]. */
  readonly trustScore: number;
  /** Findings per KB of analyzed content. */
  readonly findingDensity: number;
  /** Count of findings per severity level. */
  readonly severityBreakdown: Record<string, number>;
  /** Findings per taxonomy node. */
  readonly taxonomyBreakdown?: Record<TaxonomyId, number>;
  /** Impact of behavior chains on trust [-1.0, 1.0]. */
  readonly chainImpact?: number;
  /** Factors that influenced the score. */
  readonly contributingFactors?: readonly TrustFactor[];
  /** When the profile was computed (ISO 8601). */
  readonly computedAt: string;
}

/** Risk driver — a factor driving the risk score. */
export interface RiskDriver {
  /** Finding driving the risk. */
  readonly findingId: string;
  /** Contribution to risk score [0.0, 1.0]. */
  readonly contribution: number;
  /** Why this finding drives risk. */
  readonly reason: string;
}

/** RiskProfile — business-context-aware risk assessment. */
export interface RiskProfile {
  /** Deterministic risk profile ID. */
  readonly id: string;
  /** Owning session ID. */
  readonly sessionId: string;
  /** Source trust profile ID. */
  readonly trustProfileId: string;
  /** Overall risk score [0.0 – 10.0]. */
  readonly riskScore: number;
  /** Categorized risk level. */
  readonly riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'negligible';
  /** Highest severity finding. */
  readonly maxSeverity: Severity;
  /** Highest-risk finding IDs (top 10). */
  readonly topFindings?: readonly string[];
  /** Factors driving the risk score. */
  readonly riskDrivers?: readonly RiskDriver[];
  /** Ordered recommendation IDs. */
  readonly recommendationPriorities?: readonly string[];
  /** When computed (ISO 8601). */
  readonly computedAt: string;
}

/**
 * CanonicalReport — the complete, self-contained output of a VERIS scan session.
 * All exporters, renderers, and consumers operate on this structure.
 * Immutable after creation.
 */
export interface CanonicalReport {
  /** Deterministic report ID. */
  readonly id: ReportId;
  /** Session metadata. */
  readonly session: ScanSession;
  /** All artifacts analyzed. */
  readonly artifacts: readonly Artifact[];
  /** All findings (with embedded evidence). */
  readonly findings: readonly Finding[];
  /** Detected behavior chains. */
  readonly behaviorChains?: readonly BehaviorChain[];
  /** Trust assessment. */
  readonly trustProfile: TrustProfile;
  /** Risk assessment. */
  readonly riskProfile: RiskProfile;
  /** Remediation recommendations. */
  readonly recommendations?: readonly Recommendation[];
  /** High-level summary. */
  readonly summary: ReportSummary;
  /** Errors encountered during analysis. */
  readonly errors?: readonly SessionError[];
  /** Report generation timestamp (ISO 8601). */
  readonly generatedAt: string;
}
