/**
 * Explanation cache — in-memory cache for generated explanations.
 *
 * Implements the PersistentCache interface for M5.
 * M7 will replace this with a persistent SQLite-backed implementation.
 *
 * @module @veris/explain/engine/explanation-cache
 */

import type { Explanation } from '../types/explanation.js';

import type {
  PersistentCache,
  CacheKey,
  CacheInvalidationFilter,
  CacheStats,
} from './explainer.js';

// ── In-Memory Cache Entry ──

interface CacheEntry {
  readonly explanation: Explanation;
  readonly storedAt: string;
  readonly ttlMs: number;
}

// ── ExplanationCache ──

/**
 * In-memory explanation cache.
 *
 * Thread-safe for single-threaded JS. Provides:
 * - get/set/has operations
 * - Cache invalidation by filter
 * - Size-limited eviction (LRU-based)
 * - TTL-based expiration
 * - Stats tracking
 *
 * This is the M5 implementation. M7 provides the persistent version.
 */
export class ExplanationCache implements PersistentCache {
  private readonly cache: Map<string, CacheEntry> = new Map();
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;
  private accessOrder: string[] = [];

  private totalGets = 0;
  private totalHits = 0;
  private totalMisses = 0;
  private totalSets = 0;
  private totalEvictions = 0;

  constructor(options?: { readonly maxEntries?: number; readonly defaultTtlMs?: number }) {
    this.maxEntries = options?.maxEntries ?? 1000;
    this.defaultTtlMs = options?.defaultTtlMs ?? 7 * 24 * 60 * 60 * 1000; // 7 days
  }

  // ── PersistentCache Interface ──

  async get(key: CacheKey): Promise<Explanation | undefined> {
    this.totalGets++;
    const cacheKey = this.serializeKey(key);
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      this.totalMisses++;
      return undefined;
    }

    // Check TTL
    const age = Date.now() - new Date(entry.storedAt).getTime();
    if (age > entry.ttlMs) {
      this.cache.delete(cacheKey);
      this.removeFromAccessOrder(cacheKey);
      this.totalMisses++;
      this.totalEvictions++;
      return undefined;
    }

    // Update access order (LRU)
    this.updateAccessOrder(cacheKey);

    this.totalHits++;
    return entry.explanation;
  }

  async set(key: CacheKey, explanation: Explanation): Promise<void> {
    this.totalSets++;
    const cacheKey = this.serializeKey(key);

    // Evict oldest entry if at capacity (but not the one we're updating)
    if (!this.cache.has(cacheKey) && this.cache.size >= this.maxEntries) {
      const oldest = this.accessOrder.shift();
      if (oldest) {
        this.cache.delete(oldest);
        this.totalEvictions++;
      }
    }

    this.cache.set(cacheKey, {
      explanation,
      storedAt: new Date().toISOString(),
      ttlMs: this.defaultTtlMs,
    });

    this.updateAccessOrder(cacheKey);
  }

  async has(key: CacheKey): Promise<boolean> {
    const cacheKey = this.serializeKey(key);
    const entry = this.cache.get(cacheKey);
    if (!entry) return false;

    // Check TTL
    const age = Date.now() - new Date(entry.storedAt).getTime();
    if (age > entry.ttlMs) {
      this.cache.delete(cacheKey);
      this.removeFromAccessOrder(cacheKey);
      this.totalEvictions++;
      return false;
    }

    return true;
  }

  async invalidate(filter: CacheInvalidationFilter): Promise<number> {
    let invalidated = 0;

    for (const [cacheKey, entry] of this.cache.entries()) {
      const parsed = this.parseCacheKey(cacheKey);
      if (!parsed) continue;

      if (filter.promptVersion && parsed.promptVersion !== filter.promptVersion) continue;
      if (filter.modelId && parsed.modelId !== filter.modelId) continue;
      if (filter.olderThan && entry.storedAt >= filter.olderThan) continue;

      this.cache.delete(cacheKey);
      this.removeFromAccessOrder(cacheKey);
      invalidated++;
    }

    return invalidated;
  }

  async getStats(): Promise<CacheStats> {
    const now = Date.now();
    let oldestEntry = now.toString();
    let newestEntry = '0';
    const entriesByMode: Record<string, number> = {};
    const entriesByProvider: Record<string, number> = {};
    let totalSizeBytes = 0;

    for (const entry of this.cache.values()) {
      const storedAt = new Date(entry.storedAt).getTime();
      if (storedAt < new Date(oldestEntry).getTime()) oldestEntry = entry.storedAt;
      if (storedAt > new Date(newestEntry).getTime()) newestEntry = entry.storedAt;

      const mode = entry.explanation.mode;
      entriesByMode[mode] = (entriesByMode[mode] ?? 0) + 1;

      const provider = entry.explanation.provider.id;
      entriesByProvider[provider] = (entriesByProvider[provider] ?? 0) + 1;

      totalSizeBytes += JSON.stringify(entry.explanation).length;
    }

    const hitRate = this.totalGets > 0 ? this.totalHits / this.totalGets : 0;
    const missRate = this.totalGets > 0 ? this.totalMisses / this.totalGets : 0;

    return {
      totalEntries: this.cache.size,
      totalSizeBytes,
      maxSizeBytes: this.maxEntries * 1024 * 1024, // Rough estimate
      utilizationPercent:
        this.cache.size > 0 ? Math.round((this.cache.size / this.maxEntries) * 100) : 0,
      hitRate: Math.round(hitRate * 100) / 100,
      missRate: Math.round(missRate * 100) / 100,
      oldestEntry: oldestEntry === now.toString() ? new Date().toISOString() : oldestEntry,
      newestEntry: newestEntry === '0' ? new Date().toISOString() : newestEntry,
      entriesByMode,
      entriesByProvider,
    };
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.accessOrder = [];
    this.totalGets = 0;
    this.totalHits = 0;
    this.totalMisses = 0;
    this.totalSets = 0;
    this.totalEvictions = 0;
  }

  // ── Internal Helpers ──

  /**
   * Serialize a CacheKey into a string for map storage.
   */
  private serializeKey(key: CacheKey): string {
    return `${key.promptVersion}::${key.modelId}::${key.modelVersion}::${key.inputHash}::${key.engineVersion}::${key.mode}`;
  }

  /**
   * Parse a serialized cache key string back to components.
   */
  private parseCacheKey(
    key: string,
  ):
    | {
        promptVersion: string;
        modelId: string;
        modelVersion: string;
        inputHash: string;
        engineVersion: string;
        mode: string;
      }
    | undefined {
    const parts = key.split('::');
    if (parts.length < 6) return undefined;

    return {
      promptVersion: parts[0],
      modelId: parts[1],
      modelVersion: parts[2],
      inputHash: parts[3],
      engineVersion: parts[4],
      mode: parts[5],
    };
  }

  /**
   * Update the access order for LRU eviction.
   */
  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  /**
   * Remove a key from the access order list.
   */
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
  }
}

// ── Factory Function ──

/**
 * Create a new explanation cache instance.
 *
 * @param options - Cache configuration options.
 * @returns A PersistentCache-compatible explanation cache.
 */
export function createExplanationCache(options?: {
  readonly maxEntries?: number;
  readonly defaultTtlMs?: number;
}): PersistentCache {
  return new ExplanationCache(options);
}
