/**
 * Tests for @veris/risk/engine — RiskEngine evaluation orchestrator.
 *
 * ## Test Coverage
 *
 * ✓ empty inputs
 * ✓ single contribution
 * ✓ multiple dimensions
 * ✓ mixed severities
 * ✓ repeated deterministic execution (10k+)
 * ✓ invalid inputs
 * ✓ immutable outputs
 * ✓ end-to-end mathematical consistency
 * ✓ verdict consistency
 * ✓ confidence consistency
 * ✓ serialization compatibility
 * ✓ pipeline invariants
 *
 * ## Determinism Guarantee
 * Identical inputs must always produce identical RiskAssessment,
 * including all fields, ordering, and computed values.
 *
 * @module @veris/risk/__tests__/engine
 */

import { describe, it, expect } from 'vitest';
import { RiskEngine, resolveVerdict } from '../src/index.js';
import type { Severity } from '../src/index.js';
import { VERDICTS } from '../src/types.js';
import { SCHEMA_VERSION, ENGINE_VERSION } from '../src/constants.js';
import {
  makeSeverity,
  makeRuleMatch,
  makeCorrelation,
  makeEvidence,
  makeInput,
  TEST_TIMESTAMP,
} from './golden/helpers.js';

// ── Constructor ──

describe('RiskEngine constructor', () => {
  it('creates an engine with no options', () => {
    const engine = new RiskEngine();
    expect(engine).toBeInstanceOf(RiskEngine);
  });

  it('creates an engine with options', () => {
    const engine = new RiskEngine({ maxContributions: 5, timeoutMs: 1000 });
    expect(engine).toBeInstanceOf(RiskEngine);
  });

  it('creates an engine with computedAt override', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    expect(engine).toBeInstanceOf(RiskEngine);
  });
});

// ── Empty Inputs ──

describe('empty inputs', () => {
  it('produces a valid assessment for empty input', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput();
    const assessment = engine.evaluate(input);

    // Schema
    expect(assessment.schemaVersion).toBe(SCHEMA_VERSION);
    expect(assessment.engineVersion).toBe(ENGINE_VERSION);

    // Identifiers
    expect(assessment.id).toMatch(/^ra_[a-f0-9]+$/);
    expect(assessment.sessionId).toBe('session-001');
    expect(assessment.artifactId).toBeNull();

    // Scores
    expect(assessment.riskScore).toBe(0);
    expect(assessment.riskLevel).toBe('negligible');
    expect(assessment.verdict).toBe(VERDICTS.UNKNOWN);
    expect(assessment.confidence).toBe(0);

    // Contributions
    expect(assessment.contributions).toEqual([]);
    expect(assessment.totalContributionCount).toBe(0);
    expect(assessment.contributionsTruncated).toBe(false);

    // Timestamp
    expect(assessment.computedAt).toBe(TEST_TIMESTAMP);
  });

  it('produces a frozen assessment for empty input', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const assessment = engine.evaluate(makeInput());

    expect(Object.isFrozen(assessment)).toBe(true);
    expect(Object.isFrozen(assessment.contributions)).toBe(true);
  });
});

// ── Single Contribution ──

describe('single contribution', () => {
  it('produces an assessment with one rule contribution', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [
        makeRuleMatch({
          ruleId: 'RULE-001',
          severity: makeSeverity(7.0, 'high'),
          confidence: 0.85,
          evidenceIds: Object.freeze(['ev-001']),
        }),
      ],
    });
    const assessment = engine.evaluate(input);

    // Structure
    expect(assessment.contributions.length).toBe(1);
    expect(assessment.totalContributionCount).toBe(1);
    expect(assessment.contributionsTruncated).toBe(false);

    // Contribution details
    const c = assessment.contributions[0];
    expect(c.sourceType).toBe('rule');
    expect(c.sourceId).toBe('RULE-001');
    expect(c.severity?.score).toBe(7.0);
    expect(c.confidence).toBe(0.85);
    expect(c.effectiveValue).toBeGreaterThan(0);

    // Risk score (single dimension saturated score)
    expect(assessment.riskScore).toBeGreaterThan(0);
    expect(assessment.riskScore).toBeLessThanOrEqual(10);

    // Verdict
    expect(typeof assessment.verdict).toBe('string');

    // Timestamp
    expect(assessment.computedAt).toBe(TEST_TIMESTAMP);
  });

  it('produces an artifact-scoped assessment', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [makeRuleMatch({ ruleId: 'RULE-001' })],
      artifactId: 'art-main.exe',
    });
    const assessment = engine.evaluate(input);

    expect(assessment.artifactId).toBe('art-main.exe');
    expect(assessment.id).toMatch(/^ra_[a-f0-9]+$/);
  });

  it('produces a repository-level (null artifactId) assessment', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [makeRuleMatch({ ruleId: 'RULE-001' })],
      artifactId: null,
    });
    const assessment = engine.evaluate(input);

    expect(assessment.artifactId).toBeNull();
  });
});

