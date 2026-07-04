/**
 * Tests for @veris/risk/evaluator.
 *
 * Covers:
 * - Basic evaluation with valid inputs
 * - Input validation (missing fields, invalid values)
 * - Transformation of upstream types to RiskInput
 * - Integration with RiskEngine
 * - Edge cases (empty inputs, single dimension)
 * - Determinism
 */

import { describe, it, expect } from 'vitest';
import { RiskEvaluator, validateEvaluatorInput } from '../src/evaluator.js';
import type {
  EvaluatorInput,
  SourceRuleMatch,
  SourceCorrelation,
  SourceEvidence,
} from '../src/evaluator.js';

// ── Helpers ──

function makeRuleMatch(overrides?: Partial<SourceRuleMatch>): SourceRuleMatch {
  return {
    ruleId: 'RULE-001',
    severityScore: 8.0,
    severityLevel: 'high',
    confidence: 0.9,
    evidenceIds: ['ev-001'],
    taxonomyIds: [],
    ...overrides,
  };
}

function makeCorrelation(overrides?: Partial<SourceCorrelation>): SourceCorrelation {
  return {
    correlationId: 'CORR-001',
    chainLength: 3,
    confidence: 0.85,
    evidenceIds: ['ev-001', 'ev-002'],
    ...overrides,
  };
}

function makeEvidence(overrides?: Partial<SourceEvidence>): SourceEvidence {
  return {
    id: 'ev-001',
    confidence: 0.9,
    category: 'pe-import',
    artifactId: 'art-main.exe',
    ...overrides,
  };
}

function makeInput(overrides?: Partial<EvaluatorInput>): EvaluatorInput {
  return {
    ruleMatches: [makeRuleMatch()],
    correlations: [makeCorrelation()],
    evidence: [makeEvidence()],
    artifactId: 'art-main.exe',
    sessionId: 'session-001',
    ...overrides,
  };
}

describe('validateEvaluatorInput', () => {
  it('should return empty errors for valid input', () => {
    const errors = validateEvaluatorInput(makeInput());
    expect(errors.length).toBe(0);
  });

  it('should return errors for null input', () => {
    const errors = validateEvaluatorInput(null as any);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should return errors for missing sessionId', () => {
    const errors = validateEvaluatorInput(makeInput({ sessionId: '' }));
    expect(errors.some((e) => e.includes('sessionId'))).toBe(true);
  });

  it('should return errors for non-finite severityScore', () => {
    const errors = validateEvaluatorInput(
      makeInput({
        ruleMatches: [makeRuleMatch({ severityScore: NaN })],
      }),
    );
    expect(errors.some((e) => e.includes('severityScore'))).toBe(true);
  });

  it('should return errors for non-finite confidence', () => {
    const errors = validateEvaluatorInput(
      makeInput({
        ruleMatches: [makeRuleMatch({ confidence: Infinity })],
      }),
    );
    expect(errors.some((e) => e.includes('confidence'))).toBe(true);
  });

  it('should return errors for missing ruleId', () => {
    const errors = validateEvaluatorInput(
      makeInput({
        ruleMatches: [makeRuleMatch({ ruleId: '' })],
      }),
    );
    expect(errors.some((e) => e.includes('ruleId'))).toBe(true);
  });

  it('should return errors for non-finite chainLength', () => {
    const errors = validateEvaluatorInput(
      makeInput({
        correlations: [makeCorrelation({ chainLength: NaN })],
      }),
    );
    expect(errors.some((e) => e.includes('chainLength'))).toBe(true);
  });

  it('should return errors for missing correlationId', () => {
    const errors = validateEvaluatorInput(
      makeInput({
        correlations: [makeCorrelation({ correlationId: '' })],
      }),
    );
    expect(errors.some((e) => e.includes('correlationId'))).toBe(true);
  });

  it('should return errors for missing evidence id', () => {
    const errors = validateEvaluatorInput(
      makeInput({
        evidence: [makeEvidence({ id: '' })],
      }),
    );
    expect(errors.some((e) => e.includes('id'))).toBe(true);
  });

  it('should accept empty arrays', () => {
    const errors = validateEvaluatorInput(
      makeInput({
        ruleMatches: [],
        correlations: [],
        evidence: [],
      }),
    );
    expect(errors.length).toBe(0);
  });

  it('should return errors for non-array ruleMatches', () => {
    const errors = validateEvaluatorInput(
      makeInput({
        ruleMatches: {} as any,
      }),
    );
    expect(errors.some((e) => e.includes('ruleMatches'))).toBe(true);
  });
});

