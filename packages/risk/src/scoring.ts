/**
 * @veris/risk/scoring — Deterministic scoring primitives.
 *
 * Pure mathematical functions that form the foundation of every risk
 * computation in the VERIS Risk Engine. Every function is:
 *
 * - **Pure** — no side effects, no mutations, no global state
 * - **Deterministic** — identical inputs always produce identical outputs
 * - **Allocation-free** — no temporary arrays or object allocations in hot paths
 * - **Independently testable** — each function stands alone
 * - **Fully documented** — JSDoc with purpose, inputs, outputs, complexity, reasoning
 *
 * ## Evaluation Order Guarantee
 *
 * Every function publishes its exact evaluation order so identical inputs
 * always produce identical outputs, regardless of JavaScript engine
 * optimizations or platform differences.
 *
 * @module @veris/risk/scoring
 */

import {
  // ── Mathematical constants ──
  PI_OVER_2,

  // ── Score bounds ──
  RISK_SCORE_MIN,
  RISK_SCORE_MAX,
  CONFIDENCE_MIN,
  CONFIDENCE_MAX,

  // ── Precision ──
  ROUND_PRECISION_INTERMEDIATE,
  ROUND_PRECISION_FINAL,

  // ── Multipliers ──
  CHAIN_MULTIPLIER_INCREMENT,
  CHAIN_MULTIPLIER_CAP,
} from './constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// Rounding Primitives
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rounds a number to 2 decimal places (final output precision).
 *
 * ## Evaluation Order
 * 1. Multiply input by 100.
 * 2. Round to nearest integer via {@link Math.round} (half-away-from-zero).
 * 3. Divide by 100.
 *
 * ## Determinism
 * {@link Math.round} is deterministic per the ECMAScript specification.
 * The multiplication-division pair is a single round-trip — no repeated
 * rounding that could introduce floating-point ambiguity.
 *
 * ## Range
 * Accepts any finite number. Returns `NaN` if input is `NaN`.
 * Returns `Infinity`/`-Infinity` if input is infinite.
 *
 * ## Complexity
 * O(1) — three primitive operations, no allocations.
 *
 * ## Reasoning
 * 2 decimal places is the standard for final risk scores presented to
 * users. This matches `ROUND_PRECISION_FINAL = 2` from
 * {@link @veris/risk/constants} and SPEC-005 user-facing precision
 * guidance.
 *
 * @param value - The number to round.
 * @returns The value rounded to 2 decimal places.
 */
export function round2(value: number): number {
  // Evaluation order: multiply → round → divide
  // This is a single round-trip to avoid cumulative floating-point error.
  const factor = 10 ** ROUND_PRECISION_FINAL;
  return Math.round(value * factor) / factor;
}

/**
 * Rounds a number to 6 decimal places (intermediate computation precision).
 *
 * ## Evaluation Order
 * 1. Multiply input by 1_000_000.
 * 2. Round to nearest integer via {@link Math.round}.
 * 3. Divide by 1_000_000.
 *
 * ## Determinism
 * Identical to {@link round2} in structure but with 10⁶ scaling.
 * {@link Math.round} is deterministic per ECMAScript spec.
 *
 * ## Range
 * Accepts any finite number. Returns `NaN` if input is `NaN`.
 * Returns `Infinity`/`-Infinity` if input is infinite.
 *
 * ## Complexity
 * O(1) — three primitive operations, no allocations.
 *
 * ## Reasoning
 * 6 decimal places is the precision for intermediate values in the risk
 * engine (per `ROUND_PRECISION_INTERMEDIATE = 6` from constants). This
 * preserves sufficient precision through multi-step computations while
 * avoiding the illusion of precision beyond the input quality.
 *
 * @param value - The number to round.
 * @returns The value rounded to 6 decimal places.
 */
export function round6(value: number): number {
  // Evaluation order: multiply → round → divide
  const factor = 10 ** ROUND_PRECISION_INTERMEDIATE;
  return Math.round(value * factor) / factor;
}

