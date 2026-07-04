/**
 * Tests for @veris/recommendations explainer.
 *
 * @module @veris/recommendations/__tests__/explainer
 */

import { describe, it, expect } from 'vitest';
import {
  createRecommendationRegistry,
  createRecommendationEngine,
  BUILT_IN_RECOMMENDATIONS,
  explainRecommendation,
  explainCategory,
  breakdownByCategory,
  topRecommendations,
  SCHEMA_VERSION,
  ENGINE_VERSION,
  CATEGORIES,
  ACTIONS,
  SOURCE_TYPES,
  PRIORITY_ORDER,
} from '../src/index.js';

import type { RecommendationInput, RecommendationCollection } from '../src/types.js';
import { makeRec, makeInput, makeCollection } from './helpers.js';

// ── explainRecommendation ──

describe('explainRecommendation', () => {
  it('returns matched rule IDs from input', () => {
    const rec = makeRec({
      id: 'TEST-01',
      references: Object.freeze([
        Object.freeze({
          sourceType: SOURCE_TYPES.RULE,
          sourceId: 'rule-001',
          sourceName: 'Rule One',
        }),
      ]),
    });
    const input = makeInput({ ruleMatchIds: ['rule-001'] });
    const explanation = explainRecommendation(rec, input);
    expect(explanation.matchedRuleIds).toEqual(['rule-001']);
    expect(explanation.matchedCorrelationIds).toEqual([]);
    expect(explanation.matchedEvidenceIds).toEqual([]);
  });

  it('returns matched correlation IDs from input', () => {
    const rec = makeRec({
      id: 'TEST-CORR',
      references: Object.freeze([
        Object.freeze({
          sourceType: SOURCE_TYPES.CORRELATION,
          sourceId: 'corr-001',
          sourceName: 'Corr One',
        }),
      ]),
    });
    const input = makeInput({ correlationIds: ['corr-001'] });
    const explanation = explainRecommendation(rec, input);
    expect(explanation.matchedCorrelationIds).toEqual(['corr-001']);
    expect(explanation.matchedRuleIds).toEqual([]);
  });

  it('returns matched evidence IDs from input', () => {
    const rec = makeRec({
      id: 'TEST-EVID',
      references: Object.freeze([
        Object.freeze({
          sourceType: SOURCE_TYPES.EVIDENCE,
          sourceId: 'ev-001',
          sourceName: 'Ev One',
        }),
      ]),
    });
    const input = makeInput({ evidenceIds: ['ev-001'] });
    const explanation = explainRecommendation(rec, input);
    expect(explanation.matchedEvidenceIds).toEqual(['ev-001']);
  });

  it('returns empty matched arrays when no IDs match', () => {
    const rec = makeRec({
      id: 'NO-MATCH',
      references: Object.freeze([
        Object.freeze({
          sourceType: SOURCE_TYPES.RULE,
          sourceId: 'rule-other',
          sourceName: 'Other',
        }),
      ]),
    });
    const input = makeInput({ ruleMatchIds: ['rule-nonexistent'] });
    const explanation = explainRecommendation(rec, input);
    expect(explanation.matchedRuleIds).toEqual([]);
    expect(explanation.matchReasons).toEqual([]);
  });

  it('includes the recommendation itself', () => {
    const rec = makeRec({ id: 'SELF', title: 'Self Test' });
    const input = makeInput({ ruleMatchIds: [`rule_SELF`] });
    const explanation = explainRecommendation(rec, input);
    expect(explanation.recommendation.id).toBe('SELF');
    expect(explanation.recommendation.title).toBe('Self Test');
  });

  it('returns documentation references', () => {
    const docRefs = Object.freeze([
      Object.freeze({ documentId: 'doc-001', documentTitle: 'Doc One' }),
    ]);
    const rec = makeRec({
      id: 'DOCS',
      documentationRefs: docRefs,
      references: Object.freeze([
        Object.freeze({
          sourceType: SOURCE_TYPES.RULE,
          sourceId: 'rule-docs',
          sourceName: 'Docs Rule',
        }),
      ]),
    });
    const input = makeInput({ ruleMatchIds: ['rule-docs'] });
    const explanation = explainRecommendation(rec, input);
    expect(explanation.documentationRefs).toBe(docRefs);
  });

  it('includes priority, category, and action', () => {
    const rec = makeRec({
      id: 'META',
      priority: 'high',
      category: CATEGORIES.REMEDIATION,
      action: ACTIONS.REMOVE,
      references: Object.freeze([
        Object.freeze({ sourceType: SOURCE_TYPES.RULE, sourceId: 'rule-meta', sourceName: 'Meta' }),
      ]),
    });
    const input = makeInput({ ruleMatchIds: ['rule-meta'] });
    const explanation = explainRecommendation(rec, input);
    expect(explanation.priority).toBe('high');
    expect(explanation.category).toBe(CATEGORIES.REMEDIATION);
    expect(explanation.action).toBe(ACTIONS.REMOVE);
  });

  it('generates match reasons for each matched reference', () => {
    const rec = makeRec({
      id: 'REASONS',
      references: Object.freeze([
        Object.freeze({ sourceType: SOURCE_TYPES.RULE, sourceId: 'rule-a', sourceName: 'Rule A' }),
        Object.freeze({ sourceType: SOURCE_TYPES.RULE, sourceId: 'rule-b', sourceName: 'Rule B' }),
      ]),
    });
    const input = makeInput({ ruleMatchIds: ['rule-a', 'rule-b'] });
    const explanation = explainRecommendation(rec, input);
    expect(explanation.matchReasons.length).toBe(2);
    expect(explanation.matchReasons[0]).toContain('Rule A');
    expect(explanation.matchReasons[1]).toContain('Rule B');
  });

  it('frozen output', () => {
    const rec = makeRec({
      id: 'FROZEN-EXP',
      references: Object.freeze([
        Object.freeze({
          sourceType: SOURCE_TYPES.RULE,
          sourceId: 'rule-frozen',
          sourceName: 'Frozen',
        }),
      ]),
    });
    const input = makeInput({ ruleMatchIds: ['rule-frozen'] });
    const explanation = explainRecommendation(rec, input);
    expect(Object.isFrozen(explanation)).toBe(true);
    expect(Object.isFrozen(explanation.matchedRuleIds)).toBe(true);
    expect(Object.isFrozen(explanation.matchedCorrelationIds)).toBe(true);
    expect(Object.isFrozen(explanation.matchedEvidenceIds)).toBe(true);
    expect(Object.isFrozen(explanation.matchReasons)).toBe(true);
  });

  it('serializes to JSON', () => {
    const rec = makeRec({
      id: 'JSON-EXP',
      references: Object.freeze([
        Object.freeze({ sourceType: SOURCE_TYPES.RULE, sourceId: 'rule-json', sourceName: 'JSON' }),
      ]),
    });
    const input = makeInput({ ruleMatchIds: ['rule-json'] });
    const explanation = explainRecommendation(rec, input);
    const serialized = JSON.parse(JSON.stringify(explanation));
    expect(serialized.recommendation.id).toBe('JSON-EXP');
    expect(serialized.matchedRuleIds).toEqual(['rule-json']);
  });
});

