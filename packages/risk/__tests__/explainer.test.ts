/**
 * Tests for @veris/risk/explainer — deterministic explainability helpers.
 *
 * ## Test Coverage
 *
 * ✓ single contribution
 * ✓ multiple dimensions
 * ✓ top-K correctness
 * ✓ stable ordering
 * ✓ deterministic repeated execution (10k+)
 * ✓ empty assessment
 * ✓ immutable outputs
 * ✓ traceability preservation
 * ✓ explanation consistency
 * ✓ serialization compatibility
 *
 * ## Determinism Guarantee
 * Identical inputs must always produce identical explanations.
 *
 * @module @veris/risk/__tests__/explainer
 */

import { describe, it, expect } from 'vitest';
import {
  explainContribution,
  explainDimension,
  breakdownByDimension,
  topContributions,
  RiskEngine,
} from '../src/index.js';
import type { Contribution, SourceType, Severity, DimensionSummary } from '../src/index.js';
import { SOURCE_TYPES } from '../src/types.js';
import {
  makeSeverity,
  makeRuleMatch,
  makeCorrelation,
  makeEvidence,
  makeInput,
  TEST_TIMESTAMP,
} from './golden/helpers.js';

// ── Helpers ──

function makeContribution(overrides: {
  id: string;
  sourceType: SourceType;
  sourceId: string;
  effectiveValue: number;
  confidence: number;
  evidenceIds?: readonly string[];
  severity?: Severity | null;
  baseValue?: number;
  metadata?: Record<string, unknown>;
}): Contribution {
  return Object.freeze({
    id: overrides.id,
    sourceType: overrides.sourceType,
    sourceId: overrides.sourceId,
    sourceName: overrides.sourceId,
    baseValue: overrides.baseValue ?? overrides.effectiveValue,
    effectiveValue: overrides.effectiveValue,
    confidence: overrides.confidence,
    severity:
      overrides.severity !== undefined
        ? overrides.severity
        : overrides.sourceType === SOURCE_TYPES.RULE
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
  severityScore?: number,
): Contribution {
  return makeContribution({
    id,
    sourceType: SOURCE_TYPES.RULE,
    sourceId: id,
    effectiveValue,
    confidence,
    evidenceIds: evidenceIds ?? [`ev-${id}`],
    severity: { level: 'medium' as const, score: severityScore ?? effectiveValue },
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
    severity: null,
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
    severity: null,
    metadata: { category: 'test', artifactId: 'art-001' },
  });
}

// ── explainContribution ──

describe('explainContribution', () => {
  it('explains a rule contribution', () => {
    const contribution = makeRuleContribution('rc_rule_001', 7.5, 0.9, ['ev-001'], 8.0);
    const explanation = explainContribution(contribution);

    expect(explanation.valueSource).toBe('rule match');
    expect(explanation.valueBreakdown.baseValue).toBe(7.5);
    expect(explanation.valueBreakdown.effectiveValue).toBe(7.5);
    expect(explanation.valueBreakdown.multiplierCount).toBe(0);
    expect(explanation.traceability.id).toBe('rc_rule_001');
    expect(explanation.traceability.sourceId).toBe('rc_rule_001');
    expect(explanation.traceability.evidenceIds).toEqual(['ev-001']);
    expect(explanation.traceability.hasSeverity).toBe(true);
  });

  it('explains a correlation contribution', () => {
    const contribution = makeCorrelationContribution('rc_corr_001', 0.75, ['ev-001', 'ev-002']);
    const explanation = explainContribution(contribution);

    expect(explanation.valueSource).toBe('behavioral correlation');
    expect(explanation.valueBreakdown.baseValue).toBe(0);
    expect(explanation.valueBreakdown.effectiveValue).toBe(0);
    expect(explanation.traceability.hasSeverity).toBe(false);
  });

  it('explains an evidence contribution', () => {
    const contribution = makeEvidenceContribution('rc_ev_001', 0.95, ['ev-001']);
    const explanation = explainContribution(contribution);

    expect(explanation.valueSource).toBe('direct evidence');
    expect(explanation.traceability.hasSeverity).toBe(false);
  });

  it('preserves the original contribution reference', () => {
    const contribution = makeRuleContribution('rc_001', 5.0, 0.8);
    const explanation = explainContribution(contribution);

    expect(explanation.contribution).toBe(contribution);
  });

  it('reports multiplier count when multipliers exist', () => {
    const contribution = Object.freeze({
      ...makeRuleContribution('rc_001', 5.0, 0.8),
      multipliers: Object.freeze([{ name: 'test', value: 1.5, reason: 'test multiplier' }]),
      effectiveValue: 7.5,
    });
    const explanation = explainContribution(contribution);

    expect(explanation.valueBreakdown.multiplierCount).toBe(1);
    expect(explanation.valueBreakdown.effectiveValue).toBe(7.5);
  });

  it('throws TypeError for null input', () => {
    expect(() => (explainContribution as any)(null)).toThrow(TypeError);
  });

  it('throws TypeError for undefined input', () => {
    expect(() => (explainContribution as any)(undefined)).toThrow(TypeError);
  });

  it('produces a frozen result', () => {
    const contribution = makeRuleContribution('rc_001', 5.0, 0.8);
    const explanation = explainContribution(contribution);

    expect(Object.isFrozen(explanation)).toBe(true);
    expect(Object.isFrozen(explanation.valueBreakdown)).toBe(true);
    expect(Object.isFrozen(explanation.traceability)).toBe(true);
  });

  it('produces identical output for 10,000 iterations', () => {
    const contribution = makeRuleContribution('rc_001', 7.5, 0.9, ['ev-001']);
    const expected = explainContribution(contribution);

    for (let i = 0; i < 10_000; i++) {
      const actual = explainContribution(contribution);
      expect(actual.valueSource).toBe(expected.valueSource);
      expect(actual.valueBreakdown.effectiveValue).toBe(expected.valueBreakdown.effectiveValue);
      expect(actual.traceability.id).toBe(expected.traceability.id);
    }
  });
});

// ── explainDimension ──

describe('explainDimension', () => {
  it('explains a dimension with contributions', () => {
    const summary: DimensionSummary = Object.freeze({
      dimension: 'rule',
      contributionCount: 2,
      summedValue: 12.5,
      effectiveWeight: 0.85,
      saturatedScore: 0.72,
      intermediateCalculations: Object.freeze({
        meanConfidence: 0.85,
        effectiveChainLength: 1,
        normalizedSum: 1.25,
        rawWeightedScore: 1.0625,
      }),
      contributionIds: Object.freeze(['rc_001', 'rc_002']),
    });

    const contributions = [
      makeRuleContribution('rc_001', 7.5, 0.9),
      makeRuleContribution('rc_002', 5.0, 0.8),
    ];

    const explanation = explainDimension(summary, contributions);

    expect(explanation.dimension).toBe('rule');
    expect(explanation.contributionCount).toBe(2);
    expect(explanation.summedValue).toBe(12.5);
    expect(explanation.effectiveWeight).toBe(0.85);
    expect(explanation.saturatedScore).toBe(0.72);
    expect(explanation.contributions.length).toBe(2);
    expect(explanation.traceIds).toEqual(['rc_001', 'rc_002']);
  });

  it('sorts contributions by effectiveValue descending', () => {
    const summary: DimensionSummary = Object.freeze({
      dimension: 'rule',
      contributionCount: 3,
      summedValue: 15.0,
      effectiveWeight: 0.9,
      saturatedScore: 0.8,
      intermediateCalculations: Object.freeze({
        meanConfidence: 0.8,
        effectiveChainLength: 1,
        normalizedSum: 1.5,
        rawWeightedScore: 1.35,
      }),
      contributionIds: Object.freeze(['rc_003', 'rc_001', 'rc_002']),
    });

    const contributions = [
      makeRuleContribution('rc_003', 3.0, 0.5),
      makeRuleContribution('rc_001', 8.0, 0.9),
      makeRuleContribution('rc_002', 5.0, 0.7),
    ];

    const explanation = explainDimension(summary, contributions);

    expect(explanation.contributions[0].id).toBe('rc_001');
    expect(explanation.contributions[1].id).toBe('rc_002');
    expect(explanation.contributions[2].id).toBe('rc_003');
  });

  it('handles empty contributions array', () => {
    const summary: DimensionSummary = Object.freeze({
      dimension: 'rule',
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
    });

    const explanation = explainDimension(summary);

    expect(explanation.contributions).toEqual([]);
    expect(explanation.traceIds).toEqual([]);
  });

  it('throws TypeError for null summary', () => {
    expect(() => (explainDimension as any)(null)).toThrow(TypeError);
  });

  it('produces a frozen result', () => {
    const summary: DimensionSummary = Object.freeze({
      dimension: 'rule',
      contributionCount: 1,
      summedValue: 5.0,
      effectiveWeight: 0.8,
      saturatedScore: 0.4,
      intermediateCalculations: Object.freeze({
        meanConfidence: 0.8,
        effectiveChainLength: 1,
        normalizedSum: 0.5,
        rawWeightedScore: 0.4,
      }),
      contributionIds: Object.freeze(['rc_001']),
    });

    const contributions = [makeRuleContribution('rc_001', 5.0, 0.8)];
    const explanation = explainDimension(summary, contributions);

    expect(Object.isFrozen(explanation)).toBe(true);
    expect(Object.isFrozen(explanation.contributions)).toBe(true);
    expect(Object.isFrozen(explanation.traceIds)).toBe(true);
  });
});

// ── breakdownByDimension ──

describe('breakdownByDimension', () => {
  it('produces a breakdown from a RiskAssessment', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [
        makeRuleMatch({ ruleId: 'RULE-001', severity: makeSeverity(8.0), confidence: 0.9 }),
      ],
      correlations: [makeCorrelation({ correlationId: 'CORR-001', confidence: 0.8 })],
      evidence: [makeEvidence({ id: 'ev-001', confidence: 0.95 })],
    });
    const assessment = engine.evaluate(input);
    const breakdown = breakdownByDimension(assessment);

    // Three dimensions
    expect(breakdown.dimensions.length).toBe(3);

    // Order: rule, correlation, evidence
    expect(breakdown.dimensions[0].dimension).toBe('rule');
    expect(breakdown.dimensions[1].dimension).toBe('correlation');
    expect(breakdown.dimensions[2].dimension).toBe('evidence');

    // Rule dimension has the contribution
    expect(breakdown.dimensions[0].contributionCount).toBe(1);
    expect(breakdown.dimensions[0].contributions.length).toBe(1);
    expect(breakdown.dimensions[0].contributions[0].sourceId).toBe('RULE-001');

    // Correlation and evidence have zero-value contributions
    expect(breakdown.dimensions[1].contributionCount).toBe(1);
    expect(breakdown.dimensions[2].contributionCount).toBe(1);

    // Totals
    expect(breakdown.totalContributions).toBe(3);
    expect(breakdown.totalSummedValue).toBeGreaterThan(0);
  });

  it('handles empty assessment', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const assessment = engine.evaluate(makeInput());
    const breakdown = breakdownByDimension(assessment);

    expect(breakdown.dimensions).toEqual([]);
    expect(breakdown.totalSummedValue).toBe(0);
    expect(breakdown.totalContributions).toBe(0);
  });

  it('handles single-dimension assessment', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [
        makeRuleMatch({ ruleId: 'RULE-001', severity: makeSeverity(7.0), confidence: 0.85 }),
        makeRuleMatch({ ruleId: 'RULE-002', severity: makeSeverity(5.0), confidence: 0.7 }),
      ],
    });
    const assessment = engine.evaluate(input);
    const breakdown = breakdownByDimension(assessment);

    expect(breakdown.dimensions.length).toBe(1);
    expect(breakdown.dimensions[0].dimension).toBe('rule');
    expect(breakdown.dimensions[0].contributionCount).toBe(2);
    expect(breakdown.totalContributions).toBe(2);
  });

  it('sorts contributions by effectiveValue descending within each dimension', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [
        makeRuleMatch({ ruleId: 'RULE-LOW', severity: makeSeverity(1.0), confidence: 0.3 }),
        makeRuleMatch({ ruleId: 'RULE-HIGH', severity: makeSeverity(9.0), confidence: 0.95 }),
        makeRuleMatch({ ruleId: 'RULE-MED', severity: makeSeverity(5.0), confidence: 0.7 }),
      ],
    });
    const assessment = engine.evaluate(input);
    const breakdown = breakdownByDimension(assessment);

    const values = breakdown.dimensions[0].contributions.map((c) => c.effectiveValue);
    for (let i = 1; i < values.length; i++) {
      expect(values[i - 1]).toBeGreaterThanOrEqual(values[i]);
    }
  });

  it('throws TypeError for null assessment', () => {
    expect(() => (breakdownByDimension as any)(null)).toThrow(TypeError);
  });

  it('produces a frozen result', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const assessment = engine.evaluate(
      makeInput({
        matches: [makeRuleMatch({ ruleId: 'RULE-001' })],
      }),
    );
    const breakdown = breakdownByDimension(assessment);

    expect(Object.isFrozen(breakdown)).toBe(true);
    expect(Object.isFrozen(breakdown.dimensions)).toBe(true);
    for (const dim of breakdown.dimensions) {
      expect(Object.isFrozen(dim)).toBe(true);
      expect(Object.isFrozen(dim.contributions)).toBe(true);
      expect(Object.isFrozen(dim.traceIds)).toBe(true);
    }
  });

  it('traceIds match contribution IDs', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [
        makeRuleMatch({ ruleId: 'RULE-A', severity: makeSeverity(7.0), confidence: 0.85 }),
        makeRuleMatch({ ruleId: 'RULE-B', severity: makeSeverity(5.0), confidence: 0.7 }),
      ],
    });
    const assessment = engine.evaluate(input);
    const breakdown = breakdownByDimension(assessment);

    const ruleDim = breakdown.dimensions[0];
    const contributionIds = ruleDim.contributions.map((c) => c.id);
    expect(ruleDim.traceIds).toEqual(contributionIds);
  });
});