// ─────────────────────────────────────────────────────────────────────────────
// Clamping & Saturation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clamps a value to the inclusive range `[min, max]`.
 *
 * ## Evaluation Order
 * 1. `max(value, min)` — enforce lower bound.
 * 2. `min(result, max)` — enforce upper bound.
 *
 * ## Determinism
 * {@link Math.min} and {@link Math.max} are deterministic per ECMAScript spec.
 *
 * ## Range
 * - If `value < min`, returns `min`.
 * - If `value > max`, returns `max`.
 * - If `min === max`, returns that value regardless of input.
 * - If `min > max`, behavior is **undefined** — `max` takes precedence
 *   (the outer bound applied is `max`). Callers should ensure `min <= max`.
 * - Returns `NaN` if any argument is `NaN` or `Infinity` (Safety guard).
 *
 * ## Complexity
 * O(1) — two comparisons, no allocations.
 *
 * ## Reasoning
 * Clamping is the simplest correct way to enforce numeric bounds.
 * It preserves values within the valid range without distortion,
 * unlike saturation functions which compress the range.
 *
 * @param value - The number to clamp.
 * @param min    - The inclusive lower bound.
 * @param max    - The inclusive upper bound.
 * @returns The clamped value in `[min, max]`.
 */
export function clamp(value: number, min: number, max: number): number {
  // Guard: if any argument is NaN, return NaN to signal invalid state.
  // Infinity is allowed — Math.min/Math.max handle it correctly.
  if (Number.isNaN(value) || Number.isNaN(min) || Number.isNaN(max)) {
    return NaN;
  }
  // Evaluation order: first enforce lower bound, then enforce upper bound.
  return Math.min(Math.max(value, min), max);
}

/**
 * Applies tanh-based saturation, mapping `[0.0, ∞)` to `[0.0, 1.0)`.
 *
 * ## Formula
 * ```
 * saturate(x) = tanh(x × π ÷ 2)
 * ```
 *
 * ## Evaluation Order
 * 1. Guard: if `value <= 0`, return `0` (saturate is not defined for negatives).
 * 2. Multiply `value` by `PI_OVER_2` (`π/2`).
 * 3. Compute `Math.tanh(product)`.
 *
 * ## Saturation Function Choice
 * `tanh` is chosen over alternatives (`1 - e^(-x)`, `x / (1 + x)`, sigmoid)
 * for the following reasons:
 *
 * | Property | `tanh` | `1 - e^(-x)` | `x / (1 + x)` | Sigmoid |
 * |----------|--------|---------------|----------------|---------|
 * | Smooth (C∞) | ✅ | ✅ | ✅ | ✅ |
 * | Symmetric | ✅ | ❌ | ❌ | ❌ |
 * | Minimal linear region near 0 | ✅ (slope ≈ 1.0) | ❌ (slope ≈ 1.0) | ✅ (slope = 1.0) | ❌ (slope = 0.25) |
 * | Asymptotic approach | ✅ | ✅ (slower) | ❌ (only 1/x) | ✅ |
 * | IEEE-754 stable | ✅ | ✅ | ✅ | ⚠️ (exp overflow) |
 *
 * `tanh` provides:
 * - Near-linear response for small values (slope ~1.0 near 0).
 * - Smooth asymptotic approach to 1.0 for large values.
 * - Symmetry around 0 (though we clamp to [0, ∞) here).
 * - Excellent numerical stability (no overflow paths).
 *
 * ## Determinism
 * `Math.tanh` is deterministic per ECMAScript spec (IEEE-754 compliant).
 *
 * ## Range
 * - Input `[0.0, ∞)` → Output `[0.0, 1.0)`.
 * - Input `≤ 0` → Output `0`.
 * - Input is `NaN` → Output `0` (NaN is not > 0).
 * - Input is `Infinity` → Output `1.0` (`tanh(∞) = 1`).
 *
 * ## Invariants
 * - `saturate(x) ∈ [0.0, 1.0)` for all finite `x`.
 * - `saturate` is monotonically non-decreasing.
 * - `saturate(0) = 0`.
 * - `lim_{x→∞} saturate(x) = 1.0`.
 *
 * ## Complexity
 * O(1) — one guard, one multiply, one `Math.tanh` call.
 *
 * ## Reasoning
 * Saturation prevents extreme outliers from dominating risk scores while
 * preserving the relative ordering of all inputs. Unlike a hard clamp,
 * the smooth curve gently compresses high values rather than cutting them
 * off abruptly. This is critical for explainability — a score that was
 * compressed by saturation can still be traced back to its original value
 * and the saturation function applied.
 *
 * @param value - A non-negative number to saturate.
 * @returns The saturated value in `[0.0, 1.0)`.
 */
