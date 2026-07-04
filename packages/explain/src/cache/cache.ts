/**
 * Cache — main cache class implementing the PersistentCache interface.
 *
 * Implements SPEC-011 §11 (Caching Strategy) with:
 * - Deterministic cache key generation (6 components)
 * - In-memory storage with MemoryStore
 * - LRU eviction
 * - TTL expiration
 * - Schema-version-aware invalidation
 * - Prompt-version invalidation
 * - Engine-version invalidation
 * - Cache statistics and metrics
 * - Thread-safe async access
 * - Frozen cache entries
 *
 * Integrates with the Pipeline and ExplanationEngine via the
 * PersistentCache interface defined in engine/explainer.ts.
 *
 * @module @veris/explain/cache/cache
 */

import type {
  PersistentCache,
  CacheKey,
  CacheInvalidationFilter,
  CacheStats,
} from '../engine/persistent-cache-types.js';
import type { ExplainedContext } from '../types/context.js';
import type { Explanation, ExplanationMode } from '../types/explanation.js';

import { stableStringify } from './cache-key.js';
import { CacheManager, type CacheManagerOptions, type CacheManagerStats } from './cache-manager.js';

// ── Cache Options ──

/** Options for creating a Cache instance. */
export interface CacheConfig {
  /** Maximum number of entries (default: 1000). */
  readonly maxEntries?: number;
  /** Maximum total size in bytes (default: 100 MB). */
  readonly maxSizeBytes?: number;
  /** Default TTL in milliseconds (default: 7 days). */
  readonly defaultTtlMs?: number;
  /** Engine version string. */
  readonly engineVersion?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Cache
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Main cache implementation.
 *
 * Wraps CacheManager and adapts it to the PersistentCache interface
 * used by the Pipeline and ExplanationEngine.
 *
 * Provides:
 * - Standard cache operations (get, set, has)
 * - Cache invalidation by filter
 * - Cache statistics
 * - Cache clearing
 * - Integration with explanation generation pipeline
 */
export class Cache implements PersistentCache {
  readonly name = 'Cache';
  private readonly manager: CacheManager;
  private readonly engineVersion: string;