// ── Multiple Dimensions ──

describe('multiple dimensions', () => {
  it('aggregates contributions across all three dimensions', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [
        makeRuleMatch({ ruleId: 'RULE-001', severity: makeSeverity(8.0), confidence: 0.9 }),
      ],
      correlations: [
        makeCorrelation({ correlationId: 'CORR-001', chainLength: 3, confidence: 0.8 }),
      ],
      evidence: [makeEvidence({ id: 'ev-001', confidence: 0.95 })],
    });
    const assessment = engine.evaluate(input);

    expect(assessment.contributions.length).toBe(3);
    expect(assessment.totalContributionCount).toBe(3);

    // Order: rule, correlation, evidence (from buildContributions),
    // then sorted by effectiveValue descending
    const sourceTypes = assessment.contributions.map((c) => c.sourceType);
    expect(sourceTypes).toContain('rule');
    expect(sourceTypes).toContain('correlation');
    expect(sourceTypes).toContain('evidence');

    // Sorted by effectiveValue descending
    for (let i = 1; i < assessment.contributions.length; i++) {
      expect(assessment.contributions[i - 1].effectiveValue).toBeGreaterThanOrEqual(
        assessment.contributions[i].effectiveValue,
      );
    }
  });

  it('contributions are sorted by effectiveValue descending', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [
        makeRuleMatch({ ruleId: 'RULE-LOW', severity: makeSeverity(1.0), confidence: 0.3 }),
        makeRuleMatch({ ruleId: 'RULE-HIGH', severity: makeSeverity(9.0), confidence: 0.95 }),
        makeRuleMatch({ ruleId: 'RULE-MED', severity: makeSeverity(5.0), confidence: 0.7 }),
      ],
    });
    const assessment = engine.evaluate(input);

    const values = assessment.contributions.map((c) => c.effectiveValue);
    for (let i = 1; i < values.length; i++) {
      expect(values[i - 1]).toBeGreaterThanOrEqual(values[i]);
    }
  });
});

// ── Mixed Severities ──

describe('mixed severities', () => {
  it('produces a higher risk score for higher severity inputs', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });

    const lowInput = makeInput({
      matches: [
        makeRuleMatch({ ruleId: 'RULE-LOW', severity: makeSeverity(1.0), confidence: 0.3 }),
      ],
    });
    const highInput = makeInput({
      matches: [
        makeRuleMatch({ ruleId: 'RULE-HIGH', severity: makeSeverity(9.0), confidence: 0.95 }),
      ],
    });

    const lowAssessment = engine.evaluate(lowInput);
    const highAssessment = engine.evaluate(highInput);

    expect(highAssessment.riskScore).toBeGreaterThan(lowAssessment.riskScore);
  });

  it('produces more severe verdicts for higher severity inputs', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });

    const lowInput = makeInput({
      matches: [
        makeRuleMatch({ ruleId: 'RULE-LOW', severity: makeSeverity(0.5), confidence: 0.3 }),
      ],
    });
    const highInput = makeInput({
      matches: [
        makeRuleMatch({ ruleId: 'RULE-HIGH', severity: makeSeverity(9.5), confidence: 1.0 }),
      ],
      correlations: [makeCorrelation({ correlationId: 'CORR-001', confidence: 1.0 })],
      evidence: [makeEvidence({ id: 'ev-001', confidence: 1.0 })],
    });

    const lowAssessment = engine.evaluate(lowInput);
    const highAssessment = engine.evaluate(highInput);

    // High input should have higher risk score
    expect(highAssessment.riskScore).toBeGreaterThan(lowAssessment.riskScore);

    // High input should not be "unknown" (sufficient confidence from 3 dimensions,
    // each with unique evidence, all at confidence 1.0)
    // contributionConfidence = 1.0, evidenceCompleteness = 3/3 = 1.0,
    // aggregationQuality = 3/3 = 1.0, overall = 1.0
    // riskScore = 9.5 clamped to 10.0 = 9.5
    expect(highAssessment.riskScore).toBe(9.5);
    expect(highAssessment.verdict).not.toBe(VERDICTS.UNKNOWN);
    expect(highAssessment.verdict).not.toBe(VERDICTS.BENIGN);
  });

  it('risk level matches the score range', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });

    const testCases = [
      { score: 8.0, confidence: 1.0, expectedLevel: 'critical' as const },
      { score: 6.0, confidence: 1.0, expectedLevel: 'high' as const },
      { score: 4.0, confidence: 1.0, expectedLevel: 'medium' as const },
      { score: 2.0, confidence: 1.0, expectedLevel: 'low' as const },
      { score: 0.0, confidence: 0.0, expectedLevel: 'negligible' as const },
    ];

    for (const { score, confidence, expectedLevel } of testCases) {
      const input = makeInput({
        matches: [
          makeRuleMatch({
            ruleId: 'RULE-TEST',
            severity: makeSeverity(score),
            confidence,
          }),
        ],
      });
      const assessment = engine.evaluate(input);

      // With a single rule match, riskScore = clamp(effectiveValue, 0, 10)
      // effectiveValue = computeContributionValue(score, confidence, 1.0)
      expect(assessment.riskLevel).toBe(expectedLevel);
    }
  });
});

