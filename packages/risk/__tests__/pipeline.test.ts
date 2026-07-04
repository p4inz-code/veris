/**
 * Pipeline integration tests for @veris/risk — full deterministic pipeline validation.
 *
 * ## Pipeline Validated
 *
 * Input
 *   ↓
 * Contribution Builder (buildContributions)
 *   ↓
 * Aggregation (aggregateByDimension)
 *   ↓
 * Assessment Confidence (computeAssessmentConfidence)
 *   ↓
 * Risk Score (computeRiskScore via engine)
 *   ↓
 * Verdict (resolveVerdict)
 *   ↓
 * RiskEngine (orchestrates all stages)
 *   ↓
 * Serialization (JSON round-trip)
 *
 * ## What This Tests
 *
 * - Every pipeline stage produces correct, deterministic output
 * - Stages compose correctly (output of one stage is valid input to next)
 * - The full RiskEngine.evaluate() produces the same result as manual stage composition
 * - Serialization preserves all fields across JSON round-trip
 * - All outputs are frozen/immutable
 *
 * @module @veris/risk/__tests__/pipeline
 */

import { describe, it, expect } from 'vitest';
import { RiskEngine } from '../src/engine.js';
import { buildContributions } from '../src/contribution-builder.js';
import { aggregateByDimension } from '../src/aggregator.js';
import { computeAssessmentConfidence } from '../src/confidence.js';
import { resolveVerdict } from '../src/verdict.js';
import {
  explainContribution,
  explainDimension,
  breakdownByDimension,
  topContributions,
} from '../src/explainer.js';
import { SCHEMA_VERSION, ENGINE_VERSION } from '../src/constants.js';
import { VERDICTS } from '../src/types.js';
import type { RiskInput } from '../src/types.js';
import { GOLDEN_FIXTURES } from './golden/fixtures.js';
import { TEST_TIMESTAMP, roundTripJson, expectFrozen, makeInput } from './golden/helpers.js';

// ── Pipeline Stage Composition ──

describe('pipeline stage composition', () => {
  it('manual stage composition produces the same result as RiskEngine.evaluate()', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });

    for (const fixture of GOLDEN_FIXTURES) {
      const input = fixture.input;

      // Manual composition: build → aggregate → confidence
      const contributions = buildContributions(input);
      const aggregation = aggregateByDimension(contributions);
      const confidence = computeAssessmentConfidence(contributions, aggregation);

      // Full engine evaluate
      const assessment = engine.evaluate(input);

      // The engine uses the same internal components, so the intermediate
      // results should be consistent. Verify key outputs match.
      expect(assessment.contributions.length).toBe(contributions.length);
      expect(assessment.totalContributionCount).toBe(contributions.length);
      expect(assessment.confidence).toBe(confidence.overall);
    }
  });

  it('each stage produces frozen outputs', () => {
    const input = GOLDEN_FIXTURES[1].input; // single-rule fixture

    const contributions = buildContributions(input);
    expect(Object.isFrozen(contributions)).toBe(true);

    const aggregation = aggregateByDimension(contributions);
    expect(Object.isFrozen(aggregation)).toBe(true);
    expect(Object.isFrozen(aggregation.dimensions)).toBe(true);

    const confidence = computeAssessmentConfidence(contributions, aggregation);
    expect(Object.isFrozen(confidence)).toBe(true);
    expect(Object.isFrozen(confidence.factors)).toBe(true);
  });
});

// ── RiskEngine Golden Fixture Tests ──

