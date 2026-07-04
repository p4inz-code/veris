/**
 * @veris/risk/confidence — Deterministic assessment confidence calculation.
 *
 * ## Why Assessment Confidence Differs from Evidence Confidence
 *
 * **Evidence confidence** (the `Contribution.confidence` field) answers:
 * "How sure are we that this specific piece of evidence is valid?"
 * It is inherited from upstream pipeline outputs (rules, correlations, evidence)
 * and reflects confidence in individual data points. Each contribution's
 * confidence is a property of the source — it comes from the rule engine,
 * correlation engine, or direct evidence.
 *
 * **Assessment confidence** (computed here) answers:
 * "How confident are we in the overall risk assessment?"
 * It is a meta-level confidence derived from THREE factors that capture
 * different dimensions of assessment quality:
 *
 * 1. **Contribution confidence** — the aggregate of all individual
 *    contribution confidences. Even if every contribution has high confidence,
 *    the overall assessment confidence depends on how many contributions
 *    support the assessment and how consistent they are.
 *
 * 2. **Evidence completeness** — how much of the evidence is unique vs.
 *    repeated. An assessment that references the same few evidence IDs
 *    many times is less robust than one with diverse evidence coverage.
 *
 * 3. **Aggregation quality** — how many dimensions are populated. An
 *    assessment with evidence across all three dimensions (rule, correlation,
 *    evidence) has higher confidence than one limited to a single dimension.
 *
 * ## Why Confidence is Separate from Verdict
 *
 * - **Verdict** answers: "What should I do about this?"
 *   It combines the risk score with confidence thresholds to produce
 *   an actionable conclusion (malicious → investigate immediately,
 *   benign → no action needed).
 *
 * - **Confidence** answers: "How sure are we of the assessment?"
 *   It is a standalone measure of assessment quality that can be used
 *   independently of the verdict. A high-risk, low-confidence assessment
 *   might warrant further investigation (the verdict reflects the score),
 *   but the confidence tells the consumer to treat the result as tentative.
 *
 * The separation allows consumers to make nuanced decisions:
 * - High score + high confidence = act immediately.
 * - High score + low confidence = investigate further before acting.
 * - Low score + low confidence = insufficient data, needs more evidence.
 * - Low score + high confidence = safe, move on.
 *
 * ## How Later Milestones Consume This
 *
 * 1. **RiskAssessment construction** — `computeAssessmentConfidence()`
 *    produces the `ConfidenceBreakdown` which is stored in the assessment.
 *    The `overall` value populates `RiskAssessment.confidence`.
 *
 * 2. **Verdict computation** — `resolveVerdict()` already uses the
 *    overall confidence alongside the risk score to determine verdicts.
 *    The improved confidence calculation means verdicts are more accurate.
 *
 * 3. **Explainers** — use the `ConfidenceBreakdown` to explain why the
 *    assessment is or isn't trustworthy, showing each factor independently.
 *
 * 4. **Recommendations** — use the breakdown to prioritize actions:
 *    low evidence completeness may trigger a "gather more evidence"
 *    recommendation, while low aggregation quality may suggest enabling
 *    additional analysis dimensions.
 *
 * ## Evaluation Order
 *
 * 1. Validate inputs (throw TypeError if null/undefined).
 * 2. Compute contribution confidence (mean of all contribution confidences).
 * 3. Compute evidence completeness (unique/total evidence ID ratio).
 * 4. Compute aggregation quality (populated dimension ratio).
 * 5. Compute overall confidence (product of all three factors, clamped
 *    to [CONFIDENCE_MIN, CONFIDENCE_MAX]).
 * 6. Determine hasSufficientEvidence (overall >= CONFIDENCE_MIN_SUFFICIENT).
 * 7. Freeze and return the ConfidenceBreakdown.
 *
 * ## Determinism Guarantee
 * Identical inputs always produce identical outputs. All computations
 * use the same rounding and clamping primitives as the rest of the engine.
 *
 * @module @veris/risk/confidence
 */

import type { AggregationResult } from './aggregator.js';
import { CONFIDENCE_MIN, CONFIDENCE_MAX, CONFIDENCE_MIN_SUFFICIENT } from './constants.js';
import { clamp, round6 } from './scoring.js';
import type { Contribution } from './types.js';

// ── Types ──

/**
 * The three factors that compose the assessment confidence.
 *
 * Each factor is in [0.0, 1.0] and independently explainable.
 * The product of all three factors gives the overall confidence.
 *
 * @see {@link ConfidenceBreakdown}
 */
export interface ConfidenceFactors {
  /**
   * Aggregate confidence from all individual contributions [0.0, 1.0].
   *
   * Computed as the mean of all `Contribution.confidence` values.
   * If there are no contributions, this is 0.0 — there is nothing
   * to have confidence in.
   *
   * This captures: "How confident are we in the individual pieces of
   * evidence that make up this assessment?"
   */
  readonly contributionConfidence: number;

