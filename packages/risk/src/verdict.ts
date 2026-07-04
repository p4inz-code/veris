/**
 * @veris/risk/verdict — Deterministic verdict resolution.
 *
 * ## Why Verdict Differs from RiskLevel
 *
 * - **RiskLevel** is a categorization of the numeric risk score alone:
 *   `critical` (8-10), `high` (6-8), `medium` (4-6), `low` (2-4), `negligible` (0-2).
 *   It answers: \"How high is the score?\"
 *
 * - **Verdict** incorporates both score AND confidence. It answers:
 *   \"What should I do about this?\" A high score with low confidence may
 *   not warrant action. A moderate score with high confidence might.
 *
 * ## Why Confidence Participates
 *
 * Confidence reflects how sure we are of the evidence. Without confidence,
 * a single high-severity rule match with weak evidence would produce the
 * same verdict as one with strong evidence. By requiring both score and
 * confidence thresholds, the verdict accurately reflects investigation
 * priority.
 *
 * ## Why Thresholds Are Configurable
 *
 * Different organizations have different risk tolerances. A financial
 * institution may require higher confidence for \"benign\" than an
 * internal development tool. Thresholds are exposed as a configuration
 * object that can be overridden at the engine level.
 *
 * ## Why the Mapping Remains Deterministic
 *
 * The evaluation order is fixed: verdicts are checked from highest
 * (malicious) to lowest (benign). The first verdict whose score AND
 * confidence thresholds are both met is returned. This is fully
 * deterministic — identical inputs always produce identical verdicts.
 *
 * The UNKNOWN verdict is returned when no threshold set is satisfied,
 * typically due to very low confidence.
 *
 * @module @veris/risk/verdict
 */

import { VERDICT_THRESHOLDS, RISK_SCORE_MAX, CONFIDENCE_MAX } from './constants.js';
import type { VerdictThresholdsConfig } from './constants.js';
import type { Verdict } from './types.js';
import { VERDICTS } from './types.js';

// ── Types ──

/**
 * Result of a verdict resolution, including the verdict and metadata
 * about which thresholds were checked.
 */
export interface VerdictResult {
  /** The resolved verdict. */
  readonly verdict: Verdict;
  /** The score used for resolution. */
  readonly score: number;
  /** The confidence used for resolution. */
  readonly confidence: number;
  /**
   * The highest verdict whose score threshold was met.
   * May differ from `verdict` when confidence is insufficient.
   */
  readonly highestQualifyingVerdict: Verdict;
  /**
   * Whether the verdict was determined by confidence rather than score.
   * True when the score qualified for a higher verdict but confidence
   * was insufficient.
   */
  readonly confidenceLimited: boolean;
}

/**
 * Result of threshold validation.
 */
export interface ThresholdValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

// ── Default Thresholds ──

/**
 * Returns the default verdict threshold configuration.
 *
 * These thresholds partition the [0.0, 10.0] risk score space into
 * five regions, each requiring a minimum confidence to activate.
 *
 * @returns A frozen copy of the default thresholds.
 */
export function getDefaultThresholds(): VerdictThresholdsConfig {
  // Return a frozen copy to ensure runtime immutability.
  // VERDICT_THRESHOLDS has 'as const' type-level immutability but is
  // not Object.frozen() at runtime.
  return Object.freeze({ ...VERDICT_THRESHOLDS });
}

// ── Threshold Validation ──

/**
 * Validates a verdict threshold configuration.
 *
 * Checks:
 * - All score thresholds are in [0.0, RISK_SCORE_MAX].
 * - All confidence thresholds are in [0.0, CONFIDENCE_MAX].
 * - Score thresholds are strictly decreasing (no gaps or overlaps).
 * - All required keys are present.
 *
 * @param thresholds - The threshold configuration to validate.
 * @returns Validation result with errors, if any.
 */