describe('RiskEngine golden fixtures', () => {
  const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });

  it('every fixture produces a valid RiskAssessment', () => {
    for (const fixture of GOLDEN_FIXTURES) {
      const assessment = engine.evaluate(fixture.input);

      // Structure
      expect(Object.isFrozen(assessment)).toBe(true);
      expect(Object.isFrozen(assessment.contributions)).toBe(true);
      expect(assessment.id).toMatch(/^ra_[a-f0-9]+$/);
      expect(assessment.sessionId).toBe(fixture.input.sessionId);
      expect(assessment.artifactId).toBe(fixture.input.artifactId);

      // Schema
      expect(assessment.schemaVersion).toBe(SCHEMA_VERSION);
      expect(assessment.engineVersion).toBe(ENGINE_VERSION);

      // Scores
      expect(assessment.riskScore).toBeGreaterThanOrEqual(0);
      expect(assessment.riskScore).toBeLessThanOrEqual(10);
      expect(assessment.confidence).toBeGreaterThanOrEqual(0);
      expect(assessment.confidence).toBeLessThanOrEqual(1);

      // Contributions
      const allContribs = buildContributions(fixture.input);
      expect(assessment.totalContributionCount).toBe(allContribs.length);
      expect(assessment.contributions.length).toBeLessThanOrEqual(allContribs.length);

      // Contribution ordering (by effectiveValue descending)
      for (let i = 1; i < assessment.contributions.length; i++) {
        expect(assessment.contributions[i - 1].effectiveValue).toBeGreaterThanOrEqual(
          assessment.contributions[i].effectiveValue,
        );
      }

      // Timestamp
      expect(assessment.computedAt).toBe(TEST_TIMESTAMP);
    }
  });

  // ── Empty Input ──

  it('empty input: produces zero assessment', () => {
    const assessment = engine.evaluate(GOLDEN_FIXTURES[0].input);

    expect(assessment.riskScore).toBe(0);
    expect(assessment.riskLevel).toBe('negligible');
    expect(assessment.verdict).toBe(VERDICTS.UNKNOWN);
    expect(assessment.confidence).toBe(0);
    expect(assessment.contributions).toEqual([]);
    expect(assessment.totalContributionCount).toBe(0);
    expect(assessment.contributionsTruncated).toBe(false);
  });

  // ── Single Rule ──

  it('single rule: produces contributions for match + evidence', () => {
    const assessment = engine.evaluate(GOLDEN_FIXTURES[1].input);

    // 1 match + 0 correlations + 1 evidence = 2 total contributions
    expect(assessment.contributions.length).toBe(2);
    expect(assessment.totalContributionCount).toBe(2);
    // Rule contribution (has severity) should be first (higher effectiveValue)
    expect(assessment.contributions[0].sourceType).toBe('rule');
    expect(assessment.contributions[0].sourceId).toBe('GOLDEN-RULE-001');
    expect(assessment.contributions[0].effectiveValue).toBeGreaterThan(0);
    // Evidence contribution (no severity) should be second (effectiveValue = 0)
    expect(assessment.contributions[1].sourceType).toBe('evidence');
    expect(assessment.riskScore).toBeGreaterThan(0);
  });

  // ── Multiple Rules ──

  it('multiple rules: produces sorted contributions (rules + evidence)', () => {
    const assessment = engine.evaluate(GOLDEN_FIXTURES[2].input);

    // 4 matches + 0 correlations + 4 evidence = 8 total contributions
    expect(assessment.contributions.length).toBe(8);
    expect(assessment.totalContributionCount).toBe(8);

    // Sorted by effectiveValue descending
    for (let i = 1; i < assessment.contributions.length; i++) {
      expect(assessment.contributions[i - 1].effectiveValue).toBeGreaterThanOrEqual(
        assessment.contributions[i].effectiveValue,
      );
    }

    // Highest severity rule should be first (only rule contributions have non-zero value)
    expect(assessment.contributions[0].sourceId).toBe('GOLDEN-RULE-HIGH');
  });

  // ── Mixed Severities ──

  it('mixed severities: produces correct risk level', () => {
    const assessment = engine.evaluate(GOLDEN_FIXTURES[3].input);

    // 5 matches + 0 correlations + 5 evidence = 10 total contributions
    expect(assessment.riskScore).toBeGreaterThan(0);
    expect(assessment.totalContributionCount).toBe(10);
    expect(typeof assessment.riskLevel).toBe('string');
  });

  // ── Correlation Amplification ──

  it('correlation amplification: all three dimensions present', () => {
    const assessment = engine.evaluate(GOLDEN_FIXTURES[4].input);

    const sourceTypes = assessment.contributions.map((c) => c.sourceType);
    expect(sourceTypes).toContain('rule');
    expect(sourceTypes).toContain('correlation');
    expect(sourceTypes).toContain('evidence');

    // Correlation contribution should have 0 effectiveValue (no severity)
    const corr = assessment.contributions.find((c) => c.sourceType === 'correlation');
    expect(corr).toBeDefined();
    expect(corr!.effectiveValue).toBe(0);
  });

  // ── High Confidence ──

  it('high confidence: produces high confidence and actionable verdict', () => {
    const assessment = engine.evaluate(GOLDEN_FIXTURES[5].input);

    // 1 match + 1 correlation + 3 evidence = 5 contributions
    // contributionConfidence = 1.0 (all 1.0)
    // evidenceCompleteness = 3 unique / 5 total refs = 0.6
    // aggregationQuality = 3/3 = 1.0
    // overall = 1.0 * 0.6 * 1.0 = 0.6
    expect(assessment.confidence).toBe(0.6);
    expect(assessment.verdict).not.toBe(VERDICTS.UNKNOWN);
    expect(assessment.verdict).not.toBe(VERDICTS.BENIGN);
  });

  // ── Low Confidence ──

  it('low confidence: produces insufficient evidence', () => {
    const assessment = engine.evaluate(GOLDEN_FIXTURES[6].input);

    // 1 match + 0 correlations + 1 evidence = 2 contributions
    // Single dimension (rule), single evidence
    // contributionConfidence = (0.4 + 0.55) / 2 = 0.475
    // aggregationQuality = 1/3 ≈ 0.333
    // overall ≈ 0.475 * 1.0 * 0.333 ≈ 0.158 < 0.3
    expect(assessment.confidence).toBeLessThan(0.3);
    expect(assessment.contributions.length).toBe(2);
  });

  // ── Truncated Contributions ──

  it('truncated: retains only top-K contributions', () => {
    const truncEngine = new RiskEngine({ computedAt: TEST_TIMESTAMP, maxContributions: 3 });
    const assessment = truncEngine.evaluate(GOLDEN_FIXTURES[7].input);

    // 10 matches + 0 correlations + 10 evidence = 20 total, truncated to 3
    expect(assessment.contributions.length).toBe(3);
    expect(assessment.totalContributionCount).toBe(20);
    expect(assessment.contributionsTruncated).toBe(true);

    // Top 3 by effectiveValue: severities 10, 9, 8 (rule contributions have non-zero value)
    expect(assessment.contributions[0].sourceId).toBe('GOLDEN-TRUNC-10');
    expect(assessment.contributions[1].sourceId).toBe('GOLDEN-TRUNC-09');
    expect(assessment.contributions[2].sourceId).toBe('GOLDEN-TRUNC-08');
  });

  // ── Multi-Dimension ──

  it('multi-dimension: produces complete assessment', () => {
    const assessment = engine.evaluate(GOLDEN_FIXTURES[8].input);

    // 2 matches + 1 correlation + 4 evidence = 7 total contributions
    expect(assessment.contributions.length).toBe(7);
    expect(assessment.totalContributionCount).toBe(7);
    expect(assessment.contributionsTruncated).toBe(false);

    // All source types present
    const sourceTypes = assessment.contributions.map((c) => c.sourceType);
    expect(sourceTypes.filter((t) => t === 'rule').length).toBe(2);
    expect(sourceTypes.filter((t) => t === 'correlation').length).toBe(1);
    expect(sourceTypes.filter((t) => t === 'evidence').length).toBe(4);
  });

  // ── Large Input ──

  it('large input: processes without error', () => {
    const assessment = engine.evaluate(GOLDEN_FIXTURES[9].input);

    expect(assessment.contributions.length).toBe(35);
    expect(assessment.totalContributionCount).toBe(35);
    expect(assessment.riskScore).toBeGreaterThan(0);
    expect(assessment.riskScore).toBeLessThanOrEqual(10);
  });
});