  /**
   * How complete the evidence coverage is [0.0, 1.0].
   *
   * Computed as the ratio of unique evidence IDs to total evidence
   * references across all contributions. An assessment where every
   * contribution references a different piece of evidence has higher
   * completeness than one where the same few evidence IDs appear
   * in every contribution.
   *
   * - Ratio = 1.0: every evidence reference is unique (maximum diversity).
   * - Ratio close to 0.0: the same evidence is repeatedly referenced.
   * - 0.0 when there are no evidence references.
   *
   * This captures: "How broadly does the evidence cover the assessment?"
   */
  readonly evidenceCompleteness: number;

  /**
   * Quality of the dimension aggregation [0.0, 1.0].
   *
   * Computed as the ratio of populated dimensions to total possible
   * dimensions (3: rule, correlation, evidence). An assessment with
   * contributions in all three dimensions has the highest quality;
   * one limited to a single dimension has the lowest.
   *
   * This captures: "How many independent analytical perspectives
   * contribute to this assessment?"
   */
  readonly aggregationQuality: number;
}

/**
 * The complete result of an assessment confidence computation.
 *
 * Contains the overall confidence value plus the factor breakdown
 * for explainability. Every field is readonly and the object is frozen.
 *
 * ## Interpretation
 *
 * - `overall >= 0.7`: High confidence — the assessment is well-supported
 *   by diverse, high-quality evidence.
 * - `overall >= 0.3`: Sufficient confidence — the assessment has enough
 *   evidence to be meaningful (see {@link CONFIDENCE_MIN_SUFFICIENT}).
 * - `overall < 0.3`: Low confidence — the assessment should be treated
 *   as tentative. More evidence is needed.
 */
export interface ConfidenceBreakdown {
  /**
   * Overall assessment confidence [0.0, 1.0].
   *
   * Product of all three confidence factors:
   * `overall = contributionConfidence × evidenceCompleteness × aggregationQuality`
   *
   * Clamped to [CONFIDENCE_MIN, CONFIDENCE_MAX] = [0.0, 1.0].
   * Rounded to 6 decimal places.
   */
  readonly overall: number;

  /** Individual confidence factors with their computed values. */
  readonly factors: ConfidenceFactors;

  /**
   * Whether the assessment has sufficient evidence for a meaningful
   * conclusion.
   *
   * `true` when `overall >= CONFIDENCE_MIN_SUFFICIENT` (0.3).
   * When false, downstream consumers should treat the assessment as
   * inconclusive, regardless of the risk score.
   */
  readonly hasSufficientEvidence: boolean;
}

// ── Factor Computation ──

/**
 * Computes the contribution confidence factor.
 *
 * ## Formula
 * ```text
 * contributionConfidence = mean(contribution.confidence for each contribution)
 * ```
 *
 * ## Evaluation Order
 * 1. If no contributions, return 0.0.
 * 2. Sum all confidences (left-to-right in array order).
 * 3. Divide by count.
 * 4. Round to 6 decimal places.
 *
 * @param contributions - The contributions to aggregate.
 * @returns The mean confidence [0.0, 1.0].
 */
function computeContributionConfidenceFactor(contributions: readonly Contribution[]): number {
  const count = contributions.length;
  if (count === 0) return 0;

  let sum = 0;
  for (let i = 0; i < count; i++) {
    sum += contributions[i].confidence;
  }

  return round6(sum / count);
}

/**
 * Computes the evidence completeness factor.
 *
 * ## Formula
 * ```text
 * evidenceCompleteness = uniqueEvidenceIds / totalEvidenceReferences
 * ```
 *
 * ## Evaluation Order
 * 1. If no contributions, return 0.0.
 * 2. Collect all evidence IDs from all contributions (left-to-right).
 * 3. Count total references and unique references.
 * 4. Compute ratio: unique / total.
 * 5. Round to 6 decimal places.
 *
 * ## Rationale
 * A ratio of unique-to-total evidence IDs captures how well the
 * evidence covers the assessment. If the same evidence ID appears
 * in many contributions, that suggests the assessment is heavily
 * reliant on a narrow evidence base, reducing overall confidence.
 *
 * @param contributions - The contributions to analyze.
 * @returns The evidence completeness score [0.0, 1.0].
 */
function computeEvidenceCompletenessFactor(contributions: readonly Contribution[]): number {
  const count = contributions.length;
  if (count === 0) return 0;

  let totalReferences = 0;
  const uniqueIds = new Set<string>();

  for (let i = 0; i < count; i++) {
    const evidenceIds = contributions[i].evidenceIds;
    for (let j = 0; j < evidenceIds.length; j++) {
      totalReferences++;
      uniqueIds.add(evidenceIds[j]);
    }
  }

  if (totalReferences === 0) return 0;

  return round6(uniqueIds.size / totalReferences);
}