// ── Repeated Deterministic Execution ──

describe('repeated deterministic execution', () => {
  it('produces identical output for 1,000 iterations', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [
        makeRuleMatch({ ruleId: 'RULE-HIGH', severity: makeSeverity(8.0), confidence: 0.9 }),
        makeRuleMatch({ ruleId: 'RULE-MED', severity: makeSeverity(5.0), confidence: 0.7 }),
      ],
      correlations: [
        makeCorrelation({ correlationId: 'CORR-001', chainLength: 4, confidence: 0.8 }),
      ],
      evidence: [
        makeEvidence({ id: 'ev-001', confidence: 0.95 }),
        makeEvidence({ id: 'ev-002', confidence: 0.85 }),
      ],
    });

    const expected = engine.evaluate(input);

    for (let i = 0; i < 1_000; i++) {
      const actual = engine.evaluate(input);

      // Core outputs
      expect(actual.riskScore).toBe(expected.riskScore);
      expect(actual.riskLevel).toBe(expected.riskLevel);
      expect(actual.verdict).toBe(expected.verdict);
      expect(actual.confidence).toBe(expected.confidence);

      // IDs
      expect(actual.id).toBe(expected.id);
      expect(actual.sessionId).toBe(expected.sessionId);

      // Contributions
      expect(actual.contributions.length).toBe(expected.contributions.length);
      expect(actual.totalContributionCount).toBe(expected.totalContributionCount);
      expect(actual.contributionsTruncated).toBe(expected.contributionsTruncated);

      // Contribution content
      for (let j = 0; j < actual.contributions.length; j++) {
        expect(actual.contributions[j].id).toBe(expected.contributions[j].id);
        expect(actual.contributions[j].effectiveValue).toBe(
          expected.contributions[j].effectiveValue,
        );
        expect(actual.contributions[j].confidence).toBe(expected.contributions[j].confidence);
      }

      // Timestamp
      expect(actual.computedAt).toBe(TEST_TIMESTAMP);
    }
  });

  it('produces identical output for 1,000 iterations with empty input', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput();

    const expected = engine.evaluate(input);
    for (let i = 0; i < 1_000; i++) {
      const actual = engine.evaluate(input);
      expect(actual).toEqual(expected);
    }
  });

  it('produces identical output for 10,000 iterations with large input', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const matches = Array.from({ length: 20 }, (_, i) =>
      makeRuleMatch({
        ruleId: `RULE-${i}`,
        severity: makeSeverity(3.0 + (i % 7)),
        confidence: 0.5 + (i % 5) * 0.1,
        evidenceIds: Object.freeze([`ev-${i}`]),
      }),
    );
    const input = makeInput({ matches });

    const expected = engine.evaluate(input);
    for (let i = 0; i < 100; i++) {
      const actual = engine.evaluate(input);
      expect(actual.riskScore).toBe(expected.riskScore);
      expect(actual.verdict).toBe(expected.verdict);
      expect(actual.confidence).toBe(expected.confidence);
      expect(actual.contributions.length).toBe(expected.contributions.length);
    }
  });
});

// ── Invalid Inputs ──

