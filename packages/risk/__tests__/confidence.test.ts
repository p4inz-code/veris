/**
 * Tests for @veris/risk/confidence — deterministic assessment confidence.
 *
 * ## Test Coverage
 *
 * ✓ empty inputs
 * ✓ all high confidence
 * ✓ mixed confidence
 * ✓ missing evidence
 * ✓ incomplete contribution chains
 * ✓ deterministic repeated execution (10k+)
 * ✓ invalid inputs
 * ✓ monotonicity
 * ✓ mathematical invariants
 * ✓ immutable outputs
 * ✓ serialization compatibility
 *
 * ## Determinism Guarantee
 * Identical inputs must always produce identical ConfidenceBreakdown,
 * including overall, factors, and hasSufficientEvidence.
 *
 * @module @veris/risk/__tests__/confidence
 */

import { describe, it, expect } from 'vitest';
import { computeAssessmentConfidence, aggregateByDimension } from '../src/index.js';
import type { Contribution, SourceType, AggregationResult } from '../src/index.js';
import { SOURCE_TYPES } from '../src/types.js';
import { CONFIDENCE_MIN, CONFIDENCE_MAX, CONFIDENCE_MIN_SUFFICIENT } from '../src/constants.js';

// ── Helpers ──

function makeContribution(overrides: {
  id: string;
  sourceType: SourceType;
  sourceId: string;
  effectiveValue: number;
  confidence: number;
  evidenceIds?: readonly string[];
  metadata?: Record<string, unknown>;
}): Contribution {
  return Object.freeze({
    id: overrides.id,
    sourceType: overrides.sourceType,
    sourceId: overrides.sourceId,
    sourceName: overrides.sourceId,
    baseValue: overrides.effectiveValue,
    effectiveValue: overrides.effectiveValue,
    confidence: overrides.confidence,
    severity:
      overrides.sourceType === SOURCE_TYPES.RULE
        ? { level: 'medium' as const, score: overrides.effectiveValue }
        : null,
    evidenceIds: Object.freeze(overrides.evidenceIds ?? []),
    explanation: overrides.sourceId,
    formula: Object.freeze({
      display: 'test',
      steps: Object.freeze([]),
    }),
    multipliers: Object.freeze([]),
    metadata: Object.freeze(overrides.metadata ?? {}),
  });
}

function makeRuleContribution(
  id: string,
  effectiveValue: number,
  confidence: number,
  evidenceIds?: readonly string[],
): Contribution {
  return makeContribution({
    id,
    sourceType: SOURCE_TYPES.RULE,
    sourceId: id,
    effectiveValue,
    confidence,
    evidenceIds: evidenceIds ?? [`ev-${id}`],
    metadata: { taxonomyIds: Object.freeze([]) },
  });
}

function makeCorrelationContribution(
  id: string,
  confidence: number,
  evidenceIds?: readonly string[],
): Contribution {
  return makeContribution({
    id,
    sourceType: SOURCE_TYPES.CORRELATION,
    sourceId: id,
    effectiveValue: 0,
    confidence,
    evidenceIds: evidenceIds ?? [`ev-${id}`],
    metadata: { chainLength: 3 },
  });
}

function makeEvidenceContribution(
  id: string,
  confidence: number,
  evidenceIds?: readonly string[],
): Contribution {
  return makeContribution({
    id,
    sourceType: SOURCE_TYPES.EVIDENCE,
    sourceId: id,
    effectiveValue: 0,
    confidence,
    evidenceIds: evidenceIds ?? [id],
    metadata: { category: 'test', artifactId: 'art-001' },
  });
}

function makeEmptyAggregation(): AggregationResult {
  return Object.freeze({
    dimensions: Object.freeze([]),
    totalContributions: 0,
    totalSummedValue: 0,
  });
}

// ── Empty Inputs ──

describe('empty inputs', () => {
  it('returns zero confidence for empty contributions and empty aggregation', () => {
    const result = computeAssessmentConfidence([], makeEmptyAggregation());

    expect(result.overall).toBe(0);
    expect(result.factors.contributionConfidence).toBe(0);
    expect(result.factors.evidenceCompleteness).toBe(0);
    expect(result.factors.aggregationQuality).toBe(0);
    expect(result.hasSufficientEvidence).toBe(false);
  });

  it('returns zero confidence for empty contributions with populated aggregation', () => {
    // This shouldn't happen in practice (populated aggregation requires
    // contributions), but test the edge case.
    const aggregation = Object.freeze({
      dimensions: Object.freeze([
        Object.freeze({
          dimension: SOURCE_TYPES.RULE,
          contributionCount: 0,
          summedValue: 0,
          effectiveWeight: 0,
          saturatedScore: 0,
          intermediateCalculations: Object.freeze({
            meanConfidence: 0,
            effectiveChainLength: 1,
            normalizedSum: 0,
            rawWeightedScore: 0,
          }),
          contributionIds: Object.freeze([]),
        }),
      ]),
      totalContributions: 0,
      totalSummedValue: 0,
    });

    const result = computeAssessmentConfidence([], aggregation);

    expect(result.overall).toBe(0);
    expect(result.factors.contributionConfidence).toBe(0);
    expect(result.factors.evidenceCompleteness).toBe(0);
    // aggregationQuality = 1/3 ≈ 0.333333
    expect(result.factors.aggregationQuality).toBeCloseTo(1 / 3, 6);
    expect(result.hasSufficientEvidence).toBe(false);
  });

  it('returns a frozen result', () => {
    const result = computeAssessmentConfidence([], makeEmptyAggregation());
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.factors)).toBe(true);
  });
});

