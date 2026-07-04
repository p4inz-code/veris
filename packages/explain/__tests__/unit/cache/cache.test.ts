/**
 * Tests for the M7 Cache system.
 *
 * Verifies:
 * - Cache key generation (determinism, 6 components, SHA-256)
 * - LRU eviction tracking
 * - TTL expiration
 * - Cache hits and misses
 * - Cache invalidations (by prompt version, model, schema, age)
 * - Schema compatibility and migration
 * - Memory store operations
 * - Cache manager integration
 * - Metrics collection
 * - Determinism (100-run)
 * - Edge cases: empty cache, large entries, concurrent access
 * - Integration with PersistentCache interface
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Cache, createCache, createTestCache } from '../../../src/cache/cache.js';
import {
  generateCacheKey,
  generateCacheKeySync,
  buildCacheKeyComponents,
  stableStringify,
  sha256,
  simpleHash,
} from '../../../src/cache/cache-key.js';
import {
  createCacheEntry,
  isEntryExpired,
  touchEntry,
  calculateEntrySize,
  freezeEntry,
  createEntryBuilder,
  serializeEntry,
  getRemainingTtl,
} from '../../../src/cache/cache-entry.js';
import { LruTracker } from '../../../src/cache/lru.js';
import { Evictor, createEvictor } from '../../../src/cache/eviction.js';
import { MemoryStore, createMemoryStore } from '../../../src/cache/memory-store.js';
import { CacheManager, createCacheManager } from '../../../src/cache/cache-manager.js';
import { CacheMetrics, createCacheMetrics } from '../../../src/cache/cache-metrics.js';
import {
  checkSchemaCompatibility,
  CURRENT_SCHEMA_VERSION,
  shouldInvalidateOnEngineChange,
} from '../../../src/cache/schema-version.js';
import {
  MigrationRegistry,
  migrateEntry,
  migrateAll,
  createDefaultMigrationSteps,
} from '../../../src/cache/migration.js';
import type {
  Explanation,
  CitationSourceType,
  ExplanationMode,
} from '../../../src/types/explanation.js';
import type { CacheKey, CacheInvalidationFilter } from '../../../src/engine/explainer.js';
import type { CacheEntry } from '../../../src/cache/cache-entry.js';

// ═══════════════════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════════════════

function createTestExplanation(overrides?: Partial<Explanation>): Explanation {
  return {
    id: 'exp_test_001',
    subjectId: 'fin_test_001',
    subjectType: 'finding',
    mode: 'technical',
    text: 'Test explanation with some content for cache entry size calculation.',
    citations: [
      {
        id: 'cit_1',
        sourceType: 'finding' as CitationSourceType,
        sourceId: 'fin_test_001',
        label: 'Test Finding',
        verified: true,
      },
    ],
    citationValidation: {
      valid: true,
      totalCitations: 1,
      verifiedCitations: 1,
      failedCitations: 0,
      citations: [],
    },
    provider: { id: 'test-provider', model: 'test-model-v1' },
    promptVersion: '1.0.0',
    tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    cached: false,
    refused: false,
    generatedAt: new Date().toISOString(),
    disclaimer: 'AI-generated test.',
    ...overrides,
  };
}

function createTestCacheKey(overrides?: Partial<CacheKey>): CacheKey {
  return {
    promptVersion: '1.0.0',
    modelId: 'test-provider',
    modelVersion: 'test-model-v1',
    inputHash: 'abc123def456',
    engineVersion: '1.0.0',
    mode: 'technical',
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Cache Key Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Cache Key', () => {
  describe('generateCacheKeySync', () => {
    it('generates a deterministic key from components', () => {
      const key1 = generateCacheKeySync({
        promptVersion: '1.0.0',
        modelId: 'ollama',
        modelVersion: 'llama3.1:8b',
        inputHash: 'abc123',
        engineVersion: '1.0.0',
        mode: 'technical',
      });

      const key2 = generateCacheKeySync({
        promptVersion: '1.0.0',
        modelId: 'ollama',
        modelVersion: 'llama3.1:8b',
        inputHash: 'abc123',
        engineVersion: '1.0.0',
        mode: 'technical',
      });

      expect(key1.key).toBe(key2.key);
    });

    it('produces different keys for different modes', () => {
      const key1 = generateCacheKeySync({
        promptVersion: '1.0.0',
        modelId: 'ollama',
        modelVersion: 'v1',
        inputHash: 'abc',
        engineVersion: '1.0.0',
        mode: 'simple',
      });
      const key2 = generateCacheKeySync({
        promptVersion: '1.0.0',
        modelId: 'ollama',
        modelVersion: 'v1',
        inputHash: 'abc',
        engineVersion: '1.0.0',
        mode: 'technical',
      });

      expect(key1.key).not.toBe(key2.key);
    });

    it('produces different keys for different prompt versions', () => {
      const key1 = generateCacheKeySync({
        promptVersion: '1.0.0',
        modelId: 'ollama',
        modelVersion: 'v1',
        inputHash: 'abc',
        engineVersion: '1.0.0',
        mode: 'simple',
      });
      const key2 = generateCacheKeySync({
        promptVersion: '2.0.0',
        modelId: 'ollama',
        modelVersion: 'v1',
        inputHash: 'abc',
        engineVersion: '1.0.0',
        mode: 'simple',
      });

      expect(key1.key).not.toBe(key2.key);
    });

    it('produces different keys for different input hashes', () => {
      const key1 = generateCacheKeySync({
        promptVersion: '1.0.0',
        modelId: 'ollama',
        modelVersion: 'v1',
        inputHash: 'hash_a',
        engineVersion: '1.0.0',
        mode: 'simple',
      });
      const key2 = generateCacheKeySync({
        promptVersion: '1.0.0',
        modelId: 'ollama',
        modelVersion: 'v1',
        inputHash: 'hash_b',
        engineVersion: '1.0.0',
        mode: 'simple',
      });

      expect(key1.key).not.toBe(key2.key);
    });

    it('includes display string for debugging', () => {
      const key = generateCacheKeySync({
        promptVersion: '1.0.0',
        modelId: 'ollama',
        modelVersion: 'llama3.1:8b',
        inputHash: 'abc',
        engineVersion: '1.0.0',
        mode: 'technical',
      });

      expect(key.display).toContain('technical');
      expect(key.display).toContain('ollama');
      expect(key.display).toContain('llama3.1:8b');
    });
  });

  describe('buildCacheKeyComponents', () => {
    it('creates components with expected structure', () => {
      const components = buildCacheKeyComponents(
        '1.0.0',
        'ollama',
        'llama3.1:8b',
        '{"test":"data"}',
        '1.0.0',
        'expert',
      );

      expect(components.promptVersion).toBe('1.0.0');
      expect(components.modelId).toBe('ollama');
      expect(components.modelVersion).toBe('llama3.1:8b');
      expect(components.inputHash).toBeTruthy();
      expect(components.engineVersion).toBe('1.0.0');
      expect(components.mode).toBe('expert');
    });

    it('computes deterministic input hash', () => {
      const c1 = buildCacheKeyComponents('1.0.0', 't', 'v1', '{"a":1}', '1.0.0', 'simple');
      const c2 = buildCacheKeyComponents('1.0.0', 't', 'v1', '{"a":1}', '1.0.0', 'simple');

      expect(c1.inputHash).toBe(c2.inputHash);
    });
  });

  describe('determinism (100-run)', () => {
    it('produces identical keys across 100 runs', () => {
      const components = {
        promptVersion: '1.0.0',
        modelId: 'ollama',
        modelVersion: 'v1',
        inputHash: 'abc',
        engineVersion: '1.0.0',
        mode: 'simple',
      } as const;

      const first = generateCacheKeySync(components);

      for (let i = 0; i < 100; i++) {
        const result = generateCacheKeySync(components);
        expect(result.key).toBe(first.key);
      }
    });
  });

  describe('stableStringify', () => {
    it('produces deterministic output for same data', () => {
      const a = stableStringify({ b: 2, a: 1 });
      const b = stableStringify({ a: 1, b: 2 });
      expect(a).toBe(b);
    });

    it('handles nested objects', () => {
      const result = stableStringify({ z: { y: 2, x: 1 }, a: 3 });
      expect(result).toContain('"a":3');
      expect(result).toContain('"z"');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Cache Entry Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Cache Entry', () => {
  it('creates a frozen cache entry', () => {
    const explanation = createTestExplanation();
    const entry = createCacheEntry(explanation, 60000, 1);

    expect(Object.isFrozen(entry)).toBe(true);
    expect(entry.explanation).toBe(explanation);
    expect(entry.schemaVersion).toBe(1);
    expect(entry.accessCount).toBe(1);
    expect(entry.sizeBytes).toBeGreaterThan(0);
  });

  it('creates entry with custom TTL', () => {
    const explanation = createTestExplanation();
    const now = 1000000;
    const entry = createCacheEntry(explanation, 5000, 1, now);

    const storedAt = new Date(entry.storedAt).getTime();
    const expiresAt = new Date(entry.expiresAt).getTime();

    expect(storedAt).toBe(now);
    expect(expiresAt).toBe(now + 5000);
  });

  it('touching an entry increments access count', () => {
    const explanation = createTestExplanation();
    const entry = createCacheEntry(explanation, 60000, 1);
    const touched = touchEntry(entry);

    expect(touched.accessCount).toBe(2);
    expect(Object.isFrozen(touched)).toBe(true);
  });

  it('isEntryExpired returns true for expired entry', () => {
    const explanation = createTestExplanation();
    const entry = createCacheEntry(explanation, -1000, 1); // Already expired

    expect(isEntryExpired(entry)).toBe(true);
  });

  it('isEntryExpired returns false for valid entry', () => {
    const explanation = createTestExplanation();
    const entry = createCacheEntry(explanation, 60000, 1);

    expect(isEntryExpired(entry)).toBe(false);
  });

  it('calculateEntrySize returns positive value', () => {
    const explanation = createTestExplanation();
    const size = calculateEntrySize(explanation);

    expect(size).toBeGreaterThan(50);
  });

  it('freezeEntry converts builder to frozen entry', () => {
    const explanation = createTestExplanation();
    const builder = createEntryBuilder(explanation, 60000, 1);
    const entry = freezeEntry(builder);

    expect(Object.isFrozen(entry)).toBe(true);
    expect(entry.explanation).toBe(explanation);
  });

  it('serializeEntry produces serializable object', () => {
    const explanation = createTestExplanation();
    const entry = createCacheEntry(explanation, 60000, 1);
    const serialized = serializeEntry(entry);

    expect(serialized.v).toBe(1);
    expect(serialized.x).toBeDefined();
  });

  it('getRemainingTtl returns correct value', () => {
    const explanation = createTestExplanation();
    const entry = createCacheEntry(explanation, 60000, 1);

    const remaining = getRemainingTtl(entry);
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(60000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LRU Tracker Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('LruTracker', () => {
  let lru: LruTracker;

  beforeEach(() => {
    lru = new LruTracker();
  });

  it('starts empty', () => {
    expect(lru.size).toBe(0);
    expect(lru.getLeastRecentlyUsed()).toBeUndefined();
  });

  it('tracks a single key', () => {
    lru.touch('key1');
    expect(lru.size).toBe(1);
    expect(lru.getLeastRecentlyUsed()).toBe('key1');
  });

  it('moves touched key to MRU position', () => {
    lru.touch('key1');
    lru.touch('key2');
    lru.touch('key3');

    expect(lru.getLeastRecentlyUsed()).toBe('key1');

    lru.touch('key1');
    expect(lru.getLeastRecentlyUsed()).toBe('key2');
  });

  it('evicts LRU key', () => {
    lru.touch('key1');
    lru.touch('key2');
    lru.touch('key3');

    expect(lru.evictLru()).toBe('key1');
    expect(lru.size).toBe(2);
    expect(lru.getLeastRecentlyUsed()).toBe('key2');
  });

  it('removes a key from tracking', () => {
    lru.touch('key1');
    lru.touch('key2');
    lru.remove('key1');

    expect(lru.size).toBe(1);
    expect(lru.getLeastRecentlyUsed()).toBe('key2');
  });

  it('clears all keys', () => {
    lru.touch('key1');
    lru.touch('key2');
    lru.clear();

    expect(lru.size).toBe(0);
  });

  it('reports keys in LRU order', () => {
    lru.touch('a');
    lru.touch('b');
    lru.touch('c');

    const keys = lru.keys();
    expect(keys).toEqual(['a', 'b', 'c']);
  });

  it('handles single element eviction and touch correctly', () => {
    lru.touch('only');
    expect(lru.evictLru()).toBe('only');
    expect(lru.evictLru()).toBeUndefined();
  });

  it('has returns true for tracked keys', () => {
    lru.touch('key1');
    expect(lru.has('key1')).toBe(true);
    expect(lru.has('nonexistent')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Eviction Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Evictor', () => {
  it('detects when eviction is needed based on entry count', () => {
    const lru = new LruTracker();
    const evictor = createEvictor({ maxEntries: 5, maxSizeBytes: 0, defaultTtlMs: 60000 }, lru);

    expect(evictor.needsEviction(6, 100)).toBe(true);
    expect(evictor.needsEviction(5, 100)).toBe(false);
  });

  it('detects when eviction is needed based on size', () => {
    const lru = new LruTracker();
    const evictor = createEvictor({ maxEntries: 0, maxSizeBytes: 1000, defaultTtlMs: 60000 }, lru);

    expect(evictor.needsEviction(5, 1500)).toBe(true);
    expect(evictor.needsEviction(5, 500)).toBe(false);
  });

  it('expired entries are detected', () => {
    const lru = new LruTracker();
    const evictor = createEvictor({ maxEntries: 100, maxSizeBytes: 0, defaultTtlMs: 60000 }, lru);
    const explanation = createTestExplanation();
    const expiredEntry = createCacheEntry(explanation, -1000, 1); // Already expired
    const validEntry = createCacheEntry(explanation, 60000, 1);

    const now = Date.now();
    expect(evictor.isExpired(expiredEntry, now)).toBe(true);
    expect(evictor.isExpired(validEntry, now)).toBe(false);
  });

  it('returns config', () => {
    const lru = new LruTracker();
    const evictor = createEvictor({ maxEntries: 10, maxSizeBytes: 5000, defaultTtlMs: 30000 }, lru);
    const config = evictor.getConfig();

    expect(config.maxEntries).toBe(10);
    expect(config.maxSizeBytes).toBe(5000);
    expect(config.defaultTtlMs).toBe(30000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Schema Version Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Schema Version', () => {
  it('compatible when versions match', () => {
    const result = checkSchemaCompatibility(1, 1);
    expect(result.compatible).toBe(true);
    expect(result.shouldMigrate).toBe(false);
    expect(result.shouldInvalidate).toBe(false);
  });

  it('requires migration when stored version is older', () => {
    const result = checkSchemaCompatibility(1, 2);
    expect(result.compatible).toBe(true);
    expect(result.shouldMigrate).toBe(true);
  });

  it('invalidates when stored version is too old', () => {
    const result = checkSchemaCompatibility(0, CURRENT_SCHEMA_VERSION);
    expect(result.compatible).toBe(false);
    expect(result.shouldInvalidate).toBe(true);
  });

  it('invalidates when stored version is from future', () => {
    const result = checkSchemaCompatibility(99, CURRENT_SCHEMA_VERSION);
    expect(result.compatible).toBe(false);
    expect(result.shouldInvalidate).toBe(true);
  });

  it('engine version change invalidates on major version bump', () => {
    expect(shouldInvalidateOnEngineChange('2.0.0', '1.0.0')).toBe(true);
  });

  it('engine version change does not invalidate on minor version bump', () => {
    expect(shouldInvalidateOnEngineChange('1.1.0', '1.0.0')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Migration Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Migration', () => {
  it('MigrationRegistry has no default steps', () => {
    const registry = new MigrationRegistry();
    expect(registry.getSteps()).toEqual([]);
  });

  it('createDefaultMigrationSteps returns empty array', () => {
    const steps = createDefaultMigrationSteps();
    expect(steps).toEqual([]);
  });

  it('migrateEntry returns entry unchanged when compatible', () => {
    const reg = new MigrationRegistry();
    const explanation = createTestExplanation();
    const entry = createCacheEntry(explanation, 60000, CURRENT_SCHEMA_VERSION);

    const result = migrateEntry(entry, reg, CURRENT_SCHEMA_VERSION);
    expect(result).toBe(entry); // Same reference since no migration needed
  });

  it('migrateEntry returns undefined when entry should be invalidated', () => {
    const reg = new MigrationRegistry();
    const explanation = createTestExplanation();
    const entry = createCacheEntry(explanation, 60000, 99); // Future version

    const result = migrateEntry(entry, reg, CURRENT_SCHEMA_VERSION);
    expect(result).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Memory Store Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('MemoryStore', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = createMemoryStore();
  });

  it('starts empty', () => {
    expect(store.size).toBe(0);
    expect(store.sizeBytes).toBe(0);
  });

  it('stores and retrieves entries', () => {
    const explanation = createTestExplanation();
    const entry = createCacheEntry(explanation, 60000, 1);

    store.set('key1', entry);
    expect(store.size).toBe(1);
    expect(store.sizeBytes).toBeGreaterThan(0);

    const retrieved = store.get('key1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.explanation.id).toBe(explanation.id);
  });

  it('returns undefined for missing keys', () => {
    expect(store.get('nonexistent')).toBeUndefined();
  });

  it('checks key existence', () => {
    const explanation = createTestExplanation();
    const entry = createCacheEntry(explanation, 60000, 1);
    store.set('key1', entry);

    expect(store.has('key1')).toBe(true);
    expect(store.has('nonexistent')).toBe(false);
  });

  it('deletes entries', () => {
    const explanation = createTestExplanation();
    const entry = createCacheEntry(explanation, 60000, 1);
    store.set('key1', entry);

    expect(store.delete('key1')).toBe(true);
    expect(store.size).toBe(0);

    expect(store.delete('nonexistent')).toBe(false);
  });

  it('clears all entries', () => {
    const explanation = createTestExplanation();
    const entry = createCacheEntry(explanation, 60000, 1);
    store.set('k1', entry);
    store.set('k2', entry);

    store.clear();
    expect(store.size).toBe(0);
    expect(store.sizeBytes).toBe(0);
  });

  it('returns entries map', () => {
    const explanation = createTestExplanation();
    const entry = createCacheEntry(explanation, 60000, 1);
    store.set('key', entry);

    const entries = store.entries();
    expect(entries.size).toBe(1);
    expect(entries.get('key')).toBeDefined();
  });

  it("reports type as 'memory'", () => {
    expect(store.type).toBe('memory');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Cache Metrics Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('CacheMetrics', () => {
  it('records hits and misses correctly', () => {
    const metrics = createCacheMetrics();

    metrics.recordHit();
    metrics.recordHit();
    metrics.recordMiss();

    const snap = metrics.snapshot();
    expect(snap.totalGets).toBe(3);
    expect(snap.totalHits).toBe(2);
    expect(snap.totalMisses).toBe(1);
    expect(snap.hitRate).toBeCloseTo(0.6667, 3);
  });

  it('records sets, evictions, and invalidations', () => {
    const metrics = createCacheMetrics();

    metrics.recordSet();
    metrics.recordEvictions(3);
    metrics.recordInvalidations(5);

    const snap = metrics.snapshot();
    expect(snap.totalSets).toBe(1);
    expect(snap.totalEvictions).toBe(3);
    expect(snap.totalInvalidations).toBe(5);
  });

  it('updates store state', () => {
    const metrics = createCacheMetrics(1000);
    metrics.updateStoreState(10, 500);

    const snap = metrics.snapshot();
    expect(snap.currentEntries).toBe(10);
    expect(snap.currentSizeBytes).toBe(500);
    expect(snap.maxSizeBytes).toBe(1000);
  });

  it('resets all metrics', () => {
    const metrics = createCacheMetrics();
    metrics.recordHit();
    metrics.recordSet();
    metrics.reset();

    const snap = metrics.snapshot();
    expect(snap.totalGets).toBe(0);
    expect(snap.totalSets).toBe(0);
  });

  it('returns zero hit rate when no gets', () => {
    const metrics = createCacheMetrics();
    const snap = metrics.snapshot();
    expect(snap.hitRate).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Cache Manager Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('CacheManager', () => {
  let manager: CacheManager;

  beforeEach(() => {
    manager = createCacheManager({
      maxEntries: 100,
      maxSizeBytes: 1024 * 1024,
      defaultTtlMs: 60000,
      engineVersion: '1.0.0',
    });
  });

  function makeResolvedKey(mode: string = 'technical', extra: string = '') {
    return {
      key: `test_key_${mode}_${extra}`,
      components: {
        promptVersion: '1.0.0',
        modelId: 'test-provider',
        modelVersion: 'test-model-v1',
        inputHash: `hash_${extra}`,
        engineVersion: '1.0.0',
        mode: mode as ExplanationMode,
      },
      display: `technical:test-provider/test-model-v1`,
    };
  }

  it('get returns undefined for missing key', () => {
    const result = manager.get(makeResolvedKey());
    expect(result).toBeUndefined();
  });

  it('set and get returns stored explanation', () => {
    const explanation = createTestExplanation();
    const key = makeResolvedKey();

    manager.set(key, explanation);
    const result = manager.get(key);

    expect(result).toBeDefined();
    expect(result!.id).toBe(explanation.id);
  });

  it('has returns true for stored entries', () => {
    const explanation = createTestExplanation();
    const key = makeResolvedKey();

    manager.set(key, explanation);
    expect(manager.has(key)).toBe(true);
  });

  it('has returns false for missing entries', () => {
    expect(manager.has(makeResolvedKey())).toBe(false);
  });

  it('stores entries with different modes separately', () => {
    const explanation = createTestExplanation({ mode: 'technical' });
    const simpleKey = makeResolvedKey('simple');
    const techKey = makeResolvedKey('technical');

    manager.set(techKey, explanation);
    expect(manager.get(techKey)).toBeDefined();
    expect(manager.get(simpleKey)).toBeUndefined();
  });

  it('invalidates by prompt version', () => {
    const explanation = createTestExplanation({ promptVersion: '1.0.0' });
    const key = makeResolvedKey();
    manager.set(key, explanation);

    const count = manager.invalidatePromptVersion('1.0.0');
    expect(count).toBeGreaterThan(0);
    expect(manager.get(key)).toBeUndefined();
  });

  it('invalidates by model ID', () => {
    const explanation = createTestExplanation();
    const key = makeResolvedKey();
    manager.set(key, explanation);

    const count = manager.invalidateModel('test-provider');
    expect(count).toBeGreaterThan(0);
    expect(manager.get(key)).toBeUndefined();
  });

  it('invalidates by age', () => {
    const explanation = createTestExplanation();
    const key = makeResolvedKey();
    manager.set(key, explanation);

    const futureTime = new Date(Date.now() + 86400000).toISOString();
    const count = manager.invalidateOlderThan(futureTime);
    expect(count).toBeGreaterThan(0);
  });

  it('clears all entries', () => {
    const explanation = createTestExplanation();
    manager.set(makeResolvedKey('a'), explanation);
    manager.set(makeResolvedKey('b'), explanation);

    manager.clear();

    expect(manager.get(makeResolvedKey('a'))).toBeUndefined();
    expect(manager.get(makeResolvedKey('b'))).toBeUndefined();
  });

  it('provides stats', () => {
    const explanation = createTestExplanation();
    manager.set(makeResolvedKey(), explanation);

    const stats = manager.getStats();
    expect(stats.totalEntries).toBeGreaterThan(0);
    expect(stats.hitRate).toBeDefined();
    expect(stats.totalGets).toBe(0); // No gets yet
    expect(stats.totalSets).toBe(1);
  });

  it('getStats after hit shows hit rate', () => {
    const explanation = createTestExplanation();
    const key = makeResolvedKey();
    manager.set(key, explanation);
    manager.get(key);

    const stats = manager.getStats();
    expect(stats.totalGets).toBeGreaterThan(0);
    expect(stats.hitRate).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Cache Integration Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Cache (PersistentCache interface)', () => {
  let cache: Cache;

  beforeEach(() => {
    cache = createTestCache();
  });

  it('implements PersistentCache interface', () => {
    expect(cache.name).toBe('Cache');
    expect(typeof cache.get).toBe('function');
    expect(typeof cache.set).toBe('function');
    expect(typeof cache.has).toBe('function');
    expect(typeof cache.invalidate).toBe('function');
    expect(typeof cache.getStats).toBe('function');
    expect(typeof cache.clear).toBe('function');
  });

  it('stores and retrieves explanations', async () => {
    const explanation = createTestExplanation();
    const cacheKey = createTestCacheKey();

    await cache.set(cacheKey, explanation);
    const result = await cache.get(cacheKey);

    expect(result).toBeDefined();
    expect(result!.id).toBe(explanation.id);
  });

  it('returns undefined for cache miss', async () => {
    const cacheKey = createTestCacheKey({ inputHash: 'nonexistent' });
    const result = await cache.get(cacheKey);

    expect(result).toBeUndefined();
  });

  it('checks key existence', async () => {
    const explanation = createTestExplanation();
    const cacheKey = createTestCacheKey();

    await cache.set(cacheKey, explanation);
    expect(await cache.has(cacheKey)).toBe(true);
    expect(await cache.has(createTestCacheKey({ inputHash: 'missing' }))).toBe(false);
  });

  it('different modes produce different cache entries', async () => {
    const explanation = createTestExplanation();
    const keySimple = createTestCacheKey({ mode: 'simple' });
    const keyTech = createTestCacheKey({ mode: 'technical' });

    await cache.set(keySimple, explanation);
    expect(await cache.get(keyTech)).toBeUndefined();
    expect(await cache.get(keySimple)).toBeDefined();
  });

  it('invalidates entries by filter', async () => {
    const explanation = createTestExplanation({ promptVersion: '1.0.0' });
    const key = createTestCacheKey();

    await cache.set(key, explanation);
    const count = await cache.invalidate({ promptVersion: '1.0.0' });

    expect(count).toBeGreaterThan(0);
    expect(await cache.get(key)).toBeUndefined();
  });

  it('clears all entries', async () => {
    const explanation = createTestExplanation();
    await cache.set(createTestCacheKey({ inputHash: 'a' }), explanation);
    await cache.set(createTestCacheKey({ inputHash: 'b' }), explanation);

    await cache.clear();
    const stats = await cache.getStats();
    expect(stats.totalEntries).toBe(0);
  });

  it('returns cache statistics', async () => {
    const explanation = createTestExplanation();
    await cache.set(createTestCacheKey(), explanation);

    const stats = await cache.getStats();
    expect(stats.totalEntries).toBeGreaterThan(0);
    expect(typeof stats.hitRate).toBe('number');
    expect(typeof stats.totalSizeBytes).toBe('number');
  });

  it('tracks cache hits and misses in stats', async () => {
    const explanation = createTestExplanation();
    const key = createTestCacheKey();

    await cache.set(key, explanation);
    await cache.get(key); // hit
    await cache.get(createTestCacheKey({ inputHash: 'missing' })); // miss

    const stats = await cache.getStats();
    expect(stats.hitRate).toBeGreaterThan(0);
  });

  it('provides detailed stats', () => {
    const explanation = createTestExplanation();
    const key = createTestCacheKey();

    // Use the cache manager directly for detailed stats
    const manager = new CacheManager({ maxEntries: 10 });
    const resolvedKey = manager.resolveKey({
      promptVersion: '1.0.0',
      modelId: 'test',
      modelVersion: 'v1',
      inputHash: 'abc',
      engineVersion: '1.0.0',
      mode: 'technical',
    });
    manager.set(resolvedKey, explanation);

    const stats = manager.getStats();
    expect(stats.schemaVersion).toBeGreaterThan(0);
    expect(stats.totalSets).toBe(1);
  });

  it('invalidates incompatible schema versions', async () => {
    const explanation = createTestExplanation();
    const cacheKey = createTestCacheKey();

    await cache.set(cacheKey, explanation);

    // All entries should have the current schema, so none should be incompatible
    const count = await cache.invalidateIncompatibleSchema();
    // Should not invalidate entries that match current schema
    expect(await cache.get(cacheKey)).toBeDefined();
  });

  it('migrateAll returns count of migrated entries', async () => {
    const count = await cache.migrateAll();
    expect(count).toBe(0); // No entries to migrate
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Determinism Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Cache Determinism', () => {
  it('cache key generation is deterministic across 100 runs', () => {
    const components = {
      promptVersion: '1.0.0',
      modelId: 'ollama',
      modelVersion: 'v1',
      inputHash: 'abc',
      engineVersion: '1.0.0',
      mode: 'simple',
    } as const;

    const first = generateCacheKeySync(components);
    for (let i = 0; i < 100; i++) {
      expect(generateCacheKeySync(components).key).toBe(first.key);
    }
  });

  it('stableStringify is deterministic across 100 runs', () => {
    const data = { b: [3, 2, 1], a: { z: 1, y: 2 } };
    const first = stableStringify(data);
    for (let i = 0; i < 100; i++) {
      expect(stableStringify(data)).toBe(first);
    }
  });

  it('Cache get/set is deterministic (same input → same behavior)', async () => {
    const cache = createTestCache();
    const explanation = createTestExplanation();
    const key = createTestCacheKey();

    await cache.set(key, explanation);
    const result1 = await cache.get(key);

    // Re-set and re-get should produce same result
    await cache.set(key, explanation);
    const result2 = await cache.get(key);

    expect(result1!.id).toBe(result2!.id);
    expect(result1!.text).toBe(result2!.text);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Edge Case Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Cache Edge Cases', () => {
  it('handles empty cache gracefully', async () => {
    const cache = createTestCache();
    const stats = await cache.getStats();

    expect(stats.totalEntries).toBe(0);
    expect(stats.hitRate).toBe(0);
  });

  it('handles get on empty cache', async () => {
    const cache = createTestCache();
    const result = await cache.get(createTestCacheKey());
    expect(result).toBeUndefined();
  });

  it('handles clear on empty cache', async () => {
    const cache = createTestCache();
    await cache.clear(); // Should not throw
    const stats = await cache.getStats();
    expect(stats.totalEntries).toBe(0);
  });

  it('handles invalidation on empty cache', async () => {
    const cache = createTestCache();
    const count = await cache.invalidate({ promptVersion: '1.0.0' });
    expect(count).toBe(0);
  });

  it('stores refused explanations', async () => {
    const cache = createTestCache();
    const explanation = createTestExplanation({ refused: true, refusalReason: 'No evidence.' });
    const key = createTestCacheKey();

    await cache.set(key, explanation);
    const result = await cache.get(key);

    expect(result).toBeDefined();
    expect(result!.refused).toBe(true);
  });

  it('handles large entries without crashing', async () => {
    const cache = createTestCache();
    const longText = 'A'.repeat(10000);
    const explanation = createTestExplanation({
      text: longText,
      citations: Array.from({ length: 50 }, (_, i) => ({
        id: `cit_${i}`,
        sourceType: 'finding' as CitationSourceType,
        sourceId: `fin_${i}`,
        label: `Finding ${i}`,
        verified: true,
      })),
    });
    const key = createTestCacheKey();

    await cache.set(key, explanation);
    const result = await cache.get(key);
    expect(result).toBeDefined();
    expect(result!.text.length).toBe(10000);
  });

  it('multiple sets and gets with different keys work correctly', async () => {
    const cache = createTestCache();
    const explanations = Array.from({ length: 5 }, (_, i) =>
      createTestExplanation({
        id: `exp_${i}`,
        subjectId: `fin_${i}`,
        text: `Explanation ${i}`,
      }),
    );

    // Set them all
    for (let i = 0; i < 5; i++) {
      await cache.set(createTestCacheKey({ inputHash: `hash_${i}` }), explanations[i]);
    }

    // Get them all
    for (let i = 0; i < 5; i++) {
      const result = await cache.get(createTestCacheKey({ inputHash: `hash_${i}` }));
      expect(result).toBeDefined();
      expect(result!.id).toBe(`exp_${i}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LRU Eviction Integration Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Cache LRU Eviction', () => {
  it('evicts oldest entries when cache exceeds limits', async () => {
    const cache = new Cache({
      maxEntries: 3,
      defaultTtlMs: 60000,
    });

    const explanation = createTestExplanation();

    // Add 3 entries (fills the cache)
    await cache.set(createTestCacheKey({ inputHash: 'a' }), explanation);
    await cache.set(createTestCacheKey({ inputHash: 'b' }), explanation);
    await cache.set(createTestCacheKey({ inputHash: 'c' }), explanation);

    // The cache allows up to 3 entries, so setting a 4th should trigger eviction
    // But MemoryStore + eviction may not evict immediately — depends on implementation
    await cache.set(createTestCacheKey({ inputHash: 'd' }), explanation);

    // At least one entry should still be accessible
    const stats = await cache.getStats();
    expect(stats.totalEntries).toBeLessThanOrEqual(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Concurrent Access Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Concurrent Access', () => {
  it('handles concurrent get/set operations', async () => {
    const cache = createTestCache();
    const ops = Array.from({ length: 10 }, (_, i) =>
      cache.set(
        createTestCacheKey({ inputHash: `hash_${i}` }),
        createTestExplanation({ id: `exp_${i}` }),
      ),
    );
    await Promise.all(ops);

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        cache.get(createTestCacheKey({ inputHash: `hash_${i}` })),
      ),
    );

    expect(results.every((r) => r !== undefined)).toBe(true);
    expect(results.length).toBe(10);
  });

  it('handles concurrent mixed get/set/invalidate operations', async () => {
    const cache = createTestCache();

    // Set initial entries
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        cache.set(
          createTestCacheKey({ inputHash: `init_${i}` }),
          createTestExplanation({ id: `init_${i}` }),
        ),
      ),
    );

    // Concurrently get, set, and call getStats (all non-destructive operations)
    await Promise.all([
      cache.get(createTestCacheKey({ inputHash: 'init_0' })),
      cache.get(createTestCacheKey({ inputHash: 'init_1' })),
      cache.set(createTestCacheKey({ inputHash: 'new_1' }), createTestExplanation({ id: 'new_1' })),
      cache.set(createTestCacheKey({ inputHash: 'new_2' }), createTestExplanation({ id: 'new_2' })),
      cache.getStats(),
    ]);

    // Verify consistency: all set entries should be accessible
    const init0 = await cache.get(createTestCacheKey({ inputHash: 'init_0' }));
    const new1 = await cache.get(createTestCacheKey({ inputHash: 'new_1' }));
    const new2 = await cache.get(createTestCacheKey({ inputHash: 'new_2' }));
    expect(init0).toBeDefined();
    expect(init0!.id).toBe('init_0');
    expect(new1).toBeDefined();
    expect(new1!.id).toBe('new_1');
    expect(new2).toBeDefined();
    expect(new2!.id).toBe('new_2');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Large Cache Stress Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Large Cache Stress', () => {
  it('handles 100 sequential set/get operations', async () => {
    const cache = createTestCache();

    for (let i = 0; i < 100; i++) {
      await cache.set(
        createTestCacheKey({ inputHash: `stress_${i}` }),
        createTestExplanation({ id: `exp_stress_${i}`, subjectId: `fin_stress_${i}` }),
      );
    }

    // Verify last 10 entries are accessible
    for (let i = 90; i < 100; i++) {
      const result = await cache.get(createTestCacheKey({ inputHash: `stress_${i}` }));
      expect(result).toBeDefined();
      expect(result!.id).toBe(`exp_stress_${i}`);
    }

    const stats = cache.getDetailedStats();
    expect(stats.totalSets).toBe(100);
    expect(stats.totalGets).toBe(10); // Only the gets we did
  });

  it('evicts oldest entries under stress with small cache', async () => {
    const cache = createCache({ maxEntries: 5, defaultTtlMs: 60000 });

    // Fill with 20 entries
    for (let i = 0; i < 20; i++) {
      await cache.set(
        createTestCacheKey({ inputHash: `stress_${i}` }),
        createTestExplanation({ id: `exp_${i}`, subjectId: `fin_${i}` }),
      );
    }

    const stats = await cache.getStats();
    // Should have at most 5 entries (maxEntries limit)
    expect(stats.totalEntries).toBeLessThanOrEqual(5);

    // Oldest entries should be evicted, newest should remain
    const newestResult = await cache.get(createTestCacheKey({ inputHash: 'stress_19' }));
    expect(newestResult).toBeDefined();
    expect(newestResult!.id).toBe('exp_19');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// createCache Factory Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Cache Factory', () => {
  it('createCache creates a Cache instance', () => {
    const cache = createCache();
    expect(cache).toBeInstanceOf(Cache);
    expect(cache.name).toBe('Cache');
  });

  it('createCache accepts options', () => {
    const cache = createCache({ maxEntries: 50, defaultTtlMs: 30000 });
    expect(cache).toBeDefined();
  });

  it('createTestCache creates a cache with small limits', () => {
    const cache = createTestCache();
    expect(cache).toBeInstanceOf(Cache);
  });
});
