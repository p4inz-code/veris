/**
 * Tests for @veris/risk/aggregator — deterministic dimension aggregation.
 *
 * ## Test Coverage
 *
 * ✓ empty input
 * ✓ single dimension
 * ✓ multiple dimensions
 * ✓ mixed severities
 * ✓ duplicate dimensions
 * ✓ ordering guarantees
 * ✓ deterministic repeated execution (10k+)
 * ✓ mathematical invariants
 * ✓ saturation behavior
 * ✓ trace reference correctness
 * ✓ immutable outputs
 * ✓ invalid inputs
 *
 * ## Determinism Guarantee
 * Identical inputs must always produce identical AggregationResult,
 * including summaries, ordering, computed values, and trace references.
 *
 * @module @veris/risk/__tests__/aggregator
 */

import { describe, it, expect } from 'vitest';
import { aggregateByDimension, computeEffectiveWeight } from '../src/index.js';
import type { Contribution, SourceType } from '../src/index.js';
import { SOURCE_TYPES } from '../src/types.js';
import { computeDimensionWeight, saturate, round6 } from '../src/scoring.js';
import { RISK_SCORE_MAX, CONFIDENCE_MIN, CONFIDENCE_MAX } from '../src/constants.js';

// ── Helpers ──

function makeContribution(overrides: {
  id: string;
  sourceType: SourceType;
  sourceId: string;
  effectiveValue: number;
  confidence: number;
  metadata?: Record<string, unknown>;
  explanation?: string;
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
    evidenceIds: Object.freeze([]),
    explanation: overrides.explanation ?? overrides.sourceId,
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
  extra?: { taxonomyIds?: readonly string[] },
): Contribution {
  return makeContribution({
    id,
    sourceType: SOURCE_TYPES.RULE,
    sourceId: id,
    effectiveValue,
    confidence,
    metadata: { taxonomyIds: Object.freeze(extra?.taxonomyIds ?? []) },
  });
}

function makeCorrelationContribution(
  id: string,
  effectiveValue: number,
  confidence: number,
  chainLength: number,
): Contribution {
  return makeContribution({
    id,
    sourceType: SOURCE_TYPES.CORRELATION,
    sourceId: id,
    effectiveValue,
    confidence,
    metadata: { chainLength },
  });
}

function makeEvidenceContribution(
  id: string,
  effectiveValue: number,
  confidence: number,
): Contribution {
  return makeContribution({
    id,
    sourceType: SOURCE_TYPES.EVIDENCE,
    sourceId: id,
    effectiveValue,
    confidence,
    metadata: { category: 'test', artifactId: 'art-001' },
  });
}

// ── computeEffectiveWeight ──

describe('computeEffectiveWeight', () => {
  it('delegates to computeDimensionWeight with clamped inputs', () => {
    const result = computeEffectiveWeight(0.8, 1);
    const expected = computeDimensionWeight(0.8, 1);
    expect(result).toBe(expected);
  });

  it('clamps meanConfidence above 1.0 to 1.0', () => {
    const result = computeEffectiveWeight(1.5, 1);
    const expected = computeDimensionWeight(1.0, 1);
    expect(result).toBe(expected);
  });

  it('clamps meanConfidence below 0.0 to 0.0', () => {
    const result = computeEffectiveWeight(-0.5, 1);
    const expected = computeDimensionWeight(0.0, 1);
    expect(result).toBe(expected);
  });

  it('ensures chain length is at least 1', () => {
    const result = computeEffectiveWeight(0.8, 0);
    // chainLength = 0 → clamped to 1
    const expected = computeDimensionWeight(0.8, 1);
    expect(result).toBe(expected);
  });

  it('handles chainLength = 0 (clamped to 1)', () => {
    const result = computeEffectiveWeight(0.7, 0);
    const expected = computeDimensionWeight(0.7, 1);
    expect(result).toBe(expected);
  });

  it('handles negative chainLength (clamped to 1)', () => {
    const result = computeEffectiveWeight(0.7, -5);
    const expected = computeDimensionWeight(0.7, 1);
    expect(result).toBe(expected);
  });

  it('handles chain amplification for chainLength = 5', () => {
    const result = computeEffectiveWeight(0.8, 5);
    const expected = computeDimensionWeight(0.8, 5);
    expect(result).toBe(expected);
  });

  it('returns NaN for NaN confidence', () => {
    expect(computeEffectiveWeight(NaN, 1)).toBeNaN();
  });

  it('returns NaN for NaN chainLength', () => {
    expect(computeEffectiveWeight(0.8, NaN)).toBeNaN();
  });

  it('produces identical output for 10,000 iterations (determinism)', () => {
    const testCases = [
      [0.7, 1],
      [0.8, 5],
      [0.5, 10],
      [1.0, 21],
    ] as const;

    for (const [dc, cl] of testCases) {
      const expected = computeEffectiveWeight(dc, cl);
      for (let i = 0; i < 10_000; i++) {
        expect(computeEffectiveWeight(dc, cl)).toBe(expected);
      }
    }
  });

  it('result is always in [0.0, 1.0]', () => {
    const testCases = [
      [0.5, 1],
      [0.0, 5],
      [1.0, 21],
      [-0.5, 3],
      [1.5, 10],
      [0.8, 0],
      [0.8, -1],
    ] as const;

    for (const [dc, cl] of testCases) {
      const result = computeEffectiveWeight(dc, cl);
      if (!Number.isNaN(result)) {
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(1);
      }
    }
  });
});

// ── Empty Input ──

describe('empty input', () => {
  it('returns empty dimensions array for empty contributions', () => {
    const result = aggregateByDimension([]);
    expect(result.dimensions).toEqual([]);
    expect(result.totalContributions).toBe(0);
    expect(result.totalSummedValue).toBe(0);
  });

  it('returns immutable result for empty input', () => {
    const result = aggregateByDimension([]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.dimensions)).toBe(true);
  });
});

