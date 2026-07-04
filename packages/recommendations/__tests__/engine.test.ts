/**
 * Tests for @veris/recommendations recommendation engine.
 *
 * @module @veris/recommendations/__tests__/engine
 */

import { describe, it, expect } from 'vitest';
import {
  createRecommendationEngine,
  createRecommendationRegistry,
  BUILT_IN_RECOMMENDATIONS,
  SCHEMA_VERSION,
  ENGINE_VERSION,
  CATEGORIES,
  ACTIONS,
  SOURCE_TYPES,
  PRIORITY_ORDER,
  PRIORITY_RANK,
} from '../src/index.js';

import type { RecommendationInput, Recommendation } from '../src/types.js';
import { makeRec } from './helpers.js';

// ── Test Helpers ──

/** Create a minimal valid input for testing. */
function makeInput(overrides?: Partial<RecommendationInput>): RecommendationInput {
  return {
    riskAssessmentId: overrides?.riskAssessmentId ?? 'ra_test',
    sessionId: overrides?.sessionId ?? 'session-test',
    artifactId: overrides?.artifactId ?? 'artifact-test.exe',
    ruleMatchIds: overrides?.ruleMatchIds ?? ['rule_TEST-01'],
    correlationIds: overrides?.correlationIds ?? [],
    evidenceIds: overrides?.evidenceIds ?? [],
  };
}

// ── Engine Construction ──

describe('engine construction', () => {
  it('creates an engine with a registry', () => {
    const registry = createRecommendationRegistry();
    const engine = createRecommendationEngine({ registry });
    expect(engine).toBeDefined();
    expect(typeof engine.evaluate).toBe('function');
  });

  it('throws TypeError when registry is missing', () => {
    expect(() => {
      createRecommendationEngine({} as any);
    }).toThrow(TypeError);
  });

  it('throws TypeError when options is null', () => {
    expect(() => {
      createRecommendationEngine(null as any);
    }).toThrow(TypeError);
  });

  it('throws TypeError when options is undefined', () => {
    expect(() => {
      createRecommendationEngine(undefined as any);
    }).toThrow(TypeError);
  });
});

// ── Empty Input ──

describe('empty input', () => {
  it('returns empty result when input is valid but no IDs match', () => {
    const registry = createRecommendationRegistry();
    registry.register(makeRec({ id: 'TEST-01' }));
    const engine = createRecommendationEngine({ registry });
    const result = engine.evaluate(makeInput({ ruleMatchIds: ['non-existent'] }));
    expect(result.recommendations.items).toEqual([]);
    expect(result.recommendations.totalCount).toBe(0);
    expect(result.totalCount).toBe(0);
  });

  it('returns empty result when input has no IDs at all', () => {
    const registry = createRecommendationRegistry();
    registry.register(makeRec({ id: 'TEST-01' }));
    const engine = createRecommendationEngine({ registry });
    const result = engine.evaluate(
      makeInput({
        ruleMatchIds: [],
        correlationIds: [],
        evidenceIds: [],
      }),
    );
    expect(result.recommendations.items).toEqual([]);
    expect(result.recommendations.totalCount).toBe(0);
  });

  it('throws TypeError for null input', () => {
    const registry = createRecommendationRegistry();
    const engine = createRecommendationEngine({ registry });
    expect(() => {
      engine.evaluate(null as any);
    }).toThrow(TypeError);
  });

  it('throws TypeError for undefined input', () => {
    const registry = createRecommendationRegistry();
    const engine = createRecommendationEngine({ registry });
    expect(() => {
      engine.evaluate(undefined as any);
    }).toThrow(TypeError);
  });

  it('empty registry returns empty result', () => {
    const registry = createRecommendationRegistry();
    const engine = createRecommendationEngine({ registry });
    const result = engine.evaluate(makeInput({ ruleMatchIds: ['rule_TEST'] }));
    expect(result.recommendations.items).toEqual([]);
    expect(result.totalCount).toBe(0);
  });
});

// ── Single Recommendation ──