// ── All High Confidence ──

describe('all high confidence', () => {
  it('returns high overall confidence when all contributions have high confidence', () => {
    const contributions = [
      makeRuleContribution('rc_001', 8.0, 0.95, ['ev-001']),
      makeCorrelationContribution('rc_002', 0.9, ['ev-002']),
      makeEvidenceContribution('rc_003', 0.95, ['ev-003']),
    ];
    const aggregation = aggregateByDimension(contributions);
    const result = computeAssessmentConfidence(contributions, aggregation);

    // contributionConfidence = (0.95 + 0.9 + 0.95) / 3 = 2.8 / 3 ≈ 0.933333
    expect(result.factors.contributionConfidence).toBeCloseTo(0.933333, 4);

    // evidenceCompleteness = 3 unique / 3 total = 1.0
    expect(result.factors.evidenceCompleteness).toBe(1.0);

    // aggregationQuality = 3 / 3 = 1.0
    expect(result.factors.aggregationQuality).toBe(1.0);

    // overall = 0.933333 × 1.0 × 1.0 ≈ 0.933333
    expect(result.overall).toBeCloseTo(0.933333, 4);
    expect(result.hasSufficientEvidence).toBe(true);
  });

  it('returns overall = 1.0 for perfect inputs', () => {
    const contributions = [
      makeRuleContribution('rc_001', 10.0, 1.0, ['ev-001']),
      makeCorrelationContribution('rc_002', 1.0, ['ev-002']),
      makeEvidenceContribution('rc_003', 1.0, ['ev-003']),
    ];
    const aggregation = aggregateByDimension(contributions);
    const result = computeAssessmentConfidence(contributions, aggregation);

    // contributionConfidence = (1.0 + 1.0 + 1.0) / 3 = 1.0
    // evidenceCompleteness = 3/3 = 1.0
    // aggregationQuality = 3/3 = 1.0
    // overall = 1.0
    expect(result.overall).toBe(1.0);
    expect(result.hasSufficientEvidence).toBe(true);
  });
});

// ── Mixed Confidence ──

describe('mixed confidence', () => {
  it('reflects the mean of varying contribution confidences', () => {
    const contributions = [
      makeRuleContribution('rc_001', 8.0, 0.95, ['ev-001']),
      makeRuleContribution('rc_002', 5.0, 0.5, ['ev-002']),
      makeRuleContribution('rc_003', 3.0, 0.2, ['ev-003']),
    ];
    const aggregation = aggregateByDimension(contributions);
    const result = computeAssessmentConfidence(contributions, aggregation);

    // contributionConfidence = (0.95 + 0.5 + 0.2) / 3 ≈ 0.55
    expect(result.factors.contributionConfidence).toBeCloseTo(0.55, 4);

    // evidenceCompleteness = 3/3 = 1.0
    expect(result.factors.evidenceCompleteness).toBe(1.0);

    // aggregationQuality = 1/3 ≈ 0.333333
    expect(result.factors.aggregationQuality).toBeCloseTo(1 / 3, 4);

    // overall = 0.55 × 1.0 × 0.333333 ≈ 0.183333
    expect(result.overall).toBeCloseTo(0.183333, 4);
    expect(result.hasSufficientEvidence).toBe(false);
  });

  it('mixed confidence across multiple dimensions produces intermediate values', () => {
    const contributions = [
      // Rule: high confidence
      makeRuleContribution('rc_rule_001', 8.0, 0.9, ['ev-001']),
      // Correlation: moderate confidence
      makeCorrelationContribution('rc_corr_001', 0.6, ['ev-002']),
      // Evidence: very high confidence
      makeEvidenceContribution('rc_ev_001', 0.99, ['ev-003']),
    ];
    const aggregation = aggregateByDimension(contributions);
    const result = computeAssessmentConfidence(contributions, aggregation);

    // contributionConfidence = (0.9 + 0.6 + 0.99) / 3 = 2.49 / 3 = 0.83
    expect(result.factors.contributionConfidence).toBeCloseTo(0.83, 4);

    // evidenceCompleteness = 3/3 = 1.0
    expect(result.factors.evidenceCompleteness).toBe(1.0);

    // aggregationQuality = 3/3 = 1.0
    expect(result.factors.aggregationQuality).toBe(1.0);

    // overall = 0.83 × 1.0 × 1.0 = 0.83
    expect(result.overall).toBeCloseTo(0.83, 4);
    expect(result.hasSufficientEvidence).toBe(true);
  });
});