/**
 * Computes the aggregation quality factor.
 *
 * ## Formula
 * ```text
 * aggregationQuality = populatedDimensionCount / TOTAL_DIMENSIONS
 * ```
 *
 * Where TOTAL_DIMENSIONS = 3 (rule, correlation, evidence).
 *
 * ## Evaluation Order
 * 1. Count how many dimensions in the aggregation result have
 *    contributions.
 * 2. Divide by 3 (the total number of possible dimensions).
 * 3. Round to 6 decimal places.
 *
 * ## Rationale
 * The risk engine has three analytical dimensions: rule matches,
 * correlations, and direct evidence. An assessment that leverages
 * all three dimensions has higher confidence because it synthesizes
 * multiple independent analytical perspectives. A single-dimension
 * assessment is inherently less robust.
 *
 * @param aggregationResult - The result of dimension aggregation.
 * @returns The aggregation quality score [0.0, 1.0].
 */
function computeAggregationQualityFactor(aggregationResult: AggregationResult): number {
  const populatedCount = aggregationResult.dimensions.length;
  // Three possible dimensions: rule, correlation, evidence.
  const TOTAL_DIMENSIONS = 3;

  return round6(populatedCount / TOTAL_DIMENSIONS);
}

// ── Main Function ──

/**
 * Computes the deterministic assessment confidence from a set of
 * contributions and their aggregation result.
 *
 * ## Usage
 * ```typescript
 * const contributions = buildContributions(input);
 * const aggregation = aggregateByDimension(contributions);
 * const confidence = computeAssessmentConfidence(contributions, aggregation);
 * ```
 *
 * ## What This Function Does
 * - Computes contribution confidence (mean of all contribution confidences).
 * - Computes evidence completeness (unique/total evidence ratio).
 * - Computes aggregation quality (populated dimension ratio).
 * - Combines all three factors into an overall confidence score.
 * - Determines whether the assessment has sufficient evidence.
 * - Returns a frozen, immutable ConfidenceBreakdown.
 *
 * ## What This Function Does NOT Do
 * - Does NOT compute the risk score (handled by scoring and aggregation).
 * - Does NOT determine a verdict (handled by verdict resolution).
 * - Does NOT generate explanations.
 * - Does NOT mutate contributions or aggregation results.
 * - Does NOT inspect raw files, bytes, or AI output.
 *
 * ## Determinism Guarantee
 * Identical inputs always produce identical outputs. The product formula
 * ensures that the evaluation order is fixed: contributionConfidence ×
 * evidenceCompleteness × aggregationQuality. This left-to-right evaluation
 * is the same approach used throughout the engine.
 *
 * ## Range
 * - `overall` is always in [0.0, 1.0] (clamped and rounded).
 * - `hasSufficientEvidence` is true when `overall >= CONFIDENCE_MIN_SUFFICIENT`.
 *
 * ## Invariants
 * - `computeAssessmentConfidence(c, a).overall ∈ [0.0, 1.0]` for all valid inputs.
 * - `computeAssessmentConfidence([], emptyAggregation).overall === 0.0`.
 * - All three factors are independently in [0.0, 1.0].
 * - The function is pure: no side effects, no mutations, no global state.
 *
 * ## Complexity
 * O(n + m) where n is the number of contributions and m is the total
 * number of evidence references across all contributions. Both factor
 * computations are single-pass linear scans.
 *
 * @param contributions     - The contributions that make up the assessment.
 * @param aggregationResult - The result of aggregating contributions by
 *                            dimension (from `aggregateByDimension`).
 * @returns A frozen ConfidenceBreakdown.
 * @throws {TypeError} If either argument is null or undefined.
 */
export function computeAssessmentConfidence(
  contributions: readonly Contribution[],
  aggregationResult: AggregationResult,
): ConfidenceBreakdown {
  // Stage 1 — validate inputs.
  if (!contributions) {
    throw new TypeError('contributions array is required');
  }
  if (!aggregationResult) {
    throw new TypeError('aggregationResult is required');
  }

  // Stage 2 — compute each factor independently.
  const contributionConfidence = computeContributionConfidenceFactor(contributions);
  const evidenceCompleteness = computeEvidenceCompletenessFactor(contributions);
  const aggregationQuality = computeAggregationQualityFactor(aggregationResult);

  // Stage 3 — combine factors into overall confidence.
  // Product model: overall confidence is high only when ALL factors are high.
  // This matches the engineering philosophy of multiplicative confidence
  // used throughout VERIS.
  const product = contributionConfidence * evidenceCompleteness * aggregationQuality;
  const overall = round6(clamp(product, CONFIDENCE_MIN, CONFIDENCE_MAX));

  // Stage 4 — determine sufficiency.
  const hasSufficientEvidence = overall >= CONFIDENCE_MIN_SUFFICIENT;

  // Stage 5 — build and freeze the result.
  const factors: ConfidenceFactors = Object.freeze({
    contributionConfidence,
    evidenceCompleteness,
    aggregationQuality,
  });

  return Object.freeze({
    overall,
    factors,
    hasSufficientEvidence,
  });
}
