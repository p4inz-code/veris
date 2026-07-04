/**
 * Tests for @veris/risk/decision-engine.
 *
 * Covers:
 * - Decision mapping for each verdict
 * - Priority mapping
 * - Rationale generation
 * - Recommendation generation
 * - Confidence-limited detection
 * - Edge cases (null assessment, empty dimensions)
 * - Determinism
 */

import { describe, it, expect } from 'vitest';
import { DecisionEngine } from '../src/decision-engine.js';
import type { RiskAssessment } from '../src/types.js';
import { VERDICTS } from '../src/types.js';

// ── Helper: create a minimal RiskAssessment ──

function makeAssessment(overrides?: Partial<RiskAssessment>): RiskAssessment {
  return Object.freeze({
    schemaVersion: '0.1.0',
    engineVersion: '0.1.0',
    id: 'ra_test_assessment',
    sessionId: 'session-001',
    artifactId: 'art-main.exe',
    riskScore: 6.4,
    riskLevel: 'high',
    verdict: VERDICTS.LIKELY_MALICIOUS,
    confidence: 0.85,
    computedAt: '2024-01-01T00:00:00.000Z',
    contributions: Object.freeze([]),
    totalContributionCount: 5,
    contributionsTruncated: false,
    ...overrides,
  });
}

describe('DecisionEngine.decide', () => {
  it('should produce block action for malicious verdict', () => {
    const engine = new DecisionEngine();
    const assessment = makeAssessment({
      verdict: VERDICTS.MALICIOUS,
      riskScore: 9.0,
      confidence: 0.9,
    });
    const decision = engine.decide(assessment);

    expect(decision.action).toBe('block');
    expect(decision.priority).toBe('critical');
  });

  it('should produce investigate action for likely-malicious verdict', () => {
    const engine = new DecisionEngine();
    const assessment = makeAssessment({
      verdict: VERDICTS.LIKELY_MALICIOUS,
      riskScore: 6.4,
      confidence: 0.85,
    });
    const decision = engine.decide(assessment);

    expect(decision.action).toBe('investigate');
    expect(decision.priority).toBe('high');
  });

  it('should produce review action for suspicious verdict', () => {
    const engine = new DecisionEngine();
    const assessment = makeAssessment({
      verdict: VERDICTS.SUSPICIOUS,
      riskScore: 4.5,
      confidence: 0.5,
    });
    const decision = engine.decide(assessment);

    expect(decision.action).toBe('review');
    expect(decision.priority).toBe('medium');
  });

  it('should produce monitor action for likely-benign verdict', () => {
    const engine = new DecisionEngine();
    const assessment = makeAssessment({
      verdict: VERDICTS.LIKELY_BENIGN,
      riskScore: 2.5,
      confidence: 0.6,
    });
    const decision = engine.decide(assessment);

    expect(decision.action).toBe('monitor');
    expect(decision.priority).toBe('low');
  });

  it('should produce allow action for benign verdict', () => {
    const engine = new DecisionEngine();
    const assessment = makeAssessment({
      verdict: VERDICTS.BENIGN,
      riskScore: 0.5,
      confidence: 0.8,
    });
    const decision = engine.decide(assessment);

    expect(decision.action).toBe('allow');
    expect(decision.priority).toBe('none');
  });

  it('should produce insufficient-evidence for unknown verdict', () => {
    const engine = new DecisionEngine();
    const assessment = makeAssessment({ verdict: VERDICTS.UNKNOWN, riskScore: 0, confidence: 0 });
    const decision = engine.decide(assessment);

    expect(decision.action).toBe('insufficient-evidence');
    expect(decision.priority).toBe('none');
  });

  it('should throw TypeError for null assessment', () => {
    const engine = new DecisionEngine();
    expect(() => engine.decide(null as any)).toThrow(TypeError);
  });
});

describe('DecisionEngine confidence-limited detection', () => {
  it('should detect confidence-limited when score is high but confidence low', () => {
    const engine = new DecisionEngine();
    const assessment = makeAssessment({
      verdict: VERDICTS.SUSPICIOUS,
      riskScore: 7.0, // qualifies for investigate+ but...
      confidence: 0.3, // ...confidence is very low
    });
    const decision = engine.decide(assessment);

    expect(decision.confidenceLimited).toBe(true);
  });

  it('should not flag as confidence-limited when both score and confidence are aligned', () => {
    const engine = new DecisionEngine();
    const assessment = makeAssessment({
      verdict: VERDICTS.LIKELY_MALICIOUS,
      riskScore: 6.4,
      confidence: 0.85,
    });
    const decision = engine.decide(assessment);

    expect(decision.confidenceLimited).toBe(false);
  });

  it('should not flag as confidence-limited for low scores', () => {
    const engine = new DecisionEngine();
    const assessment = makeAssessment({
      verdict: VERDICTS.BENIGN,
      riskScore: 0.5,
      confidence: 0.5, // low confidence but low score too
    });
    const decision = engine.decide(assessment);

    expect(decision.confidenceLimited).toBe(false);
  });
});