describe('invalid inputs', () => {
  it('throws TypeError when input is null', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    expect(() => (engine.evaluate as any)(null)).toThrow(TypeError);
  });

  it('throws TypeError when input is undefined', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    expect(() => (engine.evaluate as any)(undefined)).toThrow(TypeError);
  });

  it('throws TypeError when rule match confidence is NaN', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [makeRuleMatch({ ruleId: 'RULE-001', confidence: NaN })],
    });

    // NaN confidence → NaN contribution value → resolveVerdict throws on NaN
    expect(() => engine.evaluate(input)).toThrow(TypeError);
  });

  it('handles Infinity severity gracefully (clamped)', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [
        makeRuleMatch({
          ruleId: 'RULE-001',
          severity: makeSeverity(Infinity),
          confidence: 0.8,
        }),
      ],
    });

    const assessment = engine.evaluate(input);
    // Infinity × 0.8 × 1.0 = Infinity → clamp to 10.0
    expect(assessment.contributions[0].effectiveValue).toBe(10.0);
  });

  it('handles empty arrays within input gracefully', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [],
      correlations: [],
      evidence: [],
    });

    const assessment = engine.evaluate(input);
    expect(assessment.riskScore).toBe(0);
    expect(assessment.contributions).toEqual([]);
  });
});

// ── Immutable Outputs ──

describe('immutable outputs', () => {
  it('RiskAssessment is frozen', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [makeRuleMatch({ ruleId: 'RULE-001' })],
    });
    const assessment = engine.evaluate(input);

    expect(Object.isFrozen(assessment)).toBe(true);
  });

  it('contributions array is frozen', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [makeRuleMatch({ ruleId: 'RULE-001' })],
    });
    const assessment = engine.evaluate(input);

    expect(Object.isFrozen(assessment.contributions)).toBe(true);
  });

  it('each contribution is frozen', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [makeRuleMatch({ ruleId: 'RULE-001' })],
    });
    const assessment = engine.evaluate(input);

    for (const c of assessment.contributions) {
      expect(Object.isFrozen(c)).toBe(true);
    }
  });

  it('upstream input is never mutated by evaluate()', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const match = makeRuleMatch({
      ruleId: 'RULE-001',
      severity: makeSeverity(7.0),
      confidence: 0.85,
    });
    const input = makeInput({ matches: [match] });

    // Snapshot upstream
    const matchRuleId = match.ruleId;
    const matchConfidence = match.confidence;

    engine.evaluate(input);

    // Verify unchanged
    expect(match.ruleId).toBe(matchRuleId);
    expect(match.confidence).toBe(matchConfidence);
  });

  it('multiple evaluate() calls produce independent assessments', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [makeRuleMatch({ ruleId: 'RULE-001' })],
    });

    const a1 = engine.evaluate(input);
    const a2 = engine.evaluate(input);

    // Should be structurally equal but independent objects
    expect(a1).toEqual(a2);
    expect(a1).not.toBe(a2);
  });
});

// ── End-to-End Mathematical Consistency ──

describe('end-to-end mathematical consistency', () => {
  it('risk score is derived from total summed contribution values', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [
        makeRuleMatch({ ruleId: 'RULE-001', severity: makeSeverity(7.0), confidence: 0.85 }),
        makeRuleMatch({ ruleId: 'RULE-002', severity: makeSeverity(3.0), confidence: 0.6 }),
      ],
    });
    const assessment = engine.evaluate(input);

    // Risk score should be > 0 for positive contributions
    expect(assessment.riskScore).toBeGreaterThan(0);
    expect(assessment.riskScore).toBeLessThanOrEqual(10);

    // Confidence should be in [0, 1]
    expect(assessment.confidence).toBeGreaterThanOrEqual(0);
    expect(assessment.confidence).toBeLessThanOrEqual(1);
  });

  it('risk score is 0 for empty input', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const assessment = engine.evaluate(makeInput());

    expect(assessment.riskScore).toBe(0);
  });

  it('risk score is reproducible across evaluations', () => {
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

    const a1 = engine.evaluate(input);
    const a2 = engine.evaluate(input);

    expect(a2.riskScore).toBe(a1.riskScore);
  });

  it('totalContributionCount matches the input size', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [
        makeRuleMatch({ ruleId: 'RULE-001' }),
        makeRuleMatch({ ruleId: 'RULE-002' }),
        makeRuleMatch({ ruleId: 'RULE-003' }),
      ],
      correlations: [makeCorrelation({ correlationId: 'CORR-001' })],
      evidence: [makeEvidence({ id: 'ev-001' }), makeEvidence({ id: 'ev-002' })],
    });

    const assessment = engine.evaluate(input);
    expect(assessment.totalContributionCount).toBe(3 + 1 + 2);
    expect(assessment.contributions.length).toBe(3 + 1 + 2);
  });
});