// ── Single Dimension ──

describe('single dimension', () => {
  it('aggregates a single rule contribution', () => {
    const contributions = [makeRuleContribution('rc_rule_001', 5.6, 0.8)];
    const result = aggregateByDimension(contributions);

    expect(result.dimensions.length).toBe(1);
    expect(result.dimensions[0].dimension).toBe(SOURCE_TYPES.RULE);
    expect(result.dimensions[0].contributionCount).toBe(1);
    expect(result.dimensions[0].summedValue).toBe(5.6);
    expect(result.dimensions[0].contributionIds).toEqual(['rc_rule_001']);
  });

  it('aggregates a single correlation contribution', () => {
    const contributions = [makeCorrelationContribution('rc_corr_001', 0, 0.7, 3)];
    const result = aggregateByDimension(contributions);

    expect(result.dimensions.length).toBe(1);
    expect(result.dimensions[0].dimension).toBe(SOURCE_TYPES.CORRELATION);
    expect(result.dimensions[0].contributionCount).toBe(1);
    expect(result.dimensions[0].summedValue).toBe(0);
  });

  it('aggregates a single evidence contribution', () => {
    const contributions = [makeEvidenceContribution('rc_ev_001', 0, 0.9)];
    const result = aggregateByDimension(contributions);

    expect(result.dimensions.length).toBe(1);
    expect(result.dimensions[0].dimension).toBe(SOURCE_TYPES.EVIDENCE);
    expect(result.dimensions[0].contributionCount).toBe(1);
  });

  it('computes correct saturatedScore for rule dimension', () => {
    const contributions = [makeRuleContribution('rc_001', 8.0, 0.9)];
    const result = aggregateByDimension(contributions);

    const summedValue = 8.0;
    const meanConfidence = 0.9;
    const effectiveWeight = computeDimensionWeight(meanConfidence, 1);
    const normalizedSum = summedValue / RISK_SCORE_MAX;
    const expectedSaturated = round6(saturate(normalizedSum) * effectiveWeight);

    expect(result.dimensions[0].saturatedScore).toBe(expectedSaturated);
  });

  it('includes intermediate calculations', () => {
    const contributions = [makeRuleContribution('rc_001', 5.6, 0.8)];
    const result = aggregateByDimension(contributions);

    const interp = result.dimensions[0].intermediateCalculations;
    expect(interp.meanConfidence).toBe(0.8);
    expect(interp.effectiveChainLength).toBe(1);
    expect(interp.normalizedSum).toBe(0.56);
    expect(typeof interp.rawWeightedScore).toBe('number');
  });
});

// ── Multiple Dimensions ──

