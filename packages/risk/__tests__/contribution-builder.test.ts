/**
 * Tests for @veris/risk/contribution-builder — deterministic Contribution Builder.
 *
 * ## Test Coverage
 *
 * ✓ single rule
 * ✓ multiple rules
 * ✓ correlation amplification
 * ✓ missing evidence
 * ✓ duplicated evidence references
 * ✓ empty inputs
 * ✓ deterministic ordering
 * ✓ repeated execution
 * ✓ stable identifiers
 * ✓ invalid inputs
 * ✓ immutable outputs
 * ✓ cross-function invariants
 *
 * ## Determinism Guarantee
 * Identical inputs must always produce identical Contribution arrays,
 * including IDs, ordering, computed values, and structure.
 *
 * @module @veris/risk/__tests__/contribution-builder
 */

import { describe, it, expect } from 'vitest';
import { buildContributions, validateContributionInput } from '../src/index.js';
import type { Contribution, Severity } from '../src/index.js';
import { SOURCE_TYPES } from '../src/types.js';
import { computeContributionValue } from '../src/scoring.js';
import { deterministicId } from '@veris/shared';
import { CONTRIBUTION_ID_PREFIX } from '../src/constants.js';
import {
  makeSeverity,
  makeRuleMatch,
  makeCorrelation,
  makeEvidence,
  makeInput,
} from './golden/helpers.js';

// ── Single Rule ──

describe('single rule', () => {
  it('produces one contribution for one rule match', () => {
    const match = makeRuleMatch({ ruleId: 'RULE-001' });
    const input = makeInput({ matches: [match] });
    const contributions = buildContributions(input);

    expect(contributions.length).toBe(1);
    expect(contributions[0].sourceType).toBe(SOURCE_TYPES.RULE);
    expect(contributions[0].sourceId).toBe('RULE-001');
  });

  it('computes correct baseValue for rule match', () => {
    const severity = makeSeverity(7.0);
    const match = makeRuleMatch({ ruleId: 'RULE-001', severity, confidence: 0.8 });
    const input = makeInput({ matches: [match] });
    const contributions = buildContributions(input);

    // For a standalone rule match, dimensionWeight = 1.0
    // baseValue = computeContributionValue(7.0, 0.8, 1.0) = 5.6
    const expected = computeContributionValue(7.0, 0.8, 1.0);
    expect(contributions[0].baseValue).toBe(expected);
    expect(contributions[0].effectiveValue).toBe(expected);
  });

  it('preserves evidence IDs from the rule match', () => {
    const match = makeRuleMatch({
      ruleId: 'RULE-001',
      evidenceIds: Object.freeze(['ev-001', 'ev-002']),
    });
    const input = makeInput({ matches: [match] });
    const contributions = buildContributions(input);

    expect(contributions[0].evidenceIds).toEqual(['ev-001', 'ev-002']);
  });

  it('preserves severity from the rule match', () => {
    const severity = makeSeverity(9.0, 'critical');
    const match = makeRuleMatch({ ruleId: 'RULE-001', severity });
    const input = makeInput({ matches: [match] });
    const contributions = buildContributions(input);

    expect(contributions[0].severity).toEqual(severity);
    expect(contributions[0].severity?.score).toBe(9.0);
    expect(contributions[0].severity?.level).toBe('critical');
  });

  it('preserves confidence from the rule match', () => {
    const match = makeRuleMatch({ ruleId: 'RULE-001', confidence: 0.95 });
    const input = makeInput({ matches: [match] });
    const contributions = buildContributions(input);

    expect(contributions[0].confidence).toBe(0.95);
  });

  it('includes formula steps in the contribution', () => {
    const severity = makeSeverity(7.0);
    const match = makeRuleMatch({ ruleId: 'RULE-001', severity, confidence: 0.8 });
    const input = makeInput({ matches: [match] });
    const contributions = buildContributions(input);

    expect(contributions[0].formula).toBeDefined();
    expect(contributions[0].formula.steps.length).toBeGreaterThanOrEqual(4);
    expect(contributions[0].formula.display).toBeTruthy();
  });

  it('includes taxonomy IDs in metadata', () => {
    const match = makeRuleMatch({
      ruleId: 'RULE-001',
      taxonomyIds: Object.freeze(['TAX-001', 'TAX-002']),
    });
    const input = makeInput({ matches: [match] });
    const contributions = buildContributions(input);

    expect(contributions[0].metadata).toBeDefined();
    expect((contributions[0].metadata as any).taxonomyIds).toEqual(['TAX-001', 'TAX-002']);
  });

  it('has no multipliers for a standalone rule match', () => {
    const match = makeRuleMatch({ ruleId: 'RULE-001' });
    const input = makeInput({ matches: [match] });
    const contributions = buildContributions(input);

    expect(contributions[0].multipliers).toEqual([]);
  });

  it('has an explanation string containing the rule ID', () => {
    const match = makeRuleMatch({ ruleId: 'RULE-001' });
    const input = makeInput({ matches: [match] });
    const contributions = buildContributions(input);

    expect(contributions[0].explanation).toContain('RULE-001');
  });
});