describe('single recommendation', () => {
  it('returns a single matching recommendation', () => {
    const registry = createRecommendationRegistry();
    registry.register(
      makeRec({
        id: 'TEST-01',
        references: Object.freeze([
          Object.freeze({
            sourceType: SOURCE_TYPES.RULE,
            sourceId: 'rule-TEST-01',
            sourceName: 'Test',
          }),
        ]),
      }),
    );
    const engine = createRecommendationEngine({ registry });
    const result = engine.evaluate(
      makeInput({
        ruleMatchIds: ['rule-TEST-01'],
      }),
    );
    expect(result.recommendations.totalCount).toBe(1);
    expect(result.recommendations.items[0].id).toBe('TEST-01');
  });

  it('result contains expected fields', () => {
    const registry = createRecommendationRegistry();
    registry.register(
      makeRec({
        id: 'TEST-01',
        references: Object.freeze([
          Object.freeze({
            sourceType: SOURCE_TYPES.RULE,
            sourceId: 'rule-TEST-01',
            sourceName: 'Test',
          }),
        ]),
      }),
    );
    const engine = createRecommendationEngine({
      registry,
      generatedAt: '2024-01-01T00:00:00.000Z',
    });
    const result = engine.evaluate(
      makeInput({
        sessionId: 'sess-01',
        artifactId: 'art-01.exe',
        riskAssessmentId: 'ra-001',
        ruleMatchIds: ['rule-TEST-01'],
      }),
    );
    expect(result.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result.engineVersion).toBe(ENGINE_VERSION);
    expect(result.sessionId).toBe('sess-01');
    expect(result.artifactId).toBe('art-01.exe');
    expect(result.generatedAt).toBe('2024-01-01T00:00:00.000Z');
    expect(result.recommendations.truncated).toBe(false);
  });
});

// ── Multiple Recommendations ──

describe('multiple recommendations', () => {
  it('returns multiple matching recommendations', () => {
    const registry = createRecommendationRegistry();
    registry.register(
      makeRec({
        id: 'TEST-01',
        references: Object.freeze([
          Object.freeze({
            sourceType: SOURCE_TYPES.RULE,
            sourceId: 'rule-001',
            sourceName: 'R1',
          }),
        ]),
      }),
    );
    registry.register(
      makeRec({
        id: 'TEST-02',
        references: Object.freeze([
          Object.freeze({
            sourceType: SOURCE_TYPES.RULE,
            sourceId: 'rule-002',
            sourceName: 'R2',
          }),
        ]),
      }),
    );
    const engine = createRecommendationEngine({ registry });
    const result = engine.evaluate(
      makeInput({
        ruleMatchIds: ['rule-001', 'rule-002'],
      }),
    );
    expect(result.recommendations.totalCount).toBe(2);
    expect(result.recommendations.items.map((r) => r.id)).toContain('TEST-01');
    expect(result.recommendations.items.map((r) => r.id)).toContain('TEST-02');
  });

  it('can match by correlation IDs', () => {
    const registry = createRecommendationRegistry();
    registry.register(
      makeRec({
        id: 'CORR-MATCH',
        references: Object.freeze([
          Object.freeze({
            sourceType: SOURCE_TYPES.CORRELATION,
            sourceId: 'corr-001',
            sourceName: 'C1',
          }),
        ]),
      }),
    );
    const engine = createRecommendationEngine({ registry });
    const result = engine.evaluate(
      makeInput({
        correlationIds: ['corr-001'],
        ruleMatchIds: [],
      }),
    );
    expect(result.recommendations.totalCount).toBe(1);
    expect(result.recommendations.items[0].id).toBe('CORR-MATCH');
  });

  it('can match by evidence IDs', () => {
    const registry = createRecommendationRegistry();
    registry.register(
      makeRec({
        id: 'EVID-MATCH',
        references: Object.freeze([
          Object.freeze({
            sourceType: SOURCE_TYPES.EVIDENCE,
            sourceId: 'ev-001',
            sourceName: 'E1',
          }),
        ]),
      }),
    );
    const engine = createRecommendationEngine({ registry });
    const result = engine.evaluate(
      makeInput({
        evidenceIds: ['ev-001'],
        ruleMatchIds: [],
      }),
    );
    expect(result.recommendations.totalCount).toBe(1);
    expect(result.recommendations.items[0].id).toBe('EVID-MATCH');
  });
});

// ── Duplicate Source Matching ──