  constructor(options?: CacheConfig) {
    this.engineVersion = options?.engineVersion ?? '1.0.0';
    this.manager = new CacheManager({
      maxEntries: options?.maxEntries,
      maxSizeBytes: options?.maxSizeBytes,
      defaultTtlMs: options?.defaultTtlMs,
      engineVersion: this.engineVersion,
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PersistentCache Interface
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Get a cached explanation by its cache key.
   *
   * @param key - The cache key to look up.
   * @returns The cached explanation, or undefined on miss.
   */
  async get(key: CacheKey): Promise<Explanation | undefined> {
    const resolvedKey = this.resolveKey(key);
    return this.manager.get(resolvedKey);
  }

  /**
   * Store an explanation in the cache.
   *
   * @param key - The cache key to store under.
   * @param explanation - The explanation to cache.
   */
  async set(key: CacheKey, explanation: Explanation): Promise<void> {
    const resolvedKey = this.resolveKey(key);
    this.manager.set(resolvedKey, explanation);
  }

  /**
   * Check if a cache key exists and is valid.
   *
   * @param key - The cache key to check.
   * @returns True if the key exists and is not expired.
   */
  async has(key: CacheKey): Promise<boolean> {
    const resolvedKey = this.resolveKey(key);
    return this.manager.has(resolvedKey);
  }

  /**
   * Invalidate cache entries matching a filter.
   *
   * @param filter - The invalidation filter.
   * @returns Number of entries invalidated.
   */
  async invalidate(filter: CacheInvalidationFilter): Promise<number> {
    return this.manager.invalidate(filter);
  }

  /**
   * Get cache statistics.
   *
   * @returns Cache statistics compatible with the PersistentCache interface.
   */
  async getStats(): Promise<CacheStats> {
    const stats = this.manager.getStats();
    return this.toCacheStats(stats);
  }

  /**
   * Clear all entries from the cache.
   */
  async clear(): Promise<void> {
    this.manager.clear();
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Enhanced API
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Get an explanation, given the raw context and mode.
   *
   * Convenience method that builds the cache key from context data
   * and performs the lookup in one step.
   *
   * @param context - The explained context.
   * @param mode - The explanation mode.
   * @param promptVersion - The prompt version used.
   * @param modelId - The provider model ID.
   * @returns The cached explanation, or undefined on miss.
   */
  async getFromContext(
    context: ExplainedContext,
    mode: ExplanationMode,
    promptVersion: string,
    modelId: string,
  ): Promise<Explanation | undefined> {
    const cacheKey = this.buildKey(context, mode, promptVersion, modelId);
    const resolvedKey = this.resolveKey(cacheKey);
    return this.manager.get(resolvedKey);
  }

  /**
   * Store an explanation, building the cache key from context.
   *
   * @param context - The explained context.
   * @param explanation - The explanation to cache.
   * @param promptVersion - The prompt version used.
   * @param modelId - The provider model ID.
   */
  async setFromContext(
    context: ExplainedContext,
    explanation: Explanation,
    promptVersion: string,
    modelId: string,
  ): Promise<void> {
    const cacheKey = this.buildKey(context, explanation.mode, promptVersion, modelId);
    const resolvedKey = this.resolveKey(cacheKey);
    this.manager.set(resolvedKey, explanation);
  }

  /**
   * Invalidate all entries for a specific prompt version.
   *
   * @param promptVersion - The prompt version to invalidate.
   * @returns Number of entries invalidated.
   */
  async invalidateByPromptVersion(promptVersion: string): Promise<number> {
    return this.manager.invalidatePromptVersion(promptVersion);
  }

  /**
   * Invalidate all entries for a specific model.
   *
   * @param modelId - The model ID to invalidate.
   * @returns Number of entries invalidated.
   */
  async invalidateByModel(modelId: string): Promise<number> {
    return this.manager.invalidateModel(modelId);
  }

  /**
   * Invalidate all entries that are incompatible with the current schema.
   *
   * @returns Number of entries invalidated.
   */
  async invalidateIncompatibleSchema(): Promise<number> {
    return this.manager.invalidateIncompatibleSchema();
  }

  /**
   * Get detailed cache statistics.
   *
   * @returns Detailed cache manager stats.
   */
  getDetailedStats(): CacheManagerStats {
    return this.manager.getStats();
  }

  /**
   * Migrate all entries to the current schema version.
   *
   * @returns Number of entries migrated.
   */
  async migrateAll(): Promise<number> {
    return this.manager.migrateAll();
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Private Helpers
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Build a CacheKey from context and mode.
   */
  private buildKey(
    context: ExplainedContext,
    mode: ExplanationMode,
    promptVersion: string,
    modelId: string,
  ): CacheKey {
    // Safe: stableStringify accepts any object; the cast to Record is for type compatibility
    const contextJson = stableStringify(context as unknown as Record<string, unknown>);

    const components = this.manager.buildComponents(
      promptVersion,
      modelId,
      this.engineVersion,
      contextJson,
      mode,
    );

    return {
      promptVersion: components.promptVersion,
      modelId: components.modelId,
      modelVersion: components.modelVersion,
      inputHash: components.inputHash,
      engineVersion: components.engineVersion,
      mode: components.mode,
    };
  }

  /**
   * Resolve a CacheKey into the internal ResolvedCacheKey format.
   */
  private resolveKey(key: CacheKey): import('./cache-key.js').ResolvedCacheKey {
    return this.manager.resolveKey({
      promptVersion: key.promptVersion,
      modelId: key.modelId,
      modelVersion: key.modelVersion,
      inputHash: key.inputHash,
      engineVersion: key.engineVersion,
      mode: key.mode,
    });
  }

  /**
   * Convert CacheManagerStats to the PersistentCache CacheStats format.
   */
  private toCacheStats(stats: CacheManagerStats): CacheStats {
    return {
      totalEntries: stats.totalEntries,
      totalSizeBytes: stats.totalSizeBytes,
      maxSizeBytes: stats.maxSizeBytes,
      utilizationPercent: stats.utilizationPercent,
      hitRate: stats.hitRate,
      missRate: stats.missRate,
      oldestEntry: stats.oldestEntry,
      newestEntry: stats.newestEntry,
      entriesByMode: stats.entriesByMode,
      entriesByProvider: stats.entriesByProvider,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Factory Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new Cache instance.
 *
 * @param options - Optional cache configuration.
 * @returns A new Cache instance implementing PersistentCache.
 */
export function createCache(options?: CacheConfig): Cache {
  return new Cache(options);
}

/**
 * Create a test cache with small limits for testing.
 *
 * @returns A cache with small limits suitable for testing.
 */
export function createTestCache(): Cache {
  return new Cache({
    maxEntries: 10,
    maxSizeBytes: 1024 * 100, // 100 KB
    defaultTtlMs: 60 * 1000, // 1 minute
  });
}