// ── Multiple Rules ──

describe('multiple rules', () => {
  it('produces one contribution per rule match', () => {
    const matches = [
      makeRuleMatch({ ruleId: 'RULE-001' }),
      makeRuleMatch({ ruleId: 'RULE-002' }),
      makeRuleMatch({ ruleId: 'RULE-003' }),
    ];
    const input = makeInput({ matches });
    const contributions = buildContributions(input);

    expect(contributions.length).toBe(3);
  });

  it('preserves input ordering of rule matches', () => {
    const matches = [
      makeRuleMatch({ ruleId: 'RULE-A' }),
      makeRuleMatch({ ruleId: 'RULE-B' }),
      makeRuleMatch({ ruleId: 'RULE-C' }),
    ];
    const input = makeInput({ matches });
    const contributions = buildContributions(input);

    expect(contributions[0].sourceId).toBe('RULE-A');
    expect(contributions[1].sourceId).toBe('RULE-B');
    expect(contributions[2].sourceId).toBe('RULE-C');
  });

  it('computes correct baseValues for each rule independently', () => {
    const matches = [
      makeRuleMatch({ ruleId: 'RULE-001', severity: makeSeverity(3.0), confidence: 0.5 }),
      makeRuleMatch({ ruleId: 'RULE-002', severity: makeSeverity(7.0), confidence: 0.8 }),
      makeRuleMatch({ ruleId: 'RULE-003', severity: makeSeverity(10.0), confidence: 0.95 }),
    ];
    const input = makeInput({ matches });
    const contributions = buildContributions(input);

    expect(contributions[0].baseValue).toBe(computeContributionValue(3.0, 0.5, 1.0));
    expect(contributions[1].baseValue).toBe(computeContributionValue(7.0, 0.8, 1.0));
    expect(contributions[2].baseValue).toBe(computeContributionValue(10.0, 0.95, 1.0));
  });

  it('each contribution has a unique deterministic ID', () => {
    const matches = [
      makeRuleMatch({ ruleId: 'RULE-001', evidenceIds: Object.freeze(['ev-001']) }),
      makeRuleMatch({ ruleId: 'RULE-002', evidenceIds: Object.freeze(['ev-002']) }),
    ];
    const input = makeInput({ matches });
    const contributions = buildContributions(input);

    expect(contributions[0].id).not.toBe(contributions[1].id);
    expect(contributions[0].id).toMatch(/^rc_[a-f0-9]+$/);
    expect(contributions[1].id).toMatch(/^rc_[a-f0-9]+$/);
  });

  it('contributions are all frozen', () => {
    const matches = [
      makeRuleMatch({ ruleId: 'RULE-001' }),
      makeRuleMatch({ ruleId: 'RULE-002' }),
      makeRuleMatch({ ruleId: 'RULE-003' }),
    ];
    const input = makeInput({ matches });
    const contributions = buildContributions(input);

    for (const c of contributions) {
      expect(Object.isFrozen(c)).toBe(true);
    }
  });
});

// ── Correlation Amplification ──

describe('correlation amplification', () => {
  it('produces a contribution with sourceType CORRELATION', () => {
    const corr = makeCorrelation({ correlationId: 'CORR-001' });
    const input = makeInput({ correlations: [corr] });
    const contributions = buildContributions(input);

    expect(contributions.length).toBe(1);
    expect(contributions[0].sourceType).toBe(SOURCE_TYPES.CORRELATION);
    expect(contributions[0].sourceId).toBe('CORR-001');
  });

  it('sets severity to null for correlation contributions', () => {
    const corr = makeCorrelation({ correlationId: 'CORR-001' });
    const input = makeInput({ correlations: [corr] });
    const contributions = buildContributions(input);

    expect(contributions[0].severity).toBeNull();
  });

  it('sets baseValue to 0 for correlation contributions (no severity)', () => {
    const corr = makeCorrelation({ correlationId: 'CORR-001' });
    const input = makeInput({ correlations: [corr] });
    const contributions = buildContributions(input);

    expect(contributions[0].baseValue).toBe(0);
    expect(contributions[0].effectiveValue).toBe(0);
  });

  it('includes chainLength in metadata', () => {
    const corr = makeCorrelation({ correlationId: 'CORR-001', chainLength: 5 });
    const input = makeInput({ correlations: [corr] });
    const contributions = buildContributions(input);

    expect((contributions[0].metadata as any).chainLength).toBe(5);
  });

  it('preserves evidence IDs from the correlation', () => {
    const corr = makeCorrelation({
      correlationId: 'CORR-001',
      evidenceIds: Object.freeze(['ev-001', 'ev-002', 'ev-003']),
    });
    const input = makeInput({ correlations: [corr] });
    const contributions = buildContributions(input);

    expect(contributions[0].evidenceIds).toEqual(['ev-001', 'ev-002', 'ev-003']);
  });

  it('preserves confidence from the correlation', () => {
    const corr = makeCorrelation({ correlationId: 'CORR-001', confidence: 0.85 });
    const input = makeInput({ correlations: [corr] });
    const contributions = buildContributions(input);

    expect(contributions[0].confidence).toBe(0.85);
  });
});