describe('duplicate recommendation sources', () => {
  it('deduplicates recommendations matched by multiple sources', () => {
    const registry = createRecommendationRegistry();
    registry.register(
      makeRec({
        id: 'MULTI-MATCH',
        references: Object.freeze([
          Object.freeze({ sourceType: SOURCE_TYPES.RULE, sourceId: 'rule-001', sourceName: 'R1' }),
          Object.freeze({
            sourceType: SOURCE_TYPES.EVIDENCE,
            sourceId: 'ev-001',
            sourceName: 'E1',
          }),
        ]),
      }),
    );
    const engine = createRecommendationEngine({ registry });
    const result = engine.evaluate(
      makeInput({
        ruleMatchIds: ['rule-001'],
        evidenceIds: ['ev-001'],
      }),
    );
    expect(result.recommendations.totalCount).toBe(1);
    expect(result.recommendations.items[0].id).toBe('MULTI-MATCH');
  });
});

// ── Stable Ordering ──

describe('stable ordering', () => {
  it('sorts by priority (critical before high, etc.)', () => {
    const registry = createRecommendationRegistry();
    registry.register(
      makeRec({
        id: 'LOW',
        priority: 'low',
        references: Object.freeze([
          Object.freeze({ sourceType: SOURCE_TYPES.RULE, sourceId: 'rule-all', sourceName: 'All' }),
        ]),
      }),
    );
    registry.register(
      makeRec({
        id: 'HIGH',
        priority: 'high',
        references: Object.freeze([
          Object.freeze({ sourceType: SOURCE_TYPES.RULE, sourceId: 'rule-all', sourceName: 'All' }),
        ]),
      }),
    );
    registry.register(
      makeRec({
        id: 'CRIT',
        priority: 'critical',
        references: Object.freeze([
          Object.freeze({ sourceType: SOURCE_TYPES.RULE, sourceId: 'rule-all', sourceName: 'All' }),
        ]),
      }),
    );
    const engine = createRecommendationEngine({ registry });
    const result = engine.evaluate(makeInput({ ruleMatchIds: ['rule-all'] }));
    const ids = result.recommendations.items.map((r) => r.id);
    expect(ids[0]).toBe('CRIT');
    expect(ids[1]).toBe('HIGH');
    expect(ids[2]).toBe('LOW');
  });

  it('sorts by category within same priority', () => {
    const registry = createRecommendationRegistry();
    registry.register(
      makeRec({
        id: 'B',
        priority: 'medium',
        category: 'remediation' as any,
        references: Object.freeze([
          Object.freeze({ sourceType: SOURCE_TYPES.RULE, sourceId: 'rule-all', sourceName: 'All' }),
        ]),
      }),
    );
    registry.register(
      makeRec({
        id: 'A',
        priority: 'medium',
        category: 'investigation' as any,
        references: Object.freeze([
          Object.freeze({ sourceType: SOURCE_TYPES.RULE, sourceId: 'rule-all', sourceName: 'All' }),
        ]),
      }),
    );
    const engine = createRecommendationEngine({ registry });
    const result = engine.evaluate(makeInput({ ruleMatchIds: ['rule-all'] }));
    const items = result.recommendations.items;
    expect(items[0].id).toBe('A');
    expect(items[1].id).toBe('B');
  });

  it('sorts by ID within same priority and category', () => {
    const registry = createRecommendationRegistry();
    registry.register(
      makeRec({
        id: 'Z-REC',
        priority: 'medium',
        references: Object.freeze([
          Object.freeze({ sourceType: SOURCE_TYPES.RULE, sourceId: 'rule-all', sourceName: 'All' }),
        ]),
      }),
    );
    registry.register(
      makeRec({
        id: 'A-REC',
        priority: 'medium',
        references: Object.freeze([
          Object.freeze({ sourceType: SOURCE_TYPES.RULE, sourceId: 'rule-all', sourceName: 'All' }),
        ]),
      }),
    );
    const engine = createRecommendationEngine({ registry });
    const result = engine.evaluate(makeInput({ ruleMatchIds: ['rule-all'] }));
    expect(result.recommendations.items[0].id).toBe('A-REC');
    expect(result.recommendations.items[1].id).toBe('Z-REC');
  });

  it('priority ordering is consistent with PRIORITY_RANK', () => {
    const registry = createRecommendationRegistry();
    registry.register(
      makeRec({
        id: 'L',
        priority: 'low',
        references: Object.freeze([
          Object.freeze({ sourceType: SOURCE_TYPES.RULE, sourceId: 'rule-all', sourceName: 'All' }),
        ]),
      }),
    );
    registry.register(
      makeRec({
        id: 'M',
        priority: 'medium',
        references: Object.freeze([
          Object.freeze({ sourceType: SOURCE_TYPES.RULE, sourceId: 'rule-all', sourceName: 'All' }),
        ]),
      }),
    );
    registry.register(
      makeRec({
        id: 'H',
        priority: 'high',
        references: Object.freeze([
          Object.freeze({ sourceType: SOURCE_TYPES.RULE, sourceId: 'rule-all', sourceName: 'All' }),
        ]),
      }),
    );
    registry.register(
      makeRec({
        id: 'C',
        priority: 'critical',
        references: Object.freeze([
          Object.freeze({ sourceType: SOURCE_TYPES.RULE, sourceId: 'rule-all', sourceName: 'All' }),
        ]),
      }),
    );
    const engine = createRecommendationEngine({ registry });
    const result = engine.evaluate(makeInput({ ruleMatchIds: ['rule-all'] }));
    const items = result.recommendations.items;
    for (let i = 1; i < items.length; i++) {
      const prev = PRIORITY_RANK[items[i - 1].priority];
      const curr = PRIORITY_RANK[items[i].priority];
      expect(prev).toBeLessThanOrEqual(curr);
    }
  });
});