describe('multiple dimensions', () => {
  it('aggregates contributions across all three dimensions', () => {
    const contributions = [
      makeRuleContribution('rc_rule_001', 5.6, 0.8),
      makeCorrelationContribution('rc_corr_001', 0, 0.7, 3),
      makeEvidenceContribution('rc_ev_001', 0, 0.9),
    ];
    const result = aggregateByDimension(contributions);

    expect(result.dimensions.length).toBe(3);
    expect(result.dimensions[0].dimension).toBe(SOURCE_TYPES.RULE);
    expect(result.dimensions[1].dimension).toBe(SOURCE_TYPES.CORRELATION);
    expect(result.dimensions[2].dimension).toBe(SOURCE_TYPES.EVIDENCE);
  });

  it('computes total contributions and total summed value', () => {
    const contributions = [
      makeRuleContribution('rc_rule_001', 5.6, 0.8),
      makeRuleContribution('rc_rule_002', 3.2, 0.6),
      makeCorrelationContribution('rc_corr_001', 0, 0.7, 3),
      makeEvidenceContribution('rc_ev_001', 0, 0.9),
    ];
    const result = aggregateByDimension(contributions);

    expect(result.totalContributions).toBe(4);
    expect(result.totalSummedValue).toBe(round6(5.6 + 3.2 + 0 + 0));
  });

  it('each dimension has correct contribution count', () => {
    const contributions = [
      makeRuleContribution('rc_rule_001', 5.6, 0.8),
      makeRuleContribution('rc_rule_002', 3.2, 0.6),
      makeCorrelationContribution('rc_corr_001', 0, 0.7, 3),
      makeEvidenceContribution('rc_ev_001', 0, 0.9),
      makeEvidenceContribution('rc_ev_002', 0, 0.5),
    ];
    const result = aggregateByDimension(contributions);

    expect(result.dimensions[0].contributionCount).toBe(2); // rule
    expect(result.dimensions[1].contributionCount).toBe(1); // correlation
    expect(result.dimensions[2].contributionCount).toBe(2); // evidence
  });

  it('updates totalSummedValue when contributions have non-zero values', () => {
    const contributions = [
      makeRuleContribution('rc_rule_001', 7.0, 0.8),
      makeRuleContribution('rc_rule_002', 3.0, 0.5),
    ];
    const result = aggregateByDimension(contributions);

    expect(result.totalSummedValue).toBe(round6(7.0 + 3.0));
  });
});

// ── Mixed Severities ──

describe('mixed severities', () => {
  it('aggregates rule contributions with varying effective values', () => {
    const contributions = [
      makeRuleContribution('rc_high', 9.5, 1.0),
      makeRuleContribution('rc_med', 5.0, 0.8),
      makeRuleContribution('rc_low', 1.0, 0.3),
    ];
    const result = aggregateByDimension(contributions);

    expect(result.dimensions[0].contributionCount).toBe(3);
    expect(result.dimensions[0].summedValue).toBe(round6(9.5 + 5.0 + 1.0));
  });

  it('mean confidence reflects all confidences in the dimension', () => {
    const contributions = [
      makeRuleContribution('rc_001', 7.0, 0.9),
      makeRuleContribution('rc_002', 5.0, 0.7),
      makeRuleContribution('rc_003', 3.0, 0.5),
    ];
    const result = aggregateByDimension(contributions);

    // meanConfidence = (0.9 + 0.7 + 0.5) / 3 = 0.7
    expect(result.dimensions[0].intermediateCalculations.meanConfidence).toBeCloseTo(0.7, 6);
  });

  it('saturated score increases with more/severe contributions', () => {
    const lowRisk = [makeRuleContribution('rc_001', 1.0, 0.3)];
    const highRisk = [makeRuleContribution('rc_001', 9.5, 0.95)];

    const lowResult = aggregateByDimension(lowRisk);
    const highResult = aggregateByDimension(highRisk);

    expect(highResult.dimensions[0].saturatedScore).toBeGreaterThan(
      lowResult.dimensions[0].saturatedScore,
    );
  });
});

// ── Duplicate Dimensions ──

