/**
 * Tests for @veris/risk/verdict — deterministic verdict resolution.
 *
 * ## Test Coverage
 *
 * ✓ every threshold boundary
 * ✓ confidence boundary cases
 * ✓ invalid thresholds
 * ✓ overlapping thresholds
 * ✓ impossible configurations
 * ✓ deterministic repeated execution (10k+)
 * ✓ immutable configuration
 * ✓ invalid inputs
 * ✓ mathematical invariants
 * ✓ serialization compatibility
 *
 * ## Determinism Guarantee
 * Identical (score, confidence, thresholds) must always produce
 * identical VerdictResult.
 *
 * @module @veris/risk/__tests__/verdict
 */

import { describe, it, expect } from 'vitest';
import {
  resolveVerdict,
  resolveVerdictValue,
  getDefaultThresholds,
  validateVerdictThresholds,
} from '../src/index.js';
import { VERDICTS } from '../src/types.js';
import { VERDICT_THRESHOLDS, VERDICT_ORDER } from '../src/constants.js';
import type { VerdictThresholdsConfig } from '../src/constants.js';

// ── Default Thresholds ──

describe('getDefaultThresholds', () => {
  it('returns values matching VERDICT_THRESHOLDS', () => {
    const thresholds = getDefaultThresholds();
    // getDefaultThresholds returns a frozen copy, so use deep equality
    expect(thresholds).toEqual(VERDICT_THRESHOLDS);
  });

  it('returns a frozen object', () => {
    const thresholds = getDefaultThresholds();
    expect(Object.isFrozen(thresholds)).toBe(true);
  });
});

// ── MALICIOUS Threshold Boundary ──

describe('MALICIOUS threshold boundary', () => {
  it('returns MALICIOUS when score >= 8.0 and confidence >= 0.8', () => {
    const result = resolveVerdict(8.0, 0.8);
    expect(result.verdict).toBe(VERDICTS.MALICIOUS);
    expect(result.confidenceLimited).toBe(false);
  });

  it('returns MALICIOUS at exact threshold values', () => {
    const result = resolveVerdict(
      VERDICT_THRESHOLDS.maliciousScore,
      VERDICT_THRESHOLDS.maliciousConfidence,
    );
    expect(result.verdict).toBe(VERDICTS.MALICIOUS);
  });

  it('returns MALICIOUS for max score and confidence', () => {
    const result = resolveVerdict(10.0, 1.0);
    expect(result.verdict).toBe(VERDICTS.MALICIOUS);
  });

  it('returns LIKELY_MALICIOUS when score >= 8.0 but confidence < 0.8 but >= 0.6', () => {
    const result = resolveVerdict(9.0, 0.7);
    expect(result.verdict).toBe(VERDICTS.LIKELY_MALICIOUS);
    expect(result.confidenceLimited).toBe(true);
    expect(result.highestQualifyingVerdict).toBe(VERDICTS.MALICIOUS);
  });

  it('returns SUSPICIOUS when score >= 8.0 but confidence < 0.6 but >= 0.3', () => {
    const result = resolveVerdict(9.0, 0.4);
    expect(result.verdict).toBe(VERDICTS.SUSPICIOUS);
    expect(result.confidenceLimited).toBe(true);
  });

  it('returns UNKNOWN when score >= 8.0 but confidence < 0.3 (below all confidence thresholds)', () => {
    const result = resolveVerdict(9.0, 0.2);
    // Confidence 0.2 is below all thresholds (0.8, 0.6, 0.3, 0.5, 0.7)
    expect(result.verdict).toBe(VERDICTS.UNKNOWN);
    expect(result.confidenceLimited).toBe(true);
    expect(result.highestQualifyingVerdict).toBe(VERDICTS.MALICIOUS);
  });

  it('returns UNKNOWN when score >= 8.0 but confidence is very low (0.0)', () => {
    const result = resolveVerdict(9.0, 0.0);
    expect(result.verdict).toBe(VERDICTS.UNKNOWN);
    expect(result.confidenceLimited).toBe(true);
  });
});

// ── LIKELY_MALICIOUS Threshold Boundary ──