// ── explainCategory ──

describe('explainCategory', () => {
  it('returns explanation for a category with recommendations', () => {
    const rec = makeRec({ id: 'CAT-A', category: CATEGORIES.REMEDIATION });
    const collection = makeCollection([rec]);
    const explanation = explainCategory(collection, CATEGORIES.REMEDIATION);
    expect(explanation.category).toBe(CATEGORIES.REMEDIATION);
    expect(explanation.recommendationCount).toBe(1);
    expect(explanation.recommendations).toEqual([rec]);
  });

  it('returns empty explanation for unmatched category', () => {
    const rec = makeRec({ id: 'CAT-A', category: CATEGORIES.REMEDIATION });
    const collection = makeCollection([rec]);
    const explanation = explainCategory(collection, CATEGORIES.INVESTIGATION);
    expect(explanation.recommendationCount).toBe(0);
    expect(explanation.recommendations).toEqual([]);
  });

  it('counts priority distribution correctly', () => {
    const recs = [
      makeRec({ id: 'C', priority: 'critical', category: CATEGORIES.REMEDIATION }),
      makeRec({ id: 'H', priority: 'high', category: CATEGORIES.REMEDIATION }),
      makeRec({ id: 'M', priority: 'medium', category: CATEGORIES.REMEDIATION }),
      makeRec({ id: 'L', priority: 'low', category: CATEGORIES.REMEDIATION }),
    ];
    const collection = makeCollection(recs);
    const explanation = explainCategory(collection, CATEGORIES.REMEDIATION);
    expect(explanation.priorityDistribution.critical).toBe(1);
    expect(explanation.priorityDistribution.high).toBe(1);
    expect(explanation.priorityDistribution.medium).toBe(1);
    expect(explanation.priorityDistribution.low).toBe(1);
    expect(explanation.recommendationCount).toBe(4);
  });

  it('collects unique documentation references', () => {
    const docA = Object.freeze({ documentId: 'doc-a', documentTitle: 'Doc A' });
    const docB = Object.freeze({ documentId: 'doc-b', documentTitle: 'Doc B' });
    const rec1 = makeRec({
      id: 'DOC-1',
      category: CATEGORIES.REMEDIATION,
      documentationRefs: Object.freeze([docA]),
    });
    const rec2 = makeRec({
      id: 'DOC-2',
      category: CATEGORIES.REMEDIATION,
      documentationRefs: Object.freeze([docB]),
    });
    const collection = makeCollection([rec1, rec2]);
    const explanation = explainCategory(collection, CATEGORIES.REMEDIATION);
    expect(explanation.documentationRefs.length).toBe(2);
    expect(explanation.documentationRefs[0].documentId).toBe('doc-a');
    expect(explanation.documentationRefs[1].documentId).toBe('doc-b');
  });

  it('deduplicates documentation references across recommendations', () => {
    const doc = Object.freeze({ documentId: 'doc-shared', documentTitle: 'Shared' });
    const rec1 = makeRec({
      id: 'SHARE-1',
      category: CATEGORIES.REMEDIATION,
      documentationRefs: Object.freeze([doc]),
    });
    const rec2 = makeRec({
      id: 'SHARE-2',
      category: CATEGORIES.REMEDIATION,
      documentationRefs: Object.freeze([doc]),
    });
    const collection = makeCollection([rec1, rec2]);
    const explanation = explainCategory(collection, CATEGORIES.REMEDIATION);
    expect(explanation.documentationRefs.length).toBe(1);
  });

  it('frozen output', () => {
    const rec = makeRec({ id: 'FROZEN-CAT', category: CATEGORIES.REMEDIATION });
    const collection = makeCollection([rec]);
    const explanation = explainCategory(collection, CATEGORIES.REMEDIATION);
    expect(Object.isFrozen(explanation)).toBe(true);
    expect(Object.isFrozen(explanation.recommendations)).toBe(true);
    expect(Object.isFrozen(explanation.documentationRefs)).toBe(true);
    expect(Object.isFrozen(explanation.priorityDistribution)).toBe(true);
  });

  it('serializes to JSON', () => {
    const rec = makeRec({ id: 'JSON-CAT', category: CATEGORIES.REMEDIATION });
    const collection = makeCollection([rec]);
    const explanation = explainCategory(collection, CATEGORIES.REMEDIATION);
    const serialized = JSON.parse(JSON.stringify(explanation));
    expect(serialized.category).toBe('remediation');
    expect(serialized.recommendationCount).toBe(1);
    expect(serialized.recommendations[0].id).toBe('JSON-CAT');
  });
});