// ── topContributions ──

describe('topContributions', () => {
  it('returns the top-K contributions by effectiveValue', () => {
    const contributions = [
      makeRuleContribution('rc_001', 8.0, 0.9),
      makeRuleContribution('rc_002', 5.0, 0.7),
      makeRuleContribution('rc_003', 3.0, 0.5),
      makeRuleContribution('rc_004', 1.0, 0.3),
    ];

    const result = topContributions(contributions, 2);

    expect(result.contributions.length).toBe(2);
    expect(result.returnedCount).toBe(2);
    expect(result.totalCount).toBe(4);
    expect(result.contributions[0].id).toBe('rc_001');
    expect(result.contributions[1].id).toBe('rc_002');
    expect(result.cutoffValue).toBe(5.0);
  });

  it('returns all contributions when K >= total', () => {
    const contributions = [
      makeRuleContribution('rc_001', 8.0, 0.9),
      makeRuleContribution('rc_002', 5.0, 0.7),
    ];

    const result = topContributions(contributions, 10);

    expect(result.contributions.length).toBe(2);
    expect(result.returnedCount).toBe(2);
    expect(result.totalCount).toBe(2);
    expect(result.contributions[0].id).toBe('rc_001');
    expect(result.contributions[1].id).toBe('rc_002');
  });

  it('handles unsorted input correctly', () => {
    const contributions = [
      makeRuleContribution('rc_003', 3.0, 0.5),
      makeRuleContribution('rc_001', 8.0, 0.9),
      makeRuleContribution('rc_002', 5.0, 0.7),
    ];

    const result = topContributions(contributions, 2);

    expect(result.contributions.length).toBe(2);
    expect(result.contributions[0].id).toBe('rc_001');
    expect(result.contributions[1].id).toBe('rc_002');
  });

  it('returns cutoffValue as null for empty input', () => {
    const result = topContributions([], 5);

    expect(result.contributions).toEqual([]);
    expect(result.returnedCount).toBe(0);
    expect(result.totalCount).toBe(0);
    expect(result.cutoffValue).toBeNull();
  });

  it('returns cutoffValue for non-empty result', () => {
    const contributions = [
      makeRuleContribution('rc_001', 9.0, 0.95),
      makeRuleContribution('rc_002', 7.0, 0.85),
      makeRuleContribution('rc_003', 5.0, 0.7),
    ];

    const result = topContributions(contributions, 2);
    expect(result.cutoffValue).toBe(7.0);
  });

  it('throws TypeError for null input', () => {
    expect(() => (topContributions as any)(null, 5)).toThrow(TypeError);
  });

  it('throws RangeError for k < 1', () => {
    const contributions = [makeRuleContribution('rc_001', 5.0, 0.8)];
    expect(() => topContributions(contributions, 0)).toThrow(RangeError);
    expect(() => topContributions(contributions, -1)).toThrow(RangeError);
  });

  it('throws RangeError for NaN k', () => {
    const contributions = [makeRuleContribution('rc_001', 5.0, 0.8)];
    expect(() => topContributions(contributions, NaN)).toThrow(RangeError);
  });

  it('produces a frozen result', () => {
    const contributions = [makeRuleContribution('rc_001', 5.0, 0.8)];
    const result = topContributions(contributions, 1);

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.contributions)).toBe(true);
  });
});