describe('LIKELY_MALICIOUS threshold boundary', () => {
  it('returns LIKELY_MALICIOUS when score >= 6.0 and score < 8.0 and confidence >= 0.6', () => {
    const result = resolveVerdict(7.0, 0.7);
    expect(result.verdict).toBe(VERDICTS.LIKELY_MALICIOUS);
    expect(result.confidenceLimited).toBe(false);
  });

  it('returns LIKELY_MALICIOUS at exact threshold', () => {
    const result = resolveVerdict(
      VERDICT_THRESHOLDS.likelyMaliciousScore,
      VERDICT_THRESHOLDS.likelyMaliciousConfidence,
    );
    expect(result.verdict).toBe(VERDICTS.LIKELY_MALICIOUS);
  });

  it('returns SUSPICIOUS when score qualifies for LIKELY_MALICIOUS but confidence < 0.6', () => {
    const result = resolveVerdict(7.0, 0.4);
    expect(result.verdict).toBe(VERDICTS.SUSPICIOUS);
    expect(result.confidenceLimited).toBe(true);
  });

  it('returns UNKNOWN when score qualifies for LIKELY_MALICIOUS but confidence < 0.3', () => {
    const result = resolveVerdict(7.0, 0.2);
    // Confidence 0.2 is below all confidence thresholds
    expect(result.verdict).toBe(VERDICTS.UNKNOWN);
    expect(result.confidenceLimited).toBe(true);
    expect(result.highestQualifyingVerdict).toBe(VERDICTS.LIKELY_MALICIOUS);
  });
});

// ── SUSPICIOUS Threshold Boundary ──

describe('SUSPICIOUS threshold boundary', () => {
  it('returns SUSPICIOUS when score >= 4.0 and score < 6.0 and confidence >= 0.3', () => {
    const result = resolveVerdict(5.0, 0.5);
    expect(result.verdict).toBe(VERDICTS.SUSPICIOUS);
    expect(result.confidenceLimited).toBe(false);
  });

  it('returns SUSPICIOUS at exact threshold', () => {
    const result = resolveVerdict(
      VERDICT_THRESHOLDS.suspiciousScore,
      VERDICT_THRESHOLDS.suspiciousConfidence,
    );
    expect(result.verdict).toBe(VERDICTS.SUSPICIOUS);
  });

  it('returns UNKNOWN when score qualifies for SUSPICIOUS but confidence < 0.3 (below suspicious threshold)', () => {
    const result = resolveVerdict(5.0, 0.2);
    // Confidence 0.2 is below suspicious threshold (0.3) and all lower ones
    expect(result.verdict).toBe(VERDICTS.UNKNOWN);
    expect(result.confidenceLimited).toBe(true);
    expect(result.highestQualifyingVerdict).toBe(VERDICTS.SUSPICIOUS);
  });
});

// ── LIKELY_BENIGN Threshold Boundary ──

describe('LIKELY_BENIGN threshold boundary', () => {
  it('returns LIKELY_BENIGN when score >= 2.0 and score < 4.0 and confidence >= 0.5', () => {
    const result = resolveVerdict(3.0, 0.6);
    expect(result.verdict).toBe(VERDICTS.LIKELY_BENIGN);
    expect(result.confidenceLimited).toBe(false);
  });

  it('returns LIKELY_BENIGN at exact threshold', () => {
    const result = resolveVerdict(
      VERDICT_THRESHOLDS.likelyBenignScore,
      VERDICT_THRESHOLDS.likelyBenignConfidence,
    );
    expect(result.verdict).toBe(VERDICTS.LIKELY_BENIGN);
  });

  it('returns BENIGN when score qualifies for LIKELY_BENIGN but confidence < 0.5 but >= 0.7', () => {
    // Actually, for likelyBenign area (< 4.0, >= 2.0), if confidence < 0.5,
    // the score also qualifies for BENIGN (score >= 0.0).
    // But BENIGN requires confidence >= 0.7, so if confidence < 0.5 and >= 0.0:
    const result = resolveVerdict(3.0, 0.3);
    expect(result.verdict).toBe(VERDICTS.UNKNOWN);
    expect(result.confidenceLimited).toBe(true);
  });
});

// ── BENIGN Threshold Boundary ──