// ── breakdownByCategory ──

describe('breakdownByCategory', () => {
  it('groups recommendations by category', () => {
    const recs = [
      makeRec({ id: 'A', category: CATEGORIES.REMEDIATION }),
      makeRec({ id: 'B', category: CATEGORIES.INVESTIGATION }),
      makeRec({ id: 'C', category: CATEGORIES.REMEDIATION }),
    ];
    const collection = makeCollection(recs);
    const breakdown = breakdownByCategory(collection);
    expect(breakdown.totalCount).toBe(3);
    expect(breakdown.categories.length).toBe(2);
  });

  it('orders categories alphabetically', () => {
    const recs = [
      makeRec({ id: 'Z', category: 'zzz-category' as any }),
      makeRec({ id: 'A', category: 'aaa-category' as any }),
    ];
    const collection = makeCollection(recs);
    const breakdown = breakdownByCategory(collection);
    expect(breakdown.categories[0].category).toBe('aaa-category');
    expect(breakdown.categories[1].category).toBe('zzz-category');
  });

  it('sorts recommendations within category by priority → ID', () => {
    const recs = [
      makeRec({ id: 'M', priority: 'medium', category: CATEGORIES.REMEDIATION }),
      makeRec({ id: 'H', priority: 'high', category: CATEGORIES.REMEDIATION }),
      makeRec({ id: 'C', priority: 'critical', category: CATEGORIES.REMEDIATION }),
    ];
    const collection = makeCollection(recs);
    const breakdown = breakdownByCategory(collection);
    const remed = breakdown.categories.find((c) => c.category === CATEGORIES.REMEDIATION)!;
    expect(remed.recommendations[0].id).toBe('C');
    expect(remed.recommendations[1].id).toBe('H');
    expect(remed.recommendations[2].id).toBe('M');
  });

  it('returns empty breakdown for empty collection', () => {
    const collection = makeCollection([]);
    const breakdown = breakdownByCategory(collection);
    expect(breakdown.totalCount).toBe(0);
    expect(breakdown.categories).toEqual([]);
  });

  it('counts priority distribution per category', () => {
    const recs = [
      makeRec({ id: 'C1', priority: 'critical', category: CATEGORIES.REMEDIATION }),
      makeRec({ id: 'C2', priority: 'critical', category: CATEGORIES.REMEDIATION }),
      makeRec({ id: 'H1', priority: 'high', category: CATEGORIES.INVESTIGATION }),
    ];
    const collection = makeCollection(recs);
    const breakdown = breakdownByCategory(collection);
    const remediation = breakdown.categories.find((c) => c.category === CATEGORIES.REMEDIATION)!;
    expect(remediation.priorityDistribution.critical).toBe(2);
    expect(remediation.recommendationCount).toBe(2);
    const investigation = breakdown.categories.find(
      (c) => c.category === CATEGORIES.INVESTIGATION,
    )!;
    expect(investigation.priorityDistribution.high).toBe(1);
  });

  it('frozen output', () => {
    const rec = makeRec({ id: 'FROZEN-BD', category: CATEGORIES.REMEDIATION });
    const collection = makeCollection([rec]);
    const breakdown = breakdownByCategory(collection);
    expect(Object.isFrozen(breakdown)).toBe(true);
    expect(Object.isFrozen(breakdown.categories)).toBe(true);
    for (const cat of breakdown.categories) {
      expect(Object.isFrozen(cat)).toBe(true);
    }
  });

  it('serializes to JSON', () => {
    const recs = [
      makeRec({ id: 'A', category: CATEGORIES.REMEDIATION }),
      makeRec({ id: 'B', category: CATEGORIES.INVESTIGATION }),
    ];
    const collection = makeCollection(recs);
    const breakdown = breakdownByCategory(collection);
    const serialized = JSON.parse(JSON.stringify(breakdown));
    expect(serialized.totalCount).toBe(2);
    expect(serialized.categories.length).toBe(2);
  });
});

