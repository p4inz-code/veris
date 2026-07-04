/**
 * @veris/risk/weighting — Deterministic weight configuration and management.
 *
 * ## Responsibility
 *
 * Weighting provides the configuration layer for dimension weights and evidence
 * category weights used throughout the risk engine. Weights control how much
 * each analytical dimension (rule, correlation, evidence) and each evidence
 * category contributes to the overall risk score.
 *
 * ## Design Philosophy
 *
 * - **Configuration is code** — weight profiles are frozen objects, not loaded
 *   from external files. This ensures determinism and eliminates I/O failures.
 * - **Profiles are immutable** — once created, a weight profile cannot be
 *   modified. New profiles are created via factory functions.
 * - **Default profile is reasonable** — the `DEFAULT_WEIGHT_PROFILE` provides
 *   sensible defaults for most use cases. Custom profiles override specific
 *   weights while inheriting defaults for unspecified fields.
 * - **Explainable** — every weight value is documented with its purpose and
 *   derivation, enabling full explainability of weight decisions.
 *
 * ## Dimension Weights
 *
 * Dimension weights control how much influence each analytical dimension has
 * on the risk score. The three dimensions are:
 *
 * | Dimension     | Default Weight | Rationale                                      |
 * |---------------|----------------|-------------------------------------------------|
 * | rule          | 1.0            | Rule matches are the primary risk signal        |
 * | correlation   | 1.0            | Behavior chains amplify existing rule signals   |
 * | evidence      | 0.5            | Direct evidence without rules has lower weight  |
 *
 * ## Evidence Category Weights
 *
 * Evidence category weights allow fine-tuning within dimensions based on the
 * type of evidence. For example, within the rule dimension, an "obfuscation"
 * finding might be weighted differently from a "persistence" finding.
 *
 * ## Usage
 *
 * ```typescript
 * // Use default weights
 * const weight = getDimensionWeight("rule", DEFAULT_WEIGHT_PROFILE);
 *
 * // Create a custom profile
 * const customProfile = createWeightProfile({
 *   dimensionWeights: { rule: 1.2, correlation: 0.8 },
 * });
 *
 * // Get evidence category weight
 * const evWeight = getEvidenceCategoryWeight("obfuscation", customProfile);
 * ```
 *
 * @module @veris/risk/weighting
 */

// ── Type Imports ──

import type { SourceType } from './types.js';

// ── Weight Profile Types ──

/**
 * Dimension weight configuration.
 *
 * Maps each analytical dimension to a weight value in [0.0, 2.0].
 * A weight of 0.0 disables the dimension. A weight of 1.0 is neutral.
 * Weights above 1.0 amplify the dimension's contribution.
 */
export interface DimensionWeights {
  /** Weight for the rule match dimension [0.0, 2.0]. Default: 1.0. */
  readonly rule: number;
  /** Weight for the correlation dimension [0.0, 2.0]. Default: 1.0. */
  readonly correlation: number;
  /** Weight for the evidence dimension [0.0, 2.0]. Default: 0.5. */
  readonly evidence: number;
}

/**
 * Evidence category weight configuration.
 *
 * Maps evidence category strings (e.g., "obfuscation", "persistence",
 * "executable") to weight values in [0.0, 2.0]. Categories not present
 * in the map default to 1.0.
 *
 * This enables fine-tuning within dimensions based on evidence type.
 * For example, within the rule dimension, an "executable" finding may
 * be weighted differently from a "network" finding.
 */
export interface EvidenceCategoryWeights {
  /** Category-to-weight mapping. Keys are evidence category strings. */
  readonly categories: Readonly<Record<string, number>>;
  /**
   * Default weight for categories not explicitly listed [0.0, 2.0].
   * Default: 1.0.
   */
  readonly defaultWeight: number;
}

/**
 * Complete weight profile for risk evaluation.
 *
 * A weight profile encapsulates all weight configuration for a single
 * evaluation. Profiles are immutable after creation.
 *
 * To create a profile with custom overrides, use `createWeightProfile()`.
 * To use the system defaults, use `DEFAULT_WEIGHT_PROFILE`.
 */
export interface WeightProfile {
  /**
   * Dimension weights controlling how much each analytical dimension
   * contributes to the risk score.
   */
  readonly dimensionWeights: DimensionWeights;
  /**
   * Evidence category weights for fine-tuning within dimensions.
   * When omitted, all categories default to 1.0 weight.
   */
  readonly evidenceCategoryWeights?: EvidenceCategoryWeights;
}

// ── Weight Validation ──

/**
 * Range bounds for weight values.
 */
const WEIGHT_MIN = 0.0;
const WEIGHT_MAX = 2.0;

/**
 * Validates a weight value.
 *
 * @param value - The weight value to validate.
 * @param name - The name of the weight for error messages.
 * @returns A string error message, or null if valid.
 */
