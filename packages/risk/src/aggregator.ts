/**
 * @veris/risk/aggregator — Deterministic dimension aggregation.
 *
 * ## Why Dimensions Exist
 *
 * Dimensions represent distinct sources of risk in an assessment. Each
 * Contribution belongs to exactly one dimension, identified by its
 * `sourceType`. Aggregating by dimension allows downstream consumers
 * to understand risk composition — how much risk comes from rule matches
 * versus correlations versus direct evidence.
 *
 * The three dimensions are:
 * - **rule** — from RuleMatch contributions (computed severity × confidence).
 * - **correlation** — from correlation contributions (behavioral chain metadata).
 * - **evidence** — from direct evidence contributions (traceability only).
 *
 * ## Why Aggregation Stops Here
 *
 * This milestone computes intermediate dimension-level summaries only.
 * It does NOT:
 *
 * - Compute an overall risk score (that requires combining dimensions).
 * - Determine a verdict (that requires risk score + confidence thresholds).
 * - Generate explanations (that is the explainer's responsibility).
 * - Mutate or duplicate Contribution objects (only stores references).
 *
 * ## How Later Milestones Consume This Output
 *
 * The DimensionSummary array is consumed by:
 * 1. **Risk scoring** — combines dimension saturated scores into an
 *    overall risk score.
 * 2. **Verdict computation** — uses the risk score and aggregate
 *    confidence to determine a verdict.
 * 3. **Explainers** — use dimension summaries plus trace references
 *    to produce human-readable breakdowns.
 *
 * ## Ownership Boundaries
 *
 * This aggregator owns the dimension summary computation. It receives
 * contributions from the Contribution Builder (Milestone 3) and produces
 * summaries for the Risk Evaluator (future milestone). It is a pure
 * transformation with no side effects.
 *
 * ## Traceability Guarantees
 *
 * Every DimensionSummary includes `contributionIds`, which are the
 * deterministic IDs of the contributions that produced it. This creates
 * a complete traceability chain:
 *
 *   RiskInput → Contribution (via Contribution Builder) → DimensionSummary
 *
 * ## Ordering Guarantees
 *
 * Dimension summaries are returned in a stable order:
 * 1. `"rule"` — rule match dimension.
 * 2. `"correlation"` — correlation dimension.
 * 3. `"evidence"` — evidence dimension.
 *
 * Empty dimensions (no contributions) are omitted. This ordering is
 * deterministic and reproducible across all evaluations.
 *
 * @module @veris/risk/aggregator
 */

import { RISK_SCORE_MAX, CONFIDENCE_MIN, CONFIDENCE_MAX } from './constants.js';
import { computeDimensionWeight, saturate, round6, clamp } from './scoring.js';
import type { Contribution } from './types.js';
import { SOURCE_TYPES } from './types.js';

// ── Types ──

/**
 * Intermediate calculations that produced the dimension summary.
 *
 * Every value is documented for auditor verification.
 */
export interface IntermediateCalculations {
  /** Mean confidence of all contributions in this dimension [0.0, 1.0]. */
  readonly meanConfidence: number;
  /** Effective chain length used for weight computation (≥ 1). */
  readonly effectiveChainLength: number;
  /** Summed value normalized by dividing by RISK_SCORE_MAX. */
  readonly normalizedSum: number;
  /**
   * Raw weighted score before saturation.
   * Computed as: normalizedSum × effectiveWeight.
   */
  readonly rawWeightedScore: number;
}

/**
 * A single dimension's aggregated summary.
 *
 * Represents the deterministic aggregation of all contributions belonging
 * to the same dimension (identified by sourceType). Contains only computed
 * values — never mutates or copies contribution data.
 */
