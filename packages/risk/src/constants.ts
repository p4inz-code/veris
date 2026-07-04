/**
 * Shared constants for @veris/risk.
 *
 * ## Invariants
 * - Schema version follows semver and is incremented on any breaking type change.
 * - Engine version follows semver and is incremented on any behavioral change.
 * - Verdict thresholds are documented (see VERDICT_THRESHOLDS JSDoc) and
 *   should only be changed with the same rigor as any public API.
 *
 * @module @veris/risk/constants
 */

import type { Verdict } from './types.js';

// ── ID Prefixes ──

/** Assessment ID prefix for deterministic IDs (e.g., "ra_a1b2c3..."). */
export const ASSESSMENT_ID_PREFIX = 'ra' as const;

/** Contribution ID prefix for deterministic IDs (e.g., "rc_d4e5f6..."). */
export const CONTRIBUTION_ID_PREFIX = 'rc' as const;

// ── Versioning ──

/**
 * Schema version for RiskAssessment serialization (semver).
 *
 * Matches the @veris/risk package version. Increment on any breaking
 * type change to the RiskAssessment interface.
 */
export const SCHEMA_VERSION = '0.1.0' as const;

/** Current risk engine version (semver). Updated with each release. */
export const ENGINE_VERSION = '0.1.0' as const;

// ── Mathematical Constants ──

/**
 * π/2 — used in the tanh saturation function.
 * Computed once to avoid repeated Math.PI / 2 in hot paths.
 */
export const PI_OVER_2: number = Math.PI / 2;

/** Default rounding precision for intermediate values (6 decimal places). */
export const ROUND_PRECISION_INTERMEDIATE = 6;

/** Default rounding precision for final output (2 decimal places). */
export const ROUND_PRECISION_FINAL = 2;

// ── Scoring Constants ──

/** Minimum possible risk score. */
export const RISK_SCORE_MIN = 0.0;

/** Maximum possible risk score. */
export const RISK_SCORE_MAX = 10.0;

/** Minimum possible confidence value. */
export const CONFIDENCE_MIN = 0.0;

/** Maximum possible confidence value. */
export const CONFIDENCE_MAX = 1.0;

/** Default concurrency for parallel evaluation. */
export const DEFAULT_CONCURRENCY = 4;

/** Default timeout in milliseconds for the evaluate operation. */
export const DEFAULT_TIMEOUT_MS = 30_000;

/** Default maximum number of stored contributions. Beyond this, they are truncated. */
export const DEFAULT_MAX_CONTRIBUTIONS = 10_000;

// ── Confidence Thresholds ──

/**
 * Minimum overall assessment confidence required for the assessment to be
 * considered as having sufficient evidence for a meaningful conclusion.
 *
 * Assessments below this threshold should be treated as inconclusive
 * regardless of their risk score. Derived from the minimum confidence
 * threshold for the "suspicious" verdict (0.3) — below this point,
 * even a high-scoring assessment cannot be trusted.
 */
export const CONFIDENCE_MIN_SUFFICIENT = 0.3;

// ── Severity Multiplier Constants ──

/** Base severity level for escalation calculations. */
export const SEVERITY_MULTIPLIER_BASE = 1.0;

/**
 * Chain multiplier increment per additional link beyond the first.
 *
 * Formula: chainMultiplier = 1.0 + (chainLength - 1) × CHAIN_MULTIPLIER_INCREMENT
 * Capped at: CHAIN_MULTIPLIER_CAP
 *
 * Derived from: a chain of 20 behaviors would produce the maximum multiplier.
 * 1.0 + (20 - 1) × 0.05 = 1.95 ≈ 2.0 (the cap).
 */
export const CHAIN_MULTIPLIER_INCREMENT = 0.05;

/** Maximum chain multiplier cap. */
export const CHAIN_MULTIPLIER_CAP = 2.0;

// ── Risk Level Order ──

/** Ordered risk levels from highest to lowest impact. */
export const RISK_LEVEL_ORDER: readonly ('critical' | 'high' | 'medium' | 'low' | 'negligible')[] =
  ['critical', 'high', 'medium', 'low', 'negligible'] as const;

// ── Verdict Order ──

/**
 * Ordered verdicts from most to least severe.
 * UNKNOWN is last because it represents the absence of a determination.
 */
export const VERDICT_ORDER: readonly Verdict[] = [
  'malicious' as Verdict,
  'likely-malicious' as Verdict,
  'suspicious' as Verdict,
  'likely-benign' as Verdict,
  'benign' as Verdict,
  'unknown' as Verdict,
] as const;

// ── Verdict Thresholds ──

/**
 * Default verdict thresholds for mapping (score, confidence) → Verdict.
 *
 * These thresholds partition the [0.0, 10.0] risk score space and
 * [0.0, 1.0] confidence space into six regions corresponding to
 * each verdict.
 *
 * The thresholds are derived from the following principles:
 * - Scores below 2.0 (info/low boundary) are negligible.
 * - Scores at 4.0+ require investigation (medium+).
 * - Scores at 6.0+ are significant (high+).
 * - Scores at 8.0+ are critical.
 * - Confidence below 0.3 means insufficient evidence for any conclusion.
 * - Confidence below 0.5 reduces verdict confidence one level.
 *
 * These are defaults and may be overridden via configuration.
 *
 * The object is frozen at runtime to enforce immutability.
 */
export const VERDICT_THRESHOLDS: VerdictThresholdsConfig = Object.freeze({
  /** Score threshold for "malicious" verdict [0.0, 10.0]. */
  maliciousScore: 8.0,
  /** Confidence threshold for "malicious" verdict [0.0, 1.0]. */
  maliciousConfidence: 0.8,

  /** Score threshold for "likely-malicious" verdict [0.0, 10.0]. */
  likelyMaliciousScore: 6.0,
  /** Confidence threshold for "likely-malicious" verdict [0.0, 1.0]. */
  likelyMaliciousConfidence: 0.6,

  /** Score threshold for "suspicious" verdict [0.0, 10.0]. */
  suspiciousScore: 4.0,
  /** Confidence threshold for "suspicious" verdict [0.0, 1.0]. */
  suspiciousConfidence: 0.3,

  /** Score threshold for "likely-benign" verdict [0.0, 10.0]. */
  likelyBenignScore: 2.0,
  /** Confidence threshold for "likely-benign" verdict [0.0, 1.0]. */
  likelyBenignConfidence: 0.5,

  /** Score threshold for "benign" verdict [0.0, 10.0]. */
  benignScore: 0.0,
  /** Confidence threshold for "benign" verdict [0.0, 1.0]. */
  benignConfidence: 0.7,
});

/** Shape of the VERDICT_THRESHOLDS constant for reuse in config types. */
export type VerdictThresholdsConfig = {
  readonly maliciousScore: number;
  readonly maliciousConfidence: number;
  readonly likelyMaliciousScore: number;
  readonly likelyMaliciousConfidence: number;
  readonly suspiciousScore: number;
  readonly suspiciousConfidence: number;
  readonly likelyBenignScore: number;
  readonly likelyBenignConfidence: number;
  readonly benignScore: number;
  readonly benignConfidence: number;
};