// ── Missing Evidence ──

describe('missing evidence', () => {
  it('evidence completeness is 0 when no contributions have evidence IDs', () => {
    const contributions = [makeRuleContribution('rc_001', 8.0, 0.9, [])];
    const aggregation = aggregateByDimension(contributions);
    const result = computeAssessmentConfidence(contributions, aggregation);

    expect(result.factors.evidenceCompleteness).toBe(0);
    expect(result.overall).toBe(0);
    expect(result.hasSufficientEvidence).toBe(false);
  });

  it('evidence completeness decreases with repeated evidence references', () => {
    // Three contributions all referencing the same evidence ID
    const contributions = [
      makeRuleContribution('rc_001', 8.0, 0.9, ['ev-001']),
      makeRuleContribution('rc_002', 5.0, 0.8, ['ev-001']),
      makeRuleContribution('rc_003', 3.0, 0.7, ['ev-001']),
    ];
    const aggregation = aggregateByDimension(contributions);
    const result = computeAssessmentConfidence(contributions, aggregation);

    // evidenceCompleteness = 1 unique / 3 total ≈ 0.333333
    expect(result.factors.evidenceCompleteness).toBeCloseTo(1 / 3, 4);
  });

  it('evidence completeness is higher with diverse evidence', () => {
    // Three contributions each with unique evidence IDs
    const contributions = [
      makeRuleContribution('rc_001', 8.0, 0.9, ['ev-001']),
      makeRuleContribution('rc_002', 5.0, 0.8, ['ev-002']),
      makeRuleContribution('rc_003', 3.0, 0.7, ['ev-003']),
    ];
    const aggregation = aggregateByDimension(contributions);
    const result = computeAssessmentConfidence(contributions, aggregation);

    // evidenceCompleteness = 3 unique / 3 total = 1.0
    expect(result.factors.evidenceCompleteness).toBe(1.0);
  });

  it('evidence completeness with mixed repeated and unique references', () => {
    const contributions = [
      makeRuleContribution('rc_001', 8.0, 0.9, ['ev-001', 'ev-002']),
      makeRuleContribution('rc_002', 5.0, 0.8, ['ev-001']),
    ];
    const aggregation = aggregateByDimension(contributions);
    const result = computeAssessmentConfidence(contributions, aggregation);

    // evidenceCompleteness = 2 unique / 3 total ≈ 0.666667
    expect(result.factors.evidenceCompleteness).toBeCloseTo(2 / 3, 4);
  });
});

// ── Incomplete Contribution Chains ──

describe('incomplete contribution chains', () => {
  it('aggregation quality is lower when few dimensions are populated', () => {
    // Only rule dimension populated
    const contributions = [makeRuleContribution('rc_001', 8.0, 0.9, ['ev-001'])];
    const aggregation = aggregateByDimension(contributions);
    const result = computeAssessmentConfidence(contributions, aggregation);

    // aggregationQuality = 1/3 ≈ 0.333333
    expect(result.factors.aggregationQuality).toBeCloseTo(1 / 3, 4);
  });

  it('aggregation quality increases with more dimensions', () => {
    // Two dimensions: rule + correlation
    const contributions = [
      makeRuleContribution('rc_rule_001', 8.0, 0.9, ['ev-001']),
      makeCorrelationContribution('rc_corr_001', 0.8, ['ev-002']),
    ];
    const aggregation = aggregateByDimension(contributions);
    const result = computeAssessmentConfidence(contributions, aggregation);

    // aggregationQuality = 2/3 ≈ 0.666667
    expect(result.factors.aggregationQuality).toBeCloseTo(2 / 3, 4);
  });

  it('aggregation quality is 1.0 with all three dimensions', () => {
    const contributions = [
      makeRuleContribution('rc_rule_001', 8.0, 0.9, ['ev-001']),
      makeCorrelationContribution('rc_corr_001', 0.8, ['ev-002']),
      makeEvidenceContribution('rc_ev_001', 0.95, ['ev-003']),
    ];
    const aggregation = aggregateByDimension(contributions);
    const result = computeAssessmentConfidence(contributions, aggregation);

    expect(result.factors.aggregationQuality).toBe(1.0);
  });

  it('handles multiple contributions in a single dimension', () => {
    const contributions = [
      makeRuleContribution('rc_001', 8.0, 0.9, ['ev-001']),
      makeRuleContribution('rc_002', 5.0, 0.8, ['ev-002']),
      makeRuleContribution('rc_003', 3.0, 0.7, ['ev-003']),
    ];
    const aggregation = aggregateByDimension(contributions);
    const result = computeAssessmentConfidence(contributions, aggregation);

    // Only rule dimension → 1/3
    expect(result.factors.aggregationQuality).toBeCloseTo(1 / 3, 4);
  });
});