describe('duplicate contributions within same dimension', () => {
  it('correctly aggregates multiple contributions in the same dimension', () => {
    const contributions = [
      makeRuleContribution('rc_001', 4.0, 0.7),
      makeRuleContribution('rc_002', 6.0, 0.8),
      makeRuleContribution('rc_003', 2.0, 0.5),
    ];
    const result = aggregateByDimension(contributions);

    expect(result.dimensions.length).toBe(1);
    expect(result.dimensions[0].contributionCount).toBe(3);
    expect(result.dimensions[0].summedValue).toBe(round6(4.0 + 6.0 + 2.0));
  });

  it('trace references include all contribution IDs in input order', () => {
    const contributions = [
      makeRuleContribution('rc_003', 3.0, 0.5),
      makeRuleContribution('rc_001', 7.0, 0.9),
      makeRuleContribution('rc_002', 5.0, 0.7),
    ];
    const result = aggregateByDimension(contributions);

    expect(result.dimensions[0].contributionIds).toEqual(['rc_003', 'rc_001', 'rc_002']);
  });
});

// ── Ordering Guarantees ──

describe('ordering guarantees', () => {
  it('dimensions are always ordered: rule → correlation → evidence', () => {
    // Test with various input orderings
    const inputs = [
      {
        label: 'rule, evidence, correlation',
        contributions: [
          makeRuleContribution('rc_rule', 5.0, 0.8),
          makeEvidenceContribution('rc_ev', 0, 0.9),
          makeCorrelationContribution('rc_corr', 0, 0.7, 3),
        ],
      },
      {
        label: 'evidence, correlation, rule',
        contributions: [
          makeEvidenceContribution('rc_ev', 0, 0.9),
          makeCorrelationContribution('rc_corr', 0, 0.7, 3),
          makeRuleContribution('rc_rule', 5.0, 0.8),
        ],
      },
      {
        label: 'correlation, rule, evidence',
        contributions: [
          makeCorrelationContribution('rc_corr', 0, 0.7, 3),
          makeRuleContribution('rc_rule', 5.0, 0.8),
          makeEvidenceContribution('rc_ev', 0, 0.9),
        ],
      },
    ];

    for (const { label, contributions } of inputs) {
      const result = aggregateByDimension(contributions);
      expect(result.dimensions[0].dimension).toBe(SOURCE_TYPES.RULE);
      expect(result.dimensions[1].dimension).toBe(SOURCE_TYPES.CORRELATION);
      expect(result.dimensions[2].dimension).toBe(SOURCE_TYPES.EVIDENCE);
    }
  });

  it('missing dimensions are omitted (no empty dimension summaries)', () => {
    const onlyRules = [makeRuleContribution('rc_001', 5.0, 0.8)];
    const onlyCorrelations = [makeCorrelationContribution('rc_001', 0, 0.7, 3)];
    const onlyEvidence = [makeEvidenceContribution('rc_001', 0, 0.9)];

    const rulesResult = aggregateByDimension(onlyRules);
    expect(rulesResult.dimensions.length).toBe(1);
    expect(rulesResult.dimensions[0].dimension).toBe(SOURCE_TYPES.RULE);

    const corrResult = aggregateByDimension(onlyCorrelations);
    expect(corrResult.dimensions.length).toBe(1);
    expect(corrResult.dimensions[0].dimension).toBe(SOURCE_TYPES.CORRELATION);

    const evResult = aggregateByDimension(onlyEvidence);
    expect(evResult.dimensions.length).toBe(1);
    expect(evResult.dimensions[0].dimension).toBe(SOURCE_TYPES.EVIDENCE);
  });
});

// ── Deterministic Repeated Execution ──