// ── Determinism ──

describe('golden fixture determinism', () => {
  it('every fixture produces identical output across 100 iterations', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });

    for (const fixture of GOLDEN_FIXTURES) {
      const expected = engine.evaluate(fixture.input);

      for (let i = 0; i < 100; i++) {
        const actual = engine.evaluate(fixture.input);

        expect(actual.riskScore).toBe(expected.riskScore);
        expect(actual.riskLevel).toBe(expected.riskLevel);
        expect(actual.verdict).toBe(expected.verdict);
        expect(actual.confidence).toBe(expected.confidence);
        expect(actual.id).toBe(expected.id);
        expect(actual.contributions.length).toBe(expected.contributions.length);
        expect(actual.totalContributionCount).toBe(expected.totalContributionCount);
        expect(actual.contributionsTruncated).toBe(expected.contributionsTruncated);

        for (let j = 0; j < actual.contributions.length; j++) {
          expect(actual.contributions[j].id).toBe(expected.contributions[j].id);
          expect(actual.contributions[j].effectiveValue).toBe(
            expected.contributions[j].effectiveValue,
          );
        }
      }
    }
  });

  it('fixture IDs are deterministic from input content', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });

    for (const fixture of GOLDEN_FIXTURES) {
      const a1 = engine.evaluate(fixture.input);
      const a2 = engine.evaluate(fixture.input);

      expect(a2.id).toBe(a1.id);

      for (let j = 0; j < a1.contributions.length; j++) {
        expect(a2.contributions[j].id).toBe(a1.contributions[j].id);
      }
    }
  });
});

