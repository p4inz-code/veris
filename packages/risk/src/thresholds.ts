/**
 * @veris/risk/thresholds — Deterministic threshold profile configuration and management.
 *
 * ## Responsibility
 *
 * Thresholds provides the configuration layer for verdict and risk level
 * thresholds. Thresholds determine how numeric risk scores and confidence
 * values map to verdicts and risk levels.
 *
 * ## Why Thresholds are Separate from Constants
 *
 * In the previous milestone, verdict thresholds were defined directly in
 * `constants.ts` as a single frozen object. This module extends that by
 * providing:
 *
 * 1. **Multiple profiles** — different use cases (security audit, CI/CD gate,
 *    development analysis) may require different threshold configurations.
 * 2. **Profile management** — create, validate, and select threshold profiles.
 * 3. **Runtime validation** — validate threshold configurations before use.
 * 4. **Documented defaults** — every threshold is documented with its
 *    rationale and recommended usage.
 *
 * ## Threshold Profiles
 *
 * A threshold profile consists of:
 * - **Verdict thresholds** — score and confidence thresholds for each verdict.
 * - **Risk level thresholds** — score thresholds for each risk level.
 *
 * ## Default Profile
 *
 * The `DEFAULT_THRESHOLD_PROFILE` matches the values in `VERDICT_THRESHOLDS`
 * from `constants.ts`, ensuring backward compatibility.
 *
 * ## Usage
 *
 * ```typescript
 * // Use default thresholds
 * const profile = DEFAULT_THRESHOLD_PROFILE;
 *
 * // Create a stricter profile for CI/CD
 * const ciProfile = createThresholdProfile({
 *   verdictThresholds: {
 *     maliciousConfidence: 0.9,  // Higher confidence required
 *   },
 * });
 *
 * // Validate a profile
 * const errors = validateThresholdProfile(customProfile);
 * if (errors.length > 0) { /* handle errors *\/ }
 * ```
 *
 * @module @veris/risk/thresholds
 */

import { VERDICT_THRESHOLDS, RISK_SCORE_MAX, CONFIDENCE_MAX } from './constants.js';

// ── Re-export Config Type ──

export type { VerdictThresholdsConfig } from './constants.js';

// ── Risk Level Thresholds ──

/**
 * Risk level threshold configuration.
 *
 * Maps score ranges to risk levels. Thresholds are checked from highest
 * to lowest, and the first matching level is returned.
 *
 * | Score Range     | Risk Level    |
 * |-----------------|---------------|
 * | [8.0, 10.0]     | critical      |
 * | [6.0, 8.0)      | high          |
 * | [4.0, 6.0)      | medium        |
 * | [2.0, 4.0)      | low           |
 * | [0.0, 2.0)      | negligible    |
 */
export interface RiskLevelThresholds {
  /** Score threshold for "critical" risk level [0.0, 10.0]. Default: 8.0. */
  readonly criticalScore: number;
  /** Score threshold for "high" risk level [0.0, 10.0]. Default: 6.0. */
  readonly highScore: number;
  /** Score threshold for "medium" risk level [0.0, 10.0]. Default: 4.0. */
  readonly mediumScore: number;
  /** Score threshold for "low" risk level [0.0, 10.0]. Default: 2.0. */
  readonly lowScore: number;
}

/**
 * Complete threshold profile for risk evaluation.
 *
 * A threshold profile encapsulates all threshold configuration for a
 * single evaluation or context. Profiles are immutable after creation.
 */
export interface ThresholdProfile {
  /** Verdict thresholds — maps (score, confidence) → verdict. */
  readonly verdictThresholds: import('./constants.js').VerdictThresholdsConfig;
  /** Risk level thresholds — maps score → risk level. */
  readonly riskLevelThresholds: RiskLevelThresholds;
}

// ── Default Thresholds ──

/**
 * Default risk level thresholds matching the engine's built-in values.
 */
const DEFAULT_RISK_LEVEL_THRESHOLDS: RiskLevelThresholds = Object.freeze({
  criticalScore: 8.0,
  highScore: 6.0,
  mediumScore: 4.0,
  lowScore: 2.0,
});

/**
 * The default threshold profile used when no custom profile is specified.
 *
 * This profile is frozen and immutable. It provides sensible defaults for
 * general-purpose security analysis. The verdict thresholds match the
 * `VERDICT_THRESHOLDS` constant from `constants.ts`.
 */
export const DEFAULT_THRESHOLD_PROFILE: ThresholdProfile = Object.freeze({
  verdictThresholds: Object.freeze({ ...VERDICT_THRESHOLDS }),
  riskLevelThresholds: DEFAULT_RISK_LEVEL_THRESHOLDS,
});

// ── Validation ──