// ── Missing Evidence ──

describe('missing evidence', () => {
  it('creates evidence contributions from RiskEvidence references', () => {
    const ev = makeEvidence({ id: 'ev-001' });
    const input = makeInput({ evidence: [ev] });
    const contributions = buildContributions(input);

    expect(contributions.length).toBe(1);
    expect(contributions[0].sourceType).toBe(SOURCE_TYPES.EVIDENCE);
    expect(contributions[0].sourceId).toBe('ev-001');
  });

  it('sets severity to null for evidence contributions', () => {
    const ev = makeEvidence({ id: 'ev-001' });
    const input = makeInput({ evidence: [ev] });
    const contributions = buildContributions(input);

    expect(contributions[0].severity).toBeNull();
  });

  it('sets baseValue to 0 for evidence contributions (no severity)', () => {
    const ev = makeEvidence({ id: 'ev-001' });
    const input = makeInput({ evidence: [ev] });
    const contributions = buildContributions(input);

    expect(contributions[0].baseValue).toBe(0);
    expect(contributions[0].effectiveValue).toBe(0);
  });

  it('includes category and artifactId in metadata', () => {
    const ev = makeEvidence({ id: 'ev-001', category: 'obfuscation', artifactId: 'art-001' });
    const input = makeInput({ evidence: [ev] });
    const contributions = buildContributions(input);

    expect((contributions[0].metadata as any).category).toBe('obfuscation');
    expect((contributions[0].metadata as any).artifactId).toBe('art-001');
  });

  it('evidence contributions have self-referencing evidenceIds', () => {
    const ev = makeEvidence({ id: 'ev-001' });
    const input = makeInput({ evidence: [ev] });
    const contributions = buildContributions(input);

    expect(contributions[0].evidenceIds).toEqual(['ev-001']);
  });
});

// ── Duplicated Evidence References ──

describe('duplicated evidence references', () => {
  it('does not deduplicate — each input produces its own contribution', () => {
    const ev1 = makeEvidence({ id: 'ev-001' });
    const ev2 = makeEvidence({ id: 'ev-001' }); // Same ID but different object
    const input = makeInput({ evidence: [ev1, ev2] });
    const contributions = buildContributions(input);

    // Each evidence input produces its own contribution
    expect(contributions.length).toBe(2);
    expect(contributions[0].sourceId).toBe('ev-001');
    expect(contributions[1].sourceId).toBe('ev-001');
  });

  it('rule matches with same evidence IDs each produce their own contribution', () => {
    const matches = [
      makeRuleMatch({ ruleId: 'RULE-001', evidenceIds: Object.freeze(['ev-001']) }),
      makeRuleMatch({ ruleId: 'RULE-002', evidenceIds: Object.freeze(['ev-001']) }),
    ];
    const input = makeInput({ matches });
    const contributions = buildContributions(input);

    expect(contributions.length).toBe(2);
    // IDs should differ because the rule IDs differ
    expect(contributions[0].id).not.toBe(contributions[1].id);
  });

  it('correlation with same evidence as rule match both produce contributions', () => {
    const match = makeRuleMatch({
      ruleId: 'RULE-001',
      evidenceIds: Object.freeze(['ev-001']),
    });
    const corr = makeCorrelation({
      correlationId: 'CORR-001',
      evidenceIds: Object.freeze(['ev-001']),
    });
    const input = makeInput({ matches: [match], correlations: [corr] });
    const contributions = buildContributions(input);

    expect(contributions.length).toBe(2);
    expect(contributions[0].sourceType).toBe(SOURCE_TYPES.RULE);
    expect(contributions[1].sourceType).toBe(SOURCE_TYPES.CORRELATION);
  });
});

// ── Empty Inputs ──

