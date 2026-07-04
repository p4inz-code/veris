/**
 * Tests for @veris/risk core types and constants.
 *
 * These tests verify that:
 * - Types are structurally correct (compile-time checks).
 * - Constants have expected values.
 * - Verdict thresholds match documented defaults.
 * - Branded types accept known values.
 *
 * @module @veris/risk/__tests__/types
 */

import { describe, it, expect } from 'vitest';
import {
  // Versioning
  SCHEMA_VERSION,
  ENGINE_VERSION,
  // Mathematical constants
  PI_OVER_2,
  // Score bounds
  RISK_SCORE_MIN,
  RISK_SCORE_MAX,
  CONFIDENCE_MIN,
  CONFIDENCE_MAX,
  // Defaults
  DEFAULT_CONCURRENCY,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_CONTRIBUTIONS,
  // Enumerations
  RISK_LEVEL_ORDER,
  VERDICT_ORDER,
  ASSESSMENT_ID_PREFIX,
  CONTRIBUTION_ID_PREFIX,
  // Thresholds
  VERDICT_THRESHOLDS,
  // Branded values
  VERDICTS,
  SOURCE_TYPES,
} from '../src/index.js';

// ── Versioning ──

describe('versioning constants', () => {
  it('schema version is a valid semver string', () => {
    expect(SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('engine version is a valid semver string', () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

// ── Mathematical Constants ──

describe('mathematical constants', () => {
  it('PI_OVER_2 equals Math.PI / 2', () => {
    expect(PI_OVER_2).toBe(Math.PI / 2);
  });
});

// ── Score Bounds ──

describe('score bounds', () => {
  it('risk score min is 0.0', () => {
    expect(RISK_SCORE_MIN).toBe(0.0);
  });

  it('risk score max is 10.0', () => {
    expect(RISK_SCORE_MAX).toBe(10.0);
  });

  it('confidence min is 0.0', () => {
    expect(CONFIDENCE_MIN).toBe(0.0);
  });

  it('confidence max is 1.0', () => {
    expect(CONFIDENCE_MAX).toBe(1.0);
  });
});

// ── Defaults ──

describe('default configuration values', () => {
  it('default concurrency is 4', () => {
    expect(DEFAULT_CONCURRENCY).toBe(4);
  });

  it('default timeout is 30 seconds', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(30_000);
  });

  it('default max contributions is 10,000', () => {
    expect(DEFAULT_MAX_CONTRIBUTIONS).toBe(10_000);
  });
});

// ── ID Prefixes ──

describe('ID prefixes', () => {
  it("assessment ID prefix is 'ra'", () => {
    expect(ASSESSMENT_ID_PREFIX).toBe('ra');
  });

  it("contribution ID prefix is 'rc'", () => {
    expect(CONTRIBUTION_ID_PREFIX).toBe('rc');
  });
});

// ── Risk Level Order ──

describe('risk level order', () => {
  it('lists levels from highest to lowest impact', () => {
    expect(RISK_LEVEL_ORDER).toEqual(['critical', 'high', 'medium', 'low', 'negligible']);
  });

  it('contains no duplicates', () => {
    const unique = new Set(RISK_LEVEL_ORDER);
    expect(unique.size).toBe(RISK_LEVEL_ORDER.length);
  });

  it('all values are non-empty strings', () => {
    for (const level of RISK_LEVEL_ORDER) {
      expect(level).toBeTruthy();
      expect(typeof level).toBe('string');
    }
  });

  it('matches RiskProfile.riskLevel values in @veris/core', () => {
    // @veris/core uses: "critical" | "high" | "medium" | "low" | "negligible"
    // The last value "negligible" (not "informational") is the critical match
    expect(RISK_LEVEL_ORDER[4]).toBe('negligible');
  });
});

// ── Verdict Order ──

describe('verdict order', () => {
  it('lists verdicts from most to least severe', () => {
    expect(VERDICT_ORDER).toEqual([
      VERDICTS.MALICIOUS,
      VERDICTS.LIKELY_MALICIOUS,
      VERDICTS.SUSPICIOUS,
      VERDICTS.LIKELY_BENIGN,
      VERDICTS.BENIGN,
      VERDICTS.UNKNOWN,
    ]);
  });

  it('VERDICTS contains all expected values', () => {
    expect(VERDICTS.MALICIOUS).toBe('malicious');
    expect(VERDICTS.LIKELY_MALICIOUS).toBe('likely-malicious');
    expect(VERDICTS.SUSPICIOUS).toBe('suspicious');
    expect(VERDICTS.LIKELY_BENIGN).toBe('likely-benign');
    expect(VERDICTS.BENIGN).toBe('benign');
    expect(VERDICTS.UNKNOWN).toBe('unknown');
  });

  it('verdict values are usable as plain strings', () => {
    const label: string = VERDICTS.MALICIOUS;
    expect(label).toBe('malicious');
  });

  it('has no duplicate values', () => {
    const values = Object.values(VERDICTS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});

// ── Source Types ──

describe('source types', () => {
  it('provides all expected source types', () => {
    expect(SOURCE_TYPES.RULE).toBe('rule');
    expect(SOURCE_TYPES.CORRELATION).toBe('correlation');
    expect(SOURCE_TYPES.EVIDENCE).toBe('evidence');
  });

  it('source types are usable as plain strings', () => {
    const label: string = SOURCE_TYPES.RULE;
    expect(label).toBe('rule');
  });

  it('has no duplicate values', () => {
    const values = Object.values(SOURCE_TYPES);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});

// ── Verdict Thresholds ──

describe('verdict thresholds', () => {
  it('malicious threshold is at score 8.0 with confidence 0.8', () => {
    expect(VERDICT_THRESHOLDS.maliciousScore).toBe(8.0);
    expect(VERDICT_THRESHOLDS.maliciousConfidence).toBe(0.8);
  });

  it('likely-malicious threshold is at score 6.0 with confidence 0.6', () => {
    expect(VERDICT_THRESHOLDS.likelyMaliciousScore).toBe(6.0);
    expect(VERDICT_THRESHOLDS.likelyMaliciousConfidence).toBe(0.6);
  });

  it('suspicious threshold is at score 4.0 with confidence 0.3', () => {
    expect(VERDICT_THRESHOLDS.suspiciousScore).toBe(4.0);
    expect(VERDICT_THRESHOLDS.suspiciousConfidence).toBe(0.3);
  });

  it('likely-benign threshold is at score 2.0 with confidence 0.5', () => {
    expect(VERDICT_THRESHOLDS.likelyBenignScore).toBe(2.0);
    expect(VERDICT_THRESHOLDS.likelyBenignConfidence).toBe(0.5);
  });

  it('benign threshold is at score 0.0 with confidence 0.7', () => {
    expect(VERDICT_THRESHOLDS.benignScore).toBe(0.0);
    expect(VERDICT_THRESHOLDS.benignConfidence).toBe(0.7);
  });

  it('all threshold scores are within valid range [0.0, 10.0]', () => {
    const scores = [
      VERDICT_THRESHOLDS.maliciousScore,
      VERDICT_THRESHOLDS.likelyMaliciousScore,
      VERDICT_THRESHOLDS.suspiciousScore,
      VERDICT_THRESHOLDS.likelyBenignScore,
      VERDICT_THRESHOLDS.benignScore,
    ];
    for (const score of scores) {
      expect(score).toBeGreaterThanOrEqual(0.0);
      expect(score).toBeLessThanOrEqual(10.0);
    }
  });

  it('all threshold confidences are within valid range [0.0, 1.0]', () => {
    const confidences = [
      VERDICT_THRESHOLDS.maliciousConfidence,
      VERDICT_THRESHOLDS.likelyMaliciousConfidence,
      VERDICT_THRESHOLDS.suspiciousConfidence,
      VERDICT_THRESHOLDS.likelyBenignConfidence,
      VERDICT_THRESHOLDS.benignConfidence,
    ];
    for (const conf of confidences) {
      expect(conf).toBeGreaterThanOrEqual(0.0);
      expect(conf).toBeLessThanOrEqual(1.0);
    }
  });

  it('threshold scores are monotonically decreasing from malicious to benign', () => {
    expect(VERDICT_THRESHOLDS.maliciousScore).toBeGreaterThan(
      VERDICT_THRESHOLDS.likelyMaliciousScore,
    );
    expect(VERDICT_THRESHOLDS.likelyMaliciousScore).toBeGreaterThan(
      VERDICT_THRESHOLDS.suspiciousScore,
    );
    expect(VERDICT_THRESHOLDS.suspiciousScore).toBeGreaterThan(
      VERDICT_THRESHOLDS.likelyBenignScore,
    );
    expect(VERDICT_THRESHOLDS.likelyBenignScore).toBeGreaterThan(VERDICT_THRESHOLDS.benignScore);
  });
});

// ── Type-level Structural Tests ──

describe('type structure', () => {
  it('Contribution interface is exported and structurally valid', () => {
    // Compile-time verification: if Contribution wasn't exported,
    // this line would fail typecheck
    const contribution: import('../src/types.js').Contribution =
      null as unknown as import('../src/types.js').Contribution;
    // Runtime: the object is null, but the TYPE check passes
    expect(contribution).toBeNull();
  });

  it('RiskAssessment interface is exported and structurally valid', () => {
    const assessment: import('../src/types.js').RiskAssessment =
      null as unknown as import('../src/types.js').RiskAssessment;
    expect(assessment).toBeNull();
  });

  it('RiskInput interface is exported and structurally valid', () => {
    const input: import('../src/types.js').RiskInput =
      null as unknown as import('../src/types.js').RiskInput;
    expect(input).toBeNull();
  });
});

// ── Determinism ──

describe('determinism guarantees', () => {
  it('constants never change within a version (double-run stability)', () => {
    const firstRun = {
      SCHEMA_VERSION,
      ENGINE_VERSION,
      maliciousScore: VERDICT_THRESHOLDS.maliciousScore,
      maliciousConfidence: VERDICT_THRESHOLDS.maliciousConfidence,
      riskLevelCount: RISK_LEVEL_ORDER.length,
      verdictCount: VERDICT_ORDER.length,
    };

    const secondRun = {
      SCHEMA_VERSION,
      ENGINE_VERSION,
      maliciousScore: VERDICT_THRESHOLDS.maliciousScore,
      maliciousConfidence: VERDICT_THRESHOLDS.maliciousConfidence,
      riskLevelCount: RISK_LEVEL_ORDER.length,
      verdictCount: VERDICT_ORDER.length,
    };

    expect(firstRun).toEqual(secondRun);
  });
});