/**
 * Validates a risk level thresholds configuration.
 *
 * Checks:
 * - All score thresholds are in [0.0, RISK_SCORE_MAX].
 * - Score thresholds are strictly decreasing (no gaps or overlaps).
 *
 * @param thresholds - The risk level thresholds to validate.
 * @returns An array of error messages (empty if valid).
 */
export function validateRiskLevelThresholds(thresholds: RiskLevelThresholds): readonly string[] {
  const errors: string[] = [];

  if (!thresholds) {
    return ['RiskLevelThresholds is required'];
  }

  const checks: [string, number][] = [
    ['criticalScore', thresholds.criticalScore],
    ['highScore', thresholds.highScore],
    ['mediumScore', thresholds.mediumScore],
    ['lowScore', thresholds.lowScore],
  ];

  for (const [name, value] of checks) {
    if (typeof value !== 'number' || !isFinite(value)) {
      errors.push(`${name} must be a finite number, got ${value}`);
    } else if (value < 0 || value > RISK_SCORE_MAX) {
      errors.push(`${name} must be in [0, ${RISK_SCORE_MAX}], got ${value}`);
    }
  }

  // Monotonicity checks.
  if (thresholds.criticalScore <= thresholds.highScore) {
    errors.push(
      `criticalScore (${thresholds.criticalScore}) must be > highScore (${thresholds.highScore})`,
    );
  }
  if (thresholds.highScore <= thresholds.mediumScore) {
    errors.push(
      `highScore (${thresholds.highScore}) must be > mediumScore (${thresholds.mediumScore})`,
    );
  }
  if (thresholds.mediumScore <= thresholds.lowScore) {
    errors.push(
      `mediumScore (${thresholds.mediumScore}) must be > lowScore (${thresholds.lowScore})`,
    );
  }

  return Object.freeze(errors);
}

/**
 * Validates a complete ThresholdProfile.
 *
 * Checks both verdict thresholds and risk level thresholds.
 *
 * @param profile - The threshold profile to validate.
 * @returns An array of error messages (empty if valid).
 */
export function validateThresholdProfile(profile: ThresholdProfile): readonly string[] {
  const errors: string[] = [];

  if (!profile) {
    return ['ThresholdProfile is required'];
  }

  // Validate verdict thresholds.
  const vt = profile.verdictThresholds;
  if (vt) {
    const scoreChecks: [string, number][] = [
      ['verdictThresholds.maliciousScore', vt.maliciousScore],
      ['verdictThresholds.likelyMaliciousScore', vt.likelyMaliciousScore],
      ['verdictThresholds.suspiciousScore', vt.suspiciousScore],
      ['verdictThresholds.likelyBenignScore', vt.likelyBenignScore],
      ['verdictThresholds.benignScore', vt.benignScore],
    ];

    for (const [name, value] of scoreChecks) {
      if (typeof value !== 'number' || !isFinite(value)) {
        errors.push(`${name} must be a finite number, got ${value}`);
      } else if (value < 0 || value > RISK_SCORE_MAX) {
        errors.push(`${name} must be in [0, ${RISK_SCORE_MAX}], got ${value}`);
      }
    }

    const confidenceChecks: [string, number][] = [
      ['verdictThresholds.maliciousConfidence', vt.maliciousConfidence],
      ['verdictThresholds.likelyMaliciousConfidence', vt.likelyMaliciousConfidence],
      ['verdictThresholds.suspiciousConfidence', vt.suspiciousConfidence],
      ['verdictThresholds.likelyBenignConfidence', vt.likelyBenignConfidence],
      ['verdictThresholds.benignConfidence', vt.benignConfidence],
    ];

    for (const [name, value] of confidenceChecks) {
      if (typeof value !== 'number' || !isFinite(value)) {
        errors.push(`${name} must be a finite number, got ${value}`);
      } else if (value < 0 || value > CONFIDENCE_MAX) {
        errors.push(`${name} must be in [0, ${CONFIDENCE_MAX}], got ${value}`);
      }
    }

    // Monotonicity checks.
    if (vt.maliciousScore <= vt.likelyMaliciousScore) {
      errors.push(
        `verdictThresholds.maliciousScore (${vt.maliciousScore}) must be > likelyMaliciousScore (${vt.likelyMaliciousScore})`,
      );
    }
    if (vt.likelyMaliciousScore <= vt.suspiciousScore) {
      errors.push(
        `verdictThresholds.likelyMaliciousScore (${vt.likelyMaliciousScore}) must be > suspiciousScore (${vt.suspiciousScore})`,
      );
    }
    if (vt.suspiciousScore <= vt.likelyBenignScore) {
      errors.push(
        `verdictThresholds.suspiciousScore (${vt.suspiciousScore}) must be > likelyBenignScore (${vt.likelyBenignScore})`,
      );
    }
    if (vt.likelyBenignScore <= vt.benignScore) {
      errors.push(
        `verdictThresholds.likelyBenignScore (${vt.likelyBenignScore}) must be > benignScore (${vt.benignScore})`,
      );
    }
  }

  // Validate risk level thresholds.
  const riskLevelErrors = validateRiskLevelThresholds(profile.riskLevelThresholds);
  for (const err of riskLevelErrors) {
    errors.push(err);
  }

  return Object.freeze(errors);
}