function validateWeight(value: number, name: string): string | null {
  if (typeof value !== 'number' || !isFinite(value)) {
    return `${name} must be a finite number, got ${value}`;
  }
  if (value < WEIGHT_MIN || value > WEIGHT_MAX) {
    return `${name} must be in [${WEIGHT_MIN}, ${WEIGHT_MAX}], got ${value}`;
  }
  return null;
}

/**
 * Validates a WeightProfile configuration.
 *
 * Checks:
 * - All dimension weights are in [0.0, 2.0].
 * - All evidence category weights are in [0.0, 2.0].
 * - All values are finite numbers.
 *
 * @param profile - The weight profile to validate.
 * @returns An array of error messages (empty if valid).
 */
export function validateWeightProfile(profile: WeightProfile): readonly string[] {
  const errors: string[] = [];

  if (!profile) {
    return ['WeightProfile is required'];
  }

  // Validate dimension weights.
  const dimErrors = [
    validateWeight(profile.dimensionWeights.rule, 'dimensionWeights.rule'),
    validateWeight(profile.dimensionWeights.correlation, 'dimensionWeights.correlation'),
    validateWeight(profile.dimensionWeights.evidence, 'dimensionWeights.evidence'),
  ];

  for (const err of dimErrors) {
    if (err !== null) errors.push(err);
  }

  // Validate evidence category weights if present.
  const evWeights = profile.evidenceCategoryWeights;
  if (evWeights) {
    if (typeof evWeights.defaultWeight !== 'number' || !isFinite(evWeights.defaultWeight)) {
      errors.push(
        `evidenceCategoryWeights.defaultWeight must be a finite number, got ${evWeights.defaultWeight}`,
      );
    } else if (evWeights.defaultWeight < WEIGHT_MIN || evWeights.defaultWeight > WEIGHT_MAX) {
      errors.push(
        `evidenceCategoryWeights.defaultWeight must be in [${WEIGHT_MIN}, ${WEIGHT_MAX}], got ${evWeights.defaultWeight}`,
      );
    }

    if (evWeights.categories && typeof evWeights.categories === 'object') {
      const keys = Object.keys(evWeights.categories);
      for (const key of keys) {
        const val = evWeights.categories[key];
        const err = validateWeight(val, `evidenceCategoryWeights.categories["${key}"]`);
        if (err !== null) errors.push(err);
      }
    }
  }

  return Object.freeze(errors);
}

// ── Default Weight Profile ──

/**
 * Default dimension weights.
 *
 * - **rule**: 1.0 — Rule matches are the primary risk signal. Neutral weight.
 * - **correlation**: 1.0 — Behavior chains amplify signals but don't
 *   introduce new risk. Neutral weight.
 * - **evidence**: 0.5 — Direct evidence without rule context has lower
 *   weight because it lacks the structured analysis of a rule match.
 */
const DEFAULT_DIMENSION_WEIGHTS: DimensionWeights = Object.freeze({
  rule: 1.0,
  correlation: 1.0,
  evidence: 0.5,
});

/**
 * Default evidence category weights.
 *
 * All categories default to 1.0 (neutral). Custom profiles can override
 * specific categories to fine-tune risk contribution.
 */
const DEFAULT_EVIDENCE_CATEGORY_WEIGHTS: EvidenceCategoryWeights = Object.freeze({
  categories: Object.freeze({}),
  defaultWeight: 1.0,
});

/**
 * The default weight profile used when no custom profile is specified.
 *
 * This profile is frozen and immutable. It provides sensible defaults:
 * - Rule and correlation dimensions have neutral weight (1.0).
 * - Evidence dimension has reduced weight (0.5).
 * - All evidence categories have neutral default weight (1.0).
 */
export const DEFAULT_WEIGHT_PROFILE: WeightProfile = Object.freeze({
  dimensionWeights: DEFAULT_DIMENSION_WEIGHTS,
  evidenceCategoryWeights: DEFAULT_EVIDENCE_CATEGORY_WEIGHTS,
});

// ── Profile Factory ──

/**
 * Creates a custom weight profile by merging overrides with defaults.
 *
 * Any dimension weight not specified in overrides inherits from the
 * default profile. Evidence category weights are merged similarly.
 *
 * ## Usage
 *
 * ```typescript
 * const profile = createWeightProfile({
 *   dimensionWeights: { rule: 1.5, evidence: 0.8 },
 * });
 *
 * // Result:
 * // dimensionWeights.rule = 1.5 (override)
 * // dimensionWeights.correlation = 1.0 (default)
 * // dimensionWeights.evidence = 0.8 (override)
 * ```
 *
 * @param overrides - Partial weight overrides.
 * @returns A frozen WeightProfile with defaults merged.
 * @throws {TypeError} If any weight value is invalid.
 */
