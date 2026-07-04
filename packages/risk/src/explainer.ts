/**
 * @veris/risk/explainer — Deterministic explainability helpers.
 *
 * ## Why Explainability is Separate from Scoring
 *
 * The risk engine's scoring pipeline (build contributions → aggregate →
 * compute confidence → resolve verdict) is kept separate from
 * explainability for several reasons:
 *
 * 1. **Performance** — Consumers that only need the final risk score or
 *    verdict should not pay the cost of building explanation structures.
 *    The engine returns a lightweight RiskAssessment; explainability is
 *    on-demand.
 *
 * 2. **No recomputation** — All data needed for explanations already
 *    exists on the Contribution, DimensionSummary, and RiskAssessment
 *    objects. The explainer only re-formats and groups existing data.
 *    It NEVER re-runs any scoring mathematics.
 *
 * 3. **Separation of concerns** — The scoring pipeline answers "How
 *    risky is this?" The explainer answers "Why is it this risky?"
 *    Different consumers have different needs.
 *
 * ## Ownership Boundaries
 *
 * The explainer consumes (never modifies) the outputs of:
 * - **Contribution Builder** (src/contribution-builder.ts)
 * - **Aggregator** (src/aggregator.ts)
 * - **Risk Engine** (src/engine.ts)
 *
 * It does NOT depend on:
 * - Scoring primitives (src/scoring.ts) — no math is performed
 * - Confidence computation (src/confidence.ts) — already stored on assessment
 * - Verdict resolution (src/verdict.ts) — already stored on assessment
 *
 * ## Traceability Guarantees
 *
 * Every explanation maintains full traceability to the original data:
 * - `ContributionExplanation` includes the original Contribution reference
 *   (or ID), preserving access to the full formula, multiplier chain, and
 *   evidence provenance.
 * - `DimensionExplanation` includes the DimensionSummary plus direct
 *   references to the contributions that compose it.
 * - `DimensionBreakdown` groups contributions by sourceType, matching the
 *   aggregator's own dimension ordering (rule → correlation → evidence).
 * - `TopContributionsResult` preserves total contribution count even when
 *   the result is a subset, so consumers know how many were truncated.
 *
 * ## Extension Points for Future AI Explanation Layer
 *
 * - **AI Assistant** — consumes these structured explanations as context
 *   for natural-language generation. The structured data provides the
 *   factual grounding; the AI adds prose.
 * - **Recommendation engine** — uses dimension breakdown to identify
 *   which analytical dimensions are under-represented.
 * - **Diagnostics** — uses formula steps and multiplier chains to audit
 *   the evaluation without re-running the pipeline.
 *
 * @module @veris/risk/explainer
 */

import type { DimensionSummary } from './aggregator.js';
import type { Contribution } from './types.js';

// ── Types ──

/**
 * Structured explanation for a single contribution.
 *
 * Surfaces the formula, value chain, and traceability information
 * that already exists on the Contribution object in a flat,
 * consumable format. No data is recomputed — only reformatted.
 *
 * @see Contribution — the full Contribution object provides formula
 *      steps and multiplier chains for deeper inspection.
 */
export interface ContributionExplanation {
  /** The original contribution. Provides full access to formula, multipliers, etc. */
  readonly contribution: Contribution;

  /** A human-readable description of where this value came from. */
  readonly valueSource: string;

  /** The key numeric values that define this contribution. */
  readonly valueBreakdown: {
    /** Raw value before multipliers [0.0, 10.0]. */
    readonly baseValue: number;
    /** Final value after multipliers [0.0, 10.0]. */
    readonly effectiveValue: number;
    /** Number of multipliers applied (0 for most contributions at this stage). */
    readonly multiplierCount: number;
  };

  /** Traceability references to upstream pipeline objects. */
  readonly traceability: {
    /** Deterministic contribution ID. */
    readonly id: string;
    /** ID of the source (rule ID, correlation ID, evidence ID). */
    readonly sourceId: string;
    /** Evidence IDs that support this contribution. */
    readonly evidenceIds: readonly string[];
    /** Whether a severity was available for this contribution. */
    readonly hasSeverity: boolean;
  };
}