describe('empty inputs', () => {
  it('returns empty array for all-empty input', () => {
    const input = makeInput();
    const contributions = buildContributions(input);
    expect(contributions).toEqual([]);
  });

  it('returns empty array when matches is empty', () => {
    const input = makeInput({
      matches: [],
      correlations: [],
      evidence: [],
    });
    const contributions = buildContributions(input);
    expect(contributions).toEqual([]);
  });

  it('handles matches only', () => {
    const match = makeRuleMatch({ ruleId: 'RULE-001' });
    const input = makeInput({ matches: [match] });
    const contributions = buildContributions(input);

    expect(contributions.length).toBe(1);
    expect(contributions[0].sourceType).toBe(SOURCE_TYPES.RULE);
  });

  it('handles correlations only', () => {
    const corr = makeCorrelation({ correlationId: 'CORR-001' });
    const input = makeInput({ correlations: [corr] });
    const contributions = buildContributions(input);

    expect(contributions.length).toBe(1);
    expect(contributions[0].sourceType).toBe(SOURCE_TYPES.CORRELATION);
  });

  it('handles evidence only', () => {
    const ev = makeEvidence({ id: 'ev-001' });
    const input = makeInput({ evidence: [ev] });
    const contributions = buildContributions(input);

    expect(contributions.length).toBe(1);
    expect(contributions[0].sourceType).toBe(SOURCE_TYPES.EVIDENCE);
  });

  it('handles mixed empty arrays', () => {
    const match = makeRuleMatch({ ruleId: 'RULE-001' });
    const input = makeInput({
      matches: [match],
      correlations: [],
      evidence: [],
    });
    const contributions = buildContributions(input);

    expect(contributions.length).toBe(1);
  });
});

// ── Deterministic Ordering ──

describe('deterministic ordering', () => {
  it('orders: rule matches first, then correlations, then evidence', () => {
    const ev = makeEvidence({ id: 'ev-003' });
    const match = makeRuleMatch({ ruleId: 'RULE-001' });
    const corr = makeCorrelation({ correlationId: 'CORR-001' });

    const input = makeInput({
      matches: [match],
      correlations: [corr],
      evidence: [ev],
    });
    const contributions = buildContributions(input);

    expect(contributions.length).toBe(3);
    expect(contributions[0].sourceType).toBe(SOURCE_TYPES.RULE);
    expect(contributions[1].sourceType).toBe(SOURCE_TYPES.CORRELATION);
    expect(contributions[2].sourceType).toBe(SOURCE_TYPES.EVIDENCE);
  });

  it('preserves input order within each source type group', () => {
    const matches = [
      makeRuleMatch({ ruleId: 'RULE-C' }),
      makeRuleMatch({ ruleId: 'RULE-A' }),
      makeRuleMatch({ ruleId: 'RULE-B' }),
    ];
    const correlations = [
      makeCorrelation({ correlationId: 'CORR-Z' }),
      makeCorrelation({ correlationId: 'CORR-Y' }),
    ];
    const evidence = [makeEvidence({ id: 'ev-003' }), makeEvidence({ id: 'ev-001' })];

    const input = makeInput({
      matches,
      correlations,
      evidence,
    });
    const contributions = buildContributions(input);

    expect(contributions[0].sourceId).toBe('RULE-C');
    expect(contributions[1].sourceId).toBe('RULE-A');
    expect(contributions[2].sourceId).toBe('RULE-B');
    expect(contributions[3].sourceId).toBe('CORR-Z');
    expect(contributions[4].sourceId).toBe('CORR-Y');
    expect(contributions[5].sourceId).toBe('ev-003');
    expect(contributions[6].sourceId).toBe('ev-001');
  });

  it('produces identical ordering across multiple calls', () => {
    const matches = [makeRuleMatch({ ruleId: 'RULE-B' }), makeRuleMatch({ ruleId: 'RULE-A' })];
    const input = makeInput({ matches });

    const result1 = buildContributions(input);
    const result2 = buildContributions(input);

    expect(result1.length).toBe(result2.length);
    expect(result1[0].sourceId).toBe(result2[0].sourceId);
    expect(result1[1].sourceId).toBe(result2[1].sourceId);
  });
});

// ── Repeated Execution ──

describe('repeated execution', () => {
  it('produces identical output for 10,000 iterations (determinism)', () => {
    const match = makeRuleMatch({
      ruleId: 'RULE-001',
      severity: makeSeverity(7.0),
      confidence: 0.8,
      evidenceIds: Object.freeze(['ev-001']),
    });
    const corr = makeCorrelation({
      correlationId: 'CORR-001',
      chainLength: 3,
      confidence: 0.7,
    });
    const ev = makeEvidence({ id: 'ev-001', confidence: 0.9 });
    const input = makeInput({
      matches: [match],
      correlations: [corr],
      evidence: [ev],
    });

    const expected = buildContributions(input);

    for (let i = 0; i < 10_000; i++) {
      const actual = buildContributions(input);
      expect(actual.length).toBe(expected.length);
      for (let j = 0; j < actual.length; j++) {
        expect(actual[j].id).toBe(expected[j].id);
        expect(actual[j].sourceId).toBe(expected[j].sourceId);
        expect(actual[j].sourceType).toBe(expected[j].sourceType);
        expect(actual[j].baseValue).toBe(expected[j].baseValue);
        expect(actual[j].effectiveValue).toBe(expected[j].effectiveValue);
        expect(actual[j].confidence).toBe(expected[j].confidence);
        expect(actual[j].evidenceIds).toEqual(expected[j].evidenceIds);
      }
    }
  });

  it('produces identical output for large inputs across iterations', () => {
    const matches = Array.from({ length: 50 }, (_, i) =>
      makeRuleMatch({
        ruleId: `RULE-${String(i).padStart(3, '0')}`,
        severity: makeSeverity(5.0 + (i % 5)),
        confidence: 0.5 + (i % 5) * 0.1,
        evidenceIds: Object.freeze([`ev-${i}`]),
      }),
    );

    const input = makeInput({ matches });

    const expected = buildContributions(input);
    for (let i = 0; i < 100; i++) {
      const actual = buildContributions(input);
      expect(actual.map((c) => c.id)).toEqual(expected.map((c) => c.id));
      expect(actual.map((c) => c.baseValue)).toEqual(expected.map((c) => c.baseValue));
    }
  });
});