// ── Deterministic Repeated Execution ──

describe('deterministic repeated execution', () => {
  it('explainContribution produces identical output for 10,000 iterations', () => {
    const contribution = makeRuleContribution('rc_001', 7.5, 0.9, ['ev-001']);
    const expected = explainContribution(contribution);

    for (let i = 0; i < 10_000; i++) {
      const actual = explainContribution(contribution);
      expect(actual).toEqual(expected);
    }
  });

  it('explainDimension produces identical output for 10,000 iterations', () => {
    const summary: DimensionSummary = Object.freeze({
      dimension: 'rule',
      contributionCount: 2,
      summedValue: 12.5,
      effectiveWeight: 0.85,
      saturatedScore: 0.72,
      intermediateCalculations: Object.freeze({
        meanConfidence: 0.85,
        effectiveChainLength: 1,
        normalizedSum: 1.25,
        rawWeightedScore: 1.0625,
      }),
      contributionIds: Object.freeze(['rc_001', 'rc_002']),
    });
    const contributions = [
      makeRuleContribution('rc_001', 7.5, 0.9),
      makeRuleContribution('rc_002', 5.0, 0.8),
    ];

    const expected = explainDimension(summary, contributions);
    for (let i = 0; i < 10_000; i++) {
      const actual = explainDimension(summary, contributions);
      expect(actual).toEqual(expected);
    }
  });

  it('breakdownByDimension produces identical output for 10,000 iterations', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [
        makeRuleMatch({ ruleId: 'RULE-001', severity: makeSeverity(7.0), confidence: 0.85 }),
      ],
    });
    const assessment = engine.evaluate(input);
    const expected = breakdownByDimension(assessment);

    for (let i = 0; i < 10_000; i++) {
      const actual = breakdownByDimension(assessment);
      expect(actual).toEqual(expected);
    }
  });

  it('topContributions produces identical output for 10,000 iterations', () => {
    const contributions = [
      makeRuleContribution('rc_003', 3.0, 0.5),
      makeRuleContribution('rc_001', 8.0, 0.9),
      makeRuleContribution('rc_002', 5.0, 0.7),
    ];

    const expected = topContributions(contributions, 2);
    for (let i = 0; i < 10_000; i++) {
      const actual = topContributions(contributions, 2);
      expect(actual).toEqual(expected);
    }
  });
});

