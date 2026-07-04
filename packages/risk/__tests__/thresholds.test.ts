/**
 * Tests for @veris/risk/thresholds.
 *
 * Covers:
 * - Default threshold profile values
 * - Custom profile creation with overrides
 * - Profile validation (valid, invalid, edge cases)
 * - Risk level resolution from profiles
 * - Verdict resolution from profiles
 * - Determinism guarantees
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_THRESHOLD_PROFILE,
  createThresholdProfile,
  validateThresholdProfile,
  validateRiskLevelThresholds,
  resolveRiskLevelFromProfile,
} from '../src/thresholds.js';
import { resolveVerdict } from '../src/verdict.js';

describe('DEFAULT_THRESHOLD_PROFILE', () => {
  it('should have default verdict thresholds matching VERDICT_THRESHOLDS', () => {
    const vt = DEFAULT_THRESHOLD_PROFILE.verdictThresholds;
    expect(vt.maliciousScore).toBe(8.0);
    expect(vt.maliciousConfidence).toBe(0.8);
    expect(vt.likelyMaliciousScore).toBe(6.0);
    expect(vt.likelyMaliciousConfidence).toBe(0.6);
    expect(vt.suspiciousScore).toBe(4.0);
    expect(vt.suspiciousConfidence).toBe(0.3);
    expect(vt.likelyBenignScore).toBe(2.0);
    expect(vt.likelyBenignConfidence).toBe(0.5);
    expect(vt.benignScore).toBe(0.0);
    expect(vt.benignConfidence).toBe(0.7);
  });

  it('should have default risk level thresholds', () => {
    const rl = DEFAULT_THRESHOLD_PROFILE.riskLevelThresholds;
    expect(rl.criticalScore).toBe(8.0);
    expect(rl.highScore).toBe(6.0);
    expect(rl.mediumScore).toBe(4.0);
    expect(rl.lowScore).toBe(2.0);
  });

  it('should be frozen', () => {
    expect(Object.isFrozen(DEFAULT_THRESHOLD_PROFILE)).toBe(true);
    expect(Object.isFrozen(DEFAULT_THRESHOLD_PROFILE.verdictThresholds)).toBe(true);
    expect(Object.isFrozen(DEFAULT_THRESHOLD_PROFILE.riskLevelThresholds)).toBe(true);
  });
});

describe('createThresholdProfile', () => {
  it('should create profile with defaults when no overrides', () => {
    const profile = createThresholdProfile();
    expect(profile.verdictThresholds.maliciousScore).toBe(8.0);
    expect(profile.riskLevelThresholds.criticalScore).toBe(8.0);
  });

  it('should merge verdict threshold overrides with defaults', () => {
    const profile = createThresholdProfile({
      verdictThresholds: {
        maliciousConfidence: 0.9,
        suspiciousConfidence: 0.5,
      },
    });
    expect(profile.verdictThresholds.maliciousConfidence).toBe(0.9); // override
    expect(profile.verdictThresholds.maliciousScore).toBe(8.0); // default
    expect(profile.verdictThresholds.suspiciousConfidence).toBe(0.5); // override
  });

  it('should merge risk level threshold overrides', () => {
    const profile = createThresholdProfile({
      riskLevelThresholds: { highScore: 5.0, lowScore: 1.5 },
    });
    expect(profile.riskLevelThresholds.highScore).toBe(5.0); // override
    expect(profile.riskLevelThresholds.criticalScore).toBe(8.0); // default
    expect(profile.riskLevelThresholds.lowScore).toBe(1.5); // override
  });

  it('should throw TypeError for invalid thresholds', () => {
    expect(() =>
      createThresholdProfile({
        verdictThresholds: { maliciousScore: -1 },
      }),
    ).toThrow(TypeError);

    expect(() =>
      createThresholdProfile({
        verdictThresholds: { maliciousConfidence: 1.5 },
      }),
    ).toThrow(TypeError);

    expect(() =>
      createThresholdProfile({
        riskLevelThresholds: { criticalScore: 3.0, highScore: 5.0 },
      }),
    ).toThrow(TypeError); // criticalScore must be > highScore
  });

  it('should produce frozen output', () => {
    const profile = createThresholdProfile();
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.verdictThresholds)).toBe(true);
    expect(Object.isFrozen(profile.riskLevelThresholds)).toBe(true);
  });
});

describe('validateThresholdProfile', () => {
  it('should return empty errors for default profile', () => {
    const errors = validateThresholdProfile(DEFAULT_THRESHOLD_PROFILE);
    expect(errors.length).toBe(0);
  });

  it('should return errors for null input', () => {
    const errors = validateThresholdProfile(null as any);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should detect non-monotonic verdict thresholds', () => {
    const errors = validateThresholdProfile({
      verdictThresholds: {
        maliciousScore: 6.0,
        likelyMaliciousScore: 8.0, // swapped!
        maliciousConfidence: 0.8,
        likelyMaliciousConfidence: 0.6,
        suspiciousScore: 4.0,
        suspiciousConfidence: 0.3,
        likelyBenignScore: 2.0,
        likelyBenignConfidence: 0.5,
        benignScore: 0.0,
        benignConfidence: 0.7,
      },
      riskLevelThresholds: {
        criticalScore: 8.0,
        highScore: 6.0,
        mediumScore: 4.0,
        lowScore: 2.0,
      },
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(
      errors.some((e) => e.includes('maliciousScore') && e.includes('likelyMaliciousScore')),
    ).toBe(true);
  });

  it('should detect non-monotonic risk level thresholds', () => {
    const errors = validateThresholdProfile({
      verdictThresholds: {
        maliciousScore: 8.0,
        maliciousConfidence: 0.8,
        likelyMaliciousScore: 6.0,
        likelyMaliciousConfidence: 0.6,
        suspiciousScore: 4.0,
        suspiciousConfidence: 0.3,
        likelyBenignScore: 2.0,
        likelyBenignConfidence: 0.5,
        benignScore: 0.0,
        benignConfidence: 0.7,
      },
      riskLevelThresholds: {
        criticalScore: 5.0,
        highScore: 7.0,
        mediumScore: 4.0,
        lowScore: 2.0, // swapped
      },
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('validateRiskLevelThresholds', () => {
  it('should return empty errors for valid thresholds', () => {
    const errors = validateRiskLevelThresholds({
      criticalScore: 8.0,
      highScore: 6.0,
      mediumScore: 4.0,
      lowScore: 2.0,
    });
    expect(errors.length).toBe(0);
  });

  it('should detect invalid values', () => {
    const errors = validateRiskLevelThresholds(null as any);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('resolveRiskLevelFromProfile', () => {
  it('should resolve critical for score >= 8.0', () => {
    expect(resolveRiskLevelFromProfile(8.0)).toBe('critical');
    expect(resolveRiskLevelFromProfile(9.5)).toBe('critical');
    expect(resolveRiskLevelFromProfile(10.0)).toBe('critical');
  });

  it('should resolve high for score in [6.0, 8.0)', () => {
    expect(resolveRiskLevelFromProfile(6.0)).toBe('high');
    expect(resolveRiskLevelFromProfile(7.5)).toBe('high');
    expect(resolveRiskLevelFromProfile(7.999)).toBe('high');
  });

  it('should resolve medium for score in [4.0, 6.0)', () => {
    expect(resolveRiskLevelFromProfile(4.0)).toBe('medium');
    expect(resolveRiskLevelFromProfile(5.0)).toBe('medium');
  });

  it('should resolve low for score in [2.0, 4.0)', () => {
    expect(resolveRiskLevelFromProfile(2.0)).toBe('low');
    expect(resolveRiskLevelFromProfile(3.999)).toBe('low');
  });

  it('should resolve negligible for score < 2.0', () => {
    expect(resolveRiskLevelFromProfile(0.0)).toBe('negligible');
    expect(resolveRiskLevelFromProfile(1.5)).toBe('negligible');
    expect(resolveRiskLevelFromProfile(1.999)).toBe('negligible');
  });

  it('should use custom profile thresholds', () => {
    const profile = createThresholdProfile({
      riskLevelThresholds: { criticalScore: 7.0, highScore: 5.0, mediumScore: 3.0, lowScore: 1.0 },
    });
    expect(resolveRiskLevelFromProfile(7.0, profile)).toBe('critical');
    expect(resolveRiskLevelFromProfile(5.0, profile)).toBe('high');
    expect(resolveRiskLevelFromProfile(3.0, profile)).toBe('medium');
    expect(resolveRiskLevelFromProfile(1.0, profile)).toBe('low');
    expect(resolveRiskLevelFromProfile(0.5, profile)).toBe('negligible');
  });
});

describe('thresholds determinism', () => {
  it('should produce identical results for identical inputs (5 runs)', () => {
    for (let run = 0; run < 5; run++) {
      const profile = createThresholdProfile({
        verdictThresholds: { maliciousConfidence: 0.85 },
        riskLevelThresholds: { highScore: 5.5 },
      });

      expect(profile.verdictThresholds.maliciousConfidence).toBe(0.85);
      expect(profile.riskLevelThresholds.highScore).toBe(5.5);
      expect(resolveRiskLevelFromProfile(8.5)).toBe('critical');
      expect(resolveRiskLevelFromProfile(5.5, profile)).toBe('high');
      expect(resolveRiskLevelFromProfile(1.0)).toBe('negligible');
    }
  });
});