// ── Stable Identifiers ──

describe('stable identifiers', () => {
  it('same inputs produce same deterministic IDs', () => {
    const match = makeRuleMatch({
      ruleId: 'RULE-001',
      evidenceIds: Object.freeze(['ev-001']),
    });
    const input = makeInput({ matches: [match] });

    const id1 = buildContributions(input)[0].id;
    const id2 = buildContributions(input)[0].id;

    expect(id1).toBe(id2);
  });

  it("IDs are deterministic hashes with 'rc_' prefix", () => {
    const match = makeRuleMatch({
      ruleId: 'RULE-001',
      evidenceIds: Object.freeze(['ev-001', 'ev-002']),
    });
    const input = makeInput({ matches: [match] });
    const contribution = buildContributions(input)[0];

    expect(contribution.id).toMatch(/^rc_[a-f0-9]{64}$/);
  });

  it('different inputs produce different IDs', () => {
    const match1 = makeRuleMatch({
      ruleId: 'RULE-001',
      evidenceIds: Object.freeze(['ev-001']),
    });
    const match2 = makeRuleMatch({
      ruleId: 'RULE-002',
      evidenceIds: Object.freeze(['ev-001']),
    });

    const id1 = buildContributions(makeInput({ matches: [match1] }))[0].id;
    const id2 = buildContributions(makeInput({ matches: [match2] }))[0].id;

    expect(id1).not.toBe(id2);
  });

  it('IDs are deterministic from the SHA-256 of stable content', () => {
    const match = makeRuleMatch({
      ruleId: 'RULE-X',
      evidenceIds: Object.freeze(['ev-001']),
    });
    const input = makeInput({ matches: [match] });
    const contribution = buildContributions(input)[0];

    // The deterministic ID is computed from: CONTRIBUTION_ID_PREFIX + "rule" + "RULE-X" + "ev-001"
    const expectedId = deterministicId(CONTRIBUTION_ID_PREFIX, 'rule', 'RULE-X', 'ev-001');

    expect(contribution.id).toBe(expectedId);
  });
});

// ── Invalid Inputs ──

describe('invalid inputs', () => {
  it('throws TypeError when input is null', () => {
    expect(() => (buildContributions as any)(null)).toThrow(TypeError);
  });

  it('throws TypeError when input is undefined', () => {
    expect(() => (buildContributions as any)(undefined)).toThrow(TypeError);
  });

  it('handles NaN confidence in rule match gracefully (NaN propagates)', () => {
    const match = makeRuleMatch({
      ruleId: 'RULE-001',
      confidence: NaN,
    });
    const input = makeInput({ matches: [match] });

    const contributions = buildContributions(input);
    expect(contributions[0].baseValue).toBeNaN();
  });

  it('handles NaN severity score gracefully (NaN propagates)', () => {
    const match = makeRuleMatch({
      ruleId: 'RULE-001',
      severity: makeSeverity(NaN),
    });
    const input = makeInput({ matches: [match] });

    const contributions = buildContributions(input);
    expect(contributions[0].baseValue).toBeNaN();
  });

  it('handles Infinity severity score that gets clamped', () => {
    const match = makeRuleMatch({
      ruleId: 'RULE-001',
      severity: makeSeverity(Infinity),
    });
    const input = makeInput({ matches: [match] });

    const contributions = buildContributions(input);
    // Infinity × confidence × 1.0 = Infinity → clamp to 10.0
    expect(contributions[0].baseValue).toBe(10.0);
  });

  it('handles very large negative severity score that gets clamped', () => {
    const match = makeRuleMatch({
      ruleId: 'RULE-001',
      severity: makeSeverity(-100),
    });
    const input = makeInput({ matches: [match] });

    const contributions = buildContributions(input);
    // -100 × confidence × 1.0 = -100 → clamp to 0.0
    expect(contributions[0].baseValue).toBe(0);
  });

  it('handles NaN confidence in correlation gracefully', () => {
    const corr = makeCorrelation({
      correlationId: 'CORR-001',
      confidence: NaN,
    });
    const input = makeInput({ correlations: [corr] });

    const contributions = buildContributions(input);
    // Correlation with NaN confidence: baseValue = 0 (no severity)
    expect(contributions[0].baseValue).toBe(0);
    // Confidence should preserve NaN
    expect(contributions[0].confidence).toBeNaN();
  });

  it('handles NaN confidence in evidence gracefully', () => {
    const ev = makeEvidence({ id: 'ev-001', confidence: NaN });
    const input = makeInput({ evidence: [ev] });

    const contributions = buildContributions(input);
    expect(contributions[0].baseValue).toBe(0);
    expect(contributions[0].confidence).toBeNaN();
  });

  it('handles Infinity chainLength in correlation', () => {
    const corr = makeCorrelation({
      correlationId: 'CORR-001',
      chainLength: Infinity,
    });
    const input = makeInput({ correlations: [corr] });

    const contributions = buildContributions(input);
    expect(contributions[0].baseValue).toBe(0);
    expect((contributions[0].metadata as any).chainLength).toBe(Infinity);
  });
});

