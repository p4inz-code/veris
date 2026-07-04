/**
 * @veris/risk/engine — Deterministic evaluation orchestrator.
 *
 * ## Evaluation Pipeline
 *
 * The `RiskEngine` composes all previously implemented deterministic
 * components into a complete `RiskAssessment`:
 *
 * ```
 * RiskInput
 *   ↓
 * 1. Validate input  ──→ validateContributionInput()
 *   ↓
 * 2. Build Contributions  ──→ buildContributions()
 *   ↓
 * 3. Aggregate Dimensions  ──→ aggregateByDimension()
 *   ↓
 * 4. Compute Assessment Confidence  ──→ computeAssessmentConfidence()
 *   ↓
 * 5. Compute Risk Score  ──→ sum of dimension saturatedScores
 *   ↓
 * 6. Resolve Verdict  ──→ resolveVerdict()
 *   ↓
 * 7. Construct immutable RiskAssessment
 * ```
 *
 * ## Ownership Boundaries
 *
 * The engine **orchestrates, not calculates**. Every mathematical
 * operation is delegated to the specialized modules:
 *
 * - **scoring.ts** — rounding, clamping, saturation, contribution math
 * - **contribution-builder.ts** — transforms input into Contributions
 * - **aggregator.ts** — groups contributions into dimension summaries
 * - **confidence.ts** — computes assessment confidence factors
 * - **verdict.ts** — resolves verdict from score + confidence
 * - **constants.ts** — shared constants and thresholds
 *
 * The engine's sole responsibility is to wire these components
 * together in the correct order and produce a frozen, immutable
 * `RiskAssessment`.
 *
 * ## Why Orchestration is Separate from Mathematics
 *
 * Separating orchestration from calculation provides several benefits:
 *
 * 1. **Testability** — each module is independently testable.
 * 2. **Maintainability** — changing the pipeline order or adding
 *    new stages does not affect the math primitives.
 * 3. **Composability** — downstream consumers (explainers,
 *    recommendations) can consume intermediate results without
 *    re-running the engine.
 * 4. **Determinism** — the fixed pipeline order guarantees that
 *    identical inputs always produce identical outputs.
 *
 * ## Determinism Guarantees
 *
 * - Every intermediate value is computed from the same deterministic
 *   primitives used throughout the engine.
 * - The pipeline order is fixed and documented.
 * - The `computedAt` timestamp is deterministic when provided via
 *   `RiskEngineOptions.computedAt`, otherwise it uses the current
 *   time (the only non-deterministic field).
 * - All outputs are frozen at construction.
 *
 * ## Extension Points for Future Layers
 *
 * - **Recommendations** — consume `RiskAssessment` and
 *   `ConfidenceBreakdown` to suggest actions.
 * - **AI Assistant** — receive `RiskAssessment`, contributions, and
 *   dimension summaries for natural language explanations.
 * - **Explainers** — use dimension summaries, formula steps, and
 *   multiplier chains to produce human-readable breakdowns.
 * - **Diagnostics** — inspect intermediate results without
 *   re-evaluation by consuming the frozen assessment.
 *
 * @module @veris/risk/engine
 */

import { deterministicId } from '@veris/shared';

import { aggregateByDimension } from './aggregator.js';
import type { AggregationResult } from './aggregator.js';
import { computeAssessmentConfidence } from './confidence.js';
import {
  SCHEMA_VERSION,
  ENGINE_VERSION,
  ASSESSMENT_ID_PREFIX,
  RISK_SCORE_MIN,
  RISK_SCORE_MAX,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_CONTRIBUTIONS,
  VERDICT_THRESHOLDS,
} from './constants.js';
import { buildContributions } from './contribution-builder.js';
import { createNoopDiagnosticsWriter } from './diagnostics.js';
import { round2, clamp } from './scoring.js';
import type {
  RiskInput,
  RiskAssessment,
  RiskEngineOptions,
  RiskLevel,
  Contribution,
  RiskDiagnosticsWriter,
} from './types.js';
import { resolveVerdict } from './verdict.js';

// ── Risk Level Resolution ──

