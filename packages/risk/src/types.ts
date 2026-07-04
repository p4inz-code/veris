/**
 * Core types for @veris/risk.
 *
 * The Risk Engine sits AFTER Correlation and BEFORE Recommendations in the pipeline.
 *
 * ## Pipeline Position
 * Rules → Correlation → **Risk** → Recommendations → AI Assistant
 *
 * ## Core Invariants
 * - All outputs are immutable (readonly + frozen at construction).
 * - All IDs are deterministic — same input always produces same IDs.
 * - Risk is computed from evidence only — never invented or inferred.
 * - Every value is explainable — every number traces to a formula.
 * - No AI, no random, no timestamps affecting scores, no external services.
 *
 * @module @veris/risk/types
 */

import type { Severity } from '@veris/core';

// ── Identifiers ──

// ── Risk Level ──

/**
 * Risk level categories.
 *
 * MUST match the values in @veris/core `RiskProfile.riskLevel`:
 *   "critical" | "high" | "medium" | "low" | "negligible"
 *
 * Keeping these in sync is critical because `CanonicalReport.RiskProfile`
 * is part of the frozen SPEC-002 data model. Any divergence would force
 * every consumer to map between two incompatible representations.
 *
 * See: @veris/core/types/report.ts → RiskProfile.riskLevel
 */
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'negligible';

// ── Verdict ──

/**
 * Unique symbol for Verdict branded type safety.
 */
declare const VERDICT_BRAND: unique symbol;

/**
 * Investigation verdict — the overall determination about an artifact
 * or repository, derived from the combination of risk score and confidence.
 *
 * Verdict is a branded string type to allow future verdict values
 * without breaking consumers. Use the `VERDICTS` constant for
 * compile-time known verdicts.
 *
 * A verdict answers: "What should I do about this?"
 * This is distinct from severity, which answers: "How bad is this if true?"
 */
export type Verdict = string & { readonly [VERDICT_BRAND]: true };

/** Known verdict values with branded type safety. */
export const VERDICTS = {
  /** Confirmed malicious. Immediate action required. */
  MALICIOUS: 'malicious' as Verdict,
  /** Strong indicators of malicious activity. Needs confirmation. */
  LIKELY_MALICIOUS: 'likely-malicious' as Verdict,
  /** Some indicators present. Warrants investigation. */
  SUSPICIOUS: 'suspicious' as Verdict,
  /** Minor or no concerning indicators. Likely safe. */
  LIKELY_BENIGN: 'likely-benign' as Verdict,
  /** No concerning indicators. Safe. */
  BENIGN: 'benign' as Verdict,
  /** Insufficient evidence to make a determination. */
  UNKNOWN: 'unknown' as Verdict,
} as const;

// ── Contribution Source Type ──

/**
 * Unique symbol for SourceType branded type safety.
 */
declare const SOURCE_TYPE_BRAND: unique symbol;

/**
 * The type of source that produced a contribution.
 *
 * Branded string type — new source types can be added without breaking
 * existing consumers. Use the `SOURCE_TYPES` constant for known values.
 */
export type SourceType = string & { readonly [SOURCE_TYPE_BRAND]: true };

/** Known source type values. */
export const SOURCE_TYPES = {
  /** Contribution from a rule match. */
  RULE: 'rule' as SourceType,
  /** Contribution from a correlation (behavioral chain). */
  CORRELATION: 'correlation' as SourceType,
  /** Contribution directly from evidence (no rule match). */
  EVIDENCE: 'evidence' as SourceType,
} as const;

// ── Multiplier Item ──

/**
 * A named multiplier applied to a contribution.
 *
 * Each multiplier is recorded so its application is fully traceable.
 * Examples: chain multiplier (1.10×), severity multiplier (1.83×),
 * policy override multiplier (2.0×).
 */
export interface MultiplierItem {
  /** Multiplier name (e.g., "chain-multiplier", "severity-multiplier"). */
  readonly name: string;
  /** The multiplier value (e.g., 1.10 for 10% amplification). */
  readonly value: number;
  /** Why this multiplier was applied. */
  readonly reason: string;
}

// ── Formula Steps ──

/**
 * A single step in a formula computation.
 *
 * Each step is independently verifiable by an auditor.
 * The chain of steps reconstructs the exact computation.
 */
export interface FormulaStep {
  /** The operation performed (e.g., "multiply", "add", "saturate"). */
  readonly operation: string;
  /** The operands used in this step. */
  readonly operands: readonly { readonly name: string; readonly value: number }[];
  /** The result of this step. */
  readonly result: number;
}

/**
 * Structured formula representation for a contribution.
 *
 * Unlike a string, this is programmatically consumable.
 * An auditor can verify each step independently.
 */