export interface DimensionSummary {
  /** The dimension identifier (matches a SourceType value). */
  readonly dimension: string;
  /** Number of contributions in this dimension. */
  readonly contributionCount: number;
  /**
   * Sum of all contribution effectiveValues in this dimension.
   *
   * Range: [0.0, contributionCount × 10.0].
   * Precision: 6 decimal places.
   */
  readonly summedValue: number;
  /**
   * Effective weight for this dimension [0.0, 1.0].
   *
   * Computed via computeDimensionWeight(meanConfidence, effectiveChainLength).
   * Captures how much weight this dimension carries based on confidence
   * and behavioral chain amplification.
   */
  readonly effectiveWeight: number;
  /**
   * Saturated dimension score [0.0, 1.0).
   *
   * Computed as: saturate(normalizedSum) × effectiveWeight.
   * This is the final score for this dimension, used in overall
   * risk computation.
   */
  readonly saturatedScore: number;
  /** Intermediate calculations that produced this summary. */
  readonly intermediateCalculations: IntermediateCalculations;
  /** References to the Contribution IDs that make up this dimension. */
  readonly contributionIds: readonly string[];
}

/**
 * The complete output of the dimension aggregation phase.
 *
 * Contains all dimension summaries plus aggregate metadata.
 */
export interface AggregationResult {
  /** Dimension summaries in stable order. */
  readonly dimensions: readonly DimensionSummary[];
  /** Total number of contributions aggregated. */
  readonly totalContributions: number;
  /** Sum of all contribution effectiveValues across all dimensions. */
  readonly totalSummedValue: number;
}

// ── Dimension Order ──

/**
 * Stable dimension ordering — rule, correlation, evidence.
 * This ordering is deterministic and reproducible.
 */
const DIMENSION_ORDER: readonly string[] = [
  SOURCE_TYPES.RULE,
  SOURCE_TYPES.CORRELATION,
  SOURCE_TYPES.EVIDENCE,
] as const;

// ── Default Chain Lengths ──

/** Default chain length for rule match dimension (no correlation chain). */
const DEFAULT_RULE_CHAIN_LENGTH = 1;

/** Default chain length for evidence dimension (no correlation chain). */
const DEFAULT_EVIDENCE_CHAIN_LENGTH = 1;

// ── computeEffectiveWeight ──

/**
 * Computes the effective weight for a dimension.
 *
 * ## Formula
 * ```
 * effectiveWeight = computeDimensionWeight(meanConfidence, effectiveChainLength)
 * ```
 *
 * ## Evaluation Order
 * 1. Clamp `meanConfidence` to `[CONFIDENCE_MIN, CONFIDENCE_MAX]` = `[0.0, 1.0]`.
 * 2. Clamp `effectiveChainLength` to ≥ 1 (minimum chain length).
 * 3. Call `computeDimensionWeight(clampedConfidence, clampedChainLength)`.
 * 4. Round to 6 decimal places via `round6`.
 *
 * ## Determinism
 * All operations are deterministic and left-to-right.
 * Constants from `@veris/risk/constants` are frozen.
 *
 * ## Range
 * Output is always in `[0.0, 1.0]` after clamping and rounding.
 *
 * ## Invariants
 * - `computeEffectiveWeight(dc, cl) ∈ [0.0, 1.0]` for all finite inputs.
 * - Returns `NaN` if either input is `NaN`.
 * - Returns 0 when `meanConfidence` ≤ 0.
 *
 * ## Complexity
 * O(1) — two clamps, one function call to `computeDimensionWeight`, one round.
 *
 * @param meanConfidence      - Mean confidence of contributions in the dimension `[0.0, 1.0]`.
 * @param effectiveChainLength - Effective chain length for the dimension (≥ 1).
 * @returns The effective weight in `[0.0, 1.0]`.
 */
export function computeEffectiveWeight(
  meanConfidence: number,
  effectiveChainLength: number,
): number {
  // Stage 1 — clamp inputs to valid ranges.
  const clampedConfidence: number = clamp(meanConfidence, CONFIDENCE_MIN, CONFIDENCE_MAX);

  // Stage 2 — ensure chain length is at least 1.
  const clampedChainLength: number = effectiveChainLength < 1 ? 1 : effectiveChainLength;

  // Stage 3 — compute dimension weight using the existing primitive.
  const weight: number = computeDimensionWeight(clampedConfidence, clampedChainLength);

  // Stage 4 — round to intermediate precision.
  return round6(weight);
}