describe('deterministic repeated execution', () => {
  it('produces identical output for 10,000 iterations', () => {
    const contributions = [
      makeRuleContribution('rc_rule_001', 7.0, 0.85),
      makeRuleContribution('rc_rule_002', 3.5, 0.6),
      makeCorrelationContribution('rc_corr_001', 0, 0.75, 4),
      makeEvidenceContribution('rc_ev_001', 0, 0.9),
    ];

    const expected = aggregateByDimension(contributions);

    for (let i = 0; i < 10_000; i++) {
      const actual = aggregateByDimension(contributions);
      expect(actual.dimensions.length).toBe(expected.dimensions.length);
      for (let j = 0; j < actual.dimensions.length; j++) {
        expect(actual.dimensions[j].dimension).toBe(expected.dimensions[j].dimension);
        expect(actual.dimensions[j].contributionCount).toBe(
          expected.dimensions[j].contributionCount,
        );
        expect(actual.dimensions[j].summedValue).toBe(expected.dimensions[j].summedValue);
        expect(actual.dimensions[j].effectiveWeight).toBe(expected.dimensions[j].effectiveWeight);
        expect(actual.dimensions[j].saturatedScore).toBe(expected.dimensions[j].saturatedScore);
        expect(actual.dimensions[j].contributionIds).toEqual(
          expected.dimensions[j].contributionIds,
        );
      }
      expect(actual.totalContributions).toBe(expected.totalContributions);
      expect(actual.totalSummedValue).toBe(expected.totalSummedValue);
    }
  });

  it('produces identical output for large inputs', () => {
    const contributions = Array.from({ length: 100 }, (_, i) =>
      i < 40
        ? makeRuleContribution(`rc_rule_${i}`, Math.random() * 10, 0.5 + Math.random() * 0.5)
        : i < 70
          ? makeCorrelationContribution(
              `rc_corr_${i}`,
              0,
              0.5 + Math.random() * 0.5,
              Math.floor(Math.random() * 10) + 1,
            )
          : makeEvidenceContribution(`rc_ev_${i}`, 0, 0.5 + Math.random() * 0.5),
    );

    const expected = aggregateByDimension(contributions);
    for (let i = 0; i < 100; i++) {
      const actual = aggregateByDimension(contributions);
      expect(actual.dimensions.map((d) => d.dimension)).toEqual(
        expected.dimensions.map((d) => d.dimension),
      );
      expect(actual.dimensions.map((d) => d.summedValue)).toEqual(
        expected.dimensions.map((d) => d.summedValue),
      );
    }
  });
});

// ── Mathematical Invariants ──

describe('mathematical invariants', () => {
  it('summedValue is always ≥ 0', () => {
    const contributions = [
      makeRuleContribution('rc_001', 5.0, 0.8),
      makeRuleContribution('rc_002', 3.0, 0.5),
    ];
    const result = aggregateByDimension(contributions);

    for (const dim of result.dimensions) {
      expect(dim.summedValue).toBeGreaterThanOrEqual(0);
    }
    expect(result.totalSummedValue).toBeGreaterThanOrEqual(0);
  });

  it('effectiveWeight is always in [0.0, 1.0]', () => {
    const contributions = [
      makeRuleContribution('rc_001', 5.0, 0.8),
      makeRuleContribution('rc_002', 3.0, 0.5),
      makeCorrelationContribution('rc_corr_001', 0, 0.7, 5),
    ];
    const result = aggregateByDimension(contributions);

    for (const dim of result.dimensions) {
      expect(dim.effectiveWeight).toBeGreaterThanOrEqual(0);
      expect(dim.effectiveWeight).toBeLessThanOrEqual(1);
    }
  });

  it('saturatedScore is always in [0.0, 1.0)', () => {
    const contributions = [
      makeRuleContribution('rc_001', 10.0, 1.0),
      makeRuleContribution('rc_002', 10.0, 1.0),
      makeRuleContribution('rc_003', 10.0, 1.0),
      makeCorrelationContribution('rc_corr_001', 0, 1.0, 100),
    ];
    const result = aggregateByDimension(contributions);

    for (const dim of result.dimensions) {
      expect(dim.saturatedScore).toBeGreaterThanOrEqual(0);
      expect(dim.saturatedScore).toBeLessThanOrEqual(1);
    }
  });

  it('totalContributions equals sum of all dimension counts', () => {
    const contributions = [
      makeRuleContribution('rc_rule_001', 5.0, 0.8),
      makeRuleContribution('rc_rule_002', 3.0, 0.5),
      makeCorrelationContribution('rc_corr_001', 0, 0.7, 3),
      makeCorrelationContribution('rc_corr_002', 0, 0.6, 2),
      makeEvidenceContribution('rc_ev_001', 0, 0.9),
    ];
    const result = aggregateByDimension(contributions);

    const sumOfCounts = result.dimensions.reduce((s, d) => s + d.contributionCount, 0);
    expect(result.totalContributions).toBe(sumOfCounts);
  });

  it('totalSummedValue equals sum of all dimension summedValues', () => {
    const contributions = [
      makeRuleContribution('rc_rule_001', 7.0, 0.8),
      makeCorrelationContribution('rc_corr_001', 0, 0.7, 3),
    ];
    const result = aggregateByDimension(contributions);

    const sumOfValues = result.dimensions.reduce((s, d) => s + d.summedValue, 0);
    expect(result.totalSummedValue).toBe(round6(sumOfValues));
  });

  it('saturatedScore is ≤ effectiveWeight (saturate(x) ≤ 1)', () => {
    const contributions = [makeRuleContribution('rc_001', 10.0, 1.0)];
    const result = aggregateByDimension(contributions);

    expect(result.dimensions[0].saturatedScore).toBeLessThanOrEqual(
      result.dimensions[0].effectiveWeight,
    );
  });
});