// ── Profile Factory ──

/**
 * Creates a custom threshold profile by merging overrides with defaults.
 *
 * Any threshold not specified in overrides inherits from the default profile.
 *
 * ## Usage
 *
 * ```typescript
 * // Stricter profile for CI/CD
 * const ciProfile = createThresholdProfile({
 *   verdictThresholds: {
 *     maliciousConfidence: 0.9,
 *     suspiciousConfidence: 0.5,
 *   },
 *   riskLevelThresholds: {
 *     highScore: 5.0,  // Lower threshold for high
 *   },
 * });
 * ```
 *
 * @param overrides - Partial threshold overrides.
 * @returns A frozen ThresholdProfile with defaults merged.
 * @throws {TypeError} If any threshold value is invalid.
 */
export function createThresholdProfile(overrides?: Partial<ThresholdProfile>): ThresholdProfile {
  const defaults = DEFAULT_THRESHOLD_PROFILE;

  // Merge verdict thresholds.
  const vtOverrides = overrides?.verdictThresholds;
  const verdictThresholds = {
    maliciousScore: vtOverrides?.maliciousScore ?? defaults.verdictThresholds.maliciousScore,
    maliciousConfidence:
      vtOverrides?.maliciousConfidence ?? defaults.verdictThresholds.maliciousConfidence,
    likelyMaliciousScore:
      vtOverrides?.likelyMaliciousScore ?? defaults.verdictThresholds.likelyMaliciousScore,
    likelyMaliciousConfidence:
      vtOverrides?.likelyMaliciousConfidence ??
      defaults.verdictThresholds.likelyMaliciousConfidence,
    suspiciousScore: vtOverrides?.suspiciousScore ?? defaults.verdictThresholds.suspiciousScore,
    suspiciousConfidence:
      vtOverrides?.suspiciousConfidence ?? defaults.verdictThresholds.suspiciousConfidence,
    likelyBenignScore:
      vtOverrides?.likelyBenignScore ?? defaults.verdictThresholds.likelyBenignScore,
    likelyBenignConfidence:
      vtOverrides?.likelyBenignConfidence ?? defaults.verdictThresholds.likelyBenignConfidence,
    benignScore: vtOverrides?.benignScore ?? defaults.verdictThresholds.benignScore,
    benignConfidence: vtOverrides?.benignConfidence ?? defaults.verdictThresholds.benignConfidence,
  };

  // Merge risk level thresholds.
  const rlOverrides = overrides?.riskLevelThresholds;
  const riskLevelThresholds = {
    criticalScore: rlOverrides?.criticalScore ?? defaults.riskLevelThresholds.criticalScore,
    highScore: rlOverrides?.highScore ?? defaults.riskLevelThresholds.highScore,
    mediumScore: rlOverrides?.mediumScore ?? defaults.riskLevelThresholds.mediumScore,
    lowScore: rlOverrides?.lowScore ?? defaults.riskLevelThresholds.lowScore,
  };

  // Validate the merged profile.
  const profile: ThresholdProfile = {
    verdictThresholds,
    riskLevelThresholds,
  };

  const errors = validateThresholdProfile(profile);
  if (errors.length > 0) {
    throw new TypeError(`Invalid threshold profile: ${errors.join('; ')}`);
  }

  return Object.freeze({
    verdictThresholds: Object.freeze(verdictThresholds),
    riskLevelThresholds: Object.freeze(riskLevelThresholds),
  });
}

// ── Threshold Lookup Functions ──

/**
 * Resolves a risk level from a score using the given threshold profile.
 *
 * ## Evaluation Order
 *
 * 1. Check from highest (critical) to lowest (negligible).
 * 2. Return the first matching level.
 *
 * ## Determinism
 * Pure function — identical inputs always produce identical outputs.
 *
 * @param score    - The risk score [0.0, 10.0].
 * @param profile  - The threshold profile to use.
 * @returns The resolved risk level.
 */
export function resolveRiskLevelFromProfile(
  score: number,
  profile?: ThresholdProfile,
): 'critical' | 'high' | 'medium' | 'low' | 'negligible' {
  const rlt = (profile ?? DEFAULT_THRESHOLD_PROFILE).riskLevelThresholds;

  if (score >= rlt.criticalScore) return 'critical';
  if (score >= rlt.highScore) return 'high';
  if (score >= rlt.mediumScore) return 'medium';
  if (score >= rlt.lowScore) return 'low';
  return 'negligible';
}