export function validateVerdictThresholds(
  thresholds: VerdictThresholdsConfig,
): ThresholdValidationResult {
  const errors: string[] = [];

  if (!thresholds) {
    return { valid: false, errors: ['Thresholds configuration is required'] };
  }

  // ── Range checks ──

  const scoreChecks: [string, number][] = [
    ['maliciousScore', thresholds.maliciousScore],
    ['likelyMaliciousScore', thresholds.likelyMaliciousScore],
    ['suspiciousScore', thresholds.suspiciousScore],
    ['likelyBenignScore', thresholds.likelyBenignScore],
    ['benignScore', thresholds.benignScore],
  ];

  for (const [name, value] of scoreChecks) {
    if (typeof value !== 'number' || !isFinite(value)) {
      errors.push(`${name} must be a finite number, got ${value}`);
    } else if (value < 0 || value > RISK_SCORE_MAX) {
      errors.push(`${name} must be in [0, ${RISK_SCORE_MAX}], got ${value}`);
    }
  }

  const confidenceChecks: [string, number][] = [
    ['maliciousConfidence', thresholds.maliciousConfidence],
    ['likelyMaliciousConfidence', thresholds.likelyMaliciousConfidence],
    ['suspiciousConfidence', thresholds.suspiciousConfidence],
    ['likelyBenignConfidence', thresholds.likelyBenignConfidence],
    ['benignConfidence', thresholds.benignConfidence],
  ];

  for (const [name, value] of confidenceChecks) {
    if (typeof value !== 'number' || !isFinite(value)) {
      errors.push(`${name} must be a finite number, got ${value}`);
    } else if (value < 0 || value > CONFIDENCE_MAX) {
      errors.push(`${name} must be in [0, ${CONFIDENCE_MAX}], got ${value}`);
    }
  }

  // ── Monotonicity checks (score thresholds must be non-increasing) ──

  if (thresholds.maliciousScore <= thresholds.likelyMaliciousScore) {
    errors.push(
      `maliciousScore (${thresholds.maliciousScore}) must be > likelyMaliciousScore (${thresholds.likelyMaliciousScore})`,
    );
  }
  if (thresholds.likelyMaliciousScore <= thresholds.suspiciousScore) {
    errors.push(
      `likelyMaliciousScore (${thresholds.likelyMaliciousScore}) must be > suspiciousScore (${thresholds.suspiciousScore})`,
    );
  }
  if (thresholds.suspiciousScore <= thresholds.likelyBenignScore) {
    errors.push(
      `suspiciousScore (${thresholds.suspiciousScore}) must be > likelyBenignScore (${thresholds.likelyBenignScore})`,
    );
  }
  if (thresholds.likelyBenignScore <= thresholds.benignScore) {
    errors.push(
      `likelyBenignScore (${thresholds.likelyBenignScore}) must be > benignScore (${thresholds.benignScore})`,
    );
  }

  return {
    valid: errors.length === 0,
    errors: Object.freeze(errors),
  };
}

// ── Verdict Resolution ──

/**
 * Threshold entry for verdict checking.
 */
interface VerdictThresholdEntry {
  readonly verdict: Verdict;
  readonly scoreThreshold: number;
  readonly confidenceThreshold: number;
}

/**
 * Builds an ordered list of verdict threshold entries from a configuration.
 * Entries are ordered from highest (malicious) to lowest (benign).
 *
 * @param thresholds - The threshold configuration.
 * @returns Ordered threshold entries.
 */
function buildThresholdEntries(
  thresholds: VerdictThresholdsConfig,
): readonly VerdictThresholdEntry[] {
  return Object.freeze([
    {
      verdict: VERDICTS.MALICIOUS,
      scoreThreshold: thresholds.maliciousScore,
      confidenceThreshold: thresholds.maliciousConfidence,
    },
    {
      verdict: VERDICTS.LIKELY_MALICIOUS,
      scoreThreshold: thresholds.likelyMaliciousScore,
      confidenceThreshold: thresholds.likelyMaliciousConfidence,
    },
    {
      verdict: VERDICTS.SUSPICIOUS,
      scoreThreshold: thresholds.suspiciousScore,
      confidenceThreshold: thresholds.suspiciousConfidence,
    },
    {
      verdict: VERDICTS.LIKELY_BENIGN,
      scoreThreshold: thresholds.likelyBenignScore,
      confidenceThreshold: thresholds.likelyBenignConfidence,
    },
    {
      verdict: VERDICTS.BENIGN,
      scoreThreshold: thresholds.benignScore,
      confidenceThreshold: thresholds.benignConfidence,
    },
  ]);
}