// ── Saturation Behavior ──

describe('saturation behavior', () => {
  it('saturatedScore approaches effectiveWeight as summedValue increases', () => {
    const veryHigh = [makeRuleContribution('rc_001', 100.0, 0.9)];
    const result = aggregateByDimension(veryHigh);

    // normalizedSum = 100/10 = 10, saturate(10) ≈ 1.0
    // So saturatedScore ≈ effectiveWeight
    expect(result.dimensions[0].saturatedScore).toBeCloseTo(
      result.dimensions[0].effectiveWeight,
      3,
    );
  });

  it('saturatedScore is 0 when summedValue is 0', () => {
    const zeroValue = [makeRuleContribution('rc_001', 0, 0.8)];
    const result = aggregateByDimension(zeroValue);

    expect(result.dimensions[0].saturatedScore).toBe(0);
  });

  it('saturatedScore is non-decreasing with more contributions', () => {
    const oneContribution = [makeRuleContribution('rc_001', 5.0, 0.8)];
    const twoContributions = [
      makeRuleContribution('rc_001', 5.0, 0.8),
      makeRuleContribution('rc_002', 3.0, 0.7),
    ];

    const oneResult = aggregateByDimension(oneContribution);
    const twoResult = aggregateByDimension(twoContributions);

    expect(twoResult.dimensions[0].saturatedScore).toBeGreaterThanOrEqual(
      oneResult.dimensions[0].saturatedScore,
    );
  });
});

// ── Trace Reference Correctness ──