// ── Immutable Outputs ──

describe('immutable outputs', () => {
  it('breakdownByDimension does not mutate the assessment', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [
        makeRuleMatch({ ruleId: 'RULE-001', severity: makeSeverity(7.0), confidence: 0.85 }),
      ],
    });
    const assessment = engine.evaluate(input);

    // Snapshot
    const contributionCount = assessment.contributions.length;

    breakdownByDimension(assessment);

    expect(assessment.contributions.length).toBe(contributionCount);
  });

  it('topContributions does not mutate the original array', () => {
    const contributions = [
      makeRuleContribution('rc_003', 3.0, 0.5),
      makeRuleContribution('rc_001', 8.0, 0.9),
      makeRuleContribution('rc_002', 5.0, 0.7),
    ];

    const originalIds = contributions.map((c) => c.id);
    topContributions(contributions, 2);

    expect(contributions.map((c) => c.id)).toEqual(originalIds);
  });
});

// ── Serialization Compatibility ──

describe('serialization compatibility', () => {
  it('ContributionExplanation is JSON-serializable', () => {
    const contribution = makeRuleContribution('rc_001', 7.5, 0.9, ['ev-001']);
    const explanation = explainContribution(contribution);

    const json = JSON.stringify(explanation);
    const parsed = JSON.parse(json);

    expect(parsed.valueSource).toBe(explanation.valueSource);
    expect(parsed.valueBreakdown.effectiveValue).toBe(explanation.valueBreakdown.effectiveValue);
    expect(parsed.traceability.id).toBe(explanation.traceability.id);
    expect(parsed.traceability.hasSeverity).toBe(true);
  });

  it('DimensionBreakdown is JSON-serializable', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [
        makeRuleMatch({ ruleId: 'RULE-001', severity: makeSeverity(7.0), confidence: 0.85 }),
      ],
      evidence: [makeEvidence({ id: 'ev-001', confidence: 0.9 })],
    });
    const assessment = engine.evaluate(input);
    const breakdown = breakdownByDimension(assessment);

    const json = JSON.stringify(breakdown);
    const parsed = JSON.parse(json);

    expect(parsed.totalContributions).toBe(breakdown.totalContributions);
    expect(parsed.totalSummedValue).toBe(breakdown.totalSummedValue);
    expect(parsed.dimensions.length).toBe(breakdown.dimensions.length);
  });

  it('TopContributionsResult is JSON-serializable', () => {
    const contributions = [
      makeRuleContribution('rc_001', 8.0, 0.9),
      makeRuleContribution('rc_002', 5.0, 0.7),
    ];
    const result = topContributions(contributions, 2);

    const json = JSON.stringify(result);
    const parsed = JSON.parse(json);

    expect(parsed.returnedCount).toBe(result.returnedCount);
    expect(parsed.totalCount).toBe(result.totalCount);
    expect(parsed.cutoffValue).toBe(result.cutoffValue);
  });
});

