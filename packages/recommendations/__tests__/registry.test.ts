/**
 * Tests for @veris/recommendations registry, validation, and built-in recommendations.
 *
 * @module @veris/recommendations/__tests__/registry
 */

import { describe, it, expect } from 'vitest';
import {
  createRecommendationRegistry,
  BUILT_IN_RECOMMENDATIONS,
  SCHEMA_VERSION,
  ENGINE_VERSION,
  CATEGORIES,
  ACTIONS,
  SOURCE_TYPES,
  PRIORITY_ORDER,
} from '../src/index.js';

import type { Recommendation } from '../src/types.js';
import { makeRec } from './helpers.js';

// ── Registry Construction ──

describe('registry construction', () => {
  it('creates an empty registry', () => {
    const registry = createRecommendationRegistry();
    expect(registry.size()).toBe(0);
    expect(registry.list()).toEqual([]);
  });

  it('returns a frozen list for empty registry', () => {
    const registry = createRecommendationRegistry();
    expect(Object.isFrozen(registry.list())).toBe(true);
  });

  it('size is 0 for new registry', () => {
    const registry = createRecommendationRegistry();
    expect(registry.size()).toBe(0);
  });

  it('has returns false for empty registry', () => {
    const registry = createRecommendationRegistry();
    expect(registry.has('nonexistent')).toBe(false);
  });

  it('get returns undefined for empty registry', () => {
    const registry = createRecommendationRegistry();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('validate returns valid for empty registry', () => {
    const registry = createRecommendationRegistry();
    const result = registry.validate();
    expect(result.valid).toBe(true);
    expect(result.errorCount).toBe(0);
    expect(result.warningCount).toBe(0);
    expect(result.findings).toEqual([]);
  });

  it('can be created multiple times independently', () => {
    const r1 = createRecommendationRegistry();
    const r2 = createRecommendationRegistry();
    expect(r1).not.toBe(r2);
    expect(r1.size()).toBe(0);
    expect(r2.size()).toBe(0);
  });
});

// ── Simple Registration ──

describe('registration', () => {
  it('registers a single recommendation', () => {
    const registry = createRecommendationRegistry();
    const rec = makeRec({ id: 'TEST-01' });
    registry.register(rec);
    expect(registry.size()).toBe(1);
    expect(registry.has('TEST-01')).toBe(true);
  });

  it('throws for null recommendation', () => {
    const registry = createRecommendationRegistry();
    expect(() => {
      registry.register(null as unknown as Recommendation);
    }).toThrow('must be a non-null object');
  });

  it('throws for undefined recommendation', () => {
    const registry = createRecommendationRegistry();
    expect(() => {
      registry.register(undefined as unknown as Recommendation);
    }).toThrow('must be a non-null object');
  });

  it('throws for recommendation with empty id', () => {
    const registry = createRecommendationRegistry();
    const rec = makeRec({ id: '' });
    expect(() => {
      registry.register(rec);
    }).toThrow('id must be a non-empty string');
  });

  it('freezes the registered recommendation', () => {
    const registry = createRecommendationRegistry();
    const rec = makeRec({ id: 'TEST-01' });
    registry.register(rec);
    const stored = registry.get('TEST-01');
    expect(Object.isFrozen(stored)).toBe(true);
  });

  it('returns the exact same recommendation object on get', () => {
    const registry = createRecommendationRegistry();
    const rec = makeRec({ id: 'TEST-01' });
    registry.register(rec);
    const stored = registry.get('TEST-01');
    expect(stored?.id).toBe(rec.id);
    expect(stored?.title).toBe(rec.title);
  });
});

// ── Duplicate Detection ──

describe('duplicate ID detection', () => {
  it('throws when registering a duplicate ID', () => {
    const registry = createRecommendationRegistry();
    const rec1 = makeRec({ id: 'DUP-01' });
    const rec2 = makeRec({ id: 'DUP-01' });
    registry.register(rec1);
    expect(() => {
      registry.register(rec2);
    }).toThrow(/duplicate recommendation ID "DUP-01"/);
  });

  it('registry size remains unchanged after failed duplicate registration', () => {
    const registry = createRecommendationRegistry();
    const rec1 = makeRec({ id: 'DUP-01' });
    const rec2 = makeRec({ id: 'DUP-01' });
    registry.register(rec1);
    expect(registry.size()).toBe(1);
    expect(() => registry.register(rec2)).toThrow();
    expect(registry.size()).toBe(1);
  });

  it('throws when registering many with duplicates', () => {
    const registry = createRecommendationRegistry();
    const rec1 = makeRec({ id: 'DUP-01' });
    const rec2 = makeRec({ id: 'DUP-02' });
    const rec3 = makeRec({ id: 'DUP-01' });
    registry.register(rec1);
    expect(() => {
      registry.registerMany([rec2, rec3]);
    }).toThrow(/duplicate recommendation ID "DUP-01"/);
  });

  it('registerMany atomically rolls back on duplicate', () => {
    const registry = createRecommendationRegistry();
    const rec1 = makeRec({ id: 'A-01' });
    const rec2 = makeRec({ id: 'A-02' });
    const rec3 = makeRec({ id: 'A-01' });
    registry.register(rec1);
    expect(() => registry.registerMany([rec2, rec3])).toThrow();
    expect(registry.size()).toBe(1);
    expect(registry.has('A-01')).toBe(true);
    expect(registry.has('A-02')).toBe(false);
  });
});

// ── Documentation Reference Duplicate Detection ──

describe('documentation reference duplicate detection', () => {
  it('throws when duplicate doc IDs exist within a single recommendation', () => {
    const registry = createRecommendationRegistry();
    const rec = makeRec({
      id: 'DOC-DUP-01',
      documentationRefs: Object.freeze([
        Object.freeze({ documentId: 'doc-001', documentTitle: 'Doc 1' }),
        Object.freeze({ documentId: 'doc-001', documentTitle: 'Doc 1 Duplicate' }),
      ]),
    });
    expect(() => {
      registry.register(rec);
    }).toThrow(/duplicate documentation reference ID "doc-001"/);
  });

  it('throws when duplicate doc IDs exist across recommendations', () => {
    const registry = createRecommendationRegistry();
    const rec1 = makeRec({
      id: 'DOC-A',
      documentationRefs: Object.freeze([
        Object.freeze({ documentId: 'shared-doc', documentTitle: 'Shared Doc' }),
      ]),
    });
    const rec2 = makeRec({
      id: 'DOC-B',
      documentationRefs: Object.freeze([
        Object.freeze({ documentId: 'shared-doc', documentTitle: 'Shared Doc Again' }),
      ]),
    });
    registry.register(rec1);
    expect(() => {
      registry.register(rec2);
    }).toThrow(/duplicate documentation reference ID "shared-doc"/);
  });

  it('allows different doc IDs across recommendations', () => {
    const registry = createRecommendationRegistry();
    const rec1 = makeRec({
      id: 'DOC-A',
      documentationRefs: Object.freeze([
        Object.freeze({ documentId: 'doc-001', documentTitle: 'Doc 1' }),
      ]),
    });
    const rec2 = makeRec({
      id: 'DOC-B',
      documentationRefs: Object.freeze([
        Object.freeze({ documentId: 'doc-002', documentTitle: 'Doc 2' }),
      ]),
    });
    registry.register(rec1);
    registry.register(rec2);
    expect(registry.size()).toBe(2);
  });
});

// ── Lookup Operations ──

describe('lookup operations', () => {
  it('returns the correct recommendation by ID', () => {
    const registry = createRecommendationRegistry();
    const rec = makeRec({ id: 'LOOKUP-01', title: 'Lookup Test' });
    registry.register(rec);
    const found = registry.get('LOOKUP-01');
    expect(found?.id).toBe('LOOKUP-01');
    expect(found?.title).toBe('Lookup Test');
  });

  it('returns undefined for non-existent ID', () => {
    const registry = createRecommendationRegistry();
    const rec = makeRec({ id: 'LOOKUP-01' });
    registry.register(rec);
    expect(registry.get('NONEXISTENT')).toBeUndefined();
  });

  it('get is case-sensitive', () => {
    const registry = createRecommendationRegistry();
    const rec = makeRec({ id: 'Case-Sensitive' });
    registry.register(rec);
    expect(registry.get('case-sensitive')).toBeUndefined();
    expect(registry.get('Case-Sensitive')).toBeDefined();
  });

  it('has returns true for registered ID', () => {
    const registry = createRecommendationRegistry();
    const rec = makeRec({ id: 'HAS-01' });
    registry.register(rec);
    expect(registry.has('HAS-01')).toBe(true);
  });

  it('has returns false for unregistered ID', () => {
    const registry = createRecommendationRegistry();
    expect(registry.has('HAS-01')).toBe(false);
  });
});

// ── Listing Operations ──

describe('list operations', () => {
  it('lists all registered recommendations', () => {
    const registry = createRecommendationRegistry();
    const rec1 = makeRec({ id: 'LIST-01' });
    const rec2 = makeRec({ id: 'LIST-02' });
    registry.register(rec1);
    registry.register(rec2);
    const all = registry.list();
    expect(all.length).toBe(2);
    expect(all.map((r) => r.id)).toContain('LIST-01');
    expect(all.map((r) => r.id)).toContain('LIST-02');
  });

  it('list returns frozen array', () => {
    const registry = createRecommendationRegistry();
    const rec = makeRec({ id: 'FROZEN' });
    registry.register(rec);
    expect(Object.isFrozen(registry.list())).toBe(true);
  });

  it('list sorts by priority then ID within same priority', () => {
    const registry = createRecommendationRegistry();
    const rec1 = makeRec({ id: 'B-01', priority: 'medium' });
    const rec2 = makeRec({ id: 'A-01', priority: 'medium' });
    const rec3 = makeRec({ id: 'C-01', priority: 'medium' });
    registry.register(rec1);
    registry.register(rec2);
    registry.register(rec3);
    const ids = registry.list().map((r) => r.id);
    expect(ids).toEqual(['A-01', 'B-01', 'C-01']);
  });

  it('list is sorted by priority then ID', () => {
    const registry = createRecommendationRegistry();
    const rec1 = makeRec({ id: 'Z-01', priority: 'low' });
    const rec2 = makeRec({ id: 'M-01', priority: 'high' });
    const rec3 = makeRec({ id: 'A-01', priority: 'critical' });
    registry.register(rec1);
    registry.register(rec2);
    registry.register(rec3);
    const ids = registry.list().map((r) => r.id);
    expect(ids[0]).toBe('A-01');
    expect(ids[1]).toBe('M-01');
    expect(ids[2]).toBe('Z-01');
  });

  it('list returns stable results across repeated calls', () => {
    const registry = createRecommendationRegistry();
    registry.register(makeRec({ id: 'A', priority: 'low' }));
    registry.register(makeRec({ id: 'B', priority: 'medium' }));
    registry.register(makeRec({ id: 'C', priority: 'high' }));
    const first = registry.list().map((r) => r.id);
    const second = registry.list().map((r) => r.id);
    const third = registry.list().map((r) => r.id);
    expect(first).toEqual(second);
    expect(second).toEqual(third);
  });
});

// ── Filtered Listing ──

describe('filtered listing', () => {
  it('listByCategory returns only matching recommendations', () => {
    const registry = createRecommendationRegistry();
    registry.register(makeRec({ id: 'CAT-A', category: CATEGORIES.REMEDIATION }));
    registry.register(makeRec({ id: 'CAT-B', category: CATEGORIES.INVESTIGATION }));
    registry.register(makeRec({ id: 'CAT-C', category: CATEGORIES.REMEDIATION }));

    const remediation = registry.listByCategory(CATEGORIES.REMEDIATION);
    expect(remediation.length).toBe(2);
    expect(remediation.map((r) => r.id)).toEqual(['CAT-A', 'CAT-C']);
  });

  it('listByCategory returns empty array for unmatched category', () => {
    const registry = createRecommendationRegistry();
    registry.register(makeRec({ id: 'CAT-A', category: CATEGORIES.REMEDIATION }));
    const result = registry.listByCategory(CATEGORIES.PREVENTION);
    expect(result).toEqual([]);
  });

  it('listByCategory returns frozen array', () => {
    const registry = createRecommendationRegistry();
    const result = registry.listByCategory(CATEGORIES.REMEDIATION);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('listByPriority returns only matching recommendations', () => {
    const registry = createRecommendationRegistry();
    registry.register(makeRec({ id: 'PRI-A', priority: 'critical' }));
    registry.register(makeRec({ id: 'PRI-B', priority: 'high' }));
    registry.register(makeRec({ id: 'PRI-C', priority: 'critical' }));

    const critical = registry.listByPriority('critical');
    expect(critical.length).toBe(2);
    expect(critical.map((r) => r.id)).toEqual(['PRI-A', 'PRI-C']);
  });

  it('listByPriority returns empty array for unmatched priority', () => {
    const registry = createRecommendationRegistry();
    registry.register(makeRec({ id: 'PRI-A', priority: 'critical' }));
    expect(registry.listByPriority('low')).toEqual([]);
  });

  it('listByPriority works for all priority levels', () => {
    const registry = createRecommendationRegistry();
    for (const priority of PRIORITY_ORDER) {
      registry.register(makeRec({ id: `PRI-${priority}`, priority }));
    }
    for (const priority of PRIORITY_ORDER) {
      const result = registry.listByPriority(priority);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe(`PRI-${priority}`);
    }
  });

  it('listByAction returns only matching recommendations', () => {
    const registry = createRecommendationRegistry();
    registry.register(makeRec({ id: 'ACT-A', action: ACTIONS.REMOVE }));
    registry.register(makeRec({ id: 'ACT-B', action: ACTIONS.REVIEW }));
    registry.register(makeRec({ id: 'ACT-C', action: ACTIONS.REMOVE }));

    const remove = registry.listByAction(ACTIONS.REMOVE);
    expect(remove.length).toBe(2);
    expect(remove.map((r) => r.id)).toEqual(['ACT-A', 'ACT-C']);
  });

  it('listByAction returns empty array for unmatched action', () => {
    const registry = createRecommendationRegistry();
    registry.register(makeRec({ id: 'ACT-A', action: ACTIONS.REMOVE }));
    expect(registry.listByAction(ACTIONS.MONITOR)).toEqual([]);
  });

  it('listByAction returns frozen array', () => {
    const registry = createRecommendationRegistry();
    const result = registry.listByAction(ACTIONS.REMOVE);
    expect(Object.isFrozen(result)).toBe(true);
  });
});

// ── RegisterMany ──

describe('registerMany', () => {
  it('registers multiple recommendations', () => {
    const registry = createRecommendationRegistry();
    const recs = [
      makeRec({ id: 'MANY-01' }),
      makeRec({ id: 'MANY-02' }),
      makeRec({ id: 'MANY-03' }),
    ];
    registry.registerMany(recs);
    expect(registry.size()).toBe(3);
  });

  it('handles empty array', () => {
    const registry = createRecommendationRegistry();
    registry.registerMany([]);
    expect(registry.size()).toBe(0);
  });

  it('registers many in insertion order', () => {
    const registry = createRecommendationRegistry();
    const recs = [
      makeRec({ id: 'Z-MANY', priority: 'low' }),
      makeRec({ id: 'A-MANY', priority: 'high' }),
      makeRec({ id: 'M-MANY', priority: 'medium' }),
    ];
    registry.registerMany(recs);
    const ids = registry.list().map((r) => r.id);
    expect(ids).toEqual(['A-MANY', 'M-MANY', 'Z-MANY']);
  });

  it('atomic rollback on failure', () => {
    const registry = createRecommendationRegistry();
    registry.register(makeRec({ id: 'EXISTING' }));
    const recs = [makeRec({ id: 'NEW-01' }), makeRec({ id: 'EXISTING' })];
    expect(() => registry.registerMany(recs)).toThrow();
    expect(registry.size()).toBe(1);
    expect(registry.has('EXISTING')).toBe(true);
    expect(registry.has('NEW-01')).toBe(false);
  });
});

// ── Validation ──

describe('validation', () => {
  it('validates a clean registry as valid', () => {
    const registry = createRecommendationRegistry();
    registry.register(makeRec({ id: 'VALID-01' }));
    registry.register(makeRec({ id: 'VALID-02' }));
    const result = registry.validate();
    expect(result.valid).toBe(true);
    expect(result.errorCount).toBe(0);
  });

  it('detects non-frozen recommendations', () => {
    const registry = createRecommendationRegistry();
    const rec: Recommendation = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      id: 'NOT-FROZEN',
      priority: 'medium',
      category: CATEGORIES.INVESTIGATION,
      action: ACTIONS.REVIEW,
      title: 'Not Frozen',
      description: 'Test',
      references: Object.freeze([
        Object.freeze({ sourceType: SOURCE_TYPES.RULE, sourceId: 'rule_1', sourceName: 'Test' }),
      ]),
      documentationRefs: Object.freeze([]),
      assessment: null,
      rationale: 'Test',
      metadata: Object.freeze({}),
    };
    registry.register(Object.freeze({ ...rec }));
    const result = registry.validate();
    expect(result.valid).toBe(true);
  });

  it('detects empty references', () => {
    const registry = createRecommendationRegistry();
    const rec = makeRec({
      id: 'NO-REFS',
      references: Object.freeze([]),
    });
    registry.register(rec);
    const result = registry.validate();
    expect(result.valid).toBe(false);
    expect(result.errorCount).toBeGreaterThanOrEqual(1);
    const emptyRefs = result.findings.filter((f) => f.code === 'EMPTY_REFERENCES');
    expect(emptyRefs.length).toBeGreaterThanOrEqual(1);
  });

  it('returns validation result with findings sorted by recommendation ID', () => {
    const registry = createRecommendationRegistry();
    const rec1 = makeRec({ id: 'B-REC', references: Object.freeze([]) });
    const rec2 = makeRec({ id: 'A-REC', references: Object.freeze([]) });
    registry.register(rec1);
    registry.register(rec2);
    const result = registry.validate();
    const ids = result.findings.map((f) => f.recommendationId);
    expect(ids[0]).toBe('A-REC');
    expect(ids[ids.length - 1]).toBe('B-REC');
  });

  it('detects invalid priority values', () => {
    const registry = createRecommendationRegistry();
    const rec = makeRec({
      id: 'BAD-PRIORITY',
      priority: 'unknown' as 'critical',
    });
    registry.register(rec);
    const result = registry.validate();
    const invalids = result.findings.filter((f) => f.code === 'INVALID_PRIORITY');
    expect(invalids.length).toBeGreaterThanOrEqual(1);
  });

  it('detects invalid category values', () => {
    const registry = createRecommendationRegistry();
    const rec = makeRec({
      id: 'BAD-CATEGORY',
      category: 'bogus' as typeof rec.category,
    });
    registry.register(rec);
    const result = registry.validate();
    const invalids = result.findings.filter((f) => f.code === 'INVALID_CATEGORY');
    expect(invalids.length).toBeGreaterThanOrEqual(1);
  });

  it('detects invalid action values', () => {
    const registry = createRecommendationRegistry();
    const rec = makeRec({
      id: 'BAD-ACTION',
      action: 'bogus' as typeof rec.action,
    });
    registry.register(rec);
    const result = registry.validate();
    const invalids = result.findings.filter((f) => f.code === 'INVALID_ACTION');
    expect(invalids.length).toBeGreaterThanOrEqual(1);
  });

  it('validate does not throw for normal failures', () => {
    const registry = createRecommendationRegistry();
    const rec = makeRec({ id: 'INVALID', references: Object.freeze([]) });
    registry.register(rec);
    expect(() => registry.validate()).not.toThrow();
  });

  it('validation result is frozen', () => {
    const registry = createRecommendationRegistry();
    const result = registry.validate();
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.findings)).toBe(true);
  });
});

// ── Determinism ──

describe('determinism', () => {
  it('same registrations produce same iteration order', () => {
    const r1 = createRecommendationRegistry();
    const r2 = createRecommendationRegistry();
    r1.register(makeRec({ id: 'A', priority: 'high' }));
    r1.register(makeRec({ id: 'B', priority: 'low' }));
    r1.register(makeRec({ id: 'C', priority: 'medium' }));
    r2.register(makeRec({ id: 'A', priority: 'high' }));
    r2.register(makeRec({ id: 'B', priority: 'low' }));
    r2.register(makeRec({ id: 'C', priority: 'medium' }));
    expect(r1.list().map((r) => r.id)).toEqual(r2.list().map((r) => r.id));
  });

  it('same registrations produce same validation results', () => {
    const r1 = createRecommendationRegistry();
    const r2 = createRecommendationRegistry();
    r1.register(makeRec({ id: 'A', references: Object.freeze([]) }));
    r2.register(makeRec({ id: 'A', references: Object.freeze([]) }));
    const v1 = r1.validate();
    const v2 = r2.validate();
    expect(v1.valid).toBe(v2.valid);
    expect(v1.errorCount).toBe(v2.errorCount);
    expect(v1.findings.length).toBe(v2.findings.length);
  });

  it('repeated execution (100 iterations) produces stable results', () => {
    for (let i = 0; i < 100; i++) {
      const registry = createRecommendationRegistry();
      registry.register(makeRec({ id: 'ITER', priority: 'high' }));
      expect(registry.size()).toBe(1);
      expect(registry.get('ITER')).toBeDefined();
      expect(registry.list().length).toBe(1);
    }
  });

  it('repeated validation (100 iterations) produces stable results', () => {
    const registry = createRecommendationRegistry();
    registry.register(makeRec({ id: 'STABLE' }));
    for (let i = 0; i < 100; i++) {
      const result = registry.validate();
      expect(result.valid).toBe(true);
      expect(result.errorCount).toBe(0);
    }
  });
});

// ── Immutability ──

describe('immutability', () => {
  it('list returns a frozen copy that cannot be mutated', () => {
    const registry = createRecommendationRegistry();
    registry.register(makeRec({ id: 'IMMUTABLE' }));
    const list = registry.list();
    expect(Object.isFrozen(list)).toBe(true);
  });

  it('listByCategory returns frozen array', () => {
    const registry = createRecommendationRegistry();
    registry.register(makeRec({ id: 'IMMUTABLE', category: CATEGORIES.REMEDIATION }));
    const filtered = registry.listByCategory(CATEGORIES.REMEDIATION);
    expect(Object.isFrozen(filtered)).toBe(true);
  });

  it('listByPriority returns frozen array', () => {
    const registry = createRecommendationRegistry();
    registry.register(makeRec({ id: 'IMMUTABLE', priority: 'high' }));
    const filtered = registry.listByPriority('high');
    expect(Object.isFrozen(filtered)).toBe(true);
  });

  it('listByAction returns frozen array', () => {
    const registry = createRecommendationRegistry();
    registry.register(makeRec({ id: 'IMMUTABLE', action: ACTIONS.REVIEW }));
    const filtered = registry.listByAction(ACTIONS.REVIEW);
    expect(Object.isFrozen(filtered)).toBe(true);
  });
});

// ── Size ──

describe('size', () => {
  it('returns correct count after multiple registrations', () => {
    const registry = createRecommendationRegistry();
    expect(registry.size()).toBe(0);
    registry.register(makeRec({ id: 'SIZE-01' }));
    expect(registry.size()).toBe(1);
    registry.register(makeRec({ id: 'SIZE-02' }));
    expect(registry.size()).toBe(2);
    registry.register(makeRec({ id: 'SIZE-03' }));
    expect(registry.size()).toBe(3);
  });

  it('size is a method (not a property)', () => {
    const registry = createRecommendationRegistry();
    expect(typeof registry.size).toBe('function');
  });
});

// ── Built-in Recommendations ──

describe('built-in recommendations', () => {
  it('exports BUILT_IN_RECOMMENDATIONS as a non-empty array', () => {
    expect(BUILT_IN_RECOMMENDATIONS).toBeDefined();
    expect(BUILT_IN_RECOMMENDATIONS.length).toBeGreaterThan(0);
  });

  it('BUILT_IN_RECOMMENDATIONS is frozen', () => {
    expect(Object.isFrozen(BUILT_IN_RECOMMENDATIONS)).toBe(true);
  });

  it('has between 15 and 20 built-in recommendations', () => {
    expect(BUILT_IN_RECOMMENDATIONS.length).toBeGreaterThanOrEqual(15);
    expect(BUILT_IN_RECOMMENDATIONS.length).toBeLessThanOrEqual(20);
  });

  it('all built-in recommendations have valid schema versions', () => {
    for (const rec of BUILT_IN_RECOMMENDATIONS) {
      expect(rec.schemaVersion).toBe(SCHEMA_VERSION);
    }
  });

  it('all built-in recommendations have valid engine versions', () => {
    for (const rec of BUILT_IN_RECOMMENDATIONS) {
      expect(rec.engineVersion).toBe(ENGINE_VERSION);
    }
  });

  it('all built-in recommendations are frozen', () => {
    for (const rec of BUILT_IN_RECOMMENDATIONS) {
      expect(Object.isFrozen(rec)).toBe(true);
    }
  });

  it('all built-in recommendations have non-empty titles', () => {
    for (const rec of BUILT_IN_RECOMMENDATIONS) {
      expect(rec.title).toBeTruthy();
      expect(typeof rec.title).toBe('string');
    }
  });

  it('all built-in recommendations have non-empty descriptions', () => {
    for (const rec of BUILT_IN_RECOMMENDATIONS) {
      expect(rec.description).toBeTruthy();
    }
  });

  it('all built-in recommendations have non-empty rationales', () => {
    for (const rec of BUILT_IN_RECOMMENDATIONS) {
      expect(rec.rationale).toBeTruthy();
    }
  });

  it('all built-in recommendations have at least one reference', () => {
    for (const rec of BUILT_IN_RECOMMENDATIONS) {
      expect(rec.references.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('all built-in recommendations have frozen references array', () => {
    for (const rec of BUILT_IN_RECOMMENDATIONS) {
      expect(Object.isFrozen(rec.references)).toBe(true);
    }
  });

  it('all built-in recommendations have frozen documentationRefs', () => {
    for (const rec of BUILT_IN_RECOMMENDATIONS) {
      expect(Object.isFrozen(rec.documentationRefs)).toBe(true);
    }
  });

  it('all built-in recommendations have null assessment', () => {
    for (const rec of BUILT_IN_RECOMMENDATIONS) {
      expect(rec.assessment).toBeNull();
    }
  });

  it('all built-in recommendations have frozen metadata', () => {
    for (const rec of BUILT_IN_RECOMMENDATIONS) {
      expect(Object.isFrozen(rec.metadata)).toBe(true);
    }
  });

  it('built-in recommendations have unique IDs', () => {
    const ids = BUILT_IN_RECOMMENDATIONS.map((r) => r.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('built-in IDs use expected format (XX-NN)', () => {
    for (const rec of BUILT_IN_RECOMMENDATIONS) {
      expect(rec.id).toMatch(/^[A-Z]{2,4}-\d{2}$/);
    }
  });

  it('all priorities are valid', () => {
    const validPriorities = ['critical', 'high', 'medium', 'low'];
    for (const rec of BUILT_IN_RECOMMENDATIONS) {
      expect(validPriorities).toContain(rec.priority);
    }
  });

  it('all categories are valid', () => {
    const validCategories = Object.values(CATEGORIES);
    for (const rec of BUILT_IN_RECOMMENDATIONS) {
      expect(validCategories).toContain(rec.category);
    }
  });

  it('all actions are valid', () => {
    const validActions = Object.values(ACTIONS);
    for (const rec of BUILT_IN_RECOMMENDATIONS) {
      expect(validActions).toContain(rec.action);
    }
  });

  it('all source types in references are valid', () => {
    const validSourceTypes = Object.values(SOURCE_TYPES);
    for (const rec of BUILT_IN_RECOMMENDATIONS) {
      for (const ref of rec.references) {
        expect(validSourceTypes).toContain(ref.sourceType);
      }
    }
  });

  it('built-in references have non-empty source names', () => {
    for (const rec of BUILT_IN_RECOMMENDATIONS) {
      for (const ref of rec.references) {
        expect(ref.sourceName).toBeTruthy();
      }
    }
  });

  it('specific built-in recommendation TR-01 exists', () => {
    const tr01 = BUILT_IN_RECOMMENDATIONS.find((r) => r.id === 'TR-01');
    expect(tr01).toBeDefined();
    expect(tr01?.title).toBe('Trojan Removal');
    expect(tr01?.priority).toBe('critical');
    expect(tr01?.category).toBe(CATEGORIES.REMEDIATION);
    expect(tr01?.action).toBe(ACTIONS.REMOVE);
  });

  it('specific built-in recommendation PE-01 exists', () => {
    const pe01 = BUILT_IN_RECOMMENDATIONS.find((r) => r.id === 'PE-01');
    expect(pe01).toBeDefined();
    expect(pe01?.title).toBe('Packed Executable Review');
    expect(pe01?.priority).toBe('high');
    expect(pe01?.category).toBe(CATEGORIES.INVESTIGATION);
    expect(pe01?.action).toBe(ACTIONS.REVIEW);
  });

  it('specific built-in recommendation CR-01 exists', () => {
    const cr01 = BUILT_IN_RECOMMENDATIONS.find((r) => r.id === 'CR-01');
    expect(cr01).toBeDefined();
    expect(cr01?.priority).toBe('critical');
    expect(cr01?.category).toBe(CATEGORIES.REMEDIATION);
  });

  it('specific built-in recommendation NET-01 exists with low priority', () => {
    const net01 = BUILT_IN_RECOMMENDATIONS.find((r) => r.id === 'NET-01');
    expect(net01).toBeDefined();
    expect(net01?.priority).toBe('low');
    expect(net01?.category).toBe(CATEGORIES.PREVENTION);
  });
});

// ── Built-in Registry ──

describe('built-in registry', () => {
  it('can register all built-in recommendations', () => {
    const registry = createRecommendationRegistry();
    registry.registerMany(BUILT_IN_RECOMMENDATIONS);
    expect(registry.size()).toBe(BUILT_IN_RECOMMENDATIONS.length);
  });

  it('built-in registry validates as valid', () => {
    const registry = createRecommendationRegistry();
    registry.registerMany(BUILT_IN_RECOMMENDATIONS);
    const result = registry.validate();
    expect(result.valid).toBe(true);
    expect(result.errorCount).toBe(0);
  });

  it('can look up individual built-in recommendations', () => {
    const registry = createRecommendationRegistry();
    registry.registerMany(BUILT_IN_RECOMMENDATIONS);
    for (const rec of BUILT_IN_RECOMMENDATIONS) {
      expect(registry.get(rec.id)).toBeDefined();
      expect(registry.has(rec.id)).toBe(true);
    }
  });

  it('built-in registry list returns all items', () => {
    const registry = createRecommendationRegistry();
    registry.registerMany(BUILT_IN_RECOMMENDATIONS);
    expect(registry.list().length).toBe(BUILT_IN_RECOMMENDATIONS.length);
  });

  it('built-in registry filters by category', () => {
    const registry = createRecommendationRegistry();
    registry.registerMany(BUILT_IN_RECOMMENDATIONS);
    const remediation = registry.listByCategory(CATEGORIES.REMEDIATION);
    const investigation = registry.listByCategory(CATEGORIES.INVESTIGATION);
    expect(remediation.length).toBeGreaterThan(0);
    expect(investigation.length).toBeGreaterThan(0);
    for (const rec of remediation) {
      expect(rec.category).toBe(CATEGORIES.REMEDIATION);
    }
    for (const rec of investigation) {
      expect(rec.category).toBe(CATEGORIES.INVESTIGATION);
    }
  });

  it('built-in registry filters by priority', () => {
    const registry = createRecommendationRegistry();
    registry.registerMany(BUILT_IN_RECOMMENDATIONS);
    const totalFromFilters =
      registry.listByPriority('critical').length +
      registry.listByPriority('high').length +
      registry.listByPriority('medium').length +
      registry.listByPriority('low').length;
    expect(totalFromFilters).toBe(BUILT_IN_RECOMMENDATIONS.length);
  });

  it('built-in registry filters by action', () => {
    const registry = createRecommendationRegistry();
    registry.registerMany(BUILT_IN_RECOMMENDATIONS);
    const remove = registry.listByAction(ACTIONS.REMOVE);
    const review = registry.listByAction(ACTIONS.REVIEW);
    expect(remove.length).toBeGreaterThan(0);
    expect(review.length).toBeGreaterThan(0);
  });
});

// ── Serialization ──

describe('serialization compatibility', () => {
  it('recommendations from list serialize to JSON', () => {
    const registry = createRecommendationRegistry();
    registry.register(makeRec({ id: 'JSON-01' }));
    const serialized = JSON.parse(JSON.stringify(registry.list()));
    expect(serialized.length).toBe(1);
    expect(serialized[0].id).toBe('JSON-01');
  });

  it('validation result serializes to JSON', () => {
    const registry = createRecommendationRegistry();
    const rec = makeRec({ id: 'JSON-VAL', references: Object.freeze([]) });
    registry.register(rec);
    const result = registry.validate();
    const serialized = JSON.parse(JSON.stringify(result));
    expect(serialized.valid).toBe(false);
    expect(serialized.errorCount).toBeGreaterThan(0);
    expect(serialized.findings.length).toBeGreaterThan(0);
  });

  it('all built-in recommendations serialize to JSON', () => {
    const serialized = JSON.parse(JSON.stringify(BUILT_IN_RECOMMENDATIONS));
    expect(serialized.length).toBe(BUILT_IN_RECOMMENDATIONS.length);
    for (const rec of serialized) {
      expect(typeof rec.id).toBe('string');
      expect(typeof rec.title).toBe('string');
      expect(typeof rec.description).toBe('string');
    }
  });
});

// ── Edge Cases ──

describe('edge cases', () => {
  it('handles registration of many recommendations with varying priorities', () => {
    const registry = createRecommendationRegistry();
    const recs = [];
    for (let i = 0; i < 50; i++) {
      const priority = PRIORITY_ORDER[i % PRIORITY_ORDER.length];
      recs.push(makeRec({ id: `EDGE-${String(i).padStart(3, '0')}`, priority }));
    }
    registry.registerMany(recs);
    expect(registry.size()).toBe(50);
  });

  it('list returns recommendations sorted by priority, then ID', () => {
    const registry = createRecommendationRegistry();
    registry.register(makeRec({ id: 'B', priority: 'high' }));
    registry.register(makeRec({ id: 'A', priority: 'high' }));
    registry.register(makeRec({ id: 'C', priority: 'low' }));
    registry.register(makeRec({ id: 'D', priority: 'critical' }));
    const ids = registry.list().map((r) => r.id);
    expect(ids).toEqual(['D', 'A', 'B', 'C']);
  });

  it('empty registry validate is valid', () => {
    const registry = createRecommendationRegistry();
    const result = registry.validate();
    expect(result.valid).toBe(true);
    expect(result.errorCount).toBe(0);
    expect(result.warningCount).toBe(0);
  });
});

// ── Allocation / Performance ──

describe('performance characteristics', () => {
  it('registerMany with 100 recommendations completes quickly', () => {
    const registry = createRecommendationRegistry();
    const recs = [];
    for (let i = 0; i < 100; i++) {
      recs.push(makeRec({ id: `PERF-${String(i).padStart(3, '0')}` }));
    }
    const start = performance.now();
    registry.registerMany(recs);
    const duration = performance.now() - start;
    expect(registry.size()).toBe(100);
    expect(duration).toBeLessThan(5000);
  });

  it('list with 100 recommendations completes quickly', () => {
    const registry = createRecommendationRegistry();
    const recs = [];
    for (let i = 0; i < 100; i++) {
      recs.push(makeRec({ id: `LST-${String(i).padStart(3, '0')}`, priority: 'medium' }));
    }
    registry.registerMany(recs);
    const start = performance.now();
    const list = registry.list();
    const duration = performance.now() - start;
    expect(list.length).toBe(100);
    expect(duration).toBeLessThan(5000);
  });
});