export interface FormulaSteps {
  /** Human-readable formula string for display. */
  readonly display: string;
  /** Ordered computation steps. */
  readonly steps: readonly FormulaStep[];
}

// ── Contribution ──

/**
 * A single atomic contribution to the risk assessment.
 *
 * Contributions are the atomic unit of explainability. Every contribution
 * has a source, a value, and a fully traceable derivation.
 *
 * ## Invariants
 * - `effectiveValue` is always the definitive contribution value.
 * - `baseValue` is `effectiveValue` before multipliers are applied.
 * - Every value is derived from evidence — never invented.
 * - Every multiplier is recorded and explainable.
 */
export interface Contribution {
  /** Deterministic contribution ID (prefix: "rc_"). */
  readonly id: string;
  /** The type of source that produced this contribution. */
  readonly sourceType: SourceType;
  /** ID of the source (rule ID, correlation ID, evidence ID). */
  readonly sourceId: string;
  /** Human-readable name of the source. */
  readonly sourceName: string;

  /**
   * Base contribution value before multipliers.
   * Computed as: severity × confidence × dimensionWeight.
   *
   * This is the "raw" contribution — what the evidence alone contributes
   * before any amplification or attenuation from multipliers.
   *
   * @remarks
   * Range: [0.0, 10.0]. Precision: 6 decimal places.
   */
  readonly baseValue: number;
  /**
   * Effective contribution value after all multipliers.
   * Computed as: baseValue × Π(multipliers).
   *
   * This is the value used in dimension scoring and is the authoritative
   * contribution value for all risk calculations.
   *
   * @remarks
   * Range: [0.0, 10.0]. Precision: 6 decimal places.
   * This, not baseValue, is what contributes to the risk score.
   */
  readonly effectiveValue: number;

  /**
   * Confidence in this contribution [0.0, 1.0].
   * Inherited from the source evidence. Never invented.
   *
   * @remarks
   * Precision: 4 decimal places.
   */
  readonly confidence: number;
  /**
   * Severity of the source, if applicable.
   * Rule matches always have severity. Correlations inherit from their members.
   * Direct evidence may not have a defined severity.
   */
  readonly severity: Severity | null;

  /** Evidence IDs supporting this contribution. Resolved through pipeline provenance. */
  readonly evidenceIds: readonly string[];

  /** Human-readable explanation of WHY this contributed. */
  readonly explanation: string;

  /** Structured formula steps for auditor verification. */
  readonly formula: FormulaSteps;

  /** Multipliers applied to this contribution, in application order. */
  readonly multipliers: readonly MultiplierItem[];

  /**
   * ISO 8601 timestamp when the source evidence was collected.
   * Present only when temporal information is available from the
   * evidence pipeline (e.g., file modification time, event log time).
   * Absent (undefined) when no temporal information is available.
   */
  readonly timestamp?: string;

  /**
   * Extensible metadata for source-specific context.
   * Consumers may store additional information here without modifying
   * the Contribution type. All metadata is immutable.
   */
  readonly metadata: Readonly<Record<string, unknown>>;
}

// ── Risk Assessment ──

/**
 * The complete output of a risk engine evaluation.
 *
 * A RiskAssessment represents the risk for a single artifact or an
 * entire repository. It contains the aggregate score, the verdict,
 * the confidence, and all individual contributions.
 *
 * ## Schema Versioning
 * The `schemaVersion` field MUST be checked before deserialization.
 * Consumers expecting schema version X should reject assessments
 * with schema version Y where major versions differ.
 *
 * ## Immutability
 * Every field is readonly. The object itself is frozen at construction.
 *
 * @see SCHEMA_VERSION constant for current version.
 */
export interface RiskAssessment {
  /**
   * Data model schema version (semver).
   * MUST be the first field for schema detection during deserialization.
   */
  readonly schemaVersion: string;

  /**
   * Version of @veris/risk that produced this assessment (semver).
   * Enables consumers to identify which engine version produced the output.
   */
  readonly engineVersion: string;

  /** Deterministic assessment ID (prefix: "ra_"). */
  readonly id: string;

  /** Owning session ID. */
  readonly sessionId: string;

  /**
   * Artifact this assessment applies to.
   * `null` indicates a repository-level (aggregate) assessment.
   */
  readonly artifactId: string | null;

  // ── Core Outputs ──

  /**
   * Overall risk score [0.0, 10.0].
   * Precision: 2 decimal places (rounded, not truncated).
   */
  readonly riskScore: number;

  /** Categorized risk level derived from the score. */
  readonly riskLevel: RiskLevel;

  /** Investigation verdict derived from score and confidence. */
  readonly verdict: Verdict;

  /**
   * Confidence in the assessment [0.0, 1.0].
   * Derived from the mean of all contribution confidences.
   */
  readonly confidence: number;