describe('RiskEvaluator', () => {
  it('should evaluate valid input and produce a RiskAssessment', () => {
    const evaluator = new RiskEvaluator();
    const assessment = evaluator.evaluate(makeInput(), { computedAt: '2024-01-01T00:00:00.000Z' });

    expect(assessment).toBeDefined();
    expect(assessment.schemaVersion).toBe('0.1.0');
    expect(assessment.sessionId).toBe('session-001');
    expect(assessment.artifactId).toBe('art-main.exe');
    expect(typeof assessment.riskScore).toBe('number');
    expect(assessment.riskScore).toBeGreaterThanOrEqual(0);
    expect(assessment.riskScore).toBeLessThanOrEqual(10);
    expect(assessment.contributions.length).toBeGreaterThan(0);
  });

  it('should evaluate with only rule matches (no correlations or evidence)', () => {
    const evaluator = new RiskEvaluator();
    const assessment = evaluator.evaluate(
      makeInput({
        correlations: [],
        evidence: [],
      }),
      { computedAt: '2024-01-01T00:00:00.000Z' },
    );

    expect(assessment.contributions.length).toBe(1);
    expect(assessment.totalContributionCount).toBe(1);
  });

  it('should evaluate with only correlations', () => {
    const evaluator = new RiskEvaluator();
    const assessment = evaluator.evaluate(
      makeInput({
        ruleMatches: [],
        correlations: [makeCorrelation()],
        evidence: [],
      }),
      { computedAt: '2024-01-01T00:00:00.000Z' },
    );

    expect(assessment.contributions.length).toBe(1);
    expect(assessment.contributions[0].sourceType).toBe('correlation' as any);
  });

  it('should evaluate with only evidence', () => {
    const evaluator = new RiskEvaluator();
    const assessment = evaluator.evaluate(
      makeInput({
        ruleMatches: [],
        correlations: [],
        evidence: [makeEvidence()],
      }),
      { computedAt: '2024-01-01T00:00:00.000Z' },
    );

    expect(assessment.contributions.length).toBe(1);
    expect(assessment.contributions[0].sourceType).toBe('evidence' as any);
  });

  it('should evaluate with empty input (no matches, correlations, or evidence)', () => {
    const evaluator = new RiskEvaluator();
    const assessment = evaluator.evaluate(
      makeInput({
        ruleMatches: [],
        correlations: [],
        evidence: [],
      }),
      { computedAt: '2024-01-01T00:00:00.000Z' },
    );

    expect(assessment.contributions.length).toBe(0);
    expect(assessment.riskScore).toBe(0);
    expect(assessment.riskLevel).toBe('negligible');
  });

  it('should throw TypeError for null input', () => {
    const evaluator = new RiskEvaluator();
    expect(() => evaluator.evaluate(null as any)).toThrow(TypeError);
  });

  it('should throw Error for missing sessionId', () => {
    const evaluator = new RiskEvaluator();
    expect(() => evaluator.evaluate(makeInput({ sessionId: '' }))).toThrow(Error);
  });

  it('should produce frozen output', () => {
    const evaluator = new RiskEvaluator();
    const assessment = evaluator.evaluate(makeInput(), { computedAt: '2024-01-01T00:00:00.000Z' });

    expect(Object.isFrozen(assessment)).toBe(true);
    expect(Object.isFrozen(assessment.contributions)).toBe(true);
  });

  it('should configure weight and threshold profiles', () => {
    const evaluator = new RiskEvaluator();
    expect(evaluator.getWeightProfile()).toBeDefined();
    expect(evaluator.getThresholdProfile()).toBeDefined();
  });

  it('should expose the underlying engine', () => {
    const evaluator = new RiskEvaluator();
    expect(evaluator.getEngine()).toBeDefined();
  });
});

describe('RiskEvaluator determinism', () => {
  it('should produce identical results for identical inputs (5 runs)', () => {
    const evaluator = new RiskEvaluator();
    const input = makeInput();

    let lastScore: number | null = null;
    let lastVerdict: string | null = null;

    for (let run = 0; run < 5; run++) {
      const assessment = evaluator.evaluate(input, { computedAt: `2024-01-01T00:00:00.000Z` });

      if (lastScore !== null) {
        expect(assessment.riskScore).toBe(lastScore);
        expect(assessment.verdict).toBe(lastVerdict);
      }

      lastScore = assessment.riskScore;
      lastVerdict = assessment.verdict;
    }
  });

  it('should produce identical contributions order for identical inputs', () => {
    const evaluator = new RiskEvaluator();

    // Input with multiple rule matches to test ordering.
    const input = makeInput({
      ruleMatches: [
        makeRuleMatch({ ruleId: 'RULE-001', severityScore: 8.0 }),
        makeRuleMatch({ ruleId: 'RULE-002', severityScore: 4.0 }),
        makeRuleMatch({ ruleId: 'RULE-003', severityScore: 6.0 }),
      ],
      correlations: [],
      evidence: [],
    });

    const assessment1 = evaluator.evaluate(input, { computedAt: '2024-01-01T00:00:00.000Z' });
    const assessment2 = evaluator.evaluate(input, { computedAt: '2024-01-01T00:00:00.000Z' });

    expect(assessment1.contributions.length).toBe(assessment2.contributions.length);
    for (let i = 0; i < assessment1.contributions.length; i++) {
      expect(assessment1.contributions[i].id).toBe(assessment2.contributions[i].id);
      expect(assessment1.contributions[i].effectiveValue).toBe(
        assessment2.contributions[i].effectiveValue,
      );
    }
  });
});