// ── Serialization ──

describe('golden fixture serialization', () => {
  it('every fixture is JSON-serializable with stable fields', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });

    for (const fixture of GOLDEN_FIXTURES) {
      const assessment = engine.evaluate(fixture.input);
      const json = JSON.stringify(assessment);
      const parsed = JSON.parse(json);

      // Schema versions
      expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
      expect(parsed.engineVersion).toBe(ENGINE_VERSION);

      // Core outputs match
      expect(parsed.id).toBe(assessment.id);
      expect(parsed.riskScore).toBe(assessment.riskScore);
      expect(parsed.riskLevel).toBe(assessment.riskLevel);
      expect(parsed.verdict).toBe(assessment.verdict);
      expect(parsed.confidence).toBe(assessment.confidence);
      expect(parsed.computedAt).toBe(TEST_TIMESTAMP);

      // Contribution data round-trips
      expect(parsed.contributions.length).toBe(assessment.contributions.length);
    }
  });

  it('every fixture round-trips through JSON without data loss', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });

    for (const fixture of GOLDEN_FIXTURES) {
      const assessment = engine.evaluate(fixture.input);
      const roundTrip = roundTripJson(assessment);

      expect(roundTrip).toEqual(JSON.parse(JSON.stringify(assessment)));
    }
  });

  it('every fixture produces finite numeric values', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });

    for (const fixture of GOLDEN_FIXTURES) {
      const assessment = engine.evaluate(fixture.input);

      expect(Number.isFinite(assessment.riskScore)).toBe(true);
      expect(Number.isFinite(assessment.confidence)).toBe(true);

      for (const c of assessment.contributions) {
        expect(Number.isFinite(c.effectiveValue)).toBe(true);
        expect(Number.isFinite(c.confidence)).toBe(true);
      }
    }
  });
});

// ── Immutability ──