// ── Deterministic Repeated Execution ──

describe('deterministic repeated execution', () => {
  it('produces identical output for 10,000 iterations', () => {
    const contributions = [
      makeRuleContribution('rc_rule_001', 8.0, 0.9, ['ev-001']),
      makeCorrelationContribution('rc_corr_001', 0.8, ['ev-002']),
      makeEvidenceContribution('rc_ev_001', 0.95, ['ev-003']),
    ];
    const aggregation = aggregateByDimension(contributions);
    const expected = computeAssessmentConfidence(contributions, aggregation);

    for (let i = 0; i < 10_000; i++) {
      const actual = computeAssessmentConfidence(contributions, aggregation);
      expect(actual.overall).toBe(expected.overall);
      expect(actual.factors.contributionConfidence).toBe(expected.factors.contributionConfidence);
      expect(actual.factors.evidenceCompleteness).toBe(expected.factors.evidenceCompleteness);
      expect(actual.factors.aggregationQuality).toBe(expected.factors.aggregationQuality);
      expect(actual.hasSufficientEvidence).toBe(expected.hasSufficientEvidence);
    }
  });

  it('produces identical output for 10,000 iterations with edge cases', () => {
    const testCases = [
      { contributions: [], aggregation: makeEmptyAggregation() },
      {
        contributions: [
          makeRuleContribution('rc_001', 10.0, 1.0, ['ev-001']),
          makeCorrelationContribution('rc_002', 1.0, ['ev-002']),
          makeEvidenceContribution('rc_003', 1.0, ['ev-003']),
        ],
        aggregation: null as any, // will compute below
      },
      {
        contributions: [makeRuleContribution('rc_001', 5.0, 0.5, ['ev-001', 'ev-001'])],
        aggregation: null as any,
      },
    ];

    // Build aggregation for non-empty cases
    const testInputs = testCases.map((tc) => {
      const agg =
        tc.contributions.length > 0 ? aggregateByDimension(tc.contributions) : tc.aggregation;
      return { contributions: tc.contributions, aggregation: agg };
    });

    for (const { contributions, aggregation } of testInputs) {
      const expected = computeAssessmentConfidence(contributions, aggregation);
      for (let i = 0; i < 10_000; i++) {
        const actual = computeAssessmentConfidence(contributions, aggregation);
        expect(actual).toEqual(expected);
      }
    }
  });

  it('produces identical output for large inputs across iterations', () => {
    const contributions = Array.from({ length: 50 }, (_, i) =>
      i < 20
        ? makeRuleContribution(`rc_rule_${i}`, 5.0 + Math.random() * 5, 0.5 + Math.random() * 0.5, [
            `ev-${i}`,
          ])
        : i < 35
          ? makeCorrelationContribution(`rc_corr_${i}`, 0.5 + Math.random() * 0.5, [`ev-${i}`])
          : makeEvidenceContribution(`rc_ev_${i}`, 0.5 + Math.random() * 0.5, [`ev-${i}`]),
    );
    const aggregation = aggregateByDimension(contributions);
    const expected = computeAssessmentConfidence(contributions, aggregation);

    for (let i = 0; i < 100; i++) {
      const actual = computeAssessmentConfidence(contributions, aggregation);
      expect(actual.overall).toBe(expected.overall);
      expect(actual.factors.contributionConfidence).toBe(expected.factors.contributionConfidence);
      expect(actual.factors.evidenceCompleteness).toBe(expected.factors.evidenceCompleteness);
      expect(actual.factors.aggregationQuality).toBe(expected.factors.aggregationQuality);
    }
  });
});

// ── Invalid Inputs ──