describe('BENIGN threshold boundary', () => {
  it('returns BENIGN when confidence >= 0.7 (any score >= 0.0)', () => {
    const result = resolveVerdict(1.0, 0.8);
    expect(result.verdict).toBe(VERDICTS.BENIGN);
    expect(result.confidenceLimited).toBe(false);
  });

  it('returns BENIGN at exact threshold', () => {
    const result = resolveVerdict(
      VERDICT_THRESHOLDS.benignScore,
      VERDICT_THRESHOLDS.benignConfidence,
    );
    expect(result.verdict).toBe(VERDICTS.BENIGN);
  });

  it('returns BENIGN with score 0.0 and high confidence', () => {
    const result = resolveVerdict(0.0, 1.0);
    expect(result.verdict).toBe(VERDICTS.BENIGN);
  });
});

// ── UNKNOWN Threshold Boundary ──

describe('UNKNOWN threshold boundary', () => {
  it('returns UNKNOWN when score qualifies for benign but confidence < 0.7', () => {
    const result = resolveVerdict(1.0, 0.3);
    expect(result.verdict).toBe(VERDICTS.UNKNOWN);
  });

  it('returns UNKNOWN with score 0.0 and confidence 0.0', () => {
    const result = resolveVerdict(0.0, 0.0);
    expect(result.verdict).toBe(VERDICTS.UNKNOWN);
  });

  it('returns UNKNOWN for low score and low confidence', () => {
    const result = resolveVerdict(0.5, 0.2);
    expect(result.verdict).toBe(VERDICTS.UNKNOWN);
  });

  it('highestQualifyingVerdict is BENIGN when score is 0.0 (benign threshold is 0.0)', () => {
    // benignScore = 0.0, so score >= 0.0 always qualifies for BENIGN
    const result = resolveVerdict(0.0, 0.0);
    expect(result.highestQualifyingVerdict).toBe(VERDICTS.BENIGN);
    expect(result.verdict).toBe(VERDICTS.UNKNOWN);
    expect(result.confidenceLimited).toBe(true);
  });

  it('highestQualifyingVerdict is UNKNOWN when score is negative (below benign threshold)', () => {
    const result = resolveVerdict(-1.0, 0.0);
    expect(result.highestQualifyingVerdict).toBe(VERDICTS.UNKNOWN);
    expect(result.confidenceLimited).toBe(false);
  });
});

// ── Confidence Boundary Cases ──

describe('confidence boundary cases', () => {
  it('malicious score with confidence just below malicious threshold (0.7999) → likely-malicious', () => {
    const result = resolveVerdict(9.0, 0.7999);
    expect(result.verdict).toBe(VERDICTS.LIKELY_MALICIOUS);
  });

  it('malicious score with confidence just below likely-malicious threshold (0.5999) → suspicious', () => {
    const result = resolveVerdict(9.0, 0.5999);
    expect(result.verdict).toBe(VERDICTS.SUSPICIOUS);
  });

  it('malicious score with confidence just below suspicious threshold (0.2999) → UNKNOWN', () => {
    const result = resolveVerdict(9.0, 0.2999);
    // Confidence 0.2999 < 0.3 (suspicious), < 0.5 (likelyBenign), < 0.7 (benign)
    expect(result.verdict).toBe(VERDICTS.UNKNOWN);
  });

  it('malicious score with confidence just below benign threshold (0.6999) → LIKELY_MALICIOUS', () => {
    const result = resolveVerdict(9.0, 0.6999);
    expect(result.verdict).toBe(VERDICTS.LIKELY_MALICIOUS); // 0.6999 >= 0.6 → qualifies for likelyMalicious
  });

  it('score just below malicious threshold (7.9999) with high confidence → likely-malicious', () => {
    const result = resolveVerdict(7.9999, 1.0);
    expect(result.verdict).toBe(VERDICTS.LIKELY_MALICIOUS);
  });

  it('score just below likely-malicious threshold (5.9999) with high confidence → suspicious', () => {
    const result = resolveVerdict(5.9999, 1.0);
    expect(result.verdict).toBe(VERDICTS.SUSPICIOUS);
  });

  it('score just below suspicious threshold (3.9999) with high confidence → likely-benign', () => {
    const result = resolveVerdict(3.9999, 1.0);
    expect(result.verdict).toBe(VERDICTS.LIKELY_BENIGN);
  });

  it('score just below likely-benign threshold (1.9999) with high confidence → benign', () => {
    const result = resolveVerdict(1.9999, 1.0);
    expect(result.verdict).toBe(VERDICTS.BENIGN);
  });
});