/**
 * Structured explanation for a single analytical dimension.
 *
 * Groups the dimension's aggregated summary with the contributions
 * that produced it. Consumers can trace from the dimension-level
 * statistics down to individual contributions.
 *
 * Dimensions are identified by their sourceType:
 * - `"rule"` — from RuleMatch contributions
 * - `"correlation"` — from correlation contributions
 * - `"evidence"` — from direct evidence contributions
 *
 * @see DimensionSummary — the aggregator's output for this dimension.
 */
export interface DimensionExplanation {
  /** The dimension identifier (matches a SourceType value). */
  readonly dimension: string;

  /** Number of contributions in this dimension. */
  readonly contributionCount: number;

  /** Sum of contribution effectiveValues in this dimension. */
  readonly summedValue: number;

  /** Effective weight for this dimension [0.0, 1.0]. */
  readonly effectiveWeight: number;

  /** Saturated dimension score [0.0, 1.0). */
  readonly saturatedScore: number;

  /**
   * The contributions that belong to this dimension.
   * Sorted by effectiveValue descending (highest first).
   * May be empty if only dimension-level statistics are available.
   */
  readonly contributions: readonly Contribution[];

  /**
   * Deterministic IDs of the contributions in this dimension.
   * Always populated, even when contributions array is empty.
   */
  readonly traceIds: readonly string[];
}

/**
 * Complete breakdown of an assessment's risk contributions by dimension.
 *
 * Groups all contributions by their sourceType/dimension and pairs each
 * group with the corresponding DimensionSummary. This is the primary
 * explainability view for understanding what drove the risk score.
 *
 * ## Ordering
 * Dimensions appear in stable order: rule, correlation, evidence.
 * Within each dimension, contributions are sorted by effectiveValue
 * descending.
 */
export interface DimensionBreakdown {
  /** Dimension explanations in stable order. */
  readonly dimensions: readonly DimensionExplanation[];

  /** Sum of all contribution effectiveValues across all dimensions. */
  readonly totalSummedValue: number;

  /** Total number of contributions across all dimensions. */
  readonly totalContributions: number;
}

/**
 * Result of a top-K contributions query.
 *
 * Returns the K contributions with the highest effectiveValue.
 * When K is larger than the total number of contributions,
 * all contributions are returned.
 *
 * The `cutoffValue` field indicates the minimum effectiveValue of
 * the returned set (null when the result is empty). This enables
 * consumers to understand the threshold for inclusion.
 */
export interface TopContributionsResult {
  /** The top-K contributions, sorted by effectiveValue descending. */
  readonly contributions: readonly Contribution[];

  /** Total number of contributions available (may be > returned). */
  readonly totalCount: number;

  /** Number of contributions actually returned. */
  readonly returnedCount: number;

  /**
   * The minimum effectiveValue in the returned set, or null if
   * the result is empty. Useful for understanding the cutoff.
   */
  readonly cutoffValue: number | null;
}

// ── explainContribution ──

/**
 * Produces a structured explanation of a single contribution.
 *
 * Surfaces the contribution's formula, value chain, and traceability
 * information. No recomputation occurs — all data is reformatted from
 * the existing Contribution object.
 *
 * ## Usage
 * ```typescript
 * const explanation = explainContribution(contribution);
 *
 * console.log(explanation.valueSource);    // "rule match"
 * console.log(explanation.traceability.sourceId); // "RULE-001"
 * ```
 *
 * ## What This Function Does
 * - Identifies the source type as a human-readable description.
 * - Extracts base and effective values.
 * - Counts applied multipliers.
 * - Collects traceability references (ID, sourceId, evidenceIds).
 *
 * ## What This Function Does NOT Do
 * - Does NOT compute or recompute any formula values.
 * - Does NOT access the formula steps (available on Contribution.formula).
 * - Does NOT generate natural language.
 * - Does NOT modify the contribution.
 *
 * ## Determinism
 * Pure function — identical contributions produce identical explanations.
 *
 * @param contribution - The contribution to explain.
 * @returns An immutable ContributionExplanation.
 * @throws {TypeError} If contribution is null or undefined.
 */