// ── topRecommendations ──

describe('topRecommendations', () => {
  it('returns top recommendations by priority order', () => {
    const recs = [
      makeRec({ id: 'LOW', priority: 'low' }),
      makeRec({ id: 'HIGH', priority: 'high' }),
      makeRec({ id: 'CRIT', priority: 'critical' }),
    ];
    const collection = makeCollection(recs);
    const top = topRecommendations(collection);
    expect(top.length).toBe(3);
  });

  it('respects limit parameter', () => {
    const recs = [
      makeRec({ id: 'A', priority: 'high' }),
      makeRec({ id: 'B', priority: 'critical' }),
      makeRec({ id: 'C', priority: 'medium' }),
    ];
    const collection = makeCollection(recs);
    const top = topRecommendations(collection, 2);
    expect(top.length).toBe(2);
  });

  it('returns all when limit exceeds count', () => {
    const recs = [makeRec({ id: 'A', priority: 'high' })];
    const collection = makeCollection(recs);
    const top = topRecommendations(collection, 100);
    expect(top.length).toBe(1);
  });

  it('returns empty for zero limit', () => {
    const recs = [makeRec({ id: 'A', priority: 'high' })];
    const collection = makeCollection(recs);
    const top = topRecommendations(collection, 0);
    expect(top).toEqual([]);
  });

  it('returns empty for negative limit', () => {
    const recs = [makeRec({ id: 'A', priority: 'high' })];
    const collection = makeCollection(recs);
    const top = topRecommendations(collection, -1);
    expect(top).toEqual([]);
  });

  it('returns empty for empty collection', () => {
    const collection = makeCollection([]);
    const top = topRecommendations(collection, 5);
    expect(top).toEqual([]);
  });

  it('returns frozen array', () => {
    const rec = makeRec({ id: 'FROZEN-TOP', priority: 'high' });
    const collection = makeCollection([rec]);
    const top = topRecommendations(collection);
    expect(Object.isFrozen(top)).toBe(true);
  });
});