/**
 * Resolves a risk level from a numeric risk score.
 *
 * ## Thresholds (from VERDICT_THRESHOLDS score thresholds)
 *
 * | Score Range            | Risk Level    |
 * |------------------------|---------------|
 * | [8.0, 10.0]            | critical      |
 * | [6.0, 8.0)             | high          |
 * | [4.0, 6.0)             | medium        |
 * | [2.0, 4.0)             | low           |
 * | [0.0, 2.0)             | negligible    |
 *
 * ## Evaluation Order
 * Checks from highest to lowest, returning the first match.
 * Falls back to "negligible" for scores below the lowest threshold.
 *
 * ## Determinism
 * Pure function — same input always produces same output.
 *
 * @param score - The numeric risk score [0.0, 10.0].
 * @returns The corresponding RiskLevel.
 */
function resolveRiskLevel(score: number): RiskLevel {
  if (score >= VERDICT_THRESHOLDS.maliciousScore) return 'critical';
  if (score >= VERDICT_THRESHOLDS.likelyMaliciousScore) return 'high';
  if (score >= VERDICT_THRESHOLDS.suspiciousScore) return 'medium';
  if (score >= VERDICT_THRESHOLDS.likelyBenignScore) return 'low';
  return 'negligible';
}

// ── Risk Score Computation ──

/**
 * Computes the overall risk score from dimension aggregation results.
 *
 * ## Formula
 * ```text
 * riskScore = clamp(Σ(dimension.saturatedScore), 0.0, 10.0)
 * ```
 *
 * ## Evaluation Order
 * 1. Sum all dimension saturatedScores (left-to-right in array order).
 * 2. Clamp to [RISK_SCORE_MIN, RISK_SCORE_MAX] = [0.0, 10.0].
 * 3. Round to 2 decimal places via round2.
 *
 * Since each saturatedScore ∈ [0.0, 1.0) and there are at most
 * 3 dimensions, the sum is always < 3.0, well within [0.0, 10.0].
 * The clamp exists for robustness against edge cases.
 *
 * @param aggregationResult - The aggregation result from aggregateByDimension.
 * @returns The overall risk score in [0.0, 10.0], rounded to 2dp.
 */
/**
 * Computes the overall risk score from dimension aggregation results.
 *
 * ## Formula
 * ```text
 * riskScore = clamp(totalSummedValue, 0.0, 10.0)
 * ```
 *
 * Where `totalSummedValue` is the sum of all contribution effectiveValues
 * across all dimensions, as computed by `aggregateByDimension`.
 *
 * ## Why totalSummedValue?
 *
 * Each contribution's `effectiveValue` is already in [0.0, 10.0] (clamped
 * by `computeContributionValue`). The total sum of these values represents
 * the aggregate evidence weight — more severe and more confident
 * contributions increase the total. Clamping to [0.0, 10.0] keeps the
 * score in the range expected by verdict thresholds.
 *
 * This approach has the property that:
 * - A single maximum-severity contribution (10.0) produces score = 10.0.
 * - Multiple moderate contributions can cumulatively reach the same score.
 * - Empty input produces score = 0.0.
 *
 * ## Evaluation Order
 * 1. Read `totalSummedValue` from the aggregation result.
 * 2. Clamp to [RISK_SCORE_MIN, RISK_SCORE_MAX] = [0.0, 10.0].
 * 3. Round to 2 decimal places via round2.
 *
 * @param aggregationResult - The aggregation result from aggregateByDimension.
 * @returns The overall risk score in [0.0, 10.0], rounded to 2dp.
 */
function computeRiskScore(aggregationResult: AggregationResult): number {
  return round2(clamp(aggregationResult.totalSummedValue, RISK_SCORE_MIN, RISK_SCORE_MAX));
}

// ── Contribution Sorting ──

/**
 * Sorts contributions by effectiveValue in descending order.
 *
 * ## Evaluation Order
 * Uses a stable sort algorithm. When effectiveValues are equal,
 * the original order is preserved.
 *
 * ## Complexity
 * O(n log n) — uses the built-in Array.prototype.sort with a
 * comparator that sorts by effectiveValue descending.
 *
 * @param contributions - The contributions to sort.
 * @returns A new frozen array of contributions sorted by effectiveValue desc.
 */
function sortContributionsByValue(contributions: readonly Contribution[]): readonly Contribution[] {
  const sorted = [...contributions].sort((a, b) => {
    return b.effectiveValue - a.effectiveValue;
  });
  return Object.freeze(sorted);
}