// ── Immutable Outputs ──

describe('immutable outputs', () => {
  it('returns a frozen array', () => {
    const match = makeRuleMatch({ ruleId: 'RULE-001' });
    const input = makeInput({ matches: [match] });
    const contributions = buildContributions(input);

    expect(Object.isFrozen(contributions)).toBe(true);
  });

  it('each Contribution is frozen', () => {
    const match = makeRuleMatch({ ruleId: 'RULE-001' });
    const corr = makeCorrelation({ correlationId: 'CORR-001' });
    const ev = makeEvidence({ id: 'ev-001' });
    const input = makeInput({
      matches: [match],
      correlations: [corr],
      evidence: [ev],
    });
    const contributions = buildContributions(input);

    for (const c of contributions) {
      expect(Object.isFrozen(c)).toBe(true);
    }
  });

  it('evidenceIds arrays are frozen', () => {
    const match = makeRuleMatch({
      ruleId: 'RULE-001',
      evidenceIds: Object.freeze(['ev-001']),
    });
    const input = makeInput({ matches: [match] });
    const contributions = buildContributions(input);

    expect(Object.isFrozen(contributions[0].evidenceIds)).toBe(true);
  });

  it('multipliers arrays are frozen', () => {
    const match = makeRuleMatch({ ruleId: 'RULE-001' });
    const input = makeInput({ matches: [match] });
    const contributions = buildContributions(input);

    expect(Object.isFrozen(contributions[0].multipliers)).toBe(true);
  });

  it('formula steps arrays are frozen', () => {
    const match = makeRuleMatch({ ruleId: 'RULE-001' });
    const input = makeInput({ matches: [match] });
    const contributions = buildContributions(input);

    expect(Object.isFrozen(contributions[0].formula.steps)).toBe(true);
  });

  it('metadata objects are frozen', () => {
    const match = makeRuleMatch({ ruleId: 'RULE-001' });
    const input = makeInput({ matches: [match] });
    const contributions = buildContributions(input);

    expect(Object.isFrozen(contributions[0].metadata)).toBe(true);
  });

  it('upstream inputs are never mutated by the builder', () => {
    const match = makeRuleMatch({
      ruleId: 'RULE-001',
      severity: makeSeverity(7.0),
      confidence: 0.8,
      evidenceIds: Object.freeze(['ev-001']),
    });
    const input = makeInput({ matches: [match] });

    // Snapshot upstream state
    const matchSnapshot = { ...match, evidenceIds: [...match.evidenceIds] };

    buildContributions(input);

    // Verify upstream is unchanged
    expect(match.ruleId).toBe(matchSnapshot.ruleId);
    expect(match.confidence).toBe(matchSnapshot.confidence);
    expect(match.severity.score).toBe(matchSnapshot.severity!.score);
    expect([...match.evidenceIds]).toEqual(matchSnapshot.evidenceIds);
  });
});

// ── Cross-function Invariants ──