// ── Multiple Categories ──

describe('multiple categories', () => {
  it('explainCategory returns correct counts for each category', () => {
    const recs = [
      makeRec({ id: 'R1', category: CATEGORIES.REMEDIATION, priority: 'critical' }),
      makeRec({ id: 'R2', category: CATEGORIES.REMEDIATION, priority: 'high' }),
      makeRec({ id: 'I1', category: CATEGORIES.INVESTIGATION, priority: 'medium' }),
      makeRec({ id: 'I2', category: CATEGORIES.INVESTIGATION, priority: 'low' }),
      makeRec({ id: 'P1', category: CATEGORIES.PREVENTION, priority: 'low' }),
    ];
    const collection = makeCollection(recs);
    const remediation = explainCategory(collection, CATEGORIES.REMEDIATION);
    expect(remediation.recommendationCount).toBe(2);
    expect(remediation.priorityDistribution.critical).toBe(1);
    expect(remediation.priorityDistribution.high).toBe(1);

    const investigation = explainCategory(collection, CATEGORIES.INVESTIGATION);
    expect(investigation.recommendationCount).toBe(2);
    expect(investigation.priorityDistribution.medium).toBe(1);
    expect(investigation.priorityDistribution.low).toBe(1);

    const prevention = explainCategory(collection, CATEGORIES.PREVENTION);
    expect(prevention.recommendationCount).toBe(1);
  });
});

// ── Traceability Preservation ──

describe('traceability preservation', () => {
  it('explainRecommendation preserves all reference types', () => {
    const rec = makeRec({
      id: 'TRACE',
      references: Object.freeze([
        Object.freeze({
          sourceType: SOURCE_TYPES.RULE,
          sourceId: 'rule-001',
          sourceName: 'Rule One',
        }),
        Object.freeze({
          sourceType: SOURCE_TYPES.CORRELATION,
          sourceId: 'corr-001',
          sourceName: 'Corr One',
        }),
        Object.freeze({
          sourceType: SOURCE_TYPES.EVIDENCE,
          sourceId: 'ev-001',
          sourceName: 'Ev One',
        }),
      ]),
    });
    const input = makeInput({
      ruleMatchIds: ['rule-001'],
      correlationIds: ['corr-001'],
      evidenceIds: ['ev-001'],
    });
    const explanation = explainRecommendation(rec, input);
    expect(explanation.matchedRuleIds).toEqual(['rule-001']);
    expect(explanation.matchedCorrelationIds).toEqual(['corr-001']);
    expect(explanation.matchedEvidenceIds).toEqual(['ev-001']);
    expect(explanation.matchReasons.length).toBe(3);
  });
});

// ── Registry Compatibility ──

describe('registry compatibility', () => {
  it('explainRecommendation works with built-in recommendations', () => {
    const registry = createRecommendationRegistry();
    registry.registerMany(BUILT_IN_RECOMMENDATIONS);
    const tr01 = registry.get('TR-01')!;
    const input = makeInput({ ruleMatchIds: ['rule_TR-01'] });
    const explanation = explainRecommendation(tr01, input);
    expect(explanation.recommendation.id).toBe('TR-01');
    expect(explanation.matchedRuleIds).toContain('rule_TR-01');
  });
});

// ── Engine Compatibility ──