export function explainContribution(contribution: Contribution): ContributionExplanation {
  if (!contribution) {
    throw new TypeError('contribution is required');
  }

  const valueSource = describeSourceType(contribution.sourceType);
  const baseValue = contribution.baseValue;
  const effectiveValue = contribution.effectiveValue;
  const multiplierCount = contribution.multipliers.length;

  const valueBreakdown = Object.freeze({
    baseValue,
    effectiveValue,
    multiplierCount,
  });

  const traceability = Object.freeze({
    id: contribution.id,
    sourceId: contribution.sourceId,
    evidenceIds: contribution.evidenceIds,
    hasSeverity: contribution.severity !== null,
  });

  return Object.freeze({
    contribution,
    valueSource,
    valueBreakdown,
    traceability,
  });
}

/**
 * Maps a source type to a human-readable description.
 *
 * @param sourceType - The source type string.
 * @returns A human-readable description of the source.
 */
function describeSourceType(sourceType: string): string {
  switch (sourceType) {
    case 'rule':
      return 'rule match';
    case 'correlation':
      return 'behavioral correlation';
    case 'evidence':
      return 'direct evidence';
    default:
      return `source: ${sourceType}`;
  }
}

// ── explainDimension ──

/**
 * Produces a structured explanation of a single analytical dimension.
 *
 * Combines the dimension's aggregated statistics (from DimensionSummary)
 * with the individual contributions that produced them. Contributions
 * are sorted by effectiveValue descending for easy scanning.
 *
 * ## Usage
 * ```typescript
 * const explanation = explainDimension(summary, contributions);
 *
 * console.log(explanation.dimension);           // "rule"
 * console.log(explanation.contributions.length); // 3
 * ```
 *
 * ## What This Function Does
 * - Copies dimension statistics from the summary.
 * - Sorts contributions by effectiveValue descending.
 * - Collects trace IDs for reference.
 *
 * ## What This Function Does NOT Do
 * - Does NOT recompute any DimensionSummary values.
 * - Does NOT mutate the summary or contributions.
 * - Does NOT generate natural language.
 *
 * @param summary      - The DimensionSummary for this dimension.
 * @param contributions - Optional contributions belonging to this dimension.
 *                        When omitted, only dimension-level stats are included.
 * @returns An immutable DimensionExplanation.
 * @throws {TypeError} If summary is null or undefined.
 */
export function explainDimension(
  summary: DimensionSummary,
  contributions?: readonly Contribution[],
): DimensionExplanation {
  if (!summary) {
    throw new TypeError('DimensionSummary is required');
  }

  // Sort contributions by effectiveValue descending if provided.
  let sortedContributions: readonly Contribution[];
  if (contributions && contributions.length > 0) {
    sortedContributions = Object.freeze(
      [...contributions].sort((a, b) => b.effectiveValue - a.effectiveValue),
    );
  } else {
    sortedContributions = Object.freeze([]);
  }

  return Object.freeze({
    dimension: summary.dimension,
    contributionCount: summary.contributionCount,
    summedValue: summary.summedValue,
    effectiveWeight: summary.effectiveWeight,
    saturatedScore: summary.saturatedScore,
    contributions: sortedContributions,
    traceIds: summary.contributionIds,
  });
}

// ── breakdownByDimension ──