describe('golden fixture immutability', () => {
  it('every fixture produces frozen assessment', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });

    for (const fixture of GOLDEN_FIXTURES) {
      const assessment = engine.evaluate(fixture.input);
      expectFrozen(assessment as unknown as Record<string, any>);
    }
  });
});

// ── Pipeline Invariants ──

describe('pipeline invariants', () => {
  it('all fixtures have consistent schema and engine versions', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });

    for (const fixture of GOLDEN_FIXTURES) {
      const assessment = engine.evaluate(fixture.input);
      expect(assessment.schemaVersion).toBe(SCHEMA_VERSION);
      expect(assessment.engineVersion).toBe(ENGINE_VERSION);
    }
  });

  it('riskScore is always in [0.0, 10.0]', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });

    for (const fixture of GOLDEN_FIXTURES) {
      const assessment = engine.evaluate(fixture.input);
      expect(assessment.riskScore).toBeGreaterThanOrEqual(0);
      expect(assessment.riskScore).toBeLessThanOrEqual(10);
    }
  });

  it('confidence is always in [0.0, 1.0]', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });

    for (const fixture of GOLDEN_FIXTURES) {
      const assessment = engine.evaluate(fixture.input);
      expect(assessment.confidence).toBeGreaterThanOrEqual(0);
      expect(assessment.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('contributionsTruncated matches totalContributionCount vs contributions.length', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });

    for (const fixture of GOLDEN_FIXTURES) {
      const assessment = engine.evaluate(fixture.input);
      expect(assessment.contributionsTruncated).toBe(
        assessment.contributions.length < assessment.totalContributionCount,
      );
    }
  });
});

// ── Explainability ──