// ── Traceability Preservation ──

describe('traceability preservation', () => {
  it('ContributionExplanation references the original contribution', () => {
    const contribution = makeRuleContribution('rc_001', 7.5, 0.9, ['ev-001', 'ev-002']);
    const explanation = explainContribution(contribution);

    expect(explanation.contribution).toBe(contribution);
    expect(explanation.traceability.evidenceIds).toEqual(['ev-001', 'ev-002']);
    expect(explanation.traceability.sourceId).toBe('rc_001');
  });

  it('DimensionExplanation preserves dimension summary data', () => {
    const summary: DimensionSummary = Object.freeze({
      dimension: 'rule',
      contributionCount: 3,
      summedValue: 15.0,
      effectiveWeight: 0.9,
      saturatedScore: 0.8,
      intermediateCalculations: Object.freeze({
        meanConfidence: 0.85,
        effectiveChainLength: 1,
        normalizedSum: 1.5,
        rawWeightedScore: 1.35,
      }),
      contributionIds: Object.freeze(['rc_001', 'rc_002', 'rc_003']),
    });

    const contributions = [
      makeRuleContribution('rc_001', 7.0, 0.9),
      makeRuleContribution('rc_002', 5.0, 0.8),
      makeRuleContribution('rc_003', 3.0, 0.6),
    ];

    const explanation = explainDimension(summary, contributions);

    expect(explanation.summedValue).toBe(15.0);
    expect(explanation.effectiveWeight).toBe(0.9);
    expect(explanation.traceIds).toEqual(['rc_001', 'rc_002', 'rc_003']);
  });
});