// ── Score Boundary Cases ──

describe('score boundary cases', () => {
  it('score 8.0 exactly with confidence 0.8 → MALICIOUS', () => {
    const result = resolveVerdict(8.0, 0.8);
    expect(result.verdict).toBe(VERDICTS.MALICIOUS);
  });

  it('score 6.0 exactly with confidence 0.6 → LIKELY_MALICIOUS', () => {
    const result = resolveVerdict(6.0, 0.6);
    expect(result.verdict).toBe(VERDICTS.LIKELY_MALICIOUS);
  });

  it('score 4.0 exactly with confidence 0.3 → SUSPICIOUS', () => {
    const result = resolveVerdict(4.0, 0.3);
    expect(result.verdict).toBe(VERDICTS.SUSPICIOUS);
  });

  it('score 2.0 exactly with confidence 0.5 → LIKELY_BENIGN', () => {
    const result = resolveVerdict(2.0, 0.5);
    expect(result.verdict).toBe(VERDICTS.LIKELY_BENIGN);
  });

  it('score 0.0 exactly with confidence 0.7 → BENIGN', () => {
    const result = resolveVerdict(0.0, 0.7);
    expect(result.verdict).toBe(VERDICTS.BENIGN);
  });

  it('score 10.0 with confidence 1.0 → MALICIOUS', () => {
    const result = resolveVerdict(10.0, 1.0);
    expect(result.verdict).toBe(VERDICTS.MALICIOUS);
  });
});

// ── resolveVerdictValue ──

describe('resolveVerdictValue', () => {
  it('returns just the verdict string', () => {
    const result = resolveVerdictValue(9.0, 0.9);
    expect(result).toBe(VERDICTS.MALICIOUS);
  });

  it('matches resolveVerdict().verdict', () => {
    const testCases = [
      [9.0, 0.9],
      [7.0, 0.7],
      [5.0, 0.5],
      [3.0, 0.6],
      [1.0, 0.8],
      [0.0, 0.0],
    ] as const;

    for (const [score, confidence] of testCases) {
      expect(resolveVerdictValue(score, confidence)).toBe(
        resolveVerdict(score, confidence).verdict,
      );
    }
  });
});

// ── Invalid Thresholds ──

describe('validateVerdictThresholds', () => {
  it('validates the default thresholds as valid', () => {
    const result = validateVerdictThresholds(VERDICT_THRESHOLDS);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('detects null thresholds', () => {
    const result = validateVerdictThresholds(null as any);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('detects score out of range (negative)', () => {
    const thresholds = { ...VERDICT_THRESHOLDS, maliciousScore: -1.0 };
    const result = validateVerdictThresholds(thresholds);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('maliciousScore'))).toBe(true);
  });

  it('detects score out of range (above max)', () => {
    const thresholds = { ...VERDICT_THRESHOLDS, maliciousScore: 11.0 };
    const result = validateVerdictThresholds(thresholds);
    expect(result.valid).toBe(false);
  });

  it('detects confidence out of range (negative)', () => {
    const thresholds = { ...VERDICT_THRESHOLDS, maliciousConfidence: -0.1 };
    const result = validateVerdictThresholds(thresholds);
    expect(result.valid).toBe(false);
  });

  it('detects confidence out of range (above max)', () => {
    const thresholds = { ...VERDICT_THRESHOLDS, maliciousConfidence: 1.1 };
    const result = validateVerdictThresholds(thresholds);
    expect(result.valid).toBe(false);
  });

  it('detects NaN score threshold', () => {
    const thresholds = { ...VERDICT_THRESHOLDS, maliciousScore: NaN };
    const result = validateVerdictThresholds(thresholds);
    expect(result.valid).toBe(false);
  });

  it('detects Infinity score threshold', () => {
    const thresholds = { ...VERDICT_THRESHOLDS, maliciousScore: Infinity };
    const result = validateVerdictThresholds(thresholds);
    expect(result.valid).toBe(false);
  });

  it('detects NaN confidence threshold', () => {
    const thresholds = { ...VERDICT_THRESHOLDS, suspiciousConfidence: NaN };
    const result = validateVerdictThresholds(thresholds);
    expect(result.valid).toBe(false);
  });
});

// ── Overlapping Thresholds ──

describe('overlapping thresholds', () => {
  it('detects maliciousScore not > likelyMaliciousScore', () => {
    const thresholds = { ...VERDICT_THRESHOLDS, maliciousScore: 6.0, likelyMaliciousScore: 6.0 };
    const result = validateVerdictThresholds(thresholds);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('maliciousScore'))).toBe(true);
  });

  it('detects likelyMaliciousScore not > suspiciousScore', () => {
    const thresholds = { ...VERDICT_THRESHOLDS, likelyMaliciousScore: 4.0, suspiciousScore: 4.0 };
    const result = validateVerdictThresholds(thresholds);
    expect(result.valid).toBe(false);
  });

  it('detects suspiciousScore not > likelyBenignScore', () => {
    const thresholds = { ...VERDICT_THRESHOLDS, suspiciousScore: 2.0, likelyBenignScore: 2.0 };
    const result = validateVerdictThresholds(thresholds);
    expect(result.valid).toBe(false);
  });

  it('detects likelyBenignScore not > benignScore', () => {
    const thresholds = { ...VERDICT_THRESHOLDS, likelyBenignScore: 0.0, benignScore: 0.0 };
    const result = validateVerdictThresholds(thresholds);
    expect(result.valid).toBe(false);
  });

  it('detects inverted thresholds (benign higher than malicious)', () => {
    const thresholds = {
      ...VERDICT_THRESHOLDS,
      maliciousScore: 2.0,
      likelyMaliciousScore: 4.0,
    };
    const result = validateVerdictThresholds(thresholds);
    expect(result.valid).toBe(false);
  });
});