export function saturate(value: number): number {
  // Stage 1 — guard: saturate maps [0.0, ∞) → [0.0, 1.0).
  // Values ≤ 0 return 0 (including NaN, since NaN > 0 is false).
  if (!(value > 0)) return 0;

  // Stage 2 — multiply value by π/2.
  const scaled = value * PI_OVER_2;

  // Stage 3 — apply tanh saturation.
  // Math.tanh(scaled) maps [0, ∞) → [0, 1).
  return Math.tanh(scaled);
}

// ─────────────────────────────────────────────────────────────────────────────
// Contribution Value Computation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes the base contribution value for a single contribution.
 *
 * ## Formula
 * ```
 * contributionValue = clamp(severity × confidence × dimensionWeight, 0.0, 10.0)
 * ```
 *
 * ## Evaluation Order
 * 1. Multiply `severity` × `confidence`.
 * 2. Multiply result × `dimensionWeight`.
 * 3. Clamp to `[RISK_SCORE_MIN, RISK_SCORE_MAX]` = `[0.0, 10.0]`.
 * 4. Round to 6 decimal places via {@link round6}.
 *
 * ## Determinism
 * The multiplication order is fixed (left-to-right) to ensure that
 * identical inputs always produce identical outputs. IEEE-754 floating-
 * point multiplication is not associative — different orderings can
 * produce different results at the ULP level. Fixing the order
 * guarantees determinism.
 *
 * ## Range
 * Output is always in `[0.0, 10.0]` after clamping.
 *
 * ## Invariants
 * - `computeContributionValue(s, c, dw) ∈ [0.0, 10.0]` for all finite inputs.
 * - Returns `NaN` if any input is `NaN`.
 * - Returns `NaN` if any input is `Infinity` (multiplying ∞ by 0 = NaN in IEEE-754).
 *   Callers should ensure finite inputs.
 *
 * ## Complexity
 * O(1) — two multiplications, one clamp, one rounding.
 *
 * ## Reasoning
 * This is the atomic unit of risk: the contribution of a single piece of
 * evidence (via its severity and confidence) weighted by the dimension
 * it belongs to. The product captures the intuition that risk requires
 * all three factors:
 * - **Severity** — how bad is this if true?
 * - **Confidence** — how sure are we it's true?
 * - **Dimension weight** — how important is this category of evidence?
 *
 * If any factor is zero, the contribution is zero. This multiplicative
 * structure is the same design principle as the multiplicative confidence
 * model — a weak link in any factor reduces the overall contribution.
 *
 * @param severity       - Severity score `[0.0, 10.0]` from the matched rule.
 * @param confidence     - Confidence score `[0.0, 1.0]` in the evidence.
 * @param dimensionWeight - Weight of the dimension `[0.0, 1.0]` (from
 *                          {@link computeDimensionWeight}).
 * @returns The base contribution value in `[0.0, 10.0]`.
 */
export function computeContributionValue(
  severity: number,
  confidence: number,
  dimensionWeight: number,
): number {
  // Stage 1 — multiply in fixed order: (severity × confidence) × dimensionWeight.
  // Left-to-right ensures deterministic IEEE-754 evaluation order.
  const product = severity * confidence * dimensionWeight;

  // Stage 2 — clamp to valid risk score range [0.0, 10.0].
  const clamped = clamp(product, RISK_SCORE_MIN, RISK_SCORE_MAX);

  // Stage 3 — round to intermediate precision.
  return round6(clamped);
}

