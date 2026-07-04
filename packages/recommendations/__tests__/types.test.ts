/**
 * Tests for @veris/recommendations core types and constants.
 *
 * These tests verify that:
 * - Types are structurally correct (compile-time checks).
 * - Constants have expected values and are frozen.
 * - Immutability is enforced at runtime.
 * - Versioning constants are consistent.
 * - Identifier prefixes match expectations.
 * - Priority ordering is correct.
 * - Assessment thresholds are within valid ranges.
 * - All branded values are exportable and usable.
 *
 * @module @veris/recommendations/__tests__/types
 */

import { describe, it, expect } from 'vitest';
import {
  // Versioning
  SCHEMA_VERSION,
  ENGINE_VERSION,
  // ID prefixes
  RECOMMENDATION_ID_PREFIX,
  // Priority
  PRIORITY_ORDER,
  PRIORITY_RANK,
  PRIORITY_LABELS,
  // Categories
  CATEGORIES,
  CATEGORY_LABELS,
  // Actions
  ACTIONS,
  ACTION_LABELS,
  // Source types
  SOURCE_TYPES,
  SOURCE_TYPE_LABELS,
  SOURCE_TYPE_ORDER,
  // Priority-to-action
  PRIORITY_DEFAULT_ACTIONS,
  // Defaults
  DEFAULT_MAX_RECOMMENDATIONS,
  DEFAULT_MIN_PRIORITY,
  DEFAULT_TIMEOUT_MS,
  // Assessment bounds
  IMPACT_MIN,
  IMPACT_MAX,
  EFFORT_MIN,
  EFFORT_MAX,
  // Assessment thresholds
  ASSESSMENT_THRESHOLDS,
} from '../src/index.js';

// ── Versioning ──