// ── Explanation Consistency ──

describe('explanation consistency', () => {
  it('breakdownByDimension totals match assessment totals', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [
        makeRuleMatch({ ruleId: 'RULE-A', severity: makeSeverity(7.0), confidence: 0.85 }),
        makeRuleMatch({ ruleId: 'RULE-B', severity: makeSeverity(5.0), confidence: 0.7 }),
      ],
    });
    const assessment = engine.evaluate(input);
    const breakdown = breakdownByDimension(assessment);

    expect(breakdown.totalContributions).toBe(assessment.contributions.length);
    expect(breakdown.totalSummedValue).toBe(
      assessment.contributions.reduce((s, c) => s + c.effectiveValue, 0),
    );
  });

  it('all contributions appear in the breakdown', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [
        makeRuleMatch({ ruleId: 'RULE-A', severity: makeSeverity(7.0), confidence: 0.85 }),
        makeRuleMatch({ ruleId: 'RULE-B', severity: makeSeverity(5.0), confidence: 0.7 }),
      ],
      correlations: [makeCorrelation({ correlationId: 'CORR-001', confidence: 0.8 })],
    });
    const assessment = engine.evaluate(input);
    const breakdown = breakdownByDimension(assessment);

    const breakdownIds = new Set(
      breakdown.dimensions.flatMap((d) => d.contributions.map((c) => c.id)),
    );
    const assessmentIds = new Set(assessment.contributions.map((c) => c.id));

    expect(breakdownIds).toEqual(assessmentIds);
  });

  it('contribution explanation and breakdown agree on values', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [
        makeRuleMatch({
          ruleId: 'RULE-001',
          severity: makeSeverity(7.5),
          confidence: 0.9,
        }),
      ],
    });
    const assessment = engine.evaluate(input);
    const contribution = assessment.contributions[0];

    const explanation = explainContribution(contribution);
    const breakdown = breakdownByDimension(assessment);

    // Both reference the same contribution
    expect(explanation.contribution).toBe(contribution);
    expect(breakdown.dimensions[0].contributions[0]).toBe(contribution);
  });

  it('topContributions with K >= total returns all contributions', () => {
    const contributions = [
      makeRuleContribution('rc_001', 7.0, 0.9),
      makeRuleContribution('rc_002', 5.0, 0.7),
    ];
    const result = topContributions(contributions, 100);

    expect(result.contributions.length).toBe(2);
    expect(result.returnedCount).toBe(2);
    expect(result.totalCount).toBe(2);
    expect(result.contributions[0].id).toBe('rc_001');
    expect(result.contributions[1].id).toBe('rc_002');
  });
});