describe('trace reference correctness', () => {
  it('contributionIds match the IDs of input contributions', () => {
    const contributions = [
      makeRuleContribution('rc_abc123', 5.0, 0.8),
      makeRuleContribution('rc_def456', 3.0, 0.6),
      makeCorrelationContribution('rc_ghi789', 0, 0.7, 3),
    ];
    const result = aggregateByDimension(contributions);

    expect(result.dimensions[0].contributionIds).toContain('rc_abc123');
    expect(result.dimensions[0].contributionIds).toContain('rc_def456');
    expect(result.dimensions[1].contributionIds).toContain('rc_ghi789');
  });

  it('trace references are in input order within each dimension', () => {
    const contributions = [
      makeRuleContribution('rc_003', 3.0, 0.5),
      makeRuleContribution('rc_001', 7.0, 0.9),
      makeCorrelationContribution('rc_corr_002', 0, 0.6, 2),
      makeRuleContribution('rc_002', 5.0, 0.7),
      makeCorrelationContribution('rc_corr_001', 0, 0.8, 4),
    ];
    const result = aggregateByDimension(contributions);

    // Rule dimension: contributions 0, 1, 3 → "rc_003", "rc_001", "rc_002"
    expect(result.dimensions[0].contributionIds).toEqual(['rc_003', 'rc_001', 'rc_002']);

    // Correlation dimension: contributions 2, 4 → "rc_corr_002", "rc_corr_001"
    expect(result.dimensions[1].contributionIds).toEqual(['rc_corr_002', 'rc_corr_001']);
  });

  it('no duplicate trace references for unique contributions', () => {
    const contributions = [
      makeRuleContribution('rc_001', 5.0, 0.8),
      makeRuleContribution('rc_002', 3.0, 0.6),
    ];
    const result = aggregateByDimension(contributions);

    const ids = result.dimensions[0].contributionIds;
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

// ── Immutable Outputs ──

describe('immutable outputs', () => {
  it('AggregationResult is frozen', () => {
    const contributions = [makeRuleContribution('rc_001', 5.0, 0.8)];
    const result = aggregateByDimension(contributions);

    expect(Object.isFrozen(result)).toBe(true);
  });

  it('dimensions array is frozen', () => {
    const contributions = [makeRuleContribution('rc_001', 5.0, 0.8)];
    const result = aggregateByDimension(contributions);

    expect(Object.isFrozen(result.dimensions)).toBe(true);
  });

  it('each DimensionSummary is frozen', () => {
    const contributions = [
      makeRuleContribution('rc_001', 5.0, 0.8),
      makeCorrelationContribution('rc_corr_001', 0, 0.7, 3),
      makeEvidenceContribution('rc_ev_001', 0, 0.9),
    ];
    const result = aggregateByDimension(contributions);

    for (const dim of result.dimensions) {
      expect(Object.isFrozen(dim)).toBe(true);
    }
  });

  it('contributionIds arrays are frozen', () => {
    const contributions = [makeRuleContribution('rc_001', 5.0, 0.8)];
    const result = aggregateByDimension(contributions);

    expect(Object.isFrozen(result.dimensions[0].contributionIds)).toBe(true);
  });

  it('intermediateCalculations objects are frozen', () => {
    const contributions = [makeRuleContribution('rc_001', 5.0, 0.8)];
    const result = aggregateByDimension(contributions);

    expect(Object.isFrozen(result.dimensions[0].intermediateCalculations)).toBe(true);
  });

  it('upstream contributions are never mutated by the aggregator', () => {
    const contributions = [makeRuleContribution('rc_001', 5.0, 0.8)];

    // Snapshot upstream state
    const snapshot = contributions[0].effectiveValue;

    aggregateByDimension(contributions);

    // Verify unchanged
    expect(contributions[0].effectiveValue).toBe(snapshot);
    expect(contributions[0].confidence).toBe(0.8);
    expect(contributions[0].sourceType).toBe(SOURCE_TYPES.RULE);
  });
});

// ── Invalid Inputs ──

describe('invalid inputs', () => {
  it('throws TypeError when contributions is null', () => {
    expect(() => (aggregateByDimension as any)(null)).toThrow(TypeError);
  });

  it('throws TypeError when contributions is undefined', () => {
    expect(() => (aggregateByDimension as any)(undefined)).toThrow(TypeError);
  });
});

// ── Correlation Dimension Chain Length ──

describe('correlation dimension chain length', () => {
  it('uses max chainLength from correlation contributions', () => {
    const contributions = [
      makeCorrelationContribution('rc_corr_001', 0, 0.7, 3),
      makeCorrelationContribution('rc_corr_002', 0, 0.8, 5),
      makeCorrelationContribution('rc_corr_003', 0, 0.6, 2),
    ];
    const result = aggregateByDimension(contributions);

    expect(result.dimensions[0].intermediateCalculations.effectiveChainLength).toBe(5);
  });

  it('defaults to chainLength 1 for correlations without chainLength metadata', () => {
    const contributions = [
      makeContribution({
        id: 'rc_corr_001',
        sourceType: SOURCE_TYPES.CORRELATION,
        sourceId: 'rc_corr_001',
        effectiveValue: 0,
        confidence: 0.7,
        metadata: {}, // no chainLength
      }),
    ];
    const result = aggregateByDimension(contributions);

    expect(result.dimensions[0].intermediateCalculations.effectiveChainLength).toBe(1);
  });

  it('uses chainLength 1 for rule dimension (not affected by correlation chains)', () => {
    const contributions = [
      makeRuleContribution('rc_rule_001', 5.0, 0.8),
      makeCorrelationContribution('rc_corr_001', 0, 0.7, 10),
    ];
    const result = aggregateByDimension(contributions);

    // Rule dimension should have chainLength 1 regardless of correlations
    expect(result.dimensions[0].intermediateCalculations.effectiveChainLength).toBe(1);
    // Correlation dimension should have chainLength 10
    expect(result.dimensions[1].intermediateCalculations.effectiveChainLength).toBe(10);
  });
});

// ── Cross-function Invariants ──

describe('cross-function invariants', () => {
  it('computeEffectiveWeight matches computeDimensionWeight for valid inputs', () => {
    const testCases = [
      [0.7, 1],
      [0.8, 5],
      [0.5, 10],
      [1.0, 21],
      [0.0, 1],
    ] as const;

    for (const [dc, cl] of testCases) {
      expect(computeEffectiveWeight(dc, cl)).toBe(computeDimensionWeight(dc, cl));
    }
  });

  it('aggregateByDimension with same contributions produces identical deep equality', () => {
    const contributions = [
      makeRuleContribution('rc_001', 5.0, 0.8),
      makeCorrelationContribution('rc_corr_001', 0, 0.7, 3),
    ];

    const result1 = aggregateByDimension(contributions);
    const result2 = aggregateByDimension(contributions);

    expect(result1).toEqual(result2);
  });

  it('all saturatedScore values are consistent with the formula', () => {
    const contributions = [makeRuleContribution('rc_001', 8.0, 0.9)];
    const result = aggregateByDimension(contributions);

    const dim = result.dimensions[0];
    const { meanConfidence, effectiveChainLength, normalizedSum } = dim.intermediateCalculations;
    const effectiveWeight = computeDimensionWeight(meanConfidence, effectiveChainLength);
    const expectedSaturated = round6(saturate(normalizedSum) * effectiveWeight);

    expect(dim.effectiveWeight).toBe(effectiveWeight);
    expect(dim.saturatedScore).toBe(expectedSaturated);
  });
});

// ── Comprehensive Pipeline Test ──

describe('comprehensive pipeline test', () => {
  it('aggregates a realistic mixed input with full verification', () => {
    const contributions = [
      // Rule contributions — high severity
      makeRuleContribution('rc_rule_injection', 8.5, 0.9),
      makeRuleContribution('rc_rule_obfuscation', 6.0, 0.75),
      makeRuleContribution('rc_rule_persistence', 4.0, 0.6),

      // Correlation contribution — behavioral chain
      makeCorrelationContribution('rc_corr_chain', 0, 0.8, 4),

      // Evidence contributions — traceability
      makeEvidenceContribution('rc_ev_import', 0, 0.95),
      makeEvidenceContribution('rc_ev_api', 0, 0.85),
    ];

    const result = aggregateByDimension(contributions);

    // ── Structure ──
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.dimensions.length).toBe(3);

    // ── Dimension order ──
    expect(result.dimensions[0].dimension).toBe(SOURCE_TYPES.RULE);
    expect(result.dimensions[1].dimension).toBe(SOURCE_TYPES.CORRELATION);
    expect(result.dimensions[2].dimension).toBe(SOURCE_TYPES.EVIDENCE);

    // ── Totals ──
    expect(result.totalContributions).toBe(6);
    expect(result.totalSummedValue).toBe(round6(8.5 + 6.0 + 4.0 + 0 + 0 + 0));

    // ── Rule dimension ──
    const ruleDim = result.dimensions[0];
    expect(ruleDim.contributionCount).toBe(3);
    expect(ruleDim.summedValue).toBe(round6(8.5 + 6.0 + 4.0));
    expect(ruleDim.contributionIds.length).toBe(3);
    expect(ruleDim.intermediateCalculations.effectiveChainLength).toBe(1);
    expect(Object.isFrozen(ruleDim)).toBe(true);
    expect(Object.isFrozen(ruleDim.contributionIds)).toBe(true);
    expect(Object.isFrozen(ruleDim.intermediateCalculations)).toBe(true);

    // ── Correlation dimension ──
    const corrDim = result.dimensions[1];
    expect(corrDim.contributionCount).toBe(1);
    expect(corrDim.summedValue).toBe(0);
    expect(corrDim.contributionIds).toEqual(['rc_corr_chain']);
    expect(corrDim.intermediateCalculations.effectiveChainLength).toBe(4);
    expect(Object.isFrozen(corrDim)).toBe(true);

    // ── Evidence dimension ──
    const evDim = result.dimensions[2];
    expect(evDim.contributionCount).toBe(2);
    expect(evDim.summedValue).toBe(0);
    expect(evDim.contributionIds).toEqual(['rc_ev_import', 'rc_ev_api']);
    expect(evDim.intermediateCalculations.effectiveChainLength).toBe(1);
    expect(Object.isFrozen(evDim)).toBe(true);

    // ── Determinism ──
    const rerun = aggregateByDimension(contributions);
    expect(rerun).toEqual(result);
  });
});