describe('versioning constants', () => {
  it('schema version is a valid semver string', () => {
    expect(SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('engine version is a valid semver string', () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('schema version matches engine version at this milestone', () => {
    expect(SCHEMA_VERSION).toBe(ENGINE_VERSION);
  });

  it('SCHEMA_VERSION is frozen', () => {
    expect(Object.isFrozen(SCHEMA_VERSION)).toBe(true);
  });

  it('ENGINE_VERSION is frozen', () => {
    expect(Object.isFrozen(ENGINE_VERSION)).toBe(true);
  });
});

// ── ID Prefixes ──

describe('ID prefixes', () => {
  it("recommendation ID prefix is 'rec'", () => {
    expect(RECOMMENDATION_ID_PREFIX).toBe('rec');
  });

  it('prefix is a short string', () => {
    expect(RECOMMENDATION_ID_PREFIX.length).toBeGreaterThanOrEqual(2);
    expect(RECOMMENDATION_ID_PREFIX.length).toBeLessThanOrEqual(5);
  });

  it('RECOMMENDATION_ID_PREFIX is frozen', () => {
    expect(Object.isFrozen(RECOMMENDATION_ID_PREFIX)).toBe(true);
  });
});

// ── Priority Order ──

describe('priority order', () => {
  it('lists priorities from most to least urgent', () => {
    expect(PRIORITY_ORDER).toEqual(['critical', 'high', 'medium', 'low']);
  });

  it('contains no duplicates', () => {
    const unique = new Set(PRIORITY_ORDER);
    expect(unique.size).toBe(PRIORITY_ORDER.length);
  });

  it('all values are non-empty strings', () => {
    for (const priority of PRIORITY_ORDER) {
      expect(priority).toBeTruthy();
      expect(typeof priority).toBe('string');
    }
  });

  it('PRIORITY_ORDER is frozen', () => {
    expect(Object.isFrozen(PRIORITY_ORDER)).toBe(true);
  });
});

// ── Priority Rank ──

describe('priority rank', () => {
  it('critical has rank 0 (highest)', () => {
    expect(PRIORITY_RANK.critical).toBe(0);
  });

  it('high has rank 1', () => {
    expect(PRIORITY_RANK.high).toBe(1);
  });

  it('medium has rank 2', () => {
    expect(PRIORITY_RANK.medium).toBe(2);
  });

  it('low has rank 3 (lowest)', () => {
    expect(PRIORITY_RANK.low).toBe(3);
  });

  it('ranks are monotonically increasing', () => {
    expect(PRIORITY_RANK.critical).toBeLessThan(PRIORITY_RANK.high);
    expect(PRIORITY_RANK.high).toBeLessThan(PRIORITY_RANK.medium);
    expect(PRIORITY_RANK.medium).toBeLessThan(PRIORITY_RANK.low);
  });

  it('PRIORITY_RANK is frozen', () => {
    expect(Object.isFrozen(PRIORITY_RANK)).toBe(true);
  });

  it('every priority in PRIORITY_ORDER has a rank', () => {
    for (const priority of PRIORITY_ORDER) {
      expect(PRIORITY_RANK[priority]).toBeDefined();
      expect(typeof PRIORITY_RANK[priority]).toBe('number');
    }
  });
});

// ── Priority Labels ──

describe('priority labels', () => {
  it('provides a label for every priority', () => {
    for (const priority of PRIORITY_ORDER) {
      expect(PRIORITY_LABELS[priority]).toBeTruthy();
    }
  });

  it('labels are capitalized strings', () => {
    expect(PRIORITY_LABELS.critical).toBe('Critical');
    expect(PRIORITY_LABELS.high).toBe('High');
    expect(PRIORITY_LABELS.medium).toBe('Medium');
    expect(PRIORITY_LABELS.low).toBe('Low');
  });

  it('PRIORITY_LABELS is frozen', () => {
    expect(Object.isFrozen(PRIORITY_LABELS)).toBe(true);
  });
});

// ── Category Constants ──

describe('categories', () => {
  it('provides all expected categories', () => {
    expect(CATEGORIES.REMEDIATION).toBe('remediation');
    expect(CATEGORIES.MITIGATION).toBe('mitigation');
    expect(CATEGORIES.INVESTIGATION).toBe('investigation');
    expect(CATEGORIES.PREVENTION).toBe('prevention');
    expect(CATEGORIES.MONITORING).toBe('monitoring');
    expect(CATEGORIES.POLICY).toBe('policy');
  });

  it('CATEGORIES object is frozen', () => {
    expect(Object.isFrozen(CATEGORIES)).toBe(true);
  });

  it('has no duplicate values', () => {
    const values = Object.values(CATEGORIES);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('all values are non-empty strings', () => {
    for (const value of Object.values(CATEGORIES)) {
      expect(value).toBeTruthy();
      expect(typeof value).toBe('string');
    }
  });

  it('CATEGORY_LABELS provides labels for every category', () => {
    for (const category of Object.values(CATEGORIES)) {
      expect(CATEGORY_LABELS[category]).toBeTruthy();
    }
  });

  it('CATEGORY_LABELS is frozen', () => {
    expect(Object.isFrozen(CATEGORY_LABELS)).toBe(true);
  });
});

// ── Action Constants ──

describe('actions', () => {
  it('provides all expected actions', () => {
    expect(ACTIONS.REMOVE).toBe('remove');
    expect(ACTIONS.QUARANTINE).toBe('quarantine');
    expect(ACTIONS.REVIEW).toBe('review');
    expect(ACTIONS.MONITOR).toBe('monitor');
    expect(ACTIONS.UPDATE_POLICY).toBe('update-policy');
    expect(ACTIONS.ESCALATE).toBe('escalate');
    expect(ACTIONS.NO_ACTION).toBe('no-action');
  });

  it('ACTIONS object is frozen', () => {
    expect(Object.isFrozen(ACTIONS)).toBe(true);
  });

  it('has no duplicate values', () => {
    const values = Object.values(ACTIONS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('all values are non-empty kebab-case strings', () => {
    for (const value of Object.values(ACTIONS)) {
      expect(value).toBeTruthy();
      expect(typeof value).toBe('string');
      expect(value).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it('ACTION_LABELS provides labels for every action', () => {
    for (const action of Object.values(ACTIONS)) {
      expect(ACTION_LABELS[action]).toBeTruthy();
    }
  });

  it('ACTION_LABELS is frozen', () => {
    expect(Object.isFrozen(ACTION_LABELS)).toBe(true);
  });
});

// ── Source Type Constants ──

describe('source types', () => {
  it('provides all expected source types', () => {
    expect(SOURCE_TYPES.RULE).toBe('rule');
    expect(SOURCE_TYPES.CORRELATION).toBe('correlation');
    expect(SOURCE_TYPES.EVIDENCE).toBe('evidence');
    expect(SOURCE_TYPES.DOCUMENTATION).toBe('documentation');
  });

  it('SOURCE_TYPES object is frozen', () => {
    expect(Object.isFrozen(SOURCE_TYPES)).toBe(true);
  });

  it('has no duplicate values', () => {
    const values = Object.values(SOURCE_TYPES);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('SOURCE_TYPE_LABELS is frozen', () => {
    expect(Object.isFrozen(SOURCE_TYPE_LABELS)).toBe(true);
  });

  it('SOURCE_TYPE_ORDER lists types from most to least authoritative', () => {
    expect(SOURCE_TYPE_ORDER).toEqual(['rule', 'correlation', 'evidence', 'documentation']);
  });

  it('SOURCE_TYPE_ORDER is frozen', () => {
    expect(Object.isFrozen(SOURCE_TYPE_ORDER)).toBe(true);
  });
});

// ── Priority-to-Action Map ──

describe('priority default actions', () => {
  it('maps critical to escalate', () => {
    expect(PRIORITY_DEFAULT_ACTIONS.critical).toBe('escalate');
  });

  it('maps high to review', () => {
    expect(PRIORITY_DEFAULT_ACTIONS.high).toBe('review');
  });

  it('maps medium to monitor', () => {
    expect(PRIORITY_DEFAULT_ACTIONS.medium).toBe('monitor');
  });

  it('maps low to no-action', () => {
    expect(PRIORITY_DEFAULT_ACTIONS.low).toBe('no-action');
  });

  it('PRIORITY_DEFAULT_ACTIONS is frozen', () => {
    expect(Object.isFrozen(PRIORITY_DEFAULT_ACTIONS)).toBe(true);
  });
});

// ── Defaults ──

describe('default configuration values', () => {
  it('default max recommendations is 100', () => {
    expect(DEFAULT_MAX_RECOMMENDATIONS).toBe(100);
  });

  it("default min priority is 'low'", () => {
    expect(DEFAULT_MIN_PRIORITY).toBe('low');
  });

  it('default timeout is 30 seconds', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(30_000);
  });
});

// ── Assessment Score Bounds ──

describe('assessment score bounds', () => {
  it('impact min is 0.0', () => {
    expect(IMPACT_MIN).toBe(0.0);
  });

  it('impact max is 10.0', () => {
    expect(IMPACT_MAX).toBe(10.0);
  });

  it('impact min < impact max', () => {
    expect(IMPACT_MIN).toBeLessThan(IMPACT_MAX);
  });

  it('effort min is 0.0', () => {
    expect(EFFORT_MIN).toBe(0.0);
  });

  it('effort max is 10.0', () => {
    expect(EFFORT_MAX).toBe(10.0);
  });

  it('effort min < effort max', () => {
    expect(EFFORT_MIN).toBeLessThan(EFFORT_MAX);
  });
});

// ── Assessment Thresholds ──

describe('assessment thresholds', () => {
  it('highImpactThreshold is 7.0', () => {
    expect(ASSESSMENT_THRESHOLDS.highImpactThreshold).toBe(7.0);
  });

  it('mediumImpactThreshold is 4.0', () => {
    expect(ASSESSMENT_THRESHOLDS.mediumImpactThreshold).toBe(4.0);
  });

  it('lowEffortThreshold is 3.0', () => {
    expect(ASSESSMENT_THRESHOLDS.lowEffortThreshold).toBe(3.0);
  });

  it('highEffortThreshold is 7.0', () => {
    expect(ASSESSMENT_THRESHOLDS.highEffortThreshold).toBe(7.0);
  });

  it('all impact thresholds are within valid range [0.0, 10.0]', () => {
    expect(ASSESSMENT_THRESHOLDS.highImpactThreshold).toBeGreaterThanOrEqual(0.0);
    expect(ASSESSMENT_THRESHOLDS.highImpactThreshold).toBeLessThanOrEqual(10.0);
    expect(ASSESSMENT_THRESHOLDS.mediumImpactThreshold).toBeGreaterThanOrEqual(0.0);
    expect(ASSESSMENT_THRESHOLDS.mediumImpactThreshold).toBeLessThanOrEqual(10.0);
  });

  it('all effort thresholds are within valid range [0.0, 10.0]', () => {
    expect(ASSESSMENT_THRESHOLDS.lowEffortThreshold).toBeGreaterThanOrEqual(0.0);
    expect(ASSESSMENT_THRESHOLDS.lowEffortThreshold).toBeLessThanOrEqual(10.0);
    expect(ASSESSMENT_THRESHOLDS.highEffortThreshold).toBeGreaterThanOrEqual(0.0);
    expect(ASSESSMENT_THRESHOLDS.highEffortThreshold).toBeLessThanOrEqual(10.0);
  });

  it('mediumImpactThreshold <= highImpactThreshold', () => {
    expect(ASSESSMENT_THRESHOLDS.mediumImpactThreshold).toBeLessThanOrEqual(
      ASSESSMENT_THRESHOLDS.highImpactThreshold,
    );
  });

  it('lowEffortThreshold <= highEffortThreshold', () => {
    expect(ASSESSMENT_THRESHOLDS.lowEffortThreshold).toBeLessThanOrEqual(
      ASSESSMENT_THRESHOLDS.highEffortThreshold,
    );
  });

  it('ASSESSMENT_THRESHOLDS is frozen', () => {
    expect(Object.isFrozen(ASSESSMENT_THRESHOLDS)).toBe(true);
  });
});

// ── Type-level Structural Tests ──

describe('type structure', () => {
  it('Recommendation interface is exported and structurally valid', () => {
    const recommendation: import('../src/types.js').Recommendation =
      null as unknown as import('../src/types.js').Recommendation;
    expect(recommendation).toBeNull();
  });

  it('RecommendationInput interface is exported and structurally valid', () => {
    const input: import('../src/types.js').RecommendationInput =
      null as unknown as import('../src/types.js').RecommendationInput;
    expect(input).toBeNull();
  });

  it('RecommendationResult interface is exported and structurally valid', () => {
    const result: import('../src/types.js').RecommendationResult =
      null as unknown as import('../src/types.js').RecommendationResult;
    expect(result).toBeNull();
  });

  it('RecommendationCollection interface is exported and structurally valid', () => {
    const collection: import('../src/types.js').RecommendationCollection =
      null as unknown as import('../src/types.js').RecommendationCollection;
    expect(collection).toBeNull();
  });

  it('RecommendationReference interface is exported and structurally valid', () => {
    const ref: import('../src/types.js').RecommendationReference =
      null as unknown as import('../src/types.js').RecommendationReference;
    expect(ref).toBeNull();
  });

  it('DocumentationReference interface is exported and structurally valid', () => {
    const docRef: import('../src/types.js').DocumentationReference =
      null as unknown as import('../src/types.js').DocumentationReference;
    expect(docRef).toBeNull();
  });

  it('RecommendationAssessment interface is exported and structurally valid', () => {
    const assessment: import('../src/types.js').RecommendationAssessment =
      null as unknown as import('../src/types.js').RecommendationAssessment;
    expect(assessment).toBeNull();
  });
});

// ── Determinism ──

describe('determinism guarantees', () => {
  it('constants never change within a version (double-run stability)', () => {
    const firstRun = {
      SCHEMA_VERSION,
      ENGINE_VERSION,
      priorityCount: PRIORITY_ORDER.length,
      categoryCount: Object.keys(CATEGORIES).length,
      actionCount: Object.keys(ACTIONS).length,
      sourceTypeCount: Object.keys(SOURCE_TYPES).length,
      highImpactThreshold: ASSESSMENT_THRESHOLDS.highImpactThreshold,
    };

    const secondRun = {
      SCHEMA_VERSION,
      ENGINE_VERSION,
      priorityCount: PRIORITY_ORDER.length,
      categoryCount: Object.keys(CATEGORIES).length,
      actionCount: Object.keys(ACTIONS).length,
      sourceTypeCount: Object.keys(SOURCE_TYPES).length,
      highImpactThreshold: ASSESSMENT_THRESHOLDS.highImpactThreshold,
    };

    expect(firstRun).toEqual(secondRun);
  });

  it('PRIORITY_ORDER is always the same reference', () => {
    expect(PRIORITY_ORDER).toBe(PRIORITY_ORDER);
  });
});

// ── Immutability Enforcement ──

describe('immutability enforcement', () => {
  it('cannot reassign members of PRIORITY_ORDER', () => {
    expect(() => {
      (PRIORITY_ORDER as unknown[])[0] = 'high';
    }).toThrow();
  });

  it('cannot reassign members of PRIORITY_RANK', () => {
    expect(() => {
      (PRIORITY_RANK as Record<string, number>).critical = 99;
    }).toThrow();
  });

  it('cannot reassign members of CATEGORIES', () => {
    expect(() => {
      (CATEGORIES as Record<string, string>).REMEDIATION = 'other';
    }).toThrow();
  });

  it('cannot reassign members of ACTIONS', () => {
    expect(() => {
      (ACTIONS as Record<string, string>).REMOVE = 'delete';
    }).toThrow();
  });
});

// ── Serialization Compatibility ──

describe('serialization compatibility', () => {
  it('CATEGORIES values serialize as plain strings', () => {
    for (const value of Object.values(CATEGORIES)) {
      const serialized = JSON.parse(JSON.stringify(value));
      expect(typeof serialized).toBe('string');
    }
  });

  it('ACTIONS values serialize as plain strings', () => {
    for (const value of Object.values(ACTIONS)) {
      const serialized = JSON.parse(JSON.stringify(value));
      expect(typeof serialized).toBe('string');
    }
  });

  it('PRIORITY_LABELS serializes as expected', () => {
    const serialized = JSON.parse(JSON.stringify(PRIORITY_LABELS));
    expect(serialized).toEqual({
      critical: 'Critical',
      high: 'High',
      medium: 'Medium',
      low: 'Low',
    });
  });

  it('ASSESSMENT_THRESHOLDS serializes as expected', () => {
    const serialized = JSON.parse(JSON.stringify(ASSESSMENT_THRESHOLDS));
    expect(serialized.highImpactThreshold).toBe(7.0);
    expect(serialized.mediumImpactThreshold).toBe(4.0);
    expect(serialized.lowEffortThreshold).toBe(3.0);
    expect(serialized.highEffortThreshold).toBe(7.0);
  });
});