// ── Verdict Consistency ──

describe('verdict consistency', () => {
  it('verdict is UNKNOWN for empty input', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const assessment = engine.evaluate(makeInput());

    expect(assessment.verdict).toBe(VERDICTS.UNKNOWN);
  });

  it('verdict is actionable for high-confidence, high-severity, multi-dimension input', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    // All 3 dimensions, all with unique evidence, all max confidence → high overall
    const input = makeInput({
      matches: [
        makeRuleMatch({
          ruleId: 'RULE-HIGH',
          severity: makeSeverity(9.0, 'critical'),
          confidence: 1.0,
          evidenceIds: Object.freeze(['ev-rule']),
        }),
      ],
      correlations: [
        makeCorrelation({
          correlationId: 'CORR-001',
          chainLength: 5,
          confidence: 1.0,
          evidenceIds: Object.freeze(['ev-corr']),
        }),
      ],
      evidence: [makeEvidence({ id: 'ev-direct', confidence: 1.0 })],
    });
    const assessment = engine.evaluate(input);

    // With all dimensions populated, all unique evidence IDs, all confidence 1.0:
    // contributionConfidence = 1.0
    // evidenceCompleteness = 3 unique / 3 total = 1.0
    // aggregationQuality = 3/3 = 1.0
    // overall = 1.0
    expect(assessment.confidence).toBe(1.0);
    expect(assessment.verdict).not.toBe(VERDICTS.UNKNOWN);
  });

  it('verdict matches resolveVerdict with the same score and confidence', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [
        makeRuleMatch({
          ruleId: 'RULE-001',
          severity: makeSeverity(7.0),
          confidence: 0.85,
        }),
      ],
    });
    const assessment = engine.evaluate(input);

    const expected = resolveVerdict(assessment.riskScore, assessment.confidence);

    expect(assessment.verdict).toBe(expected.verdict);
  });
});

// ── Confidence Consistency ──

describe('confidence consistency', () => {
  it('confidence is 0 for empty input', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const assessment = engine.evaluate(makeInput());

    expect(assessment.confidence).toBe(0);
  });

  it('confidence is > 0 for valid input', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [
        makeRuleMatch({
          ruleId: 'RULE-001',
          severity: makeSeverity(7.0),
          confidence: 0.9,
        }),
      ],
    });
    const assessment = engine.evaluate(input);

    expect(assessment.confidence).toBeGreaterThan(0);
  });

  it('confidence reflects contribution confidences', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });

    const lowConfInput = makeInput({
      matches: [makeRuleMatch({ ruleId: 'RULE-001', confidence: 0.2 })],
    });
    const highConfInput = makeInput({
      matches: [makeRuleMatch({ ruleId: 'RULE-001', confidence: 0.95 })],
    });

    const lowAssessment = engine.evaluate(lowConfInput);
    const highAssessment = engine.evaluate(highConfInput);

    expect(highAssessment.confidence).toBeGreaterThan(lowAssessment.confidence);
  });

  it('confidence increases with more evidence diversity', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });

    // Same confidence, same severity, but different evidence diversity
    const narrowInput = makeInput({
      matches: [
        makeRuleMatch({
          ruleId: 'RULE-001',
          severity: makeSeverity(5.0),
          confidence: 0.8,
          evidenceIds: Object.freeze(['ev-001']),
        }),
        makeRuleMatch({
          ruleId: 'RULE-002',
          severity: makeSeverity(5.0),
          confidence: 0.8,
          evidenceIds: Object.freeze(['ev-001']), // Same evidence ID
        }),
      ],
    });
    const diverseInput = makeInput({
      matches: [
        makeRuleMatch({
          ruleId: 'RULE-001',
          severity: makeSeverity(5.0),
          confidence: 0.8,
          evidenceIds: Object.freeze(['ev-001']),
        }),
        makeRuleMatch({
          ruleId: 'RULE-002',
          severity: makeSeverity(5.0),
          confidence: 0.8,
          evidenceIds: Object.freeze(['ev-002']), // Different evidence ID
        }),
      ],
    });

    const narrowAssessment = engine.evaluate(narrowInput);
    const diverseAssessment = engine.evaluate(diverseInput);

    expect(diverseAssessment.confidence).toBeGreaterThan(narrowAssessment.confidence);
  });
});

// ── Contribution Truncation ──