/**
 * Resolves a verdict from an aggregated risk score and confidence.
 *
 * ## Algorithm
 *
 * 1. Validate inputs: score must be finite, confidence must be finite.
 * 2. Check each verdict from highest (malicious) to lowest (benign):
 *    a. If score >= scoreThreshold AND confidence >= confidenceThreshold,
 *       return that verdict.
 * 3. If no verdict matched, return UNKNOWN.
 *
 * ## Evaluation Order
 *
 * Verdicts are checked in this exact order:
 * 1. malicious     (score >= 8.0, confidence >= 0.8)
 * 2. likely-malicious (score >= 6.0, confidence >= 0.6)
 * 3. suspicious    (score >= 4.0, confidence >= 0.3)
 * 4. likely-benign (score >= 2.0, confidence >= 0.5)
 * 5. benign        (score >= 0.0, confidence >= 0.7)
 * 6. UNKNOWN       (fallback — no threshold set satisfied)
 *
 * ## Determinism
 *
 * The verdict is purely deterministic:
 * - Same (score, confidence, thresholds) always produces same verdict.
 * - No random, no timestamps, no external state.
 * - Thresholds are evaluated left-to-right, top-to-bottom.
 *
 * ## Range
 *
 * - Score must be in [0.0, 10.0] (or any finite value — values outside
 *   range will still be evaluated against thresholds).
 * - Confidence must be in [0.0, 1.0].
 * - Returns VERDICTS.UNKNOWN for very low confidence (< 0.3 by default).
 *
 * ## Complexcity
 * O(1) — at most 6 comparisons.
 *
 * @param score      - Aggregated risk score [0.0, 10.0].
 * @param confidence - Aggregated confidence [0.0, 1.0].
 * @param thresholds - Optional custom threshold configuration.
 *                     Defaults to VERDICT_THRESHOLDS when omitted.
 * @returns The resolved verdict result.
 * @throws {TypeError} If score or confidence is NaN or Infinity.
 */
export function resolveVerdict(
  score: number,
  confidence: number,
  thresholds: VerdictThresholdsConfig = VERDICT_THRESHOLDS,
): VerdictResult {
  // Stage 1 — validate inputs.
  if (!isFinite(score)) {
    throw new TypeError(`score must be finite, got ${score}`);
  }
  if (!isFinite(confidence)) {
    throw new TypeError(`confidence must be finite, got ${confidence}`);
  }

  // Stage 2 — build threshold entries.
  const entries = buildThresholdEntries(thresholds);

  // Stage 3 — evaluate thresholds from highest to lowest.
  let highestQualifyingScore: Verdict = VERDICTS.UNKNOWN;
  let matchedVerdict: Verdict = VERDICTS.UNKNOWN;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Check score threshold.
    if (score >= entry.scoreThreshold) {
      // This is the highest verdict whose score threshold is met.
      if (highestQualifyingScore === VERDICTS.UNKNOWN) {
        highestQualifyingScore = entry.verdict;
      }

      // Check confidence threshold.
      if (confidence >= entry.confidenceThreshold) {
        matchedVerdict = entry.verdict;
        break;
      }
    }
  }

  // If loop completed without breaking, check if benign should match.
  // benign has score threshold 0.0, so it always qualifies on score.
  if (matchedVerdict === VERDICTS.UNKNOWN && highestQualifyingScore === VERDICTS.UNKNOWN) {
    // Score is below even the lowest threshold (shouldn't happen since benignScore = 0.0).
    // But confidence must meet benign threshold for BENIGN.
    const benignEntry = entries[entries.length - 1];
    if (score >= benignEntry.scoreThreshold && confidence >= benignEntry.confidenceThreshold) {
      matchedVerdict = VERDICTS.BENIGN;
      highestQualifyingScore = VERDICTS.BENIGN;
    }
  }

  // Determine confidenceLimited flag.
  const confidenceLimited =
    highestQualifyingScore !== matchedVerdict && highestQualifyingScore !== VERDICTS.UNKNOWN;

  return Object.freeze({
    verdict: matchedVerdict,
    score,
    confidence,
    highestQualifyingVerdict: highestQualifyingScore,
    confidenceLimited,
  });
}

/**
 * Resolves a verdict from an aggregated risk score and confidence,
 * returning only the Verdict value (not the full result object).
 *
 * This is a convenience wrapper around {@link resolveVerdict}.
 *
 * @param score      - Aggregated risk score [0.0, 10.0].
 * @param confidence - Aggregated confidence [0.0, 1.0].
 * @param thresholds - Optional custom threshold configuration.
 * @returns The resolved Verdict.
 */
export function resolveVerdictValue(
  score: number,
  confidence: number,
  thresholds: VerdictThresholdsConfig = VERDICT_THRESHOLDS,
): Verdict {
  return resolveVerdict(score, confidence, thresholds).verdict;
}
