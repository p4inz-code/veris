/**
 * Tests for @veris/risk/weighting.
 *
 * Covers:
 * - Default weight profile values
 * - Custom profile creation
 * - Profile validation
 * - Dimension weight lookup
 * - Evidence category weight lookup
 * - Edge cases (unknown source types, empty categories)
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WEIGHT_PROFILE,
  createWeightProfile,
  validateWeightProfile,
  getDimensionWeight,
  getEvidenceCategoryWeight,
  isDefaultWeightProfile,
  createDimensionWeightFn,
} from '../src/weighting.js';

describe('DEFAULT_WEIGHT_PROFILE', () => {
  it('should have default dimension weights', () => {
    expect(DEFAULT_WEIGHT_PROFILE.dimensionWeights.rule).toBe(1.0);
    expect(DEFAULT_WEIGHT_PROFILE.dimensionWeights.correlation).toBe(1.0);
    expect(DEFAULT_WEIGHT_PROFILE.dimensionWeights.evidence).toBe(0.5);
  });

  it('should have default evidence category weights', () => {
    expect(DEFAULT_WEIGHT_PROFILE.evidenceCategoryWeights).toBeDefined();
    expect(DEFAULT_WEIGHT_PROFILE.evidenceCategoryWeights!.defaultWeight).toBe(1.0);
    expect(DEFAULT_WEIGHT_PROFILE.evidenceCategoryWeights!.categories).toEqual({});
  });

  it('should be frozen', () => {
    expect(Object.isFrozen(DEFAULT_WEIGHT_PROFILE)).toBe(true);
    expect(Object.isFrozen(DEFAULT_WEIGHT_PROFILE.dimensionWeights)).toBe(true);
  });
});

describe('createWeightProfile', () => {
  it('should create profile with defaults when no overrides', () => {
    const profile = createWeightProfile();
    expect(profile.dimensionWeights.rule).toBe(1.0);
    expect(profile.dimensionWeights.correlation).toBe(1.0);
    expect(profile.dimensionWeights.evidence).toBe(0.5);
  });

  it('should merge dimension weight overrides with defaults', () => {
    const profile = createWeightProfile({
      dimensionWeights: { rule: 1.5, evidence: 0.8 },
    });
    expect(profile.dimensionWeights.rule).toBe(1.5); // override
    expect(profile.dimensionWeights.correlation).toBe(1.0); // default
    expect(profile.dimensionWeights.evidence).toBe(0.8); // override
  });

  it('should merge evidence category weight overrides', () => {
    const profile = createWeightProfile({
      evidenceCategoryWeights: {
        categories: { obfuscation: 1.5, persistence: 0.8 },
        defaultWeight: 0.9,
      },
    });
    expect(profile.evidenceCategoryWeights!.categories.obfuscation).toBe(1.5);
    expect(profile.evidenceCategoryWeights!.categories.persistence).toBe(0.8);
    expect(profile.evidenceCategoryWeights!.defaultWeight).toBe(0.9);
  });

  it('should throw TypeError for invalid weight values', () => {
    expect(() =>
      createWeightProfile({
        dimensionWeights: { rule: -1 },
      }),
    ).toThrow(TypeError);

    expect(() =>
      createWeightProfile({
        dimensionWeights: { correlation: 3.0 },
      }),
    ).toThrow(TypeError);

    expect(() =>
      createWeightProfile({
        dimensionWeights: { evidence: NaN },
      }),
    ).toThrow(TypeError);
  });

  it('should produce frozen output', () => {
    const profile = createWeightProfile();
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.dimensionWeights)).toBe(true);
  });
});

describe('validateWeightProfile', () => {
  it('should return empty errors for default profile', () => {
    const errors = validateWeightProfile(DEFAULT_WEIGHT_PROFILE);
    expect(errors.length).toBe(0);
  });

  it('should return errors for null input', () => {
    const errors = validateWeightProfile(null as any);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should detect out-of-range weights', () => {
    // Test validateWeightProfile directly with a constructed invalid profile
    const errors = validateWeightProfile({
      dimensionWeights: { rule: 5.0, correlation: 1.0, evidence: 0.5 },
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('rule'))).toBe(true);
  });

  it('should throw TypeError for invalid weight values via factory', () => {
    expect(() =>
      createWeightProfile({
        dimensionWeights: { rule: -1 },
      }),
    ).toThrow(TypeError);

    expect(() =>
      createWeightProfile({
        dimensionWeights: { correlation: 3.0 },
      }),
    ).toThrow(TypeError);

    expect(() =>
      createWeightProfile({
        dimensionWeights: { evidence: NaN },
      }),
    ).toThrow(TypeError);
  });
});

describe('getDimensionWeight', () => {
  it('should return default weights for known source types', () => {
    expect(getDimensionWeight('rule' as any, DEFAULT_WEIGHT_PROFILE)).toBe(1.0);
    expect(getDimensionWeight('correlation' as any, DEFAULT_WEIGHT_PROFILE)).toBe(1.0);
    expect(getDimensionWeight('evidence' as any, DEFAULT_WEIGHT_PROFILE)).toBe(0.5);
  });

  it('should return 1.0 for unknown source types', () => {
    expect(getDimensionWeight('unknown' as any, DEFAULT_WEIGHT_PROFILE)).toBe(1.0);
  });

  it('should use custom profile weights', () => {
    const profile = createWeightProfile({
      dimensionWeights: { rule: 2.0 },
    });
    expect(getDimensionWeight('rule' as any, profile)).toBe(2.0);
  });
});

describe('getEvidenceCategoryWeight', () => {
  it('should return default weight for unknown categories', () => {
    expect(getEvidenceCategoryWeight('unknown-category', DEFAULT_WEIGHT_PROFILE)).toBe(1.0);
  });

  it('should return category-specific weight when configured', () => {
    const profile = createWeightProfile({
      evidenceCategoryWeights: {
        categories: { obfuscation: 2.0 },
        defaultWeight: 1.0,
      },
    });
    expect(getEvidenceCategoryWeight('obfuscation', profile)).toBe(2.0);
  });

  it('should return default weight for categories not in the map', () => {
    const profile = createWeightProfile({
      evidenceCategoryWeights: {
        categories: { obfuscation: 2.0 },
        defaultWeight: 0.5,
      },
    });
    expect(getEvidenceCategoryWeight('network', profile)).toBe(0.5);
  });

  it('should return 1.0 when no evidence weights configured', () => {
    const profile = createWeightProfile({ dimensionWeights: { rule: 1.0 } });
    expect(getEvidenceCategoryWeight('anything', profile)).toBe(1.0);
  });
});

describe('isDefaultWeightProfile', () => {
  it('should return true for the default profile', () => {
    expect(isDefaultWeightProfile(DEFAULT_WEIGHT_PROFILE)).toBe(true);
  });

  it('should return false for custom profiles', () => {
    const profile = createWeightProfile({ dimensionWeights: { rule: 1.2 } });
    expect(isDefaultWeightProfile(profile)).toBe(false);
  });
});

describe('createDimensionWeightFn', () => {
  it('should create a fast lookup function', () => {
    const fn = createDimensionWeightFn(DEFAULT_WEIGHT_PROFILE);
    expect(fn('rule')).toBe(1.0);
    expect(fn('correlation')).toBe(1.0);
    expect(fn('evidence')).toBe(0.5);
    expect(fn('unknown')).toBe(1.0);
  });

  it('should use custom profile weights', () => {
    const profile = createWeightProfile({
      dimensionWeights: { rule: 2.0, correlation: 0.5, evidence: 0.0 },
    });
    const fn = createDimensionWeightFn(profile);
    expect(fn('rule')).toBe(2.0);
    expect(fn('correlation')).toBe(0.5);
    expect(fn('evidence')).toBe(0.0);
  });
});

describe('weighting determinism', () => {
  it('should produce identical results for identical inputs (5 runs)', () => {
    for (let run = 0; run < 5; run++) {
      const profile = createWeightProfile({
        dimensionWeights: { rule: 1.5, correlation: 0.8, evidence: 0.3 },
        evidenceCategoryWeights: {
          categories: { executable: 1.2, obfuscation: 1.5 },
          defaultWeight: 0.9,
        },
      });

      expect(getDimensionWeight('rule' as any, profile)).toBe(1.5);
      expect(getDimensionWeight('evidence' as any, profile)).toBe(0.3);
      expect(getEvidenceCategoryWeight('executable', profile)).toBe(1.2);
      expect(getEvidenceCategoryWeight('obfuscation', profile)).toBe(1.5);
      expect(getEvidenceCategoryWeight('network', profile)).toBe(0.9);
    }
  });
});