export function createWeightProfile(overrides?: Partial<WeightProfile>): WeightProfile {
  // Start with default dimension weights.
  const dimWeights: DimensionWeights = {
    rule: overrides?.dimensionWeights?.rule ?? DEFAULT_DIMENSION_WEIGHTS.rule,
    correlation: overrides?.dimensionWeights?.correlation ?? DEFAULT_DIMENSION_WEIGHTS.correlation,
    evidence: overrides?.dimensionWeights?.evidence ?? DEFAULT_DIMENSION_WEIGHTS.evidence,
  };

  // Validate dimension weights.
  const dimErrors = [
    validateWeight(dimWeights.rule, 'rule'),
    validateWeight(dimWeights.correlation, 'correlation'),
    validateWeight(dimWeights.evidence, 'evidence'),
  ];

  for (const err of dimErrors) {
    if (err !== null) {
      throw new TypeError(err);
    }
  }

  // Merge evidence category weights.
  const defaultEv = DEFAULT_EVIDENCE_CATEGORY_WEIGHTS;
  const overriddenEv = overrides?.evidenceCategoryWeights;
  let evWeights: EvidenceCategoryWeights;

  if (overriddenEv) {
    // Validate overridden values.
    const defaultWeight = overriddenEv.defaultWeight ?? defaultEv.defaultWeight;
    if (typeof defaultWeight !== 'number' || !isFinite(defaultWeight)) {
      throw new TypeError(`evidenceCategoryWeights.defaultWeight must be a finite number`);
    }

    evWeights = Object.freeze({
      categories: Object.freeze({
        ...defaultEv.categories,
        ...(overriddenEv.categories ?? {}),
      }),
      defaultWeight,
    });
  } else {
    evWeights = defaultEv;
  }

  return Object.freeze({
    dimensionWeights: Object.freeze(dimWeights),
    evidenceCategoryWeights: evWeights,
  });
}

// ── Weight Lookup Functions ──

/**
 * Gets the dimension weight for a given source type.
 *
 * Maps a SourceType (from types.ts) to the corresponding dimension
 * weight from the profile.
 *
 * ## Evaluation Order
 *
 * 1. Look up the source type in the dimension weights map.
 * 2. Return the matching weight, or 1.0 if unknown.
 *
 * ## Determinism
 * Pure function — identical inputs always produce identical outputs.
 *
 * @param sourceType - The source type (from Contribution.sourceType).
 * @param profile    - The weight profile to use.
 * @returns The dimension weight in [0.0, 2.0].
 */
export function getDimensionWeight(sourceType: SourceType, profile: WeightProfile): number {
  const dw = profile.dimensionWeights;

  switch (sourceType) {
    case 'rule':
      return dw.rule;
    case 'correlation':
      return dw.correlation;
    case 'evidence':
      return dw.evidence;
    default:
      return 1.0;
  }
}

/**
 * Gets the evidence category weight for a given category.
 *
 * Looks up the category in the profile's evidence category weights.
 * If the category is not found, returns the default weight.
 *
 * ## Evaluation Order
 *
 * 1. Check if evidence category weights are configured.
 * 2. If yes, look up the category in the categories map.
 * 3. If found, return the category weight.
 * 4. If not found, return the default weight.
 *
 * ## Determinism
 * Pure function — identical inputs always produce identical outputs.
 *
 * @param category  - The evidence category string.
 * @param profile   - The weight profile to use.
 * @returns The category weight in [0.0, 2.0].
 */
export function getEvidenceCategoryWeight(category: string, profile: WeightProfile): number {
  const evWeights = profile.evidenceCategoryWeights;
  if (!evWeights) return 1.0;

  const categories = evWeights.categories;
  if (categories && category in categories) {
    return categories[category];
  }

  return evWeights.defaultWeight;
}

// ── Utility ──

/**
 * Checks whether a weight profile is the default profile.
 *
 * Useful for consumers that want to skip weight-related computations
 * when the default profile is in use.
 *
 * @param profile - The weight profile to check.
 * @returns True if the profile is the default profile.
 */
export function isDefaultWeightProfile(profile: WeightProfile): boolean {
  return profile === DEFAULT_WEIGHT_PROFILE;
}

/**
 * Creates a dimension weight lookup function for efficient repeated lookups.
 *
 * This is useful inside tight loops where you need to look up dimension
 * weights for many contributions. The returned function has minimal overhead.
 *
 * ## Usage
 *
 * ```typescript
 * const weightFn = createDimensionWeightFn(profile);
 * for (const c of contributions) {
 *   const weight = weightFn(c.sourceType);
 *   // ...
 * }
 * ```
 *
 * @param profile - The weight profile to use.
 * @returns A function that maps SourceType → weight.
 */
export function createDimensionWeightFn(profile: WeightProfile): (sourceType: string) => number {
  // Pre-extract weights for fast lookup.
  const ruleWeight = profile.dimensionWeights.rule;
  const corrWeight = profile.dimensionWeights.correlation;
  const evWeight = profile.dimensionWeights.evidence;

  return (sourceType: string): number => {
    switch (sourceType) {
      case 'rule':
        return ruleWeight;
      case 'correlation':
        return corrWeight;
      case 'evidence':
        return evWeight;
      default:
        return 1.0;
    }
  };
}