describe('invalid inputs', () => {
  it('throws TypeError when contributions is null', () => {
    expect(() => (computeAssessmentConfidence as any)(null, makeEmptyAggregation())).toThrow(
      TypeError,
    );
  });

  it('throws TypeError when contributions is undefined', () => {
    expect(() => (computeAssessmentConfidence as any)(undefined, makeEmptyAggregation())).toThrow(
      TypeError,
    );
  });

  it('throws TypeError when aggregationResult is null', () => {
    expect(() => (computeAssessmentConfidence as any)([], null)).toThrow(TypeError);
  });

  it('throws TypeError when aggregationResult is undefined', () => {
    expect(() => (computeAssessmentConfidence as any)([], undefined)).toThrow(TypeError);
  });

  it('handles NaN confidence gracefully (propagates through mean)', () => {
    const contributions = [makeRuleContribution('rc_001', 8.0, NaN, ['ev-001'])];
    const aggregation = aggregateByDimension(contributions);
    const result = computeAssessmentConfidence(contributions, aggregation);

    // NaN / 1 = NaN → round6(NaN) = NaN
    expect(result.factors.contributionConfidence).toBeNaN();
    // NaN × anything = NaN → clamp(NaN, 0, 1) = NaN
    expect(result.overall).toBeNaN();
  });

  it('handles Infinity confidence gracefully (clamped by product)', () => {
    const contributions = [makeRuleContribution('rc_001', 8.0, Infinity, ['ev-001'])];
    const aggregation = aggregateByDimension(contributions);
    const result = computeAssessmentConfidence(contributions, aggregation);

    // Infinity / 1 = Infinity → round6(Infinity) = Infinity
    expect(result.factors.contributionConfidence).toBe(Infinity);
    // Infinity × 1.0 × 0.333333 = Infinity → clamp → 1.0
    expect(result.overall).toBe(1.0);
  });
});

// ── Monotonicity ──

describe('monotonicity', () => {
  it('overall confidence increases when contribution confidence increases (other factors fixed)', () => {
    const aggregation = aggregateByDimension([
      makeRuleContribution('rc_001', 8.0, 0.9, ['ev-001']),
      makeCorrelationContribution('rc_002', 0.8, ['ev-002']),
      makeEvidenceContribution('rc_003', 0.95, ['ev-003']),
    ]);

    // Lower confidence version
    const lowerContributions = [
      makeRuleContribution('rc_001', 8.0, 0.5, ['ev-001']),
      makeCorrelationContribution('rc_002', 0.4, ['ev-002']),
      makeEvidenceContribution('rc_003', 0.5, ['ev-003']),
    ];
    // Higher confidence version (same evidence, same dimensions)
    const higherContributions = [
      makeRuleContribution('rc_001', 8.0, 0.9, ['ev-001']),
      makeCorrelationContribution('rc_002', 0.8, ['ev-002']),
      makeEvidenceContribution('rc_003', 0.95, ['ev-003']),
    ];

    const lowerResult = computeAssessmentConfidence(lowerContributions, aggregation);
    const higherResult = computeAssessmentConfidence(higherContributions, aggregation);

    expect(higherResult.overall).toBeGreaterThan(lowerResult.overall);
  });

  it('overall confidence increases with more diverse evidence', () => {
    const baseContributions = [
      makeRuleContribution('rc_001', 8.0, 0.9, ['ev-001']),
      makeRuleContribution('rc_002', 5.0, 0.8, ['ev-001']),
    ];
    const diverseContributions = [
      makeRuleContribution('rc_001', 8.0, 0.9, ['ev-001']),
      makeRuleContribution('rc_002', 5.0, 0.8, ['ev-002']),
    ];

    const baseAgg = aggregateByDimension(baseContributions);
    const diverseAgg = aggregateByDimension(diverseContributions);

    // Same contribution confidence, same aggregation quality, but different evidence completeness
    const baseResult = computeAssessmentConfidence(baseContributions, baseAgg);
    const diverseResult = computeAssessmentConfidence(diverseContributions, diverseAgg);

    // evidenceCompleteness: base = 1/2 = 0.5, diverse = 2/2 = 1.0
    expect(diverseResult.factors.evidenceCompleteness).toBeGreaterThan(
      baseResult.factors.evidenceCompleteness,
    );
    expect(diverseResult.overall).toBeGreaterThan(baseResult.overall);
  });

  it('overall confidence increases with more populated dimensions', () => {
    // Single dimension
    const singleContributions = [makeRuleContribution('rc_001', 8.0, 0.9, ['ev-001'])];
    // Two dimensions
    const twoContributions = [
      makeRuleContribution('rc_001', 8.0, 0.9, ['ev-001']),
      makeCorrelationContribution('rc_002', 0.8, ['ev-002']),
    ];

    const singleAgg = aggregateByDimension(singleContributions);
    const twoAgg = aggregateByDimension(twoContributions);

    const singleResult = computeAssessmentConfidence(singleContributions, singleAgg);
    const twoResult = computeAssessmentConfidence(twoContributions, twoAgg);

    expect(twoResult.factors.aggregationQuality).toBeGreaterThan(
      singleResult.factors.aggregationQuality,
    );
  });

  it('monotonicity holds across the full factor space', () => {
    // Test that increasing any single factor (while holding others constant)
    // never decreases the overall confidence.
    const confidences = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    const evidenceIds = ['ev-001', 'ev-002'];

    for (let i = 1; i < confidences.length; i++) {
      const lowerConf = confidences[i - 1];
      const higherConf = confidences[i];

      const lowerContributions = [
        makeRuleContribution('rc_001', 8.0, lowerConf, [evidenceIds[0]]),
        makeCorrelationContribution('rc_002', lowerConf, [evidenceIds[1]]),
      ];
      const higherContributions = [
        makeRuleContribution('rc_001', 8.0, higherConf, [evidenceIds[0]]),
        makeCorrelationContribution('rc_002', higherConf, [evidenceIds[1]]),
      ];

      const lowerAgg = aggregateByDimension(lowerContributions);
      const higherAgg = aggregateByDimension(higherContributions);

      const lowerResult = computeAssessmentConfidence(lowerContributions, lowerAgg);
      const higherResult = computeAssessmentConfidence(higherContributions, higherAgg);

      // Same dimensions, same evidence IDs — only confidence differs
      expect(higherResult.factors.contributionConfidence).toBeGreaterThanOrEqual(
        lowerResult.factors.contributionConfidence,
      );
      expect(higherResult.overall).toBeGreaterThanOrEqual(lowerResult.overall);
    }
  });
});