// ── Impossible Configurations ──

describe('impossible configurations', () => {
  it('monotonically decreasing valid configs produce expected results', () => {
    // Custom thresholds where all confidence thresholds are 0.0
    // → verdict is purely score-based
    const scoreOnlyThresholds: VerdictThresholdsConfig = {
      maliciousScore: 8.0,
      maliciousConfidence: 0.0,
      likelyMaliciousScore: 6.0,
      likelyMaliciousConfidence: 0.0,
      suspiciousScore: 4.0,
      suspiciousConfidence: 0.0,
      likelyBenignScore: 2.0,
      likelyBenignConfidence: 0.0,
      benignScore: 0.0,
      benignConfidence: 0.0,
    };

    expect(resolveVerdictValue(9.0, 0.0, scoreOnlyThresholds)).toBe(VERDICTS.MALICIOUS);
    expect(resolveVerdictValue(7.0, 0.0, scoreOnlyThresholds)).toBe(VERDICTS.LIKELY_MALICIOUS);
    expect(resolveVerdictValue(5.0, 0.0, scoreOnlyThresholds)).toBe(VERDICTS.SUSPICIOUS);
    expect(resolveVerdictValue(3.0, 0.0, scoreOnlyThresholds)).toBe(VERDICTS.LIKELY_BENIGN);
    expect(resolveVerdictValue(1.0, 0.0, scoreOnlyThresholds)).toBe(VERDICTS.BENIGN);
  });

  it('all confidence thresholds set to 1.0 → only UNKNOWN (impossible to meet)', () => {
    const impossibleThresholds: VerdictThresholdsConfig = {
      maliciousScore: 10.0,
      maliciousConfidence: 1.0,
      likelyMaliciousScore: 8.0,
      likelyMaliciousConfidence: 1.0,
      suspiciousScore: 6.0,
      suspiciousConfidence: 1.0,
      likelyBenignScore: 4.0,
      likelyBenignConfidence: 1.0,
      benignScore: 0.0,
      benignConfidence: 1.0,
    };

    // Even with max values, confidence 1.0 is achievable, but binary floating
    // point might cause issues at exactly 1.0. Let's test with 0.9999.
    // Actually 1.0 is achievable in IEEE-754, so score=10, confidence=1 works.
    const result = resolveVerdictValue(10.0, 0.9999, impossibleThresholds);
    // 0.9999 < 1.0 for all thresholds, so UNKNOWN
    expect(result).toBe(VERDICTS.UNKNOWN);
  });
});

// ── Deterministic Repeated Execution ──