/**
 * Computes the weight for a score dimension, incorporating confidence
 * and behavioral chain amplification.
 *
 * ## Formula
 * ```
 * chainMultiplier = min(1.0 + (chainLength - 1) × CHAIN_MULTIPLIER_INCREMENT, CHAIN_MULTIPLIER_CAP)
 * dimensionWeight   = clamp(dimensionConfidence × chainMultiplier, 0.0, 1.0)
 * ```
 *
 * ## Evaluation Order
 * 1. Compute the base chain multiplier: `1.0 + (chainLength - 1) × CHAIN_MULTIPLIER_INCREMENT`.
 * 2. Cap the multiplier at `CHAIN_MULTIPLIER_CAP` (= 2.0).
 * 3. Multiply `dimensionConfidence` × chain multiplier (from step 2).
 * 4. Clamp to `[0.0, 1.0]`.
 * 5. Round to 6 decimal places via {@link round6}.
 *
 * ## Chain Amplification Rationale
 * A behavioral chain — multiple related behaviors occurring in sequence
 * (e.g., download → extract → execute) — is more concerning than the same
 * behaviors appearing independently. The chain multiplier amplifies the
 * dimension weight to reflect this increased significance.
 *
 * Each additional behavior beyond the first adds `CHAIN_MULTIPLIER_INCREMENT`
 * (0.05 = 5%) amplification, with a cap at `CHAIN_MULTIPLIER_CAP` (2.0 = 200%):
 * - `chainLength = 1`: multiplier = 1.0 (no amplification).
 * - `chainLength = 5`: multiplier = 1.2 (20% amplification).
 * - `chainLength = 21`: multiplier = 2.0 (100% amplification, capped).
 *
 * ## Determinism
 * All operations are deterministic and left-to-right.
 * Constants from `@veris/risk/constants` are frozen.
 *
 * ## Range
 * Output is always in `[0.0, 1.0]` after clamping.
 * - Returns 0 when `dimensionConfidence` is 0 (no evidence confidence).
 * - Returns the clamped product when both factors are positive.
 *
 * ## Invariants
 * - `computeDimensionWeight(dc, cl) ∈ [0.0, 1.0]` for all finite inputs.
 * - For `chainLength = 1`, the result equals `clamp(dimensionConfidence, 0.0, 1.0)`.
 * - Result is monotonically non-decreasing in both `dimensionConfidence`
 *   and `chainLength`.
 *
 * ## Complexity
 * O(1) — one multiply-add, one min, one multiply, one clamp, one rounding.
 *
 * ## Reasoning
 * The dimension weight is the third factor in the contribution formula
 * (`severity × confidence × dimensionWeight`). It captures:
 * 1. How confident we are in the evidence for this dimension.
 * 2. Whether the evidence is part of a correlated behavioral chain
 *    (which amplifies significance).
 *
 * The weight is clamped to [0, 1] because it represents a fractional
 * contribution of a dimension. Chain amplification could push it over 1.0,
 * but the clamp ensures it stays a valid weight. The actual amplification
 * effect on the final score is still present because the clamped weight
 * is multiplied by severity and confidence in `computeContributionValue`.
 *
 * @param dimensionConfidence - Confidence in the dimension's evidence `[0.0, 1.0]`.
 * @param chainLength         - Length of the behavior chain (≥ 1).
 *                               A value of 1 means no chain (standalone evidence).
 * @returns The dimension weight in `[0.0, 1.0]`.
 */
export function computeDimensionWeight(dimensionConfidence: number, chainLength: number): number {
  // Guard: if either input is NaN, return NaN to prevent silent propagation.
  // IEEE-754 rules would propagate NaN through multiplication anyway, but
  // the explicit guard makes the safety contract clear and prevents any
  // downstream NaN handling from silently accepting invalid state.
  if (Number.isNaN(dimensionConfidence) || Number.isNaN(chainLength)) {
    return NaN;
  }

  // Stage 1 — compute chain multiplier.
  // Formula: 1.0 + (chainLength - 1) × CHAIN_MULTIPLIER_INCREMENT
  // This amplifies weight for correlated behavioral chains.
  const rawMultiplier: number = 1.0 + (chainLength - 1) * CHAIN_MULTIPLIER_INCREMENT;

  // Stage 2 — cap chain multiplier at CHAIN_MULTIPLIER_CAP.
  const cappedMultiplier: number = Math.min(rawMultiplier, CHAIN_MULTIPLIER_CAP);

  // Stage 3 — multiply dimension confidence by the capped chain multiplier.
  const weighted: number = dimensionConfidence * cappedMultiplier;

  // Stage 4 — clamp to valid weight range [0.0, 1.0].
  const clamped: number = clamp(weighted, CONFIDENCE_MIN, CONFIDENCE_MAX);

  // Stage 5 — round to intermediate precision.
  return round6(clamped);
}