describe('engine compatibility', () => {
  it('explainer works with engine output', () => {
    const registry = createRecommendationRegistry();
    registry.registerMany(BUILT_IN_RECOMMENDATIONS);
    const engine = createRecommendationEngine({
      registry,
      generatedAt: '2024-01-01T00:00:00.000Z',
    });
    const allIds = BUILT_IN_RECOMMENDATIONS.map((r) => `rule_${r.id}`);
    const result = engine.evaluate(makeInput({ ruleMatchIds: allIds }));

    const first = result.recommendations.items[0];
    const explanation = explainRecommendation(first, makeInput({ ruleMatchIds: allIds }));
    expect(explanation.recommendation.id).toBe(first.id);

    const breakdown = breakdownByCategory(result.recommendations);
    expect(breakdown.totalCount).toBe(BUILT_IN_RECOMMENDATIONS.length);
    expect(breakdown.categories.length).toBeGreaterThan(1);

    const top = topRecommendations(result.recommendations, 3);
    expect(top.length).toBe(3);
  });
});

// ── Determinism (10,000 cumulative executions) ──

describe('determinism (10,000 cumulative executions)', () => {
  it('explainRecommendation is deterministic across 10,000 runs', () => {
    const rec = makeRec({
      id: 'DET-EXP',
      references: Object.freeze([
        Object.freeze({ sourceType: SOURCE_TYPES.RULE, sourceId: 'rule-det', sourceName: 'Det' }),
      ]),
    });
    const input = makeInput({ ruleMatchIds: ['rule-det'] });

    const first = explainRecommendation(rec, input);
    const firstJson = JSON.stringify(first);

    for (let i = 0; i < 10000; i++) {
      const result = explainRecommendation(rec, input);
      expect(JSON.stringify(result)).toBe(firstJson);
    }
  });

  it('explainCategory is deterministic across 10,000 runs', () => {
    const rec = makeRec({ id: 'DET-CAT', category: CATEGORIES.REMEDIATION });
    const collection = makeCollection([rec]);

    const first = explainCategory(collection, CATEGORIES.REMEDIATION);
    const firstJson = JSON.stringify(first);

    for (let i = 0; i < 10000; i++) {
      const result = explainCategory(collection, CATEGORIES.REMEDIATION);
      expect(JSON.stringify(result)).toBe(firstJson);
    }
  });

  it('breakdownByCategory is deterministic across 10,000 runs', () => {
    const recs = [
      makeRec({ id: 'A', category: CATEGORIES.REMEDIATION }),
      makeRec({ id: 'B', category: CATEGORIES.INVESTIGATION }),
    ];
    const collection = makeCollection(recs);

    const first = breakdownByCategory(collection);
    const firstJson = JSON.stringify(first);

    for (let i = 0; i < 10000; i++) {
      const result = breakdownByCategory(collection);
      expect(JSON.stringify(result)).toBe(firstJson);
    }
  });

  it('topRecommendations is deterministic across 10,000 runs', () => {
    const recs = [
      makeRec({ id: 'A', priority: 'critical' }),
      makeRec({ id: 'B', priority: 'high' }),
      makeRec({ id: 'C', priority: 'medium' }),
    ];
    const collection = makeCollection(recs);

    const first = topRecommendations(collection, 2);
    const firstJson = JSON.stringify(first);

    for (let i = 0; i < 10000; i++) {
      const result = topRecommendations(collection, 2);
      expect(JSON.stringify(result)).toBe(firstJson);
    }
  });
});

// ── Stability ──

describe('stability', () => {
  it('recommendations in category explanation preserve order', () => {
    const recs = [
      makeRec({ id: 'LOW', priority: 'low', category: CATEGORIES.REMEDIATION }),
      makeRec({ id: 'CRIT', priority: 'critical', category: CATEGORIES.REMEDIATION }),
      makeRec({ id: 'HIGH', priority: 'high', category: CATEGORIES.REMEDIATION }),
    ];
    const collection = makeCollection(recs);
    const explanation = explainCategory(collection, CATEGORIES.REMEDIATION);
    expect(explanation.recommendations[0].id).toBe('CRIT');
    expect(explanation.recommendations[1].id).toBe('HIGH');
    expect(explanation.recommendations[2].id).toBe('LOW');
  });
});