// ── Comprehensive Pipeline Test ──

describe('comprehensive pipeline test', () => {
  it('produces consistent explanations across all four functions', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [
        makeRuleMatch({
          ruleId: 'RULE-INJECTION',
          severity: makeSeverity(8.5, 'critical'),
          confidence: 0.9,
          evidenceIds: Object.freeze(['ev-import', 'ev-api']),
        }),
        makeRuleMatch({
          ruleId: 'RULE-OBFUSCATION',
          severity: makeSeverity(6.0, 'high'),
          confidence: 0.75,
          evidenceIds: Object.freeze(['ev-entropy']),
        }),
      ],
      correlations: [
        makeCorrelation({
          correlationId: 'CORR-CHAIN',
          chainLength: 3,
          confidence: 0.8,
          evidenceIds: Object.freeze(['ev-import', 'ev-api', 'ev-entropy']),
        }),
      ],
      evidence: [
        makeEvidence({
          id: 'ev-import',
          confidence: 0.95,
          category: 'pe-import',
          artifactId: 'art.exe',
        }),
        makeEvidence({
          id: 'ev-api',
          confidence: 0.85,
          category: 'api-call',
          artifactId: 'art.exe',
        }),
      ],
      artifactId: 'art.exe',
      sessionId: 'session-comprehensive',
    });

    const assessment = engine.evaluate(input);

    // ── All contributions have explanations ──
    for (const c of assessment.contributions) {
      const explanation = explainContribution(c);
      expect(explanation.valueSource).toBeTruthy();
      expect(explanation.traceability.id).toBe(c.id);
      expect(explanation.contribution).toBe(c);
    }

    // ── Breakdown covers all contributions ──
    const breakdown = breakdownByDimension(assessment);
    const breakdownIds = new Set(
      breakdown.dimensions.flatMap((d) => d.contributions.map((c) => c.id)),
    );
    const assessmentIds = new Set(assessment.contributions.map((c) => c.id));
    expect(breakdownIds).toEqual(assessmentIds);

    // ── Dimension order is stable ──
    expect(breakdown.dimensions.length).toBe(3);
    expect(breakdown.dimensions[0].dimension).toBe('rule');
    expect(breakdown.dimensions[1].dimension).toBe('correlation');
    expect(breakdown.dimensions[2].dimension).toBe('evidence');

    // ── Top-K works ──
    const top3 = topContributions(assessment.contributions, 3);
    expect(top3.returnedCount).toBe(3);
    expect(top3.totalCount).toBe(assessment.totalContributionCount);
    expect(top3.contributions[0].effectiveValue).toBeGreaterThanOrEqual(
      top3.contributions[1].effectiveValue,
    );
    expect(top3.contributions[1].effectiveValue).toBeGreaterThanOrEqual(
      top3.contributions[2].effectiveValue,
    );

    // ── All outputs are frozen ──
    for (const c of assessment.contributions) {
      expect(Object.isFrozen(explainContribution(c))).toBe(true);
    }
    expect(Object.isFrozen(breakdown)).toBe(true);
    expect(Object.isFrozen(top3)).toBe(true);

    // ── Determinism ──
    const breakdown2 = breakdownByDimension(assessment);
    expect(breakdown2).toEqual(breakdown);
  });
});