describe('DecisionEngine decision ID', () => {
  it('should generate deterministic decision ID from assessment ID', () => {
    const engine = new DecisionEngine();
    const assessment = makeAssessment({ id: 'ra_abc123def' });
    const decision = engine.decide(assessment);

    // deterministicId produces a hash-based ID with "rd_" prefix
    expect(decision.decisionId).toMatch(/^rd_/);
    expect(decision.decisionId.length).toBeGreaterThan(3);
  });
});

describe('DecisionEngine rationale', () => {
  it('should include score, level, confidence, and contribution count for investigate', () => {
    const engine = new DecisionEngine();
    const assessment = makeAssessment({
      verdict: VERDICTS.LIKELY_MALICIOUS,
      riskScore: 6.4,
      riskLevel: 'high',
      confidence: 0.85,
      totalContributionCount: 10,
    });
    const decision = engine.decide(assessment);

    expect(decision.rationale).toContain('6.4');
    expect(decision.rationale).toContain('high');
    expect(decision.rationale).toContain('0.85');
    expect(decision.rationale).toContain('10');
  });

  it('should mention insufficient evidence for unknown verdict', () => {
    const engine = new DecisionEngine();
    const assessment = makeAssessment({
      verdict: VERDICTS.UNKNOWN,
      riskScore: 0,
      confidence: 0,
      totalContributionCount: 0,
    });
    const decision = engine.decide(assessment);

    expect(decision.rationale).toContain('insufficient evidence');
  });
});

describe('DecisionEngine recommendations', () => {
  it('should include recommendations for block action', () => {
    const engine = new DecisionEngine();
    const assessment = makeAssessment({
      verdict: VERDICTS.MALICIOUS,
      riskScore: 9.0,
      confidence: 0.9,
    });
    const decision = engine.decide(assessment);

    expect(decision.recommendations.length).toBeGreaterThan(0);
    expect(decision.recommendations[0].priority).toBe('critical');
  });

  it('should include recommendations for investigate action', () => {
    const engine = new DecisionEngine();
    const assessment = makeAssessment({
      verdict: VERDICTS.LIKELY_MALICIOUS,
      riskScore: 6.4,
      confidence: 0.85,
    });
    const decision = engine.decide(assessment);

    expect(decision.recommendations.length).toBeGreaterThan(0);
    expect(decision.recommendations[0].priority).toBe('high');
  });

  it('should include recommendations for insufficient-evidence action', () => {
    const engine = new DecisionEngine();
    const assessment = makeAssessment({
      verdict: VERDICTS.UNKNOWN,
      riskScore: 0,
      confidence: 0,
    });
    const decision = engine.decide(assessment);

    expect(decision.recommendations.length).toBeGreaterThan(0);
    expect(decision.recommendations.some((r) => r.category === 'evidence-gathering')).toBe(true);
  });
});

describe('DecisionEngine frozen outputs', () => {
  it('should produce frozen decision objects', () => {
    const engine = new DecisionEngine();
    const assessment = makeAssessment();
    const decision = engine.decide(assessment);

    expect(Object.isFrozen(decision)).toBe(true);
    expect(Object.isFrozen(decision.recommendations)).toBe(true);
  });
});

describe('DecisionEngine determinism', () => {
  it('should produce identical results for identical inputs (5 runs)', () => {
    const engine = new DecisionEngine();
    const assessment = makeAssessment({
      verdict: VERDICTS.SUSPICIOUS,
      riskScore: 4.5,
      confidence: 0.6,
      totalContributionCount: 8,
    });

    let lastAction: string | null = null;
    let lastRationale: string | null = null;

    for (let run = 0; run < 5; run++) {
      const decision = engine.decide(assessment);

      if (lastAction !== null) {
        expect(decision.action).toBe(lastAction);
        expect(decision.rationale).toBe(lastRationale);
        expect(decision.recommendations.length).toBe(
          lastAction === 'block' ? 3 : lastAction === 'insufficient-evidence' ? 3 : 2,
        );
      }

      lastAction = decision.action as string;
      lastRationale = decision.rationale;
    }
  });
});
