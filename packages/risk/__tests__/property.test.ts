/**
 * Property-based tests for @veris/risk using fast-check.
 *
 * Covers:
 * - Score bounds [0, 10] for all risk functions
 * - Confidence bounds [0, 1]
 * - Determinism (same input → same output)
 * - NaN resistance (NaN inputs → NaN outputs)
 * - Monotonicity invariants
 * - Serialization stability
 *
 * @module @veris/risk/__tests__/property
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  round2,
  round6,
  clamp,
  saturate,
  computeContributionValue,
  computeDimensionWeight,
  RiskEvaluator,
  DecisionEngine,
  VERDICTS,
} from '../src/index.js';

// ── Scoring Primitives ──

describe('round2 property tests', () => {
  it('output always has at most 2 decimal places for finite values', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true, noInfinity: true }), (x) => {
        const result = round2(x);
        const str = String(result);
        const decimalPart = str.split('.')[1] ?? '';
        return decimalPart.length <= 2;
      }),
    );
  });

  it('is idempotent for finite values', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true, noInfinity: true }), (x) => {
        return round2(round2(x)) === round2(x);
      }),
    );
  });

  it('preserves integer inputs', () => {
    fc.assert(
      fc.property(fc.integer(), (n) => {
        return round2(n) === n;
      }),
    );
  });
});

describe('round6 property tests', () => {
  it('output always has at most 6 decimal places for finite values', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true, noInfinity: true }), (x) => {
        const result = round6(x);
        const str = String(result);
        const decimalPart = str.split('.')[1] ?? '';
        return decimalPart.length <= 6;
      }),
    );
  });

  it('is idempotent for finite values', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true, noInfinity: true }), (x) => {
        return round6(round6(x)) === round6(x);
      }),
    );
  });
});

describe('clamp property tests', () => {
  it('output is always in [min, max] for finite ordered inputs', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -100, max: 100, noNaN: true, noInfinity: true }),
        fc.double({ min: -100, max: 100, noNaN: true, noInfinity: true }),
        fc.double({ min: -100, max: 100, noNaN: true, noInfinity: true }),
        (value, min, max) => {
          const lo = Math.min(min, max);
          const hi = Math.max(min, max);
          const result = clamp(value, lo, hi);
          expect(result).toBeGreaterThanOrEqual(lo);
          expect(result).toBeLessThanOrEqual(hi);
        },
      ),
    );
  });

  it('returns value when value is between min and max', () => {
    fc.assert(
      fc.property(fc.double({ min: -100, max: 100, noNaN: true, noInfinity: true }), (value) => {
        const min = value - 5;
        const max = value + 5;
        return clamp(value, min, max) === value;
      }),
    );
  });

  it('is idempotent', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -100, max: 100, noNaN: true, noInfinity: true }),
        fc.double({ min: -100, max: 100, noNaN: true, noInfinity: true }),
        fc.double({ min: -100, max: 100, noNaN: true, noInfinity: true }),
        (value, min, max) => {
          const lo = Math.min(min, max);
          const hi = Math.max(min, max);
          const first = clamp(value, lo, hi);
          return clamp(first, lo, hi) === first;
        },
      ),
    );
  });
});

describe('saturate property tests', () => {
  it('output is always in [0, 1] for finite inputs', () => {
    fc.assert(
      fc.property(fc.double({ min: -100, max: 100, noNaN: true, noInfinity: true }), (x) => {
        const result = saturate(x);
        return result >= 0 && result <= 1;
      }),
    );
  });

  it('returns 0 for non-positive inputs', () => {
    fc.assert(
      fc.property(fc.double({ min: -100, max: 0, noNaN: true, noInfinity: true }), (x) => {
        return saturate(x) === 0;
      }),
    );
  });

  it('is monotonically non-decreasing for positive inputs', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 10, noNaN: true, noInfinity: true }),
        fc.double({ min: 0, max: 10, noNaN: true, noInfinity: true }),
        (a, b) => {
          const lower = Math.min(a, b);
          const upper = Math.max(a, b);
          return saturate(lower) <= saturate(upper);
        },
      ),
    );
  });
});

// ── Composite Scoring ──

describe('computeContributionValue property tests', () => {
  it('output is always in [0, 10]', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 10, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 2, noNaN: true }),
        (severity, confidence, weight) => {
          const result = computeContributionValue(severity, confidence, weight);
          return result >= 0 && result <= 10;
        },
      ),
    );
  });

  it('returns 0 when severity is 0', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 2, noNaN: true }),
        (confidence, weight) => {
          return computeContributionValue(0, confidence, weight) === 0;
        },
      ),
    );
  });
});

describe('computeDimensionWeight property tests', () => {
  it('output is always in [0, 1] for valid inputs', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: 1, max: 100 }),
        (confidence, chainLength) => {
          const result = computeDimensionWeight(confidence, chainLength);
          return result >= 0 && result <= 1;
        },
      ),
    );
  });

  it('returns confidence within rounding error when chainLength = 1', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (confidence) => {
        const result = computeDimensionWeight(confidence, 1);
        // round6(clamp(confidence * 1.0, 0, 1)) may differ from
        // confidence by at most 5e-7 due to rounding to 6 decimal places.
        return Math.abs(result - confidence) < 1e-6;
      }),
    );
  });

  it('is monotonically non-decreasing in chainLength', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 20 }),
        (confidence, a, b) => {
          const shorter = Math.min(a, b);
          const longer = Math.max(a, b);
          return (
            computeDimensionWeight(confidence, shorter) <=
            computeDimensionWeight(confidence, longer)
          );
        },
      ),
    );
  });

  it('caps at chainLength = 21', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: 21, max: 1000 }),
        (confidence, chainLength) => {
          const capped = computeDimensionWeight(confidence, 21);
          const longer = computeDimensionWeight(confidence, chainLength);
          return longer === capped;
        },
      ),
    );
  });
});

// ── NaN and Edge Cases ──

describe('NaN resistance', () => {
  it('clamp returns NaN for any NaN input', () => {
    expect(clamp(NaN, 0, 10)).toBeNaN();
    expect(clamp(5, NaN, 10)).toBeNaN();
    expect(clamp(5, 0, NaN)).toBeNaN();
  });

  it('computeContributionValue returns NaN when any input is NaN', () => {
    expect(computeContributionValue(NaN, 0.5, 0.5)).toBeNaN();
    expect(computeContributionValue(5, NaN, 0.5)).toBeNaN();
    expect(computeContributionValue(5, 0.5, NaN)).toBeNaN();
  });

  it('computeDimensionWeight returns NaN when confidence is NaN', () => {
    expect(computeDimensionWeight(NaN, 5)).toBeNaN();
  });

  it('saturate returns 0 for NaN', () => {
    expect(saturate(NaN)).toBe(0);
  });

  it('saturate returns 0 for -Infinity', () => {
    expect(saturate(-Infinity)).toBe(0);
  });

  it('saturate returns 1 for Infinity', () => {
    expect(saturate(Infinity)).toBe(1);
  });
});

// ── RiskEvaluator Determinism ──

describe('RiskEvaluator property tests', () => {
  const evaluator = new RiskEvaluator();

  it('produces deterministic output for identical inputs', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            ruleId: fc.string({ minLength: 1, maxLength: 10 }),
            severityScore: fc.double({ min: 0, max: 10, noNaN: true }),
            severityLevel: fc.constant('medium' as const),
            confidence: fc.double({ min: 0, max: 1, noNaN: true }),
            evidenceIds: fc.constant(['ev-001']),
            taxonomyIds: fc.constant([]),
          }),
          { minLength: 0, maxLength: 5 },
        ),
        (ruleMatches) => {
          const input = {
            ruleMatches: ruleMatches as any,
            correlations: [],
            evidence: [],
            artifactId: 'art_test',
            sessionId: 'session_test',
          };

          const r1 = evaluator.evaluate(input as any);
          const r2 = evaluator.evaluate(input as any);

          return (
            r1.riskScore === r2.riskScore &&
            r1.verdict === r2.verdict &&
            r1.contributions.length === r2.contributions.length
          );
        },
      ),
    );
  });

  it('risk score is always in [0, 10]', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            ruleId: fc.string({ minLength: 1, maxLength: 10 }),
            severityScore: fc.double({ min: 0, max: 10, noNaN: true }),
            severityLevel: fc.constant('medium' as const),
            confidence: fc.double({ min: 0, max: 1, noNaN: true }),
            evidenceIds: fc.constant(['ev-001']),
            taxonomyIds: fc.constant([]),
          }),
          { minLength: 0, maxLength: 5 },
        ),
        (ruleMatches) => {
          const assessment = evaluator.evaluate({
            ruleMatches: ruleMatches as any,
            correlations: [],
            evidence: [],
            artifactId: 'art_test',
            sessionId: 'session_test',
          });

          return assessment.riskScore >= 0 && assessment.riskScore <= 10;
        },
      ),
    );
  });

  it('empty input gives score 0', () => {
    const assessment = evaluator.evaluate({
      ruleMatches: [],
      correlations: [],
      evidence: [],
      artifactId: 'art_test',
      sessionId: 'session_test',
    });

    expect(assessment.riskScore).toBe(0);
    expect(assessment.contributions).toEqual([]);
  });
});

// ── DecisionEngine Properties ──

describe('DecisionEngine property tests', () => {
  const engine = new DecisionEngine();

  it('produces deterministic output for identical assessments', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 10, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (riskScore, confidence) => {
          const assessment = {
            schemaVersion: '0.1.0',
            engineVersion: '0.1.0',
            id: 'ra_test',
            sessionId: 'session_test',
            artifactId: 'art_test',
            riskScore,
            riskLevel: riskScore > 7 ? ('critical' as const) : ('high' as const),
            verdict: riskScore > 5 ? VERDICTS.SUSPICIOUS : VERDICTS.LIKELY_BENIGN,
            confidence,
            computedAt: '2024-01-01T00:00:00.000Z',
            contributions: [],
            totalContributionCount: 0,
            contributionsTruncated: false,
          };

          const d1 = engine.decide(assessment as any);
          const d2 = engine.decide(assessment as any);

          return (
            d1.action === d2.action && d1.priority === d2.priority && d1.rationale === d2.rationale
          );
        },
      ),
    );
  });

  it('always produces a valid action', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 10, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (riskScore, confidence) => {
          const assessment = {
            schemaVersion: '0.1.0',
            engineVersion: '0.1.0',
            id: 'ra_test',
            sessionId: 'session_test',
            artifactId: 'art_test',
            riskScore,
            riskLevel: 'medium' as const,
            verdict: riskScore > 5 ? VERDICTS.SUSPICIOUS : VERDICTS.LIKELY_BENIGN,
            confidence,
            computedAt: '2024-01-01T00:00:00.000Z',
            contributions: [],
            totalContributionCount: 0,
            contributionsTruncated: false,
          };

          const decision = engine.decide(assessment as any);
          const validActions = [
            'block',
            'investigate',
            'review',
            'monitor',
            'allow',
            'insufficient-evidence',
          ];
          return validActions.includes(decision.action as string);
        },
      ),
    );
  });

  it('is confidence-limited when score >= 6.0 and confidence < 0.8', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 6, max: 10, noNaN: true }),
        fc.double({ min: 0, max: 0.79, noNaN: true }),
        (riskScore, confidence) => {
          const assessment = {
            schemaVersion: '0.1.0',
            engineVersion: '0.1.0',
            id: 'ra_test',
            sessionId: 'session_test',
            artifactId: 'art_test',
            riskScore,
            riskLevel: 'high' as const,
            verdict: VERDICTS.SUSPICIOUS,
            confidence,
            computedAt: '2024-01-01T00:00:00.000Z',
            contributions: [],
            totalContributionCount: 5,
            contributionsTruncated: false,
          };

          const decision = engine.decide(assessment as any);
          return decision.confidenceLimited === true;
        },
      ),
    );
  });

  it('is not confidence-limited when confidence is high', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 10, noNaN: true }),
        fc.double({ min: 0.8, max: 1, noNaN: true }),
        (riskScore, confidence) => {
          const assessment = {
            schemaVersion: '0.1.0',
            engineVersion: '0.1.0',
            id: 'ra_test',
            sessionId: 'session_test',
            artifactId: 'art_test',
            riskScore,
            riskLevel: 'medium' as const,
            verdict: VERDICTS.LIKELY_BENIGN,
            confidence,
            computedAt: '2024-01-01T00:00:00.000Z',
            contributions: [],
            totalContributionCount: 3,
            contributionsTruncated: false,
          };

          const decision = engine.decide(assessment as any);
          return !decision.confidenceLimited;
        },
      ),
    );
  });
});

// ── Serialization Stability ──

describe('serialization property tests', () => {
  it('RiskEvaluator output survives JSON round-trip', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            ruleId: fc.string({ minLength: 1, maxLength: 10 }),
            severityScore: fc.double({ min: 0, max: 10, noNaN: true }),
            severityLevel: fc.constant('medium' as const),
            confidence: fc.double({ min: 0, max: 1, noNaN: true }),
            evidenceIds: fc.constant(['ev-001']),
            taxonomyIds: fc.constant([]),
          }),
          { minLength: 0, maxLength: 5 },
        ),
        (ruleMatches) => {
          const evaluator = new RiskEvaluator();
          const assessment = evaluator.evaluate({
            ruleMatches: ruleMatches as any,
            correlations: [],
            evidence: [],
            artifactId: 'art_test',
            sessionId: 'session_test',
          });

          const serialized = JSON.parse(JSON.stringify(assessment));

          return (
            serialized.riskScore === assessment.riskScore &&
            serialized.verdict === assessment.verdict &&
            serialized.riskLevel === assessment.riskLevel &&
            serialized.contributions.length === assessment.contributions.length
          );
        },
      ),
    );
  });
});