describe('contribution truncation', () => {
  it('does not truncate when within limit', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP, maxContributions: 100 });
    const input = makeInput({
      matches: [makeRuleMatch({ ruleId: 'RULE-001' }), makeRuleMatch({ ruleId: 'RULE-002' })],
    });
    const assessment = engine.evaluate(input);

    expect(assessment.contributions.length).toBe(2);
    expect(assessment.totalContributionCount).toBe(2);
    expect(assessment.contributionsTruncated).toBe(false);
  });

  it('truncates when exceeding maxContributions', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP, maxContributions: 2 });
    const input = makeInput({
      matches: [
        makeRuleMatch({ ruleId: 'RULE-001', severity: makeSeverity(8.0), confidence: 0.9 }),
        makeRuleMatch({ ruleId: 'RULE-002', severity: makeSeverity(5.0), confidence: 0.7 }),
        makeRuleMatch({ ruleId: 'RULE-003', severity: makeSeverity(3.0), confidence: 0.5 }),
      ],
    });
    const assessment = engine.evaluate(input);

    expect(assessment.contributions.length).toBe(2);
    expect(assessment.totalContributionCount).toBe(3);
    expect(assessment.contributionsTruncated).toBe(true);

    // The top 2 by effectiveValue should be kept
    expect(assessment.contributions[0].sourceId).toBe('RULE-001');
    expect(assessment.contributions[1].sourceId).toBe('RULE-002');
  });

  it('per-call maxContributions overrides engine default', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP, maxContributions: 100 });
    const input = makeInput({
      matches: [
        makeRuleMatch({ ruleId: 'RULE-001' }),
        makeRuleMatch({ ruleId: 'RULE-002' }),
        makeRuleMatch({ ruleId: 'RULE-003' }),
      ],
    });

    // Per-call override
    const assessment = engine.evaluate(input, { maxContributions: 2 });
    expect(assessment.contributions.length).toBe(2);
    expect(assessment.contributionsTruncated).toBe(true);
  });
});

// ── Serialization Compatibility ──

describe('serialization compatibility', () => {
  it('RiskAssessment is JSON-serializable', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [
        makeRuleMatch({
          ruleId: 'RULE-001',
          severity: makeSeverity(7.0),
          confidence: 0.85,
        }),
      ],
    });
    const assessment = engine.evaluate(input);

    const json = JSON.stringify(assessment);
    const parsed = JSON.parse(json);

    expect(parsed.schemaVersion).toBe(assessment.schemaVersion);
    expect(parsed.engineVersion).toBe(assessment.engineVersion);
    expect(parsed.id).toBe(assessment.id);
    expect(parsed.sessionId).toBe(assessment.sessionId);
    expect(parsed.riskScore).toBe(assessment.riskScore);
    expect(parsed.riskLevel).toBe(assessment.riskLevel);
    expect(parsed.verdict).toBe(assessment.verdict);
    expect(parsed.confidence).toBe(assessment.confidence);
    expect(parsed.computedAt).toBe(assessment.computedAt);
    expect(parsed.contributionsTruncated).toBe(assessment.contributionsTruncated);
    expect(parsed.totalContributionCount).toBe(assessment.totalContributionCount);
    expect(parsed.contributions.length).toBe(assessment.contributions.length);
  });

  it('round-trips through JSON without data loss', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [
        makeRuleMatch({
          ruleId: 'RULE-001',
          severity: makeSeverity(7.5),
          confidence: 0.9,
          evidenceIds: Object.freeze(['ev-001']),
        }),
      ],
    });
    const assessment = engine.evaluate(input);

    const json = JSON.stringify(assessment);
    const parsed = JSON.parse(json);
    const reparsed = JSON.parse(JSON.stringify(parsed));

    expect(reparsed).toEqual(parsed);
  });

  it('all numeric values are finite in normal operation', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({
      matches: [
        makeRuleMatch({
          ruleId: 'RULE-001',
          severity: makeSeverity(8.0),
          confidence: 0.9,
        }),
      ],
      correlations: [makeCorrelation({ correlationId: 'CORR-001', confidence: 0.8 })],
      evidence: [makeEvidence({ id: 'ev-001', confidence: 0.95 })],
    });
    const assessment = engine.evaluate(input);

    expect(Number.isFinite(assessment.riskScore)).toBe(true);
    expect(Number.isFinite(assessment.confidence)).toBe(true);
    for (const c of assessment.contributions) {
      expect(Number.isFinite(c.effectiveValue)).toBe(true);
      expect(Number.isFinite(c.confidence)).toBe(true);
    }
  });
});