// ── Frozen Outputs ──

describe('frozen outputs', () => {
  it('top-level result is frozen', () => {
    const registry = createRecommendationRegistry();
    const engine = createRecommendationEngine({ registry });
    const result = engine.evaluate(makeInput({ ruleMatchIds: [] }));
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('recommendations collection is frozen', () => {
    const registry = createRecommendationRegistry();
    const engine = createRecommendationEngine({ registry });
    const result = engine.evaluate(makeInput({ ruleMatchIds: [] }));
    expect(Object.isFrozen(result.recommendations)).toBe(true);
  });

  it('recommendations items array is frozen', () => {
    const registry = createRecommendationRegistry();
    const engine = createRecommendationEngine({ registry });
    const result = engine.evaluate(makeInput({ ruleMatchIds: [] }));
    expect(Object.isFrozen(result.recommendations.items)).toBe(true);
  });

  it('recommendations counts object is frozen', () => {
    const registry = createRecommendationRegistry();
    const engine = createRecommendationEngine({ registry });
    const result = engine.evaluate(makeInput({ ruleMatchIds: [] }));
    expect(Object.isFrozen(result.recommendations.counts)).toBe(true);
  });
});

// ── Priority Counts ──

describe('priority counts', () => {
  it('counts critical recommendations correctly', () => {
    const registry = createRecommendationRegistry();
    registry.register(
      makeRec({
        id: 'C1',
        priority: 'critical',
        references: Object.freeze([
          Object.freeze({ sourceType: SOURCE_TYPES.RULE, sourceId: 'rule-all', sourceName: 'All' }),
        ]),
      }),
    );
    registry.register(
      makeRec({
        id: 'C2',
        priority: 'critical',
        references: Object.freeze([
          Object.freeze({ sourceType: SOURCE_TYPES.RULE, sourceId: 'rule-all', sourceName: 'All' }),
        ]),
      }),
    );
    const engine = createRecommendationEngine({ registry });
    const result = engine.evaluate(makeInput({ ruleMatchIds: ['rule-all'] }));
    expect(result.recommendations.counts.critical).toBe(2);
    expect(result.recommendations.counts.high).toBe(0);
    expect(result.recommendations.counts.medium).toBe(0);
    expect(result.recommendations.counts.low).toBe(0);
  });

  it('counts all priority levels correctly', () => {
    const registry = createRecommendationRegistry();
    for (const priority of PRIORITY_ORDER) {
      registry.register(
        makeRec({
          id: `P-${priority}`,
          priority,
          references: Object.freeze([
            Object.freeze({
              sourceType: SOURCE_TYPES.RULE,
              sourceId: 'rule-all',
              sourceName: 'All',
            }),
          ]),
        }),
      );
    }
    const engine = createRecommendationEngine({ registry });
    const result = engine.evaluate(makeInput({ ruleMatchIds: ['rule-all'] }));
    expect(result.recommendations.counts.critical).toBe(1);
    expect(result.recommendations.counts.high).toBe(1);
    expect(result.recommendations.counts.medium).toBe(1);
    expect(result.recommendations.counts.low).toBe(1);
  });
});

// ── Recommendation Limit ──

describe('recommendation limit handling', () => {
  it('respects maxRecommendations option', () => {
    const registry = createRecommendationRegistry();
    for (let i = 0; i < 10; i++) {
      registry.register(
        makeRec({
          id: `LIMIT-${String(i).padStart(2, '0')}`,
          references: Object.freeze([
            Object.freeze({
              sourceType: SOURCE_TYPES.RULE,
              sourceId: 'rule-all',
              sourceName: 'All',
            }),
          ]),
        }),
      );
    }
    const engine = createRecommendationEngine({ registry, maxRecommendations: 3 });
    const result = engine.evaluate(makeInput({ ruleMatchIds: ['rule-all'] }));
    expect(result.recommendations.totalCount).toBe(3);
    expect(result.recommendations.truncated).toBe(true);
  });

  it('does not truncate when count is within limit', () => {
    const registry = createRecommendationRegistry();
    registry.register(
      makeRec({
        id: 'ONLY',
        references: Object.freeze([
          Object.freeze({ sourceType: SOURCE_TYPES.RULE, sourceId: 'rule-all', sourceName: 'All' }),
        ]),
      }),
    );
    const engine = createRecommendationEngine({ registry, maxRecommendations: 100 });
    const result = engine.evaluate(makeInput({ ruleMatchIds: ['rule-all'] }));
    expect(result.recommendations.truncated).toBe(false);
    expect(result.recommendations.totalCount).toBe(1);
  });

  it('default maxRecommendations is 100', () => {
    const registry = createRecommendationRegistry();
    for (let i = 0; i < 150; i++) {
      registry.register(
        makeRec({
          id: `DEF-${String(i).padStart(3, '0')}`,
          references: Object.freeze([
            Object.freeze({
              sourceType: SOURCE_TYPES.RULE,
              sourceId: 'rule-all',
              sourceName: 'All',
            }),
          ]),
        }),
      );
    }
    const engine = createRecommendationEngine({ registry });
    const result = engine.evaluate(makeInput({ ruleMatchIds: ['rule-all'] }));
    expect(result.recommendations.totalCount).toBe(100);
    expect(result.recommendations.truncated).toBe(true);
  });
});

// ── Serialization ──

describe('serialization compatibility', () => {
  it('result serializes to JSON', () => {
    const registry = createRecommendationRegistry();
    registry.register(
      makeRec({
        id: 'JSON',
        references: Object.freeze([
          Object.freeze({
            sourceType: SOURCE_TYPES.RULE,
            sourceId: 'rule-json',
            sourceName: 'JSON',
          }),
        ]),
      }),
    );
    const engine = createRecommendationEngine({
      registry,
      generatedAt: '2024-06-01T00:00:00.000Z',
    });
    const result = engine.evaluate(makeInput({ ruleMatchIds: ['rule-json'] }));
    const serialized = JSON.parse(JSON.stringify(result));
    expect(serialized.schemaVersion).toBe(SCHEMA_VERSION);
    expect(serialized.sessionId).toBe('session-test');
    expect(serialized.totalCount).toBe(1);
    expect(serialized.recommendations.items.length).toBe(1);
    expect(serialized.recommendations.items[0].id).toBe('JSON');
  });

  it('empty result serializes to JSON', () => {
    const registry = createRecommendationRegistry();
    const engine = createRecommendationEngine({
      registry,
      generatedAt: '2024-01-01T00:00:00.000Z',
    });
    const result = engine.evaluate(makeInput({ ruleMatchIds: [] }));
    const serialized = JSON.parse(JSON.stringify(result));
    expect(serialized.totalCount).toBe(0);
    expect(serialized.recommendations.items).toEqual([]);
  });
});

// ── Determinism (10,000 cumulative executions) ──

describe('determinism (10,000 cumulative executions)', () => {
  it('same input produces same result (10,000 iterations)', () => {
    const registry = createRecommendationRegistry();
    registry.register(
      makeRec({
        id: 'DET',
        priority: 'high',
        references: Object.freeze([
          Object.freeze({ sourceType: SOURCE_TYPES.RULE, sourceId: 'rule-det', sourceName: 'Det' }),
        ]),
      }),
    );

    let previousResult: string | null = null;
    for (let i = 0; i < 10000; i++) {
      const engine = createRecommendationEngine({
        registry,
        generatedAt: '2024-01-01T00:00:00.000Z',
      });
      const result = engine.evaluate(makeInput({ ruleMatchIds: ['rule-det'] }));
      const serialized = JSON.stringify(result);

      if (previousResult === null) {
        previousResult = serialized;
      } else {
        expect(serialized).toBe(previousResult);
      }
    }
  });

  it('10,000 evaluations produce same stable ordering', () => {
    const registry = createRecommendationRegistry();
    for (const priority of PRIORITY_ORDER) {
      for (let j = 0; j < 3; j++) {
        registry.register(
          makeRec({
            id: `${priority}-${j}`,
            priority,
            references: Object.freeze([
              Object.freeze({
                sourceType: SOURCE_TYPES.RULE,
                sourceId: 'rule-all',
                sourceName: 'All',
              }),
            ]),
          }),
        );
      }
    }

    const engine = createRecommendationEngine({
      registry,
      generatedAt: '2024-01-01T00:00:00.000Z',
    });

    const firstResult = engine.evaluate(makeInput({ ruleMatchIds: ['rule-all'] }));
    const firstIds = firstResult.recommendations.items.map((r) => r.id);

    for (let i = 0; i < 10000; i++) {
      const result = engine.evaluate(makeInput({ ruleMatchIds: ['rule-all'] }));
      const ids = result.recommendations.items.map((r) => r.id);
      expect(ids).toEqual(firstIds);
    }
  });

  it('10,000 empty evaluations are stable', () => {
    for (let i = 0; i < 10000; i++) {
      const registry = createRecommendationRegistry();
      const engine = createRecommendationEngine({
        registry,
        generatedAt: '2024-01-01T00:00:00.000Z',
      });
      const result = engine.evaluate(makeInput({ ruleMatchIds: [] }));
      expect(result.recommendations.totalCount).toBe(0);
      expect(result.totalCount).toBe(0);
      expect(result.recommendations.truncated).toBe(false);
    }
  });
});

// ── Registry Integration ──

describe('registry integration', () => {
  it('works with a registry containing built-in recommendations', () => {
    const registry = createRecommendationRegistry();
    registry.registerMany(BUILT_IN_RECOMMENDATIONS);
    const engine = createRecommendationEngine({ registry });
    const result = engine.evaluate(makeInput({ ruleMatchIds: ['rule_TR-01'] }));
    expect(result.recommendations.totalCount).toBe(1);
    expect(result.recommendations.items[0].id).toBe('TR-01');
  });

  it('result counts match built-in recommendation priorities', () => {
    const registry = createRecommendationRegistry();
    registry.registerMany(BUILT_IN_RECOMMENDATIONS);

    const allIds = BUILT_IN_RECOMMENDATIONS.map((r) => `rule_${r.id}`);
    const engine = createRecommendationEngine({ registry });
    const result = engine.evaluate(makeInput({ ruleMatchIds: allIds }));

    const expectedCritical = BUILT_IN_RECOMMENDATIONS.filter(
      (r) => r.priority === 'critical',
    ).length;
    const expectedHigh = BUILT_IN_RECOMMENDATIONS.filter((r) => r.priority === 'high').length;
    const expectedMedium = BUILT_IN_RECOMMENDATIONS.filter((r) => r.priority === 'medium').length;
    const expectedLow = BUILT_IN_RECOMMENDATIONS.filter((r) => r.priority === 'low').length;

    expect(result.recommendations.counts.critical).toBe(expectedCritical);
    expect(result.recommendations.counts.high).toBe(expectedHigh);
    expect(result.recommendations.counts.medium).toBe(expectedMedium);
    expect(result.recommendations.counts.low).toBe(expectedLow);
  });

  it('can match built-in recommendations by correlation sources', () => {
    const registry = createRecommendationRegistry();
    registry.registerMany(BUILT_IN_RECOMMENDATIONS);
    registry.register(
      makeRec({
        id: 'CUSTOM-CORR',
        references: Object.freeze([
          Object.freeze({
            sourceType: SOURCE_TYPES.CORRELATION,
            sourceId: 'corr-chain-001',
            sourceName: 'Chain',
          }),
        ]),
      }),
    );
    const engine = createRecommendationEngine({ registry });
    const result = engine.evaluate(
      makeInput({
        ruleMatchIds: [],
        correlationIds: ['corr-chain-001'],
      }),
    );
    expect(result.recommendations.totalCount).toBe(1);
    expect(result.recommendations.items[0].id).toBe('CUSTOM-CORR');
  });
});

// ── Stable IDs ──

describe('stable IDs', () => {
  it('same input produces same result ID', () => {
    const registry = createRecommendationRegistry();
    const engine1 = createRecommendationEngine({
      registry,
      generatedAt: '2024-01-01T00:00:00.000Z',
    });
    const engine2 = createRecommendationEngine({
      registry,
      generatedAt: '2024-01-01T00:00:00.000Z',
    });
    const input = makeInput({ sessionId: 'stable-session', ruleMatchIds: [] });
    const result1 = engine1.evaluate(input);
    const result2 = engine2.evaluate(input);
    expect(result1.id).toBe(result2.id);
  });

  it('different inputs produce different result IDs', () => {
    const registry = createRecommendationRegistry();
    const engine = createRecommendationEngine({
      registry,
      generatedAt: '2024-01-01T00:00:00.000Z',
    });
    const result1 = engine.evaluate(makeInput({ sessionId: 'sess-A', ruleMatchIds: [] }));
    const result2 = engine.evaluate(makeInput({ sessionId: 'sess-B', ruleMatchIds: [] }));
    expect(result1.id).not.toBe(result2.id);
  });
});

// ── Edge Cases ──

describe('edge cases', () => {
  it('handles large number of recommendations', () => {
    const registry = createRecommendationRegistry();
    for (let i = 0; i < 200; i++) {
      registry.register(
        makeRec({
          id: `LARGE-${String(i).padStart(3, '0')}`,
          priority: i < 50 ? 'high' : i < 100 ? 'medium' : 'low',
        }),
      );
    }
    const engine = createRecommendationEngine({ registry, maxRecommendations: 50 });
    const result = engine.evaluate(
      makeInput({
        ruleMatchIds: Array.from(
          { length: 200 },
          (_, i) => `rule_LARGE-${String(i).padStart(3, '0')}`,
        ),
      }),
    );
    expect(result.recommendations.totalCount).toBe(50);
    expect(result.recommendations.truncated).toBe(true);
  });

  it('matching by ruleMatchIds only', () => {
    const registry = createRecommendationRegistry();
    registry.register(
      makeRec({
        id: 'RULE-ONLY',
        references: Object.freeze([
          Object.freeze({
            sourceType: SOURCE_TYPES.RULE,
            sourceId: 'rule-specific',
            sourceName: 'Specific',
          }),
        ]),
      }),
    );
    const engine = createRecommendationEngine({ registry });
    const result = engine.evaluate(
      makeInput({
        ruleMatchIds: ['rule-specific'],
        correlationIds: [],
        evidenceIds: [],
      }),
    );
    expect(result.recommendations.totalCount).toBe(1);
  });

  it('matching by correlationIds only', () => {
    const registry = createRecommendationRegistry();
    registry.register(
      makeRec({
        id: 'CORR-ONLY',
        references: Object.freeze([
          Object.freeze({
            sourceType: SOURCE_TYPES.CORRELATION,
            sourceId: 'corr-specific',
            sourceName: 'Specific',
          }),
        ]),
      }),
    );
    const engine = createRecommendationEngine({ registry });
    const result = engine.evaluate(
      makeInput({
        ruleMatchIds: [],
        correlationIds: ['corr-specific'],
        evidenceIds: [],
      }),
    );
    expect(result.recommendations.totalCount).toBe(1);
  });

  it('matching by evidenceIds only', () => {
    const registry = createRecommendationRegistry();
    registry.register(
      makeRec({
        id: 'EVID-ONLY',
        references: Object.freeze([
          Object.freeze({
            sourceType: SOURCE_TYPES.EVIDENCE,
            sourceId: 'ev-specific',
            sourceName: 'Specific',
          }),
        ]),
      }),
    );
    const engine = createRecommendationEngine({ registry });
    const result = engine.evaluate(
      makeInput({
        ruleMatchIds: [],
        correlationIds: [],
        evidenceIds: ['ev-specific'],
      }),
    );
    expect(result.recommendations.totalCount).toBe(1);
  });
});