describe('cross-function invariants', () => {
  it('rule match contribution baseValue matches computeContributionValue', () => {
    const severity = makeSeverity(7.0);
    const match = makeRuleMatch({
      ruleId: 'RULE-001',
      severity,
      confidence: 0.8,
    });
    const input = makeInput({ matches: [match] });
    const contribution = buildContributions(input)[0];

    const expected = computeContributionValue(7.0, 0.8, 1.0);
    expect(contribution.baseValue).toBe(expected);
  });

  it('rule match baseValue is consistently computed for various inputs', () => {
    const testCases = [
      { score: 10.0, confidence: 1.0 },
      { score: 0.0, confidence: 0.0 },
      { score: 5.0, confidence: 0.5 },
      { score: 3.5, confidence: 0.75 },
      { score: 8.0, confidence: 0.9 },
    ];

    for (const tc of testCases) {
      const severity = makeSeverity(tc.score);
      const match = makeRuleMatch({
        ruleId: 'RULE-001',
        severity,
        confidence: tc.confidence,
      });
      const input = makeInput({ matches: [match] });
      const contribution = buildContributions(input)[0];

      const expected = computeContributionValue(tc.score, tc.confidence, 1.0);
      expect(contribution.baseValue).toBe(expected);
    }
  });

  it('total contributions equals sum of all input array lengths', () => {
    const matches = [makeRuleMatch({ ruleId: 'RULE-001' }), makeRuleMatch({ ruleId: 'RULE-002' })];
    const correlations = [makeCorrelation({ correlationId: 'CORR-001' })];
    const evidence = [
      makeEvidence({ id: 'ev-001' }),
      makeEvidence({ id: 'ev-002' }),
      makeEvidence({ id: 'ev-003' }),
    ];

    const input = makeInput({ matches, correlations, evidence });
    const contributions = buildContributions(input);

    expect(contributions.length).toBe(matches.length + correlations.length + evidence.length);
  });

  it('all contributions have sourceIds matching input IDs', () => {
    const matches = [makeRuleMatch({ ruleId: 'RULE-A' }), makeRuleMatch({ ruleId: 'RULE-B' })];
    const correlations = [makeCorrelation({ correlationId: 'CORR-X' })];
    const evidence = [makeEvidence({ id: 'ev-001' })];

    const input = makeInput({ matches, correlations, evidence });
    const contributions = buildContributions(input);

    expect(contributions[0].sourceId).toBe('RULE-A');
    expect(contributions[1].sourceId).toBe('RULE-B');
    expect(contributions[2].sourceId).toBe('CORR-X');
    expect(contributions[3].sourceId).toBe('ev-001');
  });

  it('identical inputs produce structurally equal outputs (deep equality)', () => {
    const match = makeRuleMatch({
      ruleId: 'RULE-001',
      severity: makeSeverity(7.0),
      confidence: 0.8,
      evidenceIds: Object.freeze(['ev-001']),
      taxonomyIds: Object.freeze(['TAX-001']),
    });
    const input = makeInput({ matches: [match] });

    const result1 = buildContributions(input);
    const result2 = buildContributions(input);

    expect(result1).toEqual(result2);
  });

  it('output array is strictly immutable — cannot be modified', () => {
    const match = makeRuleMatch({ ruleId: 'RULE-001' });
    const input = makeInput({ matches: [match] });
    const contributions = buildContributions(input);

    expect(() => (contributions as any).push({})).toThrow();
  });
});

// ── Input Validation ──