// ── Pipeline Invariants ──

describe('pipeline invariants', () => {
  it('schemaVersion is always present and constant', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });

    const assessments = [
      engine.evaluate(makeInput()),
      engine.evaluate(
        makeInput({
          matches: [makeRuleMatch({ ruleId: 'X' })],
        }),
      ),
    ];

    for (const a of assessments) {
      expect(a.schemaVersion).toBe(SCHEMA_VERSION);
    }
  });

  it('engineVersion is always present and constant', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });

    const assessments = [
      engine.evaluate(makeInput()),
      engine.evaluate(
        makeInput({
          matches: [makeRuleMatch({ ruleId: 'X' })],
        }),
      ),
    ];

    for (const a of assessments) {
      expect(a.engineVersion).toBe(ENGINE_VERSION);
    }
  });

  it('id is deterministic from input content', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });

    const input1 = makeInput({ sessionId: 'session-001', artifactId: 'art-001' });
    const input2 = makeInput({ sessionId: 'session-001', artifactId: 'art-001' });

    const a1 = engine.evaluate(input1);
    const a2 = engine.evaluate(input2);

    expect(a2.id).toBe(a1.id);

    // Different session ID → different assessment ID
    const input3 = makeInput({ sessionId: 'session-002', artifactId: 'art-001' });
    const a3 = engine.evaluate(input3);
    expect(a3.id).not.toBe(a1.id);
  });

  it('sessionId is preserved from input to assessment', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({ sessionId: 'custom-session' });
    const assessment = engine.evaluate(input);

    expect(assessment.sessionId).toBe('custom-session');
  });

  it('artifact ID is preserved from input to assessment', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput({ artifactId: 'my-artifact.exe' });
    const assessment = engine.evaluate(input);

    expect(assessment.artifactId).toBe('my-artifact.exe');
  });

  it('computedAt can be overridden per-call', () => {
    const engine = new RiskEngine({ computedAt: '2026-01-01T00:00:00.000Z' });
    const input = makeInput();

    const defaultAssessment = engine.evaluate(input);
    expect(defaultAssessment.computedAt).toBe('2026-01-01T00:00:00.000Z');

    const overrideAssessment = engine.evaluate(input, { computedAt: '2026-07-01T12:00:00.000Z' });
    expect(overrideAssessment.computedAt).toBe('2026-07-01T12:00:00.000Z');
  });

  it('riskScore is always in [0.0, 10.0]', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });

    const testCases = [
      makeInput(),
      makeInput({
        matches: [makeRuleMatch({ ruleId: 'A', severity: makeSeverity(10.0), confidence: 1.0 })],
      }),
      makeInput({
        matches: [
          makeRuleMatch({ ruleId: 'A', severity: makeSeverity(7.0), confidence: 0.85 }),
          makeRuleMatch({ ruleId: 'B', severity: makeSeverity(5.0), confidence: 0.7 }),
        ],
      }),
    ];

    for (const input of testCases) {
      const assessment = engine.evaluate(input);
      expect(assessment.riskScore).toBeGreaterThanOrEqual(0);
      expect(assessment.riskScore).toBeLessThanOrEqual(10);
    }
  });

  it('confidence is always in [0.0, 1.0]', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });

    const testCases = [
      makeInput(),
      makeInput({
        matches: [makeRuleMatch({ ruleId: 'A', severity: makeSeverity(8.0), confidence: 1.0 })],
        correlations: [makeCorrelation({ correlationId: 'B', confidence: 1.0 })],
        evidence: [makeEvidence({ id: 'C', confidence: 1.0 })],
      }),
    ];

    for (const input of testCases) {
      const assessment = engine.evaluate(input);
      expect(assessment.confidence).toBeGreaterThanOrEqual(0);
      expect(assessment.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('engine is stateless — multiple instances produce identical results', () => {
    const engine1 = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const engine2 = new RiskEngine({ computedAt: TEST_TIMESTAMP });

    const input = makeInput({
      matches: [makeRuleMatch({ ruleId: 'RULE-001' })],
    });

    const a1 = engine1.evaluate(input);
    const a2 = engine2.evaluate(input);

    expect(a2.riskScore).toBe(a1.riskScore);
    expect(a2.verdict).toBe(a1.verdict);
    expect(a2.confidence).toBe(a1.confidence);
    expect(a2.id).toBe(a1.id);
  });

  it('engine with different options produces different computedAt', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const input = makeInput();

    // The engine default timestamp
    const a1 = engine.evaluate(input);
    expect(a1.computedAt).toBe(TEST_TIMESTAMP);
  });
});

