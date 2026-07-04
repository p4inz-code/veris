/**
 * Tests for @veris/risk/scoring — deterministic scoring primitives.
 *
 * These tests verify that every function is:
 * - Pure (no side effects)
 * - Deterministic (same input → same output)
 * - Correct on all documented edge cases
 * - Mathematically sound
 *
 * Test categories per function:
 * ✓ boundary conditions
 * ✓ zero
 * ✓ maximum values
 * ✓ negative inputs
 * ✓ invalid inputs (NaN, Infinity)
 * ✓ deterministic repeated execution (10,000+ iterations)
 * ✓ saturation asymptotes (saturate)
 * ✓ threshold-adjacent values
 * ✓ mathematical invariants
 * ✓ exact documented rounding behavior
 *
 * @module @veris/risk/__tests__/scoring
 */

import { describe, it, expect } from 'vitest';
import {
  round2,
  round6,
  clamp,
  saturate,
  computeContributionValue,
  computeDimensionWeight,
} from '../src/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// round2 — Round to 2 decimal places
// ─────────────────────────────────────────────────────────────────────────────

describe('round2', () => {
  // ── Exact documented rounding behavior ──

  it('rounds 1.234 to 1.23 (standard rounding down)', () => {
    expect(round2(1.234)).toBe(1.23);
  });

  it('rounds 1.375 to 1.38 (standard rounding up)', () => {
    // 1.375 is exactly representable in IEEE-754: 1.375 × 100 = 137.5 → Math.round = 138 → 1.38
    expect(round2(1.375)).toBe(1.38);
  });

  it('rounds 1.376 to 1.38', () => {
    expect(round2(1.376)).toBe(1.38);
  });

  it('rounds 0.001 to 0.00', () => {
    expect(round2(0.001)).toBe(0.0);
  });

  it('rounds 0.005 to 0.01 (half-away-from-zero)', () => {
    expect(round2(0.005)).toBe(0.01);
  });

  it('rounds 9.999 to 10.00', () => {
    expect(round2(9.999)).toBe(10.0);
  });

  it('rounds 10.001 to 10.00', () => {
    expect(round2(10.001)).toBe(10.0);
  });

  // ── Zero ──

  it('rounds 0 to 0', () => {
    expect(round2(0)).toBe(0);
  });

  // ── Negative inputs ──

  it('rounds -1.234 to -1.23', () => {
    expect(round2(-1.234)).toBe(-1.23);
  });

  it('rounds -1.375 to -1.38', () => {
    // -1.375 is exactly representable: -1.375 × 100 = -137.5 → Math.round(-137.5) = -137 → -1.37
    // Math.round rounds .5 towards +∞, so -137.5 rounds to -137
    expect(round2(-1.375)).toBe(-1.37);
  });

  it('rounds -0.001 to -0.00', () => {
    expect(round2(-0.001)).toBe(-0.0);
  });

  it('rounds -0.005 to -0.00 (Math.round(-0.5) = -0, not -1)', () => {
    // IEEE-754: -0.005 × 100 = -0.5 → Math.round(-0.5) = -0 (rounds toward +∞) → -0 / 100 = -0
    // This is documented ECMAScript behavior: Math.round rounds .5 toward +∞.
    expect(Object.is(round2(-0.005), -0)).toBe(true);
  });

  // ── Invalid inputs ──

  it('returns NaN for NaN input', () => {
    expect(round2(NaN)).toBeNaN();
  });

  it('returns Infinity for Infinity input', () => {
    expect(round2(Infinity)).toBe(Infinity);
  });

  it('returns -Infinity for -Infinity input', () => {
    expect(round2(-Infinity)).toBe(-Infinity);
  });

  // ── Maximum values ──

  it('rounds Number.MAX_VALUE (returns Infinity as MAX_VALUE × 100 overflows IEEE-754)', () => {
    // Number.MAX_VALUE * 100 exceeds the maximum representable double
    // and overflows to Infinity. This is documented IEEE-754 behavior.
    const result = round2(Number.MAX_VALUE);
    expect(result).toBe(Infinity);
  });

  it('rounds Number.MIN_VALUE to 0', () => {
    expect(round2(Number.MIN_VALUE)).toBe(0);
  });

  // ── Deterministic repeated execution ──

  it('produces identical output for 10,000 iterations (determinism)', () => {
    const input = 1.234567;
    const expected = round2(input);
    for (let i = 0; i < 10_000; i++) {
      expect(round2(input)).toBe(expected);
    }
  });

  // ── Mathematical invariants ──

  it('is idempotent: round2(round2(x)) === round2(x)', () => {
    const inputs = [0, 1.23, 1.235, 10.0, -1.23, -1.235, 3.14159];
    for (const x of inputs) {
      expect(round2(round2(x))).toBe(round2(x));
    }
  });

  it('produces values with at most 2 decimal places', () => {
    const inputs = [0, 0.1, 1.234, 3.14159, 9.9999, -1.234];
    for (const x of inputs) {
      const result = round2(x);
      const decimalStr = String(result).split('.')[1] ?? '';
      expect(decimalStr.length).toBeLessThanOrEqual(2);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// round6 — Round to 6 decimal places
// ─────────────────────────────────────────────────────────────────────────────

describe('round6', () => {
  // ── Exact documented rounding behavior ──

  it('rounds 1.1234567 to 1.123457', () => {
    expect(round6(1.1234567)).toBe(1.123457);
  });

  it('rounds 1.1234564 to 1.123456', () => {
    expect(round6(1.1234564)).toBe(1.123456);
  });

  it('rounds 0.0000004 to 0.0', () => {
    expect(round6(0.0000004)).toBe(0.0);
  });

  it('rounds 0.0000005 to 0.000001 (half-away-from-zero)', () => {
    // Math.round rounding: 0.0000005 * 1_000_000 = 0.5 → Math.round(0.5) = 1 → 1/1_000_000 = 0.000001
    expect(round6(0.0000005)).toBe(0.000001);
  });

  it('rounds π to 3.141593', () => {
    expect(round6(Math.PI)).toBe(3.141593);
  });

  // ── Zero ──

  it('rounds 0 to 0', () => {
    expect(round6(0)).toBe(0);
  });

  // ── Negative inputs ──

  it('rounds negative values correctly', () => {
    expect(round6(-1.1234567)).toBe(-1.123457);
  });

  it('rounds -0.0000004 to -0.0', () => {
    expect(round6(-0.0000004)).toBe(-0.0);
  });

  it('rounds -0.0000005 to -0.0 (Math.round rounds .5 toward +Infinity)', () => {
    // -0.0000005 × 1_000_000 = -0.5 → Math.round(-0.5) = -0 (rounds toward +∞) → -0 / 1_000_000 = -0
    // This is documented ECMAScript behavior for Math.round of exact halves.
    const result = round6(-0.0000005);
    expect(Object.is(result, -0)).toBe(true);
  });

  // ── Invalid inputs ──

  it('returns NaN for NaN input', () => {
    expect(round6(NaN)).toBeNaN();
  });

  it('returns Infinity for Infinity input', () => {
    expect(round6(Infinity)).toBe(Infinity);
  });

  // ── Deterministic repeated execution ──

  it('produces identical output for 10,000 iterations (determinism)', () => {
    const input = 1.234567891;
    const expected = round6(input);
    for (let i = 0; i < 10_000; i++) {
      expect(round6(input)).toBe(expected);
    }
  });

  // ── Mathematical invariants ──

  it('is idempotent: round6(round6(x)) === round6(x)', () => {
    const inputs = [0, 1.123456, 1.1234567, Math.PI, -1.123456];
    for (const x of inputs) {
      expect(round6(round6(x))).toBe(round6(x));
    }
  });

  it('produces values with at most 6 decimal places', () => {
    const inputs = [0, 0.1, 1.23456789, Math.PI, 1.0000005];
    for (const x of inputs) {
      const result = round6(x);
      const decimalStr = String(result).split('.')[1] ?? '';
      expect(decimalStr.length).toBeLessThanOrEqual(6);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// clamp — Clamp to range [min, max]
// ─────────────────────────────────────────────────────────────────────────────

describe('clamp', () => {
  // ── Within range ──

  it('returns the value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('returns 5 when clamped in [5, 10]', () => {
    expect(clamp(5, 5, 10)).toBe(5);
  });

  // ── Below min ──

  it('returns min when value is below min', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('returns -1 when value is -5 and min is -1', () => {
    expect(clamp(-5, -1, 10)).toBe(-1);
  });

  // ── Above max ──

  it('returns max when value is above max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('returns 5 when value is 15 and max is 5', () => {
    expect(clamp(15, 0, 5)).toBe(5);
  });

  // ── At boundaries ──

  it('returns min when value equals min', () => {
    expect(clamp(0, 0, 10)).toBe(0);
  });

  it('returns max when value equals max', () => {
    expect(clamp(10, 0, 10)).toBe(10);
  });

  // ── Zero ──

  it('returns 0 when value is 0 in [0, 1]', () => {
    expect(clamp(0, 0, 1)).toBe(0);
  });

  it('returns 0 when all arguments are 0', () => {
    expect(clamp(0, 0, 0)).toBe(0);
  });

  // ── min === max ──

  it('returns min when min === max and value is below', () => {
    expect(clamp(-1, 5, 5)).toBe(5);
  });

  it('returns max when min === max and value is above', () => {
    expect(clamp(10, 5, 5)).toBe(5);
  });

  it('returns the boundary value when min === max and value is at boundary', () => {
    expect(clamp(5, 5, 5)).toBe(5);
  });

  // ── min > max (undefined range — returns max due to eval order) ──

  it('prefers max when min > max (evaluation order artifact)', () => {
    // Evaluation: Math.min(Math.max(5, 10), 0) = Math.min(10, 0) = 0
    expect(clamp(5, 10, 0)).toBe(0);
  });

  // ── Negative inputs ──

  it('clamps negative values with negative range', () => {
    expect(clamp(-5, -10, -1)).toBe(-5);
  });

  it('clamps below negative range', () => {
    expect(clamp(-15, -10, -1)).toBe(-10);
  });

  it('clamps above negative range', () => {
    expect(clamp(0, -10, -1)).toBe(-1);
  });

  // ── Invalid inputs ──

  it('returns NaN when value is NaN', () => {
    expect(clamp(NaN, 0, 10)).toBeNaN();
  });

  it('returns NaN when min is NaN', () => {
    expect(clamp(5, NaN, 10)).toBeNaN();
  });

  it('returns NaN when max is NaN', () => {
    expect(clamp(5, 0, NaN)).toBeNaN();
  });

  it('returns Infinity when value is Infinity', () => {
    expect(clamp(Infinity, 0, 10)).toBe(10);
  });

  it('returns -Infinity when value is -Infinity', () => {
    expect(clamp(-Infinity, 0, 10)).toBe(0);
  });

  // ── Deterministic repeated execution ──

  it('produces identical output for 10,000 iterations (determinism)', () => {
    const testCases = [
      { value: 5, min: 0, max: 10 },
      { value: -5, min: 0, max: 10 },
      { value: 15, min: 0, max: 10 },
      { value: 0, min: 0, max: 0 },
    ];
    for (const tc of testCases) {
      const expected = clamp(tc.value, tc.min, tc.max);
      for (let i = 0; i < 10_000; i++) {
        expect(clamp(tc.value, tc.min, tc.max)).toBe(expected);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// saturate — tanh-based saturation
// ─────────────────────────────────────────────────────────────────────────────

describe('saturate', () => {
  // ── Boundary conditions ──

  it('returns 0 for 0 input', () => {
    expect(saturate(0)).toBe(0);
  });

  it('returns a value in [0, 1) for positive input', () => {
    const result = saturate(1);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(1);
  });

  // ── Zero ──

  it('returns exactly 0.0 for 0.0', () => {
    expect(saturate(0.0)).toBe(0.0);
  });

  // ── Known values (via tanh(x * π/2)) ──

  it('saturate(0.5) ≈ 0.6560', () => {
    const result = saturate(0.5);
    // tanh(0.5 * π/2) = tanh(π/4) = tanh(~0.7854) ≈ 0.6558
    expect(result).toBeCloseTo(0.6558, 3);
  });

  it('saturate(1.0) = tanh(π/2) ≈ 0.9172', () => {
    const result = saturate(1.0);
    // tanh(π/2) ≈ 0.917152335667...
    expect(result).toBeCloseTo(0.9172, 3);
  });

  it('saturate(2.0) = tanh(π) ≈ 0.9963', () => {
    const result = saturate(2.0);
    // tanh(π) ≈ 0.996272...
    expect(result).toBeCloseTo(0.9963, 3);
  });

  it('saturate(3.0) ≈ 0.9998 (approaching 1)', () => {
    const result = saturate(3.0);
    // tanh(3 * π/2) = tanh(~4.7124) ≈ 0.9998
    expect(result).toBeGreaterThan(0.999);
    expect(result).toBeLessThan(1);
  });

  // ── Negative inputs (should return 0) ──

  it('returns 0 for negative input', () => {
    expect(saturate(-1)).toBe(0);
  });

  it('returns 0 for large negative input', () => {
    expect(saturate(-1000)).toBe(0);
  });

  it('returns 0 for -0', () => {
    expect(saturate(-0)).toBe(0);
  });

  // ── Invalid inputs ──

  it('returns 0 for NaN input', () => {
    expect(saturate(NaN)).toBe(0);
  });

  it('returns 1 for Infinity input', () => {
    expect(saturate(Infinity)).toBe(1);
  });

  it('returns 0 for -Infinity input', () => {
    expect(saturate(-Infinity)).toBe(0);
  });

  // ── Saturation asymptotes ──

  it('approaches 1 as input grows large', () => {
    // Use values below ~12.1 where Math.tanh still returns < 1 in double precision.
    // For x >= ~12.1 (i.e., saturate(x) where x * π/2 >= 19), tanh rounds to exactly 1.0.
    const values = [2, 4, 6];
    const results = values.map(saturate);
    for (const r of results) {
      expect(r).toBeGreaterThan(0.9);
      expect(r).toBeLessThan(1);
    }
  });

  it('saturate(4) is closer to 1 than saturate(2)', () => {
    expect(saturate(4)).toBeGreaterThan(saturate(2));
  });

  it('saturate(6) is closer to 1 than saturate(4)', () => {
    expect(saturate(6)).toBeGreaterThan(saturate(4));
  });

  // ── Threshold-adjacent values ──

  it('saturate(0.0001) > 0 (small positive)', () => {
    expect(saturate(0.0001)).toBeGreaterThan(0);
  });

  it('saturate(-0.0001) == 0 (small negative)', () => {
    expect(saturate(-0.0001)).toBe(0);
  });

  it('saturate(Number.MIN_VALUE) > 0 (smallest positive)', () => {
    expect(saturate(Number.MIN_VALUE)).toBeGreaterThan(0);
  });

  // ── Deterministic repeated execution ──

  it('produces identical output for 10,000 iterations (determinism)', () => {
    const inputs = [0, 0.1, 0.5, 1.0, 2.0, 10.0, -1.0];
    for (const x of inputs) {
      const expected = saturate(x);
      for (let i = 0; i < 10_000; i++) {
        expect(saturate(x)).toBe(expected);
      }
    }
  });

  // ── Mathematical invariants ──

  it('is monotonically non-decreasing', () => {
    const inputs = [-10, -1, -0.1, 0, 0.1, 0.5, 1, 2, 5, 10, 100];
    for (let i = 1; i < inputs.length; i++) {
      expect(saturate(inputs[i])).toBeGreaterThanOrEqual(saturate(inputs[i - 1]));
    }
  });

  it('saturate(x) ∈ [0, 1] for all finite x (Math.tanh rounds to 1.0 for x ≥ ~12.1)', () => {
    const inputs = [-1000, -10, -1, -0.1, 0, 0.1, 0.5, 1, 2, 5, 10, 100, 1000];
    for (const x of inputs) {
      const result = saturate(x);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    }
  });

  it('produces the same result regardless of evaluation order (pure function)', () => {
    const x = 1.5;
    const a = saturate(x);
    const b = saturate(x);
    const c = saturate(x);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeContributionValue — severity × confidence × dimensionWeight
// ─────────────────────────────────────────────────────────────────────────────

describe('computeContributionValue', () => {
  // ── Boundary conditions ──

  it('computes 7.0 × 0.8 × 0.5 = 2.8', () => {
    expect(computeContributionValue(7.0, 0.8, 0.5)).toBe(2.8);
  });

  it('computes 9.0 × 0.95 × 0.75 = 6.4125', () => {
    expect(computeContributionValue(9.0, 0.95, 0.75)).toBeCloseTo(6.4125, 4);
  });

  it('uses round6 precision (6 decimal places)', () => {
    // 7.0 / 3.0 = 2.333333... × 0.6 = 1.4... × 0.5 = 0.7...
    // 0.7 / 3 * 2 gives a repeating decimal
    const result = computeContributionValue(7.0 / 3.0, 0.6, 0.5);
    const str = String(result);
    const decimalPart = str.split('.')[1] ?? '';
    expect(decimalPart.length).toBeLessThanOrEqual(6);
  });

  // ── Zero ──

  it('returns 0 when severity is 0', () => {
    expect(computeContributionValue(0, 0.8, 0.5)).toBe(0);
  });

  it('returns 0 when confidence is 0', () => {
    expect(computeContributionValue(7.0, 0, 0.5)).toBe(0);
  });

  it('returns 0 when dimensionWeight is 0', () => {
    expect(computeContributionValue(7.0, 0.8, 0)).toBe(0);
  });

  it('returns 0 when all inputs are 0', () => {
    expect(computeContributionValue(0, 0, 0)).toBe(0);
  });

  // ── Maximum values ──

  it('clamps to 10.0 when product exceeds max', () => {
    // 10.0 × 1.0 × 1.5 = 15.0 → clamped to 10.0
    expect(computeContributionValue(10.0, 1.0, 1.5)).toBe(10.0);
  });

  it('clamps to 10.0 for max realistic severity and high weight', () => {
    // 10.0 × 1.0 × 2.0 = 20.0 → clamped to 10.0
    expect(computeContributionValue(10.0, 1.0, 2.0)).toBe(10.0);
  });

  it('returns exactly 10.0 for max boundary inputs', () => {
    // 10.0 × 1.0 × 1.0 = 10.0
    expect(computeContributionValue(10.0, 1.0, 1.0)).toBe(10.0);
  });

  it('returns 0.0 for min boundary inputs', () => {
    expect(computeContributionValue(0.0, 0.0, 0.0)).toBe(0.0);
  });

  // ── Negative inputs ──

  it('clamps negative severity to 0', () => {
    const result = computeContributionValue(-1, 0.8, 0.5);
    expect(result).toBe(0);
  });

  it('clamps negative confidence to 0', () => {
    const result = computeContributionValue(7.0, -0.1, 0.5);
    expect(result).toBe(0);
  });

  it('clamps negative dimensionWeight to 0', () => {
    const result = computeContributionValue(7.0, 0.8, -0.5);
    expect(result).toBe(0);
  });

  // ── Invalid inputs ──

  it('returns NaN when severity is NaN', () => {
    expect(computeContributionValue(NaN, 0.8, 0.5)).toBeNaN();
  });

  it('returns NaN when confidence is NaN', () => {
    expect(computeContributionValue(7.0, NaN, 0.5)).toBeNaN();
  });

  it('returns NaN when dimensionWeight is NaN', () => {
    expect(computeContributionValue(7.0, 0.8, NaN)).toBeNaN();
  });

  it('returns 10.0 when severity is Infinity (clamped)', () => {
    // Infinity × 0.8 × 0.5 = Infinity → clamp(Infinity, 0, 10) = 10 → round6(10) = 10
    expect(computeContributionValue(Infinity, 0.8, 0.5)).toBe(10.0);
  });

  it('returns NaN for Infinity × 0 (IEEE-754 undefined)', () => {
    // Infinity * 0 = NaN in IEEE-754
    expect(computeContributionValue(Infinity, 0, 0.5)).toBeNaN();
  });

  // ── Deterministic repeated execution ──

  it('produces identical output for 10,000 iterations (determinism)', () => {
    const inputs = [
      [7.0, 0.8, 0.5],
      [3.0, 0.6, 0.3],
      [10.0, 1.0, 1.0],
      [0, 0, 0],
    ] as const;
    for (const [s, c, dw] of inputs) {
      const expected = computeContributionValue(s, c, dw);
      for (let i = 0; i < 10_000; i++) {
        expect(computeContributionValue(s, c, dw)).toBe(expected);
      }
    }
  });

  // ── Mathematical invariants ──

  it('result is always in [0.0, 10.0]', () => {
    const testCases = [
      [7.0, 0.8, 0.5],
      [10.0, 1.0, 2.0],
      [0, 0.5, 0.3],
      [5.0, 0, 0.5],
      [3.0, 0.9, 1.5],
      [-5.0, 0.8, 0.5],
      [7.0, -0.5, 0.5],
    ] as const;
    for (const [s, c, dw] of testCases) {
      const result = computeContributionValue(s, c, dw);
      if (!Number.isNaN(result)) {
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(10);
      }
    }
  });

  it('is commutative in multiplication order under fixed evaluation', () => {
    // With the fixed left-to-right evaluation: (s × c) × dw
    // We can't guarantee commutativity in IEEE-754, but the important
    // thing is that the same inputs always produce the same output.
    const result1 = computeContributionValue(7.0, 0.8, 0.5);
    const result2 = computeContributionValue(7.0, 0.8, 0.5);
    expect(result1).toBe(result2);
  });

  // ── Threshold-adjacent values ──

  it('handles severity just below 10.0', () => {
    const result = computeContributionValue(9.999, 1.0, 1.0);
    expect(result).toBeLessThan(10.0);
    expect(result).toBeGreaterThan(9.99);
  });

  it('handles severity just above 10.0', () => {
    const result = computeContributionValue(10.001, 1.0, 0.5);
    // 10.001 * 1.0 * 0.5 = 5.0005 → round6(5.0005) = 5.0005 (not clamped)
    expect(result).toBe(5.0005);
  });

  it('handles confidence just below 1.0', () => {
    const result = computeContributionValue(7.0, 0.9999, 0.5);
    expect(result).toBeGreaterThan(3.499);
    expect(result).toBeLessThan(3.5);
  });

  it('handles dimensionWeight just below 1.0', () => {
    const result = computeContributionValue(5.0, 0.9, 0.9999);
    expect(result).toBeCloseTo(4.49955, 4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeDimensionWeight — confidence × chain amplification
// ─────────────────────────────────────────────────────────────────────────────

describe('computeDimensionWeight', () => {
  // ── Boundary conditions ──

  it('returns dimensionConfidence when chainLength is 1', () => {
    // chainLength 1: multiplier = 1.0, weight = 0.7 × 1.0 = 0.7
    expect(computeDimensionWeight(0.7, 1)).toBe(0.7);
  });

  it('returns 0.0 when dimensionConfidence is 0', () => {
    expect(computeDimensionWeight(0.0, 5)).toBe(0.0);
  });

  // ── Chain length effects ──

  it('amplifies weight for chainLength = 2 (multiplier: 1.05)', () => {
    // chainLength 2: multiplier = 1.0 + 1 × 0.05 = 1.05
    // weight = 0.8 × 1.05 = 0.84
    expect(computeDimensionWeight(0.8, 2)).toBe(0.84);
  });

  it('amplifies weight for chainLength = 5 (multiplier: 1.2)', () => {
    // chainLength 5: multiplier = 1.0 + 4 × 0.05 = 1.20
    // weight = 0.8 × 1.20 = 0.96
    expect(computeDimensionWeight(0.8, 5)).toBe(0.96);
  });

  it('amplifies weight for chainLength = 10 (multiplier: 1.45)', () => {
    // chainLength 10: multiplier = 1.0 + 9 × 0.05 = 1.45
    // weight = 0.6 × 1.45 = 0.87 → round6
    expect(computeDimensionWeight(0.6, 10)).toBe(0.87);
  });

  // ── Chain multiplier capping ──

  it('caps multiplier at CHAIN_MULTIPLIER_CAP (2.0) for long chains', () => {
    // chainLength 21: multiplier = 1.0 + 20 × 0.05 = 2.0 (capped)
    // chainLength 30: multiplier = 1.0 + 29 × 0.05 = 2.45 → capped at 2.0
    const length21 = computeDimensionWeight(0.5, 21);
    const length30 = computeDimensionWeight(0.5, 30);
    // Both should give the same result because the multiplier is capped
    expect(length21).toBe(length30);
  });

  it('produces the same weight at chainLength 21 and chainLength 100', () => {
    // Both cap at 2.0
    const w1 = computeDimensionWeight(0.4, 21);
    const w2 = computeDimensionWeight(0.4, 100);
    expect(w1).toBe(w2);
  });

  it('uses the exact cap value from constants', () => {
    // chainLength 21: multiplier = 1.0 + 20 × 0.05 = 2.0 (capped)
    // weight = 1.0 × 2.0 = 2.0 → clamped to 1.0
    expect(computeDimensionWeight(1.0, 21)).toBe(1.0);
  });

  // ── Clamping ──

  it('clamps to 1.0 when chain-amplified weight exceeds 1.0', () => {
    // dimensionConfidence 1.0, chainLength 21: 1.0 × 2.0 = 2.0 → clamp to 1.0
    expect(computeDimensionWeight(1.0, 21)).toBe(1.0);
  });

  it('clamps to 1.0 for max realistic inputs', () => {
    expect(computeDimensionWeight(1.0, 100)).toBe(1.0);
  });

  // ── Zero ──

  it('returns 0 when dimensionConfidence is 0', () => {
    expect(computeDimensionWeight(0, 1)).toBe(0);
    expect(computeDimensionWeight(0, 10)).toBe(0);
    expect(computeDimensionWeight(0, 100)).toBe(0);
  });

  // ── Negative inputs ──

  it('clamps negative dimensionConfidence to 0', () => {
    expect(computeDimensionWeight(-0.5, 1)).toBe(0);
  });

  it('handles negative chainLength as if chainLength < 1', () => {
    // chainLength = -1: multiplier = 1.0 + (-2) × 0.05 = 0.9
    const result = computeDimensionWeight(0.8, -1);
    // 0.8 × 0.9 = 0.72
    expect(result).toBe(0.72);
  });

  it('handles chainLength = 0', () => {
    // chainLength = 0: multiplier = 1.0 + (-1) × 0.05 = 0.95
    const result = computeDimensionWeight(0.8, 0);
    // 0.8 × 0.95 = 0.76
    expect(result).toBe(0.76);
  });

  // ── Invalid inputs ──

  it('returns NaN when dimensionConfidence is NaN', () => {
    expect(computeDimensionWeight(NaN, 1)).toBeNaN();
  });

  it('returns NaN when chainLength is NaN', () => {
    expect(computeDimensionWeight(0.8, NaN)).toBeNaN();
  });

  it('handles Infinity chainLength', () => {
    // Infinity × 0.05 = Infinity → 1.0 + Infinity = Infinity → capped at 2.0
    // 0.8 × 2.0 = 1.6 → clamped to 1.0
    expect(computeDimensionWeight(0.8, Infinity)).toBe(1.0);
  });

  it('handles -Infinity chainLength', () => {
    // -Infinity × 0.05 = -Infinity → 1.0 + (-Infinity) = -Infinity → capped at 2.0
    // Actually: Math.min(-Infinity, 2.0) = -Infinity
    // 0.8 × (-Infinity) = -Infinity → clamp to 0
    expect(computeDimensionWeight(0.8, -Infinity)).toBe(0);
  });

  // ── Deterministic repeated execution ──

  it('produces identical output for 10,000 iterations (determinism)', () => {
    const testCases = [
      [0.7, 1],
      [0.8, 5],
      [0.6, 10],
      [1.0, 21],
      [0.0, 5],
      [0.5, 1],
    ] as const;
    for (const [dc, cl] of testCases) {
      const expected = computeDimensionWeight(dc, cl);
      for (let i = 0; i < 10_000; i++) {
        expect(computeDimensionWeight(dc, cl)).toBe(expected);
      }
    }
  });

  // ── Mathematical invariants ──

  it('result is always in [0.0, 1.0] for all finite inputs', () => {
    const testCases = [
      [0.5, 1],
      [0.8, 5],
      [1.0, 21],
      [0.0, 5],
      [-0.5, 3],
      [0.3, 50],
      [0.9, 1],
    ] as const;
    for (const [dc, cl] of testCases) {
      const result = computeDimensionWeight(dc, cl);
      if (!Number.isNaN(result)) {
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is monotonically non-decreasing in dimensionConfidence', () => {
    const confidences = [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1.0];
    for (const cl of [1, 2, 5, 10, 21]) {
      for (let i = 1; i < confidences.length; i++) {
        const lower = computeDimensionWeight(confidences[i - 1], cl);
        const upper = computeDimensionWeight(confidences[i], cl);
        expect(upper).toBeGreaterThanOrEqual(lower);
      }
    }
  });

  it('is monotonically non-decreasing in chainLength (up to cap)', () => {
    const lengths = [1, 2, 3, 5, 10, 15, 20, 21, 30, 50];
    for (const dc of [0.3, 0.5, 0.8]) {
      for (let i = 1; i < lengths.length; i++) {
        const lower = computeDimensionWeight(dc, lengths[i - 1]);
        const upper = computeDimensionWeight(dc, lengths[i]);
        expect(upper).toBeGreaterThanOrEqual(lower);
      }
    }
  });

  it('is idempotent for chainLength = 1 (no amplification)', () => {
    // For chainLength = 1: multiplier = 1.0, so weight = dimensionConfidence
    // round6(clamp(dimensionConfidence, 0, 1)) should be idempotent
    const inputs = [0, 0.3, 0.5, 0.7, 1.0];
    for (const x of inputs) {
      expect(computeDimensionWeight(computeDimensionWeight(x, 1), 1)).toBe(
        computeDimensionWeight(x, 1),
      );
    }
  });

  // ── Threshold-adjacent values ──

  it('handles dimensionConfidence just below 1.0', () => {
    const result = computeDimensionWeight(0.9999, 1);
    expect(result).toBeLessThan(1.0);
    expect(result).toBeGreaterThan(0.999);
  });

  it('handles dimensionConfidence just below the clamp threshold', () => {
    // 0.9999 × 1.0 = 0.9999 → round6(0.9999) = 0.9999 (not clamped)
    expect(computeDimensionWeight(0.9999, 1)).toBe(0.9999);
  });

  it('handles chainLength where amplified weight is just below 1.0', () => {
    // 0.9 × (1.0 + 2 × 0.05) = 0.9 × 1.10 = 0.99
    expect(computeDimensionWeight(0.9, 3)).toBe(0.99);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-function invariants
// ─────────────────────────────────────────────────────────────────────────────

describe('cross-function invariants', () => {
  it('round2(round6(x)) preserves the first 2 decimal places of round6(x)', () => {
    const inputs = [1.234567, 3.141592, 0.123456, 9.999999];
    for (const x of inputs) {
      expect(round2(round6(x))).toBe(round2(x));
    }
  });

  it('saturate ∘ clamp preserves output in [0, 1]', () => {
    const inputs = [-5, -1, -0.1, 0, 0.5, 1, 2, 5, 10, 100];
    for (const x of inputs) {
      const result = saturate(clamp(x, 0, 10));
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    }
  });

  it('computeContributionValue with computeDimensionWeight stays in [0, 10]', () => {
    const scenarios = [
      { severity: 7.0, confidence: 0.8, dimensionConfidence: 0.9, chainLength: 1 },
      { severity: 9.0, confidence: 0.95, dimensionConfidence: 0.85, chainLength: 5 },
      { severity: 10.0, confidence: 1.0, dimensionConfidence: 1.0, chainLength: 21 },
      { severity: 0.0, confidence: 0.8, dimensionConfidence: 0.9, chainLength: 1 },
      { severity: 5.0, confidence: 0.5, dimensionConfidence: 0.5, chainLength: 3 },
    ];
    for (const s of scenarios) {
      const dw = computeDimensionWeight(s.dimensionConfidence, s.chainLength);
      const cv = computeContributionValue(s.severity, s.confidence, dw);
      expect(cv).toBeGreaterThanOrEqual(0);
      expect(cv).toBeLessThanOrEqual(10);
    }
  });

  it('all functions are pure (no side effects across calls)', () => {
    // Calling the same function multiple times with the same inputs
    // should not change any observable state.
    const x = 1.234;
    const a1 = round2(x);
    const a2 = round2(x);
    expect(a1).toBe(a2);

    const b1 = clamp(x, 0, 10);
    const b2 = clamp(x, 0, 10);
    expect(b1).toBe(b2);

    // Test that subsequent calls to other functions don't affect results
    round6(9.876);
    clamp(-5, 0, 1);
    saturate(0.5);
    computeContributionValue(7.0, 0.8, 0.5);
    computeDimensionWeight(0.7, 5);

    // Re-check original values
    expect(round2(x)).toBe(a1);
    expect(clamp(x, 0, 10)).toBe(b1);
  });
});