describe('validateContributionInput', () => {
  it('returns valid for a correct input', () => {
    const input = makeInput({
      matches: [makeRuleMatch({ ruleId: 'RULE-001' })],
    });

    const result = validateContributionInput(input);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('detects null input', () => {
    const result = validateContributionInput(null as any);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('detects NaN confidence in rule match', () => {
    const input = makeInput({
      matches: [makeRuleMatch({ ruleId: 'RULE-001', confidence: NaN })],
    });

    const result = validateContributionInput(input);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('not finite'))).toBe(true);
  });

  it('detects NaN severity score in rule match', () => {
    const input = makeInput({
      matches: [makeRuleMatch({ ruleId: 'RULE-001', severity: makeSeverity(NaN) })],
    });

    const result = validateContributionInput(input);
    expect(result.valid).toBe(false);
  });

  it('detects NaN confidence in correlation', () => {
    const input = makeInput({
      correlations: [makeCorrelation({ correlationId: 'CORR-001', confidence: NaN })],
    });

    const result = validateContributionInput(input);
    expect(result.valid).toBe(false);
  });

  it('detects NaN chainLength in correlation', () => {
    const input = makeInput({
      correlations: [makeCorrelation({ correlationId: 'CORR-001', chainLength: NaN })],
    });

    const result = validateContributionInput(input);
    expect(result.valid).toBe(false);
  });

  it('detects NaN confidence in evidence', () => {
    const input = makeInput({
      evidence: [makeEvidence({ id: 'ev-001', confidence: NaN })],
    });

    const result = validateContributionInput(input);
    expect(result.valid).toBe(false);
  });

  it('accepts Infinity chainLength (technically finite by input contract)', () => {
    // isFinite(Infinity) returns false, so this should be invalid
    const input = makeInput({
      correlations: [makeCorrelation({ correlationId: 'CORR-001', chainLength: Infinity })],
    });

    const result = validateContributionInput(input);
    expect(result.valid).toBe(false);
  });
});

// ── Comprehensive Pipeline Test ──

describe('comprehensive pipeline test', () => {
  it('builds contributions from mixed inputs with full verification', () => {
    const matches = [
      makeRuleMatch({
        ruleId: 'RULE-INJECTION-001',
        severity: makeSeverity(8.0, 'high'),
        confidence: 0.85,
        evidenceIds: Object.freeze(['ev-import', 'ev-api']),
        taxonomyIds: Object.freeze(['T1055']),
      }),
      makeRuleMatch({
        ruleId: 'RULE-OBFUSCATION-001',
        severity: makeSeverity(6.0, 'medium'),
        confidence: 0.7,
        evidenceIds: Object.freeze(['ev-entropy']),
        taxonomyIds: Object.freeze(['T1027']),
      }),
    ];

    const correlations = [
      makeCorrelation({
        correlationId: 'CORR-INJECT-CHAIN',
        chainLength: 4,
        confidence: 0.75,
        evidenceIds: Object.freeze(['ev-import', 'ev-api', 'ev-entropy']),
      }),
    ];

    const evidence = [
      makeEvidence({
        id: 'ev-import',
        confidence: 0.9,
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
    ];

    const input = makeInput({ matches, correlations, evidence });
    const contributions = buildContributions(input);

    // ── Structure checks ──
    expect(contributions.length).toBe(6);
    expect(Object.isFrozen(contributions)).toBe(true);

    // ── Contribution 0: Rule match — INJECTION ──
    const c0 = contributions[0];
    expect(c0.sourceType).toBe(SOURCE_TYPES.RULE);
    expect(c0.sourceId).toBe('RULE-INJECTION-001');
    expect(c0.severity?.score).toBe(8.0);
    expect(c0.confidence).toBe(0.85);
    expect(c0.evidenceIds).toEqual(['ev-import', 'ev-api']);
    expect(c0.baseValue).toBe(computeContributionValue(8.0, 0.85, 1.0));
    expect(c0.effectiveValue).toBe(c0.baseValue);
    expect(Object.isFrozen(c0)).toBe(true);
    expect(Object.isFrozen(c0.evidenceIds)).toBe(true);
    expect(Object.isFrozen(c0.multipliers)).toBe(true);
    expect(Object.isFrozen(c0.formula.steps)).toBe(true);
    expect(Object.isFrozen(c0.metadata)).toBe(true);
    expect(c0.id).toMatch(/^rc_[a-f0-9]{64}$/);

    // ── Contribution 1: Rule match — OBFUSCATION ──
    const c1 = contributions[1];
    expect(c1.sourceType).toBe(SOURCE_TYPES.RULE);
    expect(c1.sourceId).toBe('RULE-OBFUSCATION-001');
    expect(c1.severity?.score).toBe(6.0);
    expect(c1.confidence).toBe(0.7);
    expect(c1.evidenceIds).toEqual(['ev-entropy']);
    expect(c1.baseValue).toBe(computeContributionValue(6.0, 0.7, 1.0));

    // ── Contribution 2: Correlation ──
    const c2 = contributions[2];
    expect(c2.sourceType).toBe(SOURCE_TYPES.CORRELATION);
    expect(c2.sourceId).toBe('CORR-INJECT-CHAIN');
    expect(c2.severity).toBeNull();
    expect(c2.confidence).toBe(0.75);
    expect(c2.baseValue).toBe(0);
    expect(c2.effectiveValue).toBe(0);
    expect(Object.isFrozen(c2)).toBe(true);
    expect((c2.metadata as any).chainLength).toBe(4);

    // ── Contribution 3-5: Evidence ──
    for (let i = 3; i <= 5; i++) {
      const c = contributions[i];
      expect(c.sourceType).toBe(SOURCE_TYPES.EVIDENCE);
      expect(c.severity).toBeNull();
      expect(c.baseValue).toBe(0);
      expect(Object.isFrozen(c)).toBe(true);
    }

    // ── Ordering ──
    expect(contributions[0].sourceType).toBe(SOURCE_TYPES.RULE);
    expect(contributions[1].sourceType).toBe(SOURCE_TYPES.RULE);
    expect(contributions[2].sourceType).toBe(SOURCE_TYPES.CORRELATION);
    expect(contributions[3].sourceType).toBe(SOURCE_TYPES.EVIDENCE);
    expect(contributions[4].sourceType).toBe(SOURCE_TYPES.EVIDENCE);
    expect(contributions[5].sourceType).toBe(SOURCE_TYPES.EVIDENCE);

    // ── Evidence IDs in evidence contributions ──
    expect(contributions[3].evidenceIds).toEqual(['ev-import']);
    expect(contributions[4].evidenceIds).toEqual(['ev-api']);
    expect(contributions[5].evidenceIds).toEqual(['ev-entropy']);

    // ── Response IDs are deterministic ──
    const rerun = buildContributions(input);
    for (let i = 0; i < contributions.length; i++) {
      expect(contributions[i].id).toBe(rerun[i].id);
    }
  });
});