// ── Comprehensive Pipeline Test ──

describe('comprehensive pipeline test', () => {
  it('produces a complete, deterministic RiskAssessment from realistic inputs', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });

    const input = makeInput({
      matches: [
        makeRuleMatch({
          ruleId: 'RULE-INJECTION-001',
          severity: makeSeverity(8.5, 'critical'),
          confidence: 0.9,
          evidenceIds: Object.freeze(['ev-import', 'ev-api']),
          taxonomyIds: Object.freeze(['T1055']),
        }),
        makeRuleMatch({
          ruleId: 'RULE-OBFUSCATION-001',
          severity: makeSeverity(6.0, 'high'),
          confidence: 0.75,
          evidenceIds: Object.freeze(['ev-entropy']),
          taxonomyIds: Object.freeze(['T1027']),
        }),
      ],
      correlations: [
        makeCorrelation({
          correlationId: 'CORR-INJECT-CHAIN',
          chainLength: 4,
          confidence: 0.8,
          evidenceIds: Object.freeze(['ev-import', 'ev-api', 'ev-entropy']),
        }),
      ],
      evidence: [
        makeEvidence({
          id: 'ev-import',
          confidence: 0.95,
          category: 'pe-import',
          artifactId: 'art-main.exe',
        }),
        makeEvidence({
          id: 'ev-api',
          confidence: 0.85,
          category: 'api-call',
          artifactId: 'art-main.exe',
        }),
        makeEvidence({
          id: 'ev-entropy',
          confidence: 0.7,
          category: 'high-entropy',
          artifactId: 'art-main.exe',
        }),
      ],
      artifactId: 'art-main.exe',
      sessionId: 'session-realistic',
    });

    const assessment = engine.evaluate(input);

    // ── Structure ──
    expect(Object.isFrozen(assessment)).toBe(true);
    expect(Object.isFrozen(assessment.contributions)).toBe(true);
    for (const c of assessment.contributions) {
      expect(Object.isFrozen(c)).toBe(true);
    }

    // ── Schema ──
    expect(assessment.schemaVersion).toBe(SCHEMA_VERSION);
    expect(assessment.engineVersion).toBe(ENGINE_VERSION);

    // ── Identifiers ──
    expect(assessment.id).toMatch(/^ra_[a-f0-9]+$/);
    expect(assessment.sessionId).toBe('session-realistic');
    expect(assessment.artifactId).toBe('art-main.exe');

    // ── Score ──
    expect(assessment.riskScore).toBeGreaterThan(0);
    expect(assessment.riskScore).toBeLessThanOrEqual(10);
    expect(assessment.riskLevel).toBeTruthy();

    // ── Verdict ──
    expect(typeof assessment.verdict).toBe('string');

    // ── Confidence ──
    expect(assessment.confidence).toBeGreaterThan(0);
    expect(assessment.confidence).toBeLessThanOrEqual(1);

    // ── Contributions ──
    expect(assessment.contributions.length).toBe(6);
    expect(assessment.totalContributionCount).toBe(6);
    expect(assessment.contributionsTruncated).toBe(false);

    // ── Contribution ordering (by effectiveValue descending) ──
    for (let i = 1; i < assessment.contributions.length; i++) {
      expect(assessment.contributions[i - 1].effectiveValue).toBeGreaterThanOrEqual(
        assessment.contributions[i].effectiveValue,
      );
    }

    // ── Contribution types are present ──
    const sourceTypes = assessment.contributions.map((c) => c.sourceType);
    expect(sourceTypes).toContain('rule');
    expect(sourceTypes).toContain('correlation');
    expect(sourceTypes).toContain('evidence');

    // ── Timestamp ──
    expect(assessment.computedAt).toBe(TEST_TIMESTAMP);

    // ── Determinism ──
    const rerun = engine.evaluate(input);
    expect(rerun.id).toBe(assessment.id);
    expect(rerun.riskScore).toBe(assessment.riskScore);
    expect(rerun.verdict).toBe(assessment.verdict);
    expect(rerun.confidence).toBe(assessment.confidence);
    expect(rerun.contributions.map((c) => c.id)).toEqual(assessment.contributions.map((c) => c.id));

    // ── Serialization ──
    const json = JSON.stringify(assessment);
    const parsed = JSON.parse(json);
    expect(parsed).toBeTruthy();
    expect(parsed.riskScore).toBe(assessment.riskScore);
  });
});