// ── Contribution Truncation ──

/**
 * Truncates contributions to at most maxCount items, keeping the
 * highest-value contributions.
 *
 * When truncation occurs, the truncated contributions are discarded.
 * The total contribution count is preserved in
 * `RiskAssessment.totalContributionCount`.
 *
 * @param sortedContributions - Contributions sorted by value descending.
 * @param maxCount - Maximum number of contributions to keep.
 * @returns A frozen array with at most maxCount contributions.
 */
function truncateContributions(
  sortedContributions: readonly Contribution[],
  maxCount: number,
): readonly Contribution[] {
  if (sortedContributions.length <= maxCount) {
    return sortedContributions;
  }
  return Object.freeze(sortedContributions.slice(0, maxCount));
}

// ── Assessment ID Generation ──

/**
 * Generates a deterministic assessment ID from the input.
 *
 * The ID is a hash of the session ID and artifact ID, ensuring
 * that the same input always produces the same assessment ID.
 *
 * @param input - The risk engine input.
 * @returns A deterministic assessment ID with prefix "ra_".
 */
function generateAssessmentId(input: RiskInput): string {
  return deterministicId(ASSESSMENT_ID_PREFIX, input.sessionId, input.artifactId ?? '');
}

// ── RiskEngine ──

/**
 * Deterministic risk evaluation orchestrator.
 *
 * The `RiskEngine` transforms `RiskInput` into a complete
 * `RiskAssessment` by composing all previously implemented
 * deterministic components in a fixed pipeline order.
 *
 * ## Usage
 * ```typescript
 * const engine = new RiskEngine();
 * const assessment = engine.evaluate(input);
 * ```
 *
 * ## What This Class Does
 * - Orchestrates the evaluation pipeline (validate → build → aggregate
 *   → score → verdict → construct).
 * - Produces a frozen, immutable RiskAssessment.
 * - Handles contribution truncation and sorting.
 * - Delegates all mathematics to specialized modules.
 *
 * ## What This Class Does NOT Do
 * - Does NOT perform any mathematical computations itself
 *   (beyond simple sum and clamp for risk score).
 * - Does NOT generate explainability views.
 * - Does NOT produce recommendations.
 * - Does NOT use AI or external services.
 * - Does NOT maintain global state or caches.
 *
 * ## Determinism Guarantee
 * Identical inputs always produce identical outputs. The only
 * potentially non-deterministic field is `computedAt`, which can
 * be overridden via `RiskEngineOptions.computedAt`.
 *
 * ## Thread Safety
 * The RiskEngine has no mutable state. Multiple threads can safely
 * share a single instance.
 *
 * @example
 * ```typescript
 * const engine = new RiskEngine();
 * const assessment = engine.evaluate({
 *   matches: [{ ruleId: "RULE-001", severity: { level: "high", score: 8.0 }, confidence: 0.9, evidenceIds: ["ev-001"], taxonomyIds: [] }],
 *   correlations: [],
 *   evidence: [{ id: "ev-001", confidence: 0.9, category: "pe-import", artifactId: "art-main.exe" }],
 *   artifactId: "art-main.exe",
 *   sessionId: "session-001",
 * });
 *
 * console.log(assessment.riskScore);    // 6.40
 * console.log(assessment.riskLevel);    // "high"
 * console.log(assessment.verdict);      // "likely-malicious"
 * console.log(assessment.confidence);   // 0.9
 * ```
 */
export class RiskEngine {
  /**
   * Engine-level options. Applied to every evaluate() call unless
   * overridden by per-call options.
   */
  private readonly defaultOptions: {
    readonly timeoutMs: number;
    readonly maxContributions: number;
    readonly cancellationToken: import('@veris/shared').CancellationToken | undefined;
    readonly computedAt: string | undefined;
  };

  /**
   * Creates a new RiskEngine instance.
   *
   * @param options - Optional default engine options.
   */
  constructor(options?: RiskEngineOptions) {
    this.defaultOptions = Object.freeze({
      timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxContributions: options?.maxContributions ?? DEFAULT_MAX_CONTRIBUTIONS,
      cancellationToken: options?.cancellationToken,
      computedAt: options?.computedAt,
    });
  }