/**
 * Produces a complete dimension breakdown from a RiskAssessment.
 *
 * Groups the assessment's contributions by their sourceType and pairs
 * each group with the corresponding DimensionSummary. This is the
 * primary explainability entry point — it shows exactly what drove
 * the risk score.
 *
 * ## Usage
 * ```typescript
 * const engine = new RiskEngine();
 * const assessment = engine.evaluate(input);
 * const breakdown = breakdownByDimension(assessment);
 *
 * for (const dim of breakdown.dimensions) {
 *   console.log(dim.dimension, dim.summedValue, dim.contributions.length);
 * }
 * ```
 *
 * ## What This Function Does
 * - Groups contributions by sourceType (rule, correlation, evidence).
 * - Groups dimension IDs by sourceType for cross-referencing.
 * - Pairs each group with its dimension-level statistics.
 * - Returns a frozen, immutable breakdown.
 *
 * ## What This Function Does NOT Do
 * - Does NOT recompute any dimension statistics.
 * - Does NOT rerun the aggregator.
 * - Does NOT mutate the assessment.
 * - Does NOT generate natural language.
 *
 * ## Dimension Ordering
 * Dimensions appear in stable order: rule, correlation, evidence.
 * Within each dimension, contributions are sorted by effectiveValue
 * descending (matching the assessment's own sort order).
 *
 * ## Determinism
 * Pure function — identical assessments produce identical breakdowns.
 *
 * @param assessment - The RiskAssessment to break down.
 * @returns An immutable DimensionBreakdown.
 * @throws {TypeError} If assessment is null or undefined.
 */
/**
 * Produces a complete dimension breakdown from a RiskAssessment.
 *
 * Groups the assessment's contributions by their sourceType and pairs
 * each group with the corresponding dimension-level statistics. When
 * an `AggregationResult` is provided, the breakdown uses real
 * `effectiveWeight` and `saturatedScore` values from the aggregator;
 * otherwise these are reported as 0 (the assessment itself does not
 * store the aggregation result).
 *
 * ## Usage
 * ```typescript
 * const engine = new RiskEngine();
 * const assessment = engine.evaluate(input);
 * const breakdown = breakdownByDimension(assessment);
 *
 * for (const dim of breakdown.dimensions) {
 *   console.log(dim.dimension, dim.summedValue, dim.contributions.length);
 * }
 * ```
 *
 * When an `AggregationResult` is available (e.g., from a separate call to
 * `aggregateByDimension()`), pass it as the second parameter to get real
 * `effectiveWeight` and `saturatedScore` values.
 *
 * @param assessment      - The RiskAssessment to break down.
 * @param aggregationResult - Optional AggregationResult for real dimension
 *                            statistics. When omitted, effectiveWeight and
 *                            saturatedScore default to 0.
 * @returns An immutable DimensionBreakdown.
 * @throws {TypeError} If assessment is null or undefined.
 */
export function breakdownByDimension(
  assessment: import('./types.js').RiskAssessment,
  aggregationResult?: import('./aggregator.js').AggregationResult,
): DimensionBreakdown {
  if (!assessment) {
    throw new TypeError('RiskAssessment is required');
  }

  const contributions = assessment.contributions;

  // Phase 1 — build a lookup map from dimension name to DimensionSummary.
  // This avoids recomputing values the aggregator already calculated.
  const dimensionMap = new Map<string, import('./aggregator.js').DimensionSummary>();
  if (aggregationResult) {
    for (let i = 0; i < aggregationResult.dimensions.length; i++) {
      const ds = aggregationResult.dimensions[i];
      dimensionMap.set(ds.dimension, ds);
    }
  }

  // Phase 2 — group contributions by sourceType.
  const groups = new Map<string, Contribution[]>();
  for (let i = 0; i < contributions.length; i++) {
    const c = contributions[i];
    const dim = c.sourceType;
    let group = groups.get(dim);
    if (!group) {
      group = [];
      groups.set(dim, group);
    }
    group.push(c);
  }

  // Phase 3 — build DimensionExplanation objects in stable order.
  const dimensions: DimensionExplanation[] = [];
  const DIMENSION_ORDER: readonly string[] = ['rule', 'correlation', 'evidence'];

  for (let d = 0; d < DIMENSION_ORDER.length; d++) {
    const dim = DIMENSION_ORDER[d];
    const group = groups.get(dim);
    const dimSummary = dimensionMap.get(dim);

    if (group && group.length > 0) {
      dimensions.push(
        Object.freeze({
          dimension: dim,
          contributionCount: dimSummary?.contributionCount ?? group.length,
          summedValue: dimSummary?.summedValue ?? group.reduce((s, c) => s + c.effectiveValue, 0),
          effectiveWeight: dimSummary?.effectiveWeight ?? 0,
          saturatedScore: dimSummary?.saturatedScore ?? 0,
          contributions: Object.freeze(
            [...group].sort((a, b) => b.effectiveValue - a.effectiveValue),
          ),
          traceIds: Object.freeze(dimSummary?.contributionIds ?? group.map((c) => c.id)),
        }),
      );
    }
  }

  // Phase 4 — compute totals from the aggregation result when available.
  const totalSummedValue =
    aggregationResult?.totalSummedValue ?? contributions.reduce((s, c) => s + c.effectiveValue, 0);
  const totalContributions = contributions.length;

  return Object.freeze({
    dimensions: Object.freeze(dimensions),
    totalSummedValue,
    totalContributions,
  });
}

