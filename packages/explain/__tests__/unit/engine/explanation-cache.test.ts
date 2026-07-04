/**
 * Tests for ExplanationCache — in-memory cache for explanations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ExplanationCache } from '../../../src/engine/explanation-cache.js';
import type { CacheKey } from '../../../src/engine/explainer.js';
import type { Explanation } from '../../../src/types/explanation.js';

describe('ExplanationCache', () => {
  let cache: ExplanationCache;
  let sampleKey: CacheKey;
  let sampleExplanation: Explanation;

  beforeEach(() => {
    cache = new ExplanationCache({ maxEntries: 10, defaultTtlMs: 60000 });

    sampleKey = {
      promptVersion: '1.0.0',
      modelId: 'mock',
      modelVersion: '1.0.0',
      inputHash: 'abc123',
      engineVersion: '1.0.0',
      mode: 'simple',
    };

    sampleExplanation = {
      id: 'exp_test',
      subjectId: 'finding-1',
      subjectType: 'finding',
      mode: 'simple',
      text: 'Test explanation.',
      citations: [],
      citationValidation: {
        valid: true,
        totalCitations: 0,
        verifiedCitations: 0,
        failedCitations: 0,
        citations: [],
      },
      provider: { id: 'mock', model: 'mock-model' },
      promptVersion: '1.0.0',
      tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      cached: false,
      refused: false,
      generatedAt: new Date().toISOString(),
      disclaimer: 'AI-generated test.',
    };
  });

  it('stores and retrieves explanations', async () => {
    await cache.set(sampleKey, sampleExplanation);
    const retrieved = await cache.get(sampleKey);
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe('exp_test');
  });

  it('returns undefined for missing keys', async () => {
    const retrieved = await cache.get(sampleKey);
    expect(retrieved).toBeUndefined();
  });

  it('checks existence with has()', async () => {
    expect(await cache.has(sampleKey)).toBe(false);
    await cache.set(sampleKey, sampleExplanation);
    expect(await cache.has(sampleKey)).toBe(true);
  });

  it('evicts oldest entry when at capacity', async () => {
    const smallCache = new ExplanationCache({ maxEntries: 3, defaultTtlMs: 60000 });
    const keys: CacheKey[] = [];

    for (let i = 0; i < 4; i++) {
      const key: CacheKey = {
        ...sampleKey,
        inputHash: `key${i}`,
        mode: 'simple',
      };
      keys.push(key);
      await smallCache.set(key, {
        ...sampleExplanation,
        id: `exp_${i}`,
        text: `Explanation ${i}`,
      });
    }

    // First key should be evicted
    expect(await smallCache.get(keys[0])).toBeUndefined();
    // Later keys should exist
    expect(await smallCache.get(keys[3])).toBeDefined();
  });

  it('invalidates by filter', async () => {
    await cache.set(sampleKey, sampleExplanation);

    const key2: CacheKey = { ...sampleKey, inputHash: 'def456' };
    await cache.set(key2, { ...sampleExplanation, id: 'exp_2' });

    const invalidated = await cache.invalidate({ modelId: 'mock' });
    expect(invalidated).toBe(2);

    expect(await cache.get(sampleKey)).toBeUndefined();
  });

  it('invalidates by age', async () => {
    await cache.set(sampleKey, sampleExplanation);

    const futureTimestamp = new Date(Date.now() + 3600000).toISOString();
    const invalidated = await cache.invalidate({ olderThan: futureTimestamp });
    expect(invalidated).toBe(1);
  });

  it('provides stats', async () => {
    await cache.set(sampleKey, sampleExplanation);
    const stats = await cache.getStats();

    expect(stats.totalEntries).toBe(1);
    expect(stats.hitRate).toBe(0);
    expect(stats.missRate).toBe(0);
    expect(stats.entriesByMode.simple).toBe(1);
  });

  it('clears all entries', async () => {
    await cache.set(sampleKey, sampleExplanation);
    await cache.clear();

    expect(await cache.get(sampleKey)).toBeUndefined();
    const stats = await cache.getStats();
    expect(stats.totalEntries).toBe(0);
  });

  it('tracks hit and miss rates', async () => {
    await cache.get(sampleKey); // Miss
    await cache.get(sampleKey); // Miss
    await cache.set(sampleKey, sampleExplanation);
    await cache.get(sampleKey); // Hit

    const stats = await cache.getStats();
    expect(stats.hitRate).toBeGreaterThan(0);
    expect(stats.missRate).toBeGreaterThan(0);
  });
});