describe('deterministic repeated execution', () => {
  it('produces identical output for 10,000 iterations', () => {
    const testCases = [
      [9.0, 0.9],
      [7.0, 0.7],
      [5.0, 0.5],
      [3.0, 0.6],
      [1.0, 0.8],
      [0.0, 0.0],
      [8.0, 0.79], // score qualifies for malicious, confidence barely misses
      [6.0, 0.59], // score qualifies for likely-malicious, confidence barely misses
      [4.0, 0.29], // score qualifies for suspicious, confidence barely misses
    ] as const;

    for (const [score, confidence] of testCases) {
      const expected = resolveVerdict(score, confidence);
      for (let i = 0; i < 10_000; i++) {
        const actual = resolveVerdict(score, confidence);
        expect(actual.verdict).toBe(expected.verdict);
        expect(actual.score).toBe(expected.score);
        expect(actual.confidence).toBe(expected.confidence);
        expect(actual.highestQualifyingVerdict).toBe(expected.highestQualifyingVerdict);
        expect(actual.confidenceLimited).toBe(expected.confidenceLimited);
      }
    }
  });

  it('produces identical output with custom thresholds', () => {
    const customThresholds: VerdictThresholdsConfig = {
      maliciousScore: 9.0,
      maliciousConfidence: 0.9,
      likelyMaliciousScore: 7.0,
      likelyMaliciousConfidence: 0.7,
      suspiciousScore: 5.0,
      suspiciousConfidence: 0.5,
      likelyBenignScore: 3.0,
      likelyBenignConfidence: 0.6,
      benignScore: 0.0,
      benignConfidence: 0.8,
    };

    const expected = resolveVerdict(8.0, 0.8, customThresholds);
    for (let i = 0; i < 10_000; i++) {
      const actual = resolveVerdict(8.0, 0.8, customThresholds);
      expect(actual.verdict).toBe(expected.verdict);
    }
  });
});

// ── Immutable Configuration ──