  /** ISO 8601 timestamp when the assessment was computed. */
  readonly computedAt: string;

  // ── Contributions ──

  /**
   * Contributions that produced this assessment.
   * Sorted by effectiveValue descending (highest contribution first).
   *
   * If `contributionsTruncated` is true, this array contains only the
   * top-K contributions. The full contribution set is available via
   * the explainability API.
   */
  readonly contributions: readonly Contribution[];

  /**
   * Total number of contributions that were evaluated.
   * When contributions are truncated, this reflects the actual count.
   */
  readonly totalContributionCount: number;

  /** Whether contributions were truncated (limited to top-K). */
  readonly contributionsTruncated: boolean;
}

// ── Input Types (consumed by the engine) ──

/**
 * A lightweight rule match reference for risk engine input.
 *
 * Contains only the fields the risk engine needs, decoupling
 * the risk engine from `@veris/rules` type changes.
 */
export interface RiskRuleMatch {
  /** The rule ID that matched. */
  readonly ruleId: string;
  /** Rule severity. */
  readonly severity: Severity;
  /** Match confidence [0.0, 1.0]. */
  readonly confidence: number;
  /** Evidence IDs that contributed to this match. */
  readonly evidenceIds: readonly string[];
  /** Taxonomy IDs this rule relates to. */
  readonly taxonomyIds: readonly string[];
}

/**
 * A lightweight correlation reference for risk engine input.
 *
 * Contains only the fields the risk engine needs, decoupling
 * the risk engine from `@veris/correlation` type changes.
 */
export interface RiskCorrelation {
  /** Correlation ID. */
  readonly correlationId: string;
  /** Number of behaviors in the chain. */
  readonly chainLength: number;
  /** Confidence in the correlation [0.0, 1.0]. */
  readonly confidence: number;
  /** Evidence IDs that form this correlation. */
  readonly evidenceIds: readonly string[];
}

/**
 * A lightweight evidence reference for risk engine input.
 */
export interface RiskEvidence {
  /** Evidence ID. */
  readonly id: string;
  /** Confidence score [0.0, 1.0]. */
  readonly confidence: number;
  /** Evidence category (e.g., "executable", "obfuscation"). */
  readonly category: string;
  /** Artifact this evidence relates to. */
  readonly artifactId: string;
}

/**
 * The input context for the risk engine.
 *
 * All fields are lightweight references — no full domain objects.
 * This decouples the risk engine from upstream package type changes.
 */
export interface RiskInput {
  /** Rule matches produced by the rules engine. */
  readonly matches: readonly RiskRuleMatch[];
  /** Correlations produced by the correlation engine. */
  readonly correlations: readonly RiskCorrelation[];
  /** Evidence references. */
  readonly evidence: readonly RiskEvidence[];
  /** Artifact ID (null for repository-level assessment). */
  readonly artifactId: string | null;
  /** Owning session ID. */
  readonly sessionId: string;
}

// ── Engine Options ──

/** Optional configuration for a single evaluate() call. */
export interface RiskEngineOptions {
  /** Timeout in milliseconds (default: 30000). */
  readonly timeoutMs?: number;
  /** Maximum contributions to store (default: 10000). */
  readonly maxContributions?: number;
  /** Cancellation token for cooperative cancellation. */
  readonly cancellationToken?: import('@veris/shared').CancellationToken;
  /**
   * ISO 8601 timestamp override for the assessment's `computedAt` field.
   *
   * When provided, the assessment will use this exact timestamp instead of
   * the current time. This enables fully deterministic assessments for
   * testing and reproducible builds.
   *
   * When omitted, `new Date().toISOString()` is used at evaluation time.
   */
  readonly computedAt?: string;

  /**
   * Optional diagnostics collector for profiling and debugging.
   *
   * When provided, the engine records stage timings and metric counters
   * to this collector during evaluation. The collector's
   * `finalizeDiagnostics()` method returns an immutable diagnostics object.
   *
   * Diagnostics are purely observational — they never affect scoring,
   * verdicts, confidence, or the returned RiskAssessment.
   *
   * When omitted, no diagnostic work is performed and overhead is negligible.
   */
  readonly diagnostics?: RiskDiagnosticsWriter;
}

/**
 * Minimal interface for a diagnostics writer used by the risk engine.
 *
 * Defined here inline to avoid a circular dependency with diagnostics.ts.
 * The full implementation in diagnostics.ts uses this interface.
 */
export interface RiskDiagnosticsWriter {
  recordStage(name: string): void;
  setContributionCount(count: number): void;
  setDimensionCount(count: number): void;
  setEvidenceCount(count: number): void;
  setSkippedContributions(count: number): void;
  addValidationFailure(): void;
  setTruncationInfo(
    info: { truncated: boolean; originalCount: number; finalCount: number } | null,
  ): void;
}