// ── Mathematical Invariants ──

describe('mathematical invariants', () => {
  it('overall is always in [0.0, 1.0]', () => {
    const testCases = [
      { contributions: [], aggregation: makeEmptyAggregation() },
      {
        contributions: [makeRuleContribution('rc_001', 10.0, 1.0, ['ev-001'])],
      },
      {
        contributions: [
          makeRuleContribution('rc_001', 5.0, 0.5, ['ev-001']),
          makeCorrelationContribution('rc_002', 0.5, ['ev-002']),
          makeEvidenceContribution('rc_003', 0.5, ['ev-003']),
        ],
      },
      {
        contributions: [
          makeRuleContribution('rc_001', 8.0, -0.5, ['ev-001']),
          makeRuleContribution('rc_002', 5.0, 2.0, ['ev-002']),
        ],
      },
    ];

    for (const tc of testCases) {
      const agg =
        tc.contributions.length > 0
          ? aggregateByDimension(tc.contributions as Contribution[])
          : tc.aggregation;
      const result = computeAssessmentConfidence(tc.contributions as Contribution[], agg);

      // NaN is not in [0, 1], but it's the only exception
      if (!Number.isNaN(result.overall)) {
        expect(result.overall).toBeGreaterThanOrEqual(0);
        expect(result.overall).toBeLessThanOrEqual(1);
      }
    }
  });

  it('all three factors are independently in [0.0, 1.0]', () => {
    const contributions = [
      makeRuleContribution('rc_001', 8.0, 0.9, ['ev-001']),
      makeCorrelationContribution('rc_002', 0.8, ['ev-002']),
      makeEvidenceContribution('rc_003', 0.95, ['ev-003']),
    ];
    const aggregation = aggregateByDimension(contributions);
    const result = computeAssessmentConfidence(contributions, aggregation);

    const factors = [
      result.factors.contributionConfidence,
      result.factors.evidenceCompleteness,
      result.factors.aggregationQuality,
    ];
    for (const f of factors) {
      if (!Number.isNaN(f)) {
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThanOrEqual(1);
      }
    }
  });

  it('overall is the product of all three factors', () => {
    const contributions = [
      makeRuleContribution('rc_001', 8.0, 0.9, ['ev-001']),
      makeCorrelationContribution('rc_002', 0.8, ['ev-002']),
      makeEvidenceContribution('rc_003', 0.95, ['ev-003']),
    ];
    const aggregation = aggregateByDimension(contributions);
    const result = computeAssessmentConfidence(contributions, aggregation);

    const expectedProduct =
      result.factors.contributionConfidence *
      result.factors.evidenceCompleteness *
      result.factors.aggregationQuality;

    // The product is clamped to [0, 1] and rounded to 6dp
    const expected = Math.min(Math.max(expectedProduct, 0), 1);
    expect(result.overall).toBeCloseTo(expected, 6);
  });

  it('overall is 0 when any factor is 0', () => {
    // Factor 1: contributionConfidence = 0 (no contributions)
    const emptyResult = computeAssessmentConfidence([], makeEmptyAggregation());
    expect(emptyResult.overall).toBe(0);

    // Factor 2: evidenceCompleteness = 0 (no evidence IDs)
    const noEvidence = [makeRuleContribution('rc_001', 8.0, 0.9, [])];
    const noEvidenceAgg = aggregateByDimension(noEvidence);
    const noEvidenceResult = computeAssessmentConfidence(noEvidence, noEvidenceAgg);
    expect(noEvidenceResult.overall).toBe(0);

    // Factor 3: aggregationQuality = 0 (no dimensions)
    const emptyAgg = makeEmptyAggregation();
    // Aggregation with zero dimensions has quality 0/3 = 0
    expect(computeAssessmentConfidence([], emptyAgg).overall).toBe(0);
  });

  it('overall is never greater than the minimum of the three factors', () => {
    const contributions = [
      makeRuleContribution('rc_001', 8.0, 0.7, ['ev-001']),
      makeCorrelationContribution('rc_002', 0.6, ['ev-002']),
      makeEvidenceContribution('rc_003', 0.95, ['ev-003']),
    ];
    const aggregation = aggregateByDimension(contributions);
    const result = computeAssessmentConfidence(contributions, aggregation);

    // Since all factors <= 1, product <= min(factors)
    const minFactor = Math.min(
      result.factors.contributionConfidence,
      result.factors.evidenceCompleteness,
      result.factors.aggregationQuality,
    );
    expect(result.overall).toBeLessThanOrEqual(minFactor);
  });

  it('hasSufficientEvidence matches overall >= CONFIDENCE_MIN_SUFFICIENT', () => {
    const testCases = [
      { contributions: [], expected: false },
      {
        contributions: [makeRuleContribution('rc_001', 10.0, 1.0, ['ev-001'])],
        expected: true, // 1/3 quality ≈ 0.333 → 1.0 * 1.0 * 0.333 = 0.333 >= 0.3 → true
      },
      {
        contributions: [
          makeRuleContribution('rc_001', 10.0, 1.0, ['ev-001']),
          makeCorrelationContribution('rc_002', 1.0, ['ev-002']),
        ],
        expected: true, // 2/3 quality ≈ 0.667 → 1.0 * 1.0 * 0.667 = 0.667 >= 0.3 → true
      },
      {
        contributions: [
          makeRuleContribution('rc_001', 10.0, 1.0, ['ev-001']),
          makeCorrelationContribution('rc_002', 1.0, ['ev-002']),
          makeEvidenceContribution('rc_003', 1.0, ['ev-003']),
        ],
        expected: true, // 1.0 * 1.0 * 1.0 = 1.0 >= 0.3 → true
      },
    ];

    for (const tc of testCases) {
      const agg =
        tc.contributions.length > 0
          ? aggregateByDimension(tc.contributions)
          : makeEmptyAggregation();
      const result = computeAssessmentConfidence(tc.contributions, agg);
      expect(result.hasSufficientEvidence).toBe(tc.expected);
    }
  });
});