  /**
   * Evaluates a RiskInput and produces a complete RiskAssessment.
   *
   * ## Pipeline
   *
   * 1. **Validate input** — checks for null/undefined.
   * 2. **Build Contributions** — transforms matches, correlations,
   *    and evidence into immutable Contribution objects.
   * 3. **Aggregate Dimensions** — groups contributions by sourceType
   *    and computes dimension-level summaries.
   * 4. **Compute Assessment Confidence** — derives confidence from
   *    contribution confidences, evidence completeness, and
   *    aggregation quality.
   * 5. **Compute Risk Score** — sums dimension saturated scores.
   * 6. **Resolve Risk Level** — maps score to a risk level.
   * 7. **Resolve Verdict** — combines score + confidence → verdict.
   * 8. **Sort & Truncate Contributions** — sorts by effectiveValue
   *    descending, truncates to maxContributions.
   * 9. **Construct RiskAssessment** — freezes everything.
   *
   * ## Parameters
   *
   * @param input   - The risk engine input (rule matches, correlations, evidence).
   * @param options - Optional per-call options that override engine-level defaults.
   * @returns A frozen, immutable RiskAssessment.
   * @throws {TypeError} If input is null or undefined.
   */
  evaluate(input: RiskInput, options?: RiskEngineOptions): RiskAssessment {
    // Stage 1 — validate input.
    // We must validate BEFORE creating the diagnostics writer so that
    // validation errors propagate without a collector in scope.
    if (!input) {
      throw new TypeError('RiskInput is required');
    }

    // Resolve the diagnostics writer — use the provided collector or a no-op.
    const diag: RiskDiagnosticsWriter = options?.diagnostics ?? createNoopDiagnosticsWriter();

    // Merge options: per-call options override engine-level defaults.
    const maxContributions = options?.maxContributions ?? this.defaultOptions.maxContributions;
    const computedAt =
      options?.computedAt ?? this.defaultOptions.computedAt ?? new Date().toISOString();

    // Stage 2 — build contributions from the input.
    diag.recordStage('build-contributions');
    const contributions = buildContributions(input);
    diag.setContributionCount(contributions.length);

    // Stage 3 — aggregate contributions by dimension.
    diag.recordStage('aggregate-dimensions');
    const aggregation = aggregateByDimension(contributions);
    diag.setDimensionCount(aggregation.dimensions.length);

    // Stage 4 — compute assessment confidence.
    diag.recordStage('compute-confidence');
    const confidenceBreakdown = computeAssessmentConfidence(contributions, aggregation);

    // Stage 5 — compute overall risk score from dimension saturated scores.
    diag.recordStage('compute-risk-score');
    const riskScore = computeRiskScore(aggregation);

    // Stage 6 — resolve risk level from score.
    const riskLevel = resolveRiskLevel(riskScore);

    // Stage 7 — resolve verdict from score and confidence.
    diag.recordStage('resolve-verdict');
    const verdictResult = resolveVerdict(riskScore, confidenceBreakdown.overall);

    // Stage 8 — sort and truncate contributions.
    diag.recordStage('sort-and-truncate');
    const sortedContributions = sortContributionsByValue(contributions);
    const totalContributionCount = contributions.length;
    const truncated = truncateContributions(sortedContributions, maxContributions);
    const contributionsTruncated = truncated.length < totalContributionCount;
    diag.setTruncationInfo({
      truncated: contributionsTruncated,
      originalCount: totalContributionCount,
      finalCount: truncated.length,
    });

    // Compute unique evidence count across all contributions.
    const evidenceSet = new Set<string>();
    for (let i = 0; i < contributions.length; i++) {
      const ids = contributions[i].evidenceIds;
      for (let j = 0; j < ids.length; j++) {
        evidenceSet.add(ids[j]);
      }
    }
    diag.setEvidenceCount(evidenceSet.size);

    // Stage 9 — build deterministic assessment ID.
    diag.recordStage('build-assessment-id');
    const id = generateAssessmentId(input);

    // Stage 10 — construct and return the frozen RiskAssessment.
    diag.recordStage('construct-assessment');
    return Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      id,
      sessionId: input.sessionId,
      artifactId: input.artifactId,
      riskScore,
      riskLevel,
      verdict: verdictResult.verdict,
      confidence: confidenceBreakdown.overall,
      computedAt,
      contributions: truncated,
      totalContributionCount,
      contributionsTruncated,
    });
  }
}