// ── Dimension Summarization ──

/**
 * Computes the effective chain length for a set of contributions in
 * a single dimension.
 *
 * - For the correlation dimension: returns the maximum chainLength
 *   found in contribution metadata, or 1 if none available.
 * - For rule and evidence dimensions: returns 1 (no amplification
 *   without a correlation chain). Evidence contributions carry no
 *   chain metadata because direct evidence is always standalone.
 *
 * @param contributions - The contributions in this dimension.
 * @param dimension     - The dimension identifier.
 * @returns The effective chain length (≥ 1).
 */
function computeEffectiveChainLength(
  contributions: readonly Contribution[],
  dimension: string,
): number {
  if (dimension !== SOURCE_TYPES.CORRELATION) {
    return 1;
  }

  let maxChainLength = 1;
  for (let i = 0; i < contributions.length; i++) {
    const metadata = contributions[i].metadata;
    if (
      metadata &&
      typeof metadata.chainLength === 'number' &&
      metadata.chainLength > maxChainLength
    ) {
      maxChainLength = metadata.chainLength;
    }
  }

  return maxChainLength;
}

/**
 * Computes the mean confidence for a set of contributions.
 *
 * Returns 0 for empty arrays (handled by caller to avoid division by zero).
 *
 * ## Evaluation Order
 * 1. Sum all confidences (left-to-right in array order).
 * 2. Divide by count.
 * 3. Round to 6 decimal places.
 *
 * @param contributions - Contributions to compute mean confidence for.
 * @returns The mean confidence [0.0, 1.0], or 0 if array is empty.
 */
function computeMeanConfidence(contributions: readonly Contribution[]): number {
  const count = contributions.length;
  if (count === 0) return 0;

  let sum = 0;
  for (let i = 0; i < count; i++) {
    sum += contributions[i].confidence;
  }

  return round6(sum / count);
}

/**
 * Computes the summed effective value for a set of contributions.
 *
 * ## Evaluation Order
 * 1. Sum all effectiveValues (left-to-right in array order).
 * 2. Round to 6 decimal places.
 *
 * @param contributions - Contributions to sum.
 * @returns The summed effective value, rounded to 6dp.
 */
function computeSummedValue(contributions: readonly Contribution[]): number {
  let sum = 0;
  for (let i = 0; i < contributions.length; i++) {
    sum += contributions[i].effectiveValue;
  }
  return round6(sum);
}

/**
 * Builds a single DimensionSummary for a set of contributions.
 *
 * ## Evaluation Order
 * 1. Count contributions.
 * 2. Compute summedValue (sum of effectiveValues, left-to-right).
 * 3. Compute meanConfidence (mean of confidences, left-to-right).
 * 4. Compute effectiveChainLength.
 * 5. Compute effectiveWeight via computeEffectiveWeight.
 * 6. Compute normalizedSum = summedValue / RISK_SCORE_MAX.
 * 7. Compute rawWeightedScore = normalizedSum × effectiveWeight.
 * 8. Compute saturatedScore = saturate(normalizedSum) × effectiveWeight.
 * 9. Apply round6 to saturatedScore.
 * 10. Collect contribution IDs in array order.
 * 11. Freeze everything.
 *
 * @param contributions - Contributions in this dimension (must be non-empty).
 * @param dimension     - The dimension identifier.
 * @returns An immutable DimensionSummary.
 */