// ── Immutable Outputs ──

describe('immutable outputs', () => {
  it('ConfidenceBreakdown is frozen', () => {
    const contributions = [makeRuleContribution('rc_001', 8.0, 0.9, ['ev-001'])];
    const aggregation = aggregateByDimension(contributions);
    const result = computeAssessmentConfidence(contributions, aggregation);

    expect(Object.isFrozen(result)).toBe(true);
  });

  it('ConfidenceFactors is frozen', () => {
    const contributions = [makeRuleContribution('rc_001', 8.0, 0.9, ['ev-001'])];
    const aggregation = aggregateByDimension(contributions);
    const result = computeAssessmentConfidence(contributions, aggregation);

    expect(Object.isFrozen(result.factors)).toBe(true);
  });

  it('upstream contributions are never mutated by the confidence computation', () => {
    const contributions = [makeRuleContribution('rc_001', 8.0, 0.9, ['ev-001'])];
    const aggregation = aggregateByDimension(contributions);

    // Snapshot upstream state
    const snapshotConfidence = contributions[0].confidence;
    const snapshotEvidenceIds = [...contributions[0].evidenceIds];

    computeAssessmentConfidence(contributions, aggregation);

    // Verify unchanged
    expect(contributions[0].confidence).toBe(snapshotConfidence);
    expect([...contributions[0].evidenceIds]).toEqual(snapshotEvidenceIds);
  });

  it('upstream aggregation result is never mutated by the confidence computation', () => {
    const contributions = [makeRuleContribution('rc_001', 8.0, 0.9, ['ev-001'])];
    const aggregation = aggregateByDimension(contributions);

    // Snapshot
    const dimensionCount = aggregation.dimensions.length;

    computeAssessmentConfidence(contributions, aggregation);

    expect(aggregation.dimensions.length).toBe(dimensionCount);
    expect(Object.isFrozen(aggregation)).toBe(true);
  });
});

// ── Serialization Compatibility ──