// ── topContributions ──

/**
 * Returns the top-K contributions by effectiveValue.
 *
 * When K is >= the total number of contributions, all contributions
 * are returned unchanged. Otherwise, the top K are returned sorted
 * by effectiveValue descending.
 *
 * ## Usage
 * ```typescript
 * const top5 = topContributions(assessment.contributions, 5);
 *
 * console.log(top5.returnedCount); // 5 (or less if total < 5)
 * console.log(top5.cutoffValue);  // minimum effectiveValue in result
 * ```
 *
 * ## Performance
 * Avoids full sorting when contributions are already sorted by
 * effectiveValue descending (which they are in a RiskAssessment
 * produced by the engine). When K is >= total count, returns a
 * reference to the original array with no copying.
 *
 * ## What This Function Does
 * - Returns the K contributions with the highest effectiveValue.
 * - Reports total and returned counts.
 * - Reports the minimum effectiveValue in the result (cutoff).
 *
 * ## What This Function Does NOT Do
 * - Does NOT modify the original array.
 * - Does NOT recompute any values.
 * - Does NOT generate natural language.
 *
 * @param contributions - The contributions to select from.
 * @param k             - Maximum number of contributions to return (>= 1).
 * @returns An immutable TopContributionsResult.
 * @throws {TypeError} If contributions is null or undefined.
 * @throws {RangeError} If k < 1.
 */
export function topContributions(
  contributions: readonly Contribution[],
  k: number,
): TopContributionsResult {
  if (!contributions) {
    throw new TypeError('contributions array is required');
  }
  if (typeof k !== 'number' || !isFinite(k) || k < 1) {
    throw new RangeError(`k must be a positive integer, got ${k}`);
  }

  const totalCount = contributions.length;

  // When K >= total, return all contributions unchanged (shallow-copied and
  // frozen to guarantee immutability of the result).
  if (k >= totalCount) {
    const cutoff = totalCount > 0 ? contributions[contributions.length - 1].effectiveValue : null;

    return Object.freeze({
      contributions: Object.freeze(contributions.slice()),
      totalCount,
      returnedCount: totalCount,
      cutoffValue: cutoff,
    });
  }

  // Check if contributions are already sorted by effectiveValue descending.
  // This is the case for contributions from a RiskAssessment produced by
  // the engine. Avoid full sort when already sorted.
  let sorted: Contribution[];
  if (isSortedDescending(contributions)) {
    // Already sorted — take the first K without sorting.
    sorted = contributions.slice(0, k) as Contribution[];
  } else {
    // Sort a copy, take the first K.
    sorted = [...contributions].sort((a, b) => b.effectiveValue - a.effectiveValue).slice(0, k);
  }

  const cutoffValue = sorted.length > 0 ? sorted[sorted.length - 1].effectiveValue : null;

  return Object.freeze({
    contributions: Object.freeze(sorted),
    totalCount,
    returnedCount: sorted.length,
    cutoffValue,
  });
}

/**
 * Checks whether an array of contributions is sorted by effectiveValue
 * in descending order.
 *
 * O(n) scan. Returns true for empty or single-element arrays.
 *
 * @param contributions - The array to check.
 * @returns True if the array is sorted descending by effectiveValue.
 */
function isSortedDescending(contributions: readonly Contribution[]): boolean {
  for (let i = 1; i < contributions.length; i++) {
    if (contributions[i - 1].effectiveValue < contributions[i].effectiveValue) {
      return false;
    }
  }
  return true;
}