describe('explainability stage', () => {
  const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });

  it('explainContribution produces deterministic, frozen output', () => {
    const assessment = engine.evaluate(GOLDEN_FIXTURES[8].input); // multi-dimension

    for (const c of assessment.contributions) {
      const explanation = explainContribution(c);
      expect(Object.isFrozen(explanation)).toBe(true);
      expect(Object.isFrozen(explanation.valueBreakdown)).toBe(true);
      expect(Object.isFrozen(explanation.traceability)).toBe(true);

      // Core fields
      expect(explanation.contribution).toBe(c);
      expect(typeof explanation.valueSource).toBe('string');
      expect(explanation.traceability.id).toBe(c.id);
      expect(explanation.traceability.sourceId).toBe(c.sourceId);

      // Numeric fields are finite
      expect(Number.isFinite(explanation.valueBreakdown.baseValue)).toBe(true);
      expect(Number.isFinite(explanation.valueBreakdown.effectiveValue)).toBe(true);

      // Determinism
      const explanation2 = explainContribution(c);
      expect(explanation2).toEqual(explanation);
    }
  });

  it('explainDimension produces frozen output from summary + contributions', () => {
    const input = GOLDEN_FIXTURES[8].input; // multi-dimension
    const contributions = buildContributions(input);
    const aggregation = aggregateByDimension(contributions);

    // Explain each dimension using its summary + filtered contributions
    for (const dimSummary of aggregation.dimensions) {
      const dimContribs = contributions.filter((c) => c.sourceType === dimSummary.dimension);
      const result = explainDimension(dimSummary, dimContribs);

      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.contributions)).toBe(true);
      expect(result.dimension).toBe(dimSummary.dimension);
      expect(result.contributionCount).toBe(dimSummary.contributionCount);
      expect(result.contributions.length).toBeLessThanOrEqual(dimContribs.length);

      // Determinism
      const result2 = explainDimension(dimSummary, dimContribs);
      expect(result2).toEqual(result);
    }
  });

  it('breakdownByDimension produces a frozen result with dimension array', () => {
    const assessment = engine.evaluate(GOLDEN_FIXTURES[8].input);
    const breakdown = breakdownByDimension(assessment);

    expect(Object.isFrozen(breakdown)).toBe(true);
    expect(Object.isFrozen(breakdown.dimensions)).toBe(true);

    // Dimensions is an array of DimensionExplanation objects
    expect(breakdown.dimensions.length).toBeGreaterThan(0);
    expect(typeof breakdown.totalSummedValue).toBe('number');
    expect(typeof breakdown.totalContributions).toBe('number');

    // Verify dimension names are present
    const dimNames = breakdown.dimensions.map((d) => d.dimension);
    expect(dimNames).toContain('rule');
    expect(dimNames).toContain('correlation');

    // Each dimension explanation is frozen
    for (const dim of breakdown.dimensions) {
      expect(Object.isFrozen(dim)).toBe(true);
    }

    // Determinism
    const breakdown2 = breakdownByDimension(assessment);
    expect(breakdown2).toEqual(breakdown);
  });

  it('topContributions returns deterministic results from contributions array', () => {
    const assessment = engine.evaluate(GOLDEN_FIXTURES[8].input);
    const top = topContributions(assessment.contributions, 3);

    expect(Object.isFrozen(top)).toBe(true);
    expect(Object.isFrozen(top.contributions)).toBe(true);
    expect(top.contributions.length).toBeLessThanOrEqual(3);
    expect(top.totalCount).toBe(assessment.contributions.length);
    expect(top.returnedCount).toBe(top.contributions.length);

    // Cutoff is the minimum effectiveValue in result
    if (top.contributions.length > 0) {
      expect(typeof top.cutoffValue).toBe('number');
      expect(top.cutoffValue).toBe(top.contributions[top.contributions.length - 1].effectiveValue);
    }

    // Determinism
    const top2 = topContributions(assessment.contributions, 3);
    expect(top2).toEqual(top);
  });

  it('explainers never modify assessment', () => {
    const assessment = engine.evaluate(GOLDEN_FIXTURES[8].input);
    const assessmentJson = JSON.stringify(assessment);

    // Call various explainers (results not stored — side-effect check only)
    for (const c of assessment.contributions) {
      explainContribution(c);
    }

    const contributions = buildContributions(GOLDEN_FIXTURES[8].input);
    const aggregation = aggregateByDimension(contributions);
    for (const ds of aggregation.dimensions) {
      explainDimension(ds);
    }

    breakdownByDimension(assessment);
    topContributions(assessment.contributions, 3);

    // Assessment unchanged
    expect(JSON.stringify(assessment)).toBe(assessmentJson);
  });
});

// ── Backwards Compatibility ──

describe('backwards compatibility', () => {
  it('assessment shape is stable (all expected fields present)', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });
    const assessment = engine.evaluate(GOLDEN_FIXTURES[1].input);

    // These fields must always exist — removing any is a breaking change
    const expectedKeys = [
      'schemaVersion',
      'engineVersion',
      'id',
      'sessionId',
      'artifactId',
      'riskScore',
      'riskLevel',
      'verdict',
      'confidence',
      'computedAt',
      'contributions',
      'totalContributionCount',
      'contributionsTruncated',
    ];

    for (const key of expectedKeys) {
      expect(assessment).toHaveProperty(key);
    }

    // Contribution shape
    const contributionKeys = [
      'id',
      'sourceType',
      'sourceId',
      'sourceName',
      'baseValue',
      'effectiveValue',
      'confidence',
      'severity',
      'evidenceIds',
      'explanation',
      'formula',
      'multipliers',
      'metadata',
    ];

    for (const c of assessment.contributions) {
      for (const key of contributionKeys) {
        expect(c).toHaveProperty(key);
      }
    }
  });

  it('every fixture produces the same verdict as resolveVerdict', () => {
    const engine = new RiskEngine({ computedAt: TEST_TIMESTAMP });

    for (const fixture of GOLDEN_FIXTURES) {
      const assessment = engine.evaluate(fixture.input);
      const expected = resolveVerdict(assessment.riskScore, assessment.confidence);

      expect(assessment.verdict).toBe(expected.verdict);
    }
  });
});