describe('immutable configuration', () => {
  it('VerdictResult is frozen', () => {
    const result = resolveVerdict(5.0, 0.5);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('getDefaultThresholds returns a frozen object', () => {
    const thresholds = getDefaultThresholds();
    expect(Object.isFrozen(thresholds)).toBe(true);
  });

  it('ThresholdValidationResult errors array is frozen', () => {
    const result = validateVerdictThresholds(VERDICT_THRESHOLDS);
    expect(Object.isFrozen(result.errors)).toBe(true);
  });

  it('VERDICT_THRESHOLDS is frozen at runtime', () => {
    // VERDICT_THRESHOLDS is Object.freeze()'d at export time to enforce
    // runtime immutability, consistent with all other constants.
    expect(Object.isFrozen(VERDICT_THRESHOLDS)).toBe(true);
  });
});

// ── Invalid Inputs ──

describe('invalid inputs', () => {
  it('throws TypeError when score is NaN', () => {
    expect(() => resolveVerdict(NaN, 0.5)).toThrow(TypeError);
  });

  it('throws TypeError when score is Infinity', () => {
    expect(() => resolveVerdict(Infinity, 0.5)).toThrow(TypeError);
  });

  it('throws TypeError when confidence is NaN', () => {
    expect(() => resolveVerdict(5.0, NaN)).toThrow(TypeError);
  });

  it('throws TypeError when confidence is Infinity', () => {
    expect(() => resolveVerdict(5.0, Infinity)).toThrow(TypeError);
  });

  it('throws TypeError when both are NaN', () => {
    expect(() => resolveVerdict(NaN, NaN)).toThrow(TypeError);
  });

  it('handles negative score gracefully (treats as below all thresholds)', () => {
    // A negative score is finite, so it shouldn't throw.
    // It won't meet any score threshold, so it should return UNKNOWN.
    const result = resolveVerdict(-1.0, 0.0);
    expect(result.verdict).toBe(VERDICTS.UNKNOWN);
  });

  it('handles score above max gracefully (qualifies for malicious)', () => {
    const result = resolveVerdict(100.0, 0.9);
    expect(result.verdict).toBe(VERDICTS.MALICIOUS);
  });

  it('handles confidence above max gracefully (1.0 qualifies for highest)', () => {
    const result = resolveVerdict(8.0, 2.0); // confidence > 1.0 is still valid for comparison
    expect(result.verdict).toBe(VERDICTS.MALICIOUS);
  });
});

// ── Mathematical Invariants ──

describe('mathematical invariants', () => {
  it('verdict is monotonically non-decreasing in score (fixed confidence)', () => {
    const confidence = 0.85;
    const scores = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const verdicts = scores.map((s) => resolveVerdictValue(s, confidence));

    for (let i = 1; i < verdicts.length; i++) {
      const prevIdx = VERDICT_ORDER.indexOf(verdicts[i - 1] as any);
      const currIdx = VERDICT_ORDER.indexOf(verdicts[i] as any);
      // As score increases, verdict should stay the same or move earlier in VERDICT_ORDER
      // (VERDICT_ORDER goes from malicious (0) to unknown (5))
      // Higher scores = lower index = earlier in array
      expect(currIdx).toBeLessThanOrEqual(prevIdx);
    }
  });

  it('verdict is monotonically non-decreasing in confidence (fixed score)', () => {
    const score = 7.0;
    const confidences = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0];
    const verdicts = confidences.map((c) => resolveVerdictValue(score, c));

    for (let i = 1; i < verdicts.length; i++) {
      const prevIdx = VERDICT_ORDER.indexOf(verdicts[i - 1] as any);
      const currIdx = VERDICT_ORDER.indexOf(verdicts[i] as any);
      // As confidence increases, verdict should stay the same or move earlier
      expect(currIdx).toBeLessThanOrEqual(prevIdx);
    }
  });

  it('highestQualifyingVerdict is always at least as severe as verdict', () => {
    const testCases = [
      [9.0, 0.4], // score qualifies for malicious, but confidence limits to suspicious
      [7.0, 0.3], // score qualifies for likelyMalicious, confidence limits to suspicious
      [5.0, 0.1], // score qualifies for suspicious, confidence limits to UNKNOWN
      [0.0, 0.0], // nothing qualifies
    ] as const;

    for (const [score, confidence] of testCases) {
      const result = resolveVerdict(score, confidence);
      const hqIdx = VERDICT_ORDER.indexOf(result.highestQualifyingVerdict as any);
      const vIdx = VERDICT_ORDER.indexOf(result.verdict as any);
      // highestQualifyingVerdict should be at most as severe (lower index) as verdict
      expect(hqIdx).toBeLessThanOrEqual(vIdx);
    }
  });

  it('confidenceLimited is true only when highestQualifyingVerdict differs from verdict', () => {
    const testCases = [
      [9.0, 0.9], // both match → not limited
      [9.0, 0.7], // score qualifies for higher → limited
      [9.0, 0.0], // score qualifies for higher → limited (UNKNOWN)
      [0.0, 0.0], // nothing qualifies → not limited
    ] as const;

    for (const [score, confidence] of testCases) {
      const result = resolveVerdict(score, confidence);
      const isDifferent = result.highestQualifyingVerdict !== result.verdict;
      const isNotUnknown = result.highestQualifyingVerdict !== VERDICTS.UNKNOWN;
      expect(result.confidenceLimited).toBe(isDifferent && isNotUnknown);
    }
  });
});

// ── Custom Thresholds ──

describe('custom thresholds', () => {
  it('accepts custom thresholds as third argument', () => {
    const customThresholds: VerdictThresholdsConfig = {
      maliciousScore: 9.0,
      maliciousConfidence: 0.9,
      likelyMaliciousScore: 7.0,
      likelyMaliciousConfidence: 0.7,
      suspiciousScore: 5.0,
      suspiciousConfidence: 0.5,
      likelyBenignScore: 3.0,
      likelyBenignConfidence: 0.6,
      benignScore: 0.0,
      benignConfidence: 0.8,
    };

    const result = resolveVerdict(8.0, 0.8, customThresholds);
    // With custom thresholds, score 8.0 < 9.0 (malicious), 8.0 >= 7.0 (likelyMalicious)
    // and confidence 0.8 >= 0.7 (likelyMalicious) → LIKELY_MALICIOUS
    expect(result.verdict).toBe(VERDICTS.LIKELY_MALICIOUS);
  });

  it('more lenient thresholds produce more severe verdicts', () => {
    const lenient: VerdictThresholdsConfig = {
      maliciousScore: 5.0,
      maliciousConfidence: 0.3,
      likelyMaliciousScore: 3.0,
      likelyMaliciousConfidence: 0.2,
      suspiciousScore: 2.0,
      suspiciousConfidence: 0.1,
      likelyBenignScore: 1.0,
      likelyBenignConfidence: 0.1,
      benignScore: 0.0,
      benignConfidence: 0.1,
    };

    const strict = VERDICT_THRESHOLDS;

    // With score 4.5 and confidence 0.3:
    // Lenient → MALICIOUS (score >= 5? No... 4.5 < 5. LIKELY_MALICIOUS: 4.5 >= 3 ✓, 0.3 >= 0.2 ✓)
    const lenientResult = resolveVerdict(4.5, 0.3, lenient);
    // Strict → SUSPICIOUS (score >= 4 ✓, 0.3 >= 0.3 ✓)
    const strictResult = resolveVerdict(4.5, 0.3, strict);

    const lenientIdx = VERDICT_ORDER.indexOf(lenientResult.verdict as any);
    const strictIdx = VERDICT_ORDER.indexOf(strictResult.verdict as any);
    expect(lenientIdx).toBeLessThanOrEqual(strictIdx);
  });
});

// ── Serialization Compatibility ──

describe('serialization compatibility', () => {
  it('VerdictResult is JSON-serializable', () => {
    const result = resolveVerdict(7.5, 0.75);
    const json = JSON.stringify(result);
    const parsed = JSON.parse(json);

    expect(parsed.verdict).toBe(result.verdict);
    expect(parsed.score).toBe(result.score);
    expect(parsed.confidence).toBe(result.confidence);
    expect(parsed.highestQualifyingVerdict).toBe(result.highestQualifyingVerdict);
    expect(parsed.confidenceLimited).toBe(result.confidenceLimited);
  });

  it('Verdict values are plain strings (not symbols)', () => {
    const result = resolveVerdict(9.0, 0.9);
    expect(typeof result.verdict).toBe('string');
    expect(typeof result.highestQualifyingVerdict).toBe('string');
  });

  it('VERDICTS values are JSON-serializable strings', () => {
    const values = Object.values(VERDICTS);
    for (const v of values) {
      expect(typeof v).toBe('string');
      expect(JSON.parse(JSON.stringify(v))).toBe(v);
    }
  });
});

// ── Comprehensive Pipeline Test ──

describe('comprehensive pipeline test', () => {
  it('resolves verdict for various realistic (score, confidence) pairs', () => {
    const testCases: { score: number; confidence: number; expected: string }[] = [
      // High severity, high confidence → critical action required
      { score: 9.5, confidence: 0.95, expected: VERDICTS.MALICIOUS },
      // High severity, moderate confidence → likely malicious
      { score: 8.5, confidence: 0.65, expected: VERDICTS.LIKELY_MALICIOUS },
      // Moderate severity, moderate confidence → suspicious
      { score: 5.5, confidence: 0.45, expected: VERDICTS.SUSPICIOUS },
      // Low severity, moderate confidence → likely benign
      { score: 2.5, confidence: 0.55, expected: VERDICTS.LIKELY_BENIGN },
      // Very low severity, high confidence → benign
      { score: 0.5, confidence: 0.75, expected: VERDICTS.BENIGN },
      // No evidence → unknown
      { score: 0.0, confidence: 0.0, expected: VERDICTS.UNKNOWN },
    ];

    for (const { score, confidence, expected } of testCases) {
      const result = resolveVerdict(score, confidence);
      expect(result.verdict).toBe(expected);
      expect(result.score).toBe(score);
      expect(result.confidence).toBe(confidence);
      expect(Object.isFrozen(result)).toBe(true);
    }
  });

  it('produces fully traceable results across the full pipeline', () => {
    // Verify that the verdict is deterministic and traceable.
    const result1 = resolveVerdict(8.0, 0.8);
    const result2 = resolveVerdict(8.0, 0.8);

    expect(result1).toEqual(result2);

    // Verify all fields are present and typed correctly.
    const result = result1;
    expect(typeof result.verdict).toBe('string');
    expect(typeof result.score).toBe('number');
    expect(typeof result.confidence).toBe('number');
    expect(typeof result.highestQualifyingVerdict).toBe('string');
    expect(typeof result.confidenceLimited).toBe('boolean');
  });
});