function buildDimensionSummary(
  contributions: readonly Contribution[],
  dimension: string,
): DimensionSummary {
  const count = contributions.length;

  // Stage 1 — compute aggregate values.
  const summedValue = computeSummedValue(contributions);
  const meanConfidence = computeMeanConfidence(contributions);
  const effectiveChainLength = computeEffectiveChainLength(contributions, dimension);
  const effectiveWeight = computeEffectiveWeight(meanConfidence, effectiveChainLength);

  // Stage 2 — compute saturated score.
  // Formula: saturate(normalizedSum) × effectiveWeight
  // normalizedSum = summedValue / RISK_SCORE_MAX (maps [0, ∞) to [0, ∞))
  const normalizedSum = summedValue / RISK_SCORE_MAX;
  const saturatedNormalized = saturate(normalizedSum);
  const rawWeightedScore = normalizedSum * effectiveWeight;
  const saturatedScore = round6(saturatedNormalized * effectiveWeight);

  // Stage 3 — collect trace references.
  const contributionIds: string[] = [];
  for (let i = 0; i < count; i++) {
    contributionIds.push(contributions[i].id);
  }

  // Stage 4 — build and freeze.
  const intermediate: IntermediateCalculations = {
    meanConfidence: round6(meanConfidence),
    effectiveChainLength,
    normalizedSum: round6(normalizedSum),
    rawWeightedScore: round6(rawWeightedScore),
  };

  return Object.freeze({
    dimension,
    contributionCount: count,
    summedValue,
    effectiveWeight,
    saturatedScore,
    intermediateCalculations: Object.freeze(intermediate),
    contributionIds: Object.freeze(contributionIds),
  });
}

// ── Main Aggregator ──

/**
 * Aggregates contributions into dimension-level summaries.
 *
 * Groups contributions by their `sourceType` (dimension) and computes
 * aggregate statistics for each dimension.
 *
 * ## Usage
 * ```typescript
 * const result = aggregateByDimension(contributions);
 * ```
 *
 * ## What This Function Does
 * - Groups contributions by sourceType (RULE, CORRELATION, EVIDENCE).
 * - Computes per-dimension: summedValue, effectiveWeight, saturatedScore.
 * - Collects contribution IDs for traceability.
 * - Returns an immutable AggregationResult.
 *
 * ## What This Function Does NOT Do
 * - Does NOT compute an overall risk score.
 * - Does NOT compute a verdict.
 * - Does NOT generate explanations.
 * - Does NOT mutate Contribution objects.
 * - Does NOT duplicate Contribution data.
 *
 * ## Ordering Guarantee
 * Dimension summaries are returned in stable order: rule, correlation, evidence.
 * Empty dimensions are omitted. Within each dimension, contribution IDs
 * appear in the same order as they appear in the input array.
 *
 * ## Determinism Guarantee
 * Identical inputs always produce identical outputs, including:
 * - Same number of dimension summaries.
 * - Same ordering.
 * - Same computed values.
 * - Same trace references.
 *
 * @param contributions - The contributions to aggregate.
 * @returns An immutable AggregationResult.
 * @throws {TypeError} If contributions is null or undefined.
 */
export function aggregateByDimension(contributions: readonly Contribution[]): AggregationResult {
  if (!contributions) {
    throw new TypeError('contributions array is required');
  }

  // Phase 1 — group contributions by dimension (sourceType).
  // Use a Map for O(1) lookup: dimensionName → Contribution[]
  const dimensionMap = new Map<string, Contribution[]>();

  for (let i = 0; i < contributions.length; i++) {
    const c = contributions[i];
    const dim = c.sourceType;
    let group = dimensionMap.get(dim);
    if (!group) {
      group = [];
      dimensionMap.set(dim, group);
    }
    group.push(c);
  }

  // Phase 2 — build dimension summaries in stable order.
  const dimensionSummaries: DimensionSummary[] = [];

  for (let d = 0; d < DIMENSION_ORDER.length; d++) {
    const dim = DIMENSION_ORDER[d];
    const group = dimensionMap.get(dim);
    if (group && group.length > 0) {
      dimensionSummaries.push(buildDimensionSummary(group, dim));
    }
  }

  // Phase 3 — compute aggregate totals.
  let totalContributions = 0;
  let totalSummedValue = 0;

  for (let i = 0; i < dimensionSummaries.length; i++) {
    totalContributions += dimensionSummaries[i].contributionCount;
    totalSummedValue += dimensionSummaries[i].summedValue;
  }
  totalSummedValue = round6(totalSummedValue);

  // Phase 4 — build and return the immutable result.
  return Object.freeze({
    dimensions: Object.freeze(dimensionSummaries),
    totalContributions,
    totalSummedValue,
  });
}