describe('serialization compatibility', () => {
  it('ConfidenceBreakdown is JSON-serializable', () => {
    const contributions = [
      makeRuleContribution('rc_001', 8.0, 0.9, ['ev-001']),
      makeCorrelationContribution('rc_002', 0.8, ['ev-002']),
      makeEvidenceContribution('rc_003', 0.95, ['ev-003']),
    ];
    const aggregation = aggregateByDimension(contributions);
    const result = computeAssessmentConfidence(contributions, aggregation);

    const json = JSON.stringify(result);
    const parsed = JSON.parse(json);

    expect(parsed.overall).toBe(result.overall);
    expect(parsed.factors.contributionConfidence).toBe(result.factors.contributionConfidence);
    expect(parsed.factors.evidenceCompleteness).toBe(result.factors.evidenceCompleteness);
    expect(parsed.factors.aggregationQuality).toBe(result.factors.aggregationQuality);
    expect(parsed.hasSufficientEvidence).toBe(result.hasSufficientEvidence);
  });

  it('round-trips through JSON without data loss', () => {
    const contributions = [
      makeRuleContribution('rc_001', 8.0, 0.9, ['ev-001']),
      makeCorrelationContribution('rc_002', 0.8, ['ev-002']),
      makeEvidenceContribution('rc_003', 0.95, ['ev-003']),
    ];
    const aggregation = aggregateByDimension(contributions);
    const result = computeAssessmentConfidence(contributions, aggregation);

    const json = JSON.stringify(result);
    const parsed = JSON.parse(json);
    const reparsed = JSON.parse(JSON.stringify(parsed));

    expect(reparsed).toEqual(parsed);
  });

  it('all numeric values are finite numbers in normal operation', () => {
    const contributions = [
      makeRuleContribution('rc_001', 8.0, 0.9, ['ev-001']),
      makeCorrelationContribution('rc_002', 0.8, ['ev-002']),
      makeEvidenceContribution('rc_003', 0.95, ['ev-003']),
    ];
    const aggregation = aggregateByDimension(contributions);
    const result = computeAssessmentConfidence(contributions, aggregation);

    expect(typeof result.overall).toBe('number');
    expect(typeof result.factors.contributionConfidence).toBe('number');
    expect(typeof result.factors.evidenceCompleteness).toBe('number');
    expect(typeof result.factors.aggregationQuality).toBe('number');
    expect(typeof result.hasSufficientEvidence).toBe('boolean');

    expect(Number.isFinite(result.overall)).toBe(true);
    expect(Number.isFinite(result.factors.contributionConfidence)).toBe(true);
    expect(Number.isFinite(result.factors.evidenceCompleteness)).toBe(true);
    expect(Number.isFinite(result.factors.aggregationQuality)).toBe(true);
  });
});

// ── Comprehensive Pipeline Test ──

describe('comprehensive pipeline test', () => {
  it('produces a complete, deterministic ConfidenceBreakdown from realistic inputs', () => {
    const contributions = [
      // Rule contributions — varying confidence
      makeRuleContribution('rc_rule_injection', 8.5, 0.9, ['ev-import', 'ev-api']),
      makeRuleContribution('rc_rule_obfuscation', 6.0, 0.75, ['ev-entropy']),

      // Correlation contribution — behavioral chain
      makeCorrelationContribution('rc_corr_chain', 0.8, ['ev-import', 'ev-api', 'ev-entropy']),

      // Evidence contributions — traceability
      makeEvidenceContribution('rc_ev_import', 0.95, ['ev-import']),
      makeEvidenceContribution('rc_ev_api', 0.85, ['ev-api']),
      makeEvidenceContribution('rc_ev_entropy', 0.7, ['ev-entropy']),
    ];

    const aggregation = aggregateByDimension(contributions);
    const result = computeAssessmentConfidence(contributions, aggregation);

    // ── Structure ──
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.factors)).toBe(true);

    // ── Factors ──
    expect(result.factors.contributionConfidence).toBeGreaterThan(0);
    expect(result.factors.contributionConfidence).toBeLessThanOrEqual(1);

    // contributionConfidence = (0.9 + 0.75 + 0.8 + 0.95 + 0.85 + 0.7) / 6
    // = 4.95 / 6 = 0.825
    expect(result.factors.contributionConfidence).toBeCloseTo(0.825, 4);

    // evidenceCompleteness: unique IDs = {ev-import, ev-api, ev-entropy} = 3
    // total references = (2 + 1 + 3 + 1 + 1 + 1) = 9
    // = 3/9 ≈ 0.333333
    expect(result.factors.evidenceCompleteness).toBeCloseTo(3 / 9, 4);

    // aggregationQuality: 3 dimensions / 3 = 1.0
    expect(result.factors.aggregationQuality).toBe(1.0);

    // overall = 0.825 * 0.333333 * 1.0 ≈ 0.275
    expect(result.overall).toBeCloseTo(0.825 * (3 / 9) * 1.0, 4);
    expect(result.hasSufficientEvidence).toBe(false); // 0.275 < 0.3

    // ── Determinism ──
    const rerun = computeAssessmentConfidence(contributions, aggregation);
    expect(rerun).toEqual(result);

    // ── All fields present ──
    expect(typeof result.overall).toBe('number');
    expect(typeof result.factors.contributionConfidence).toBe('number');
    expect(typeof result.factors.evidenceCompleteness).toBe('number');
    expect(typeof result.factors.aggregationQuality).toBe('number');
    expect(typeof result.hasSufficientEvidence).toBe('boolean');
  });
});
