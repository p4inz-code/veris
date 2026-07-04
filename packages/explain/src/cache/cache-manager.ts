/**
 * Cache manager — orchestrates store, LRU tracking, eviction, and metrics.
 *
 * The CacheManager is the central coordinator that:
 * 1. Routes get/set/has operations to the store
 * 2. Updates LRU tracking on access
 * 3. Applies eviction policies (TTL + LRU + size)
 * 4. Collects metrics on all operations
 * 5. Supports schema-aware invalidation
 *
 * @module @veris/explain/cache/cache-manager
 */

import type { Explanation } from '../types/explanation.js';

import type { CacheEntry } from './cache-entry.js';
import { createCacheEntry, isEntryExpired, touchEntry } from './cache-entry.js';
import type { CacheKeyComponents, ResolvedCacheKey } from './cache-key.js';
import { generateCacheKeySync, buildCacheKeyComponents } from './cache-key.js';
import { CacheMetrics } from './cache-metrics.js';
import type { CacheStore } from './cache-store.js';
import { Evictor, type EvictionConfig } from './eviction.js';
import { LruTracker } from './lru.js';
import { MemoryStore } from './memory-store.js';
import { MigrationRegistry, migrateEntry } from './migration.js';
import { CURRENT_SCHEMA_VERSION, checkSchemaCompatibility } from './schema-version.js';

// ── Manager Options ──

/** Options for creating a CacheManager. */
export interface CacheManagerOptions {
  /** Maximum number of entries (default: 1000). */
  readonly maxEntries?: number;
  /** Maximum total size in bytes (default: 100 MB). */
  readonly maxSizeBytes?: number;
  /** Default TTL in milliseconds (default: 7 days). */
  readonly defaultTtlMs?: number;
  /** Cache schema version (default: CURRENT_SCHEMA_VERSION). */
  readonly schemaVersion?: number;
  /** Custom store implementation (default: MemoryStore). */
  readonly store?: CacheStore;
  /** Migration registry for schema migrations. */
  readonly migrationRegistry?: MigrationRegistry;
  /** Engine version string for cache key generation. */
  readonly engineVersion?: string;
}

// ── Manager Stats ──

/** Comprehensive cache statistics. */
export interface CacheManagerStats {
  /** Total number of entries. */
  readonly totalEntries: number;
  /** Total size in bytes. */
  readonly totalSizeBytes: number;
  /** Maximum size in bytes. */
  readonly maxSizeBytes: number;
  /** Utilization percentage. */
  readonly utilizationPercent: number;
  /** Hit rate (0-1). */
  readonly hitRate: number;
  /** Miss rate (0-1). */
  readonly missRate: number;
  /** Oldest entry timestamp. */
  readonly oldestEntry: string;
  /** Newest entry timestamp. */
  readonly newestEntry: string;
  /** Entry count by mode. */
  readonly entriesByMode: Record<string, number>;
  /** Entry count by provider. */
  readonly entriesByProvider: Record<string, number>;
  /** Current schema version. */
  readonly schemaVersion: number;
  /** Total operations. */
  readonly totalGets: number;
  readonly totalSets: number;
  readonly totalEvictions: number;
  readonly totalInvalidations: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CacheManager
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Central cache orchestrator.
 *
 * Wires together:
 * - Store (MemoryStore or future SQLite backend)
 * - LRU tracking (ordered access list)
 * - Eviction (TTL + LRU + size-based)
 * - Metrics (hit/miss rates, sizes, breakdowns)
 * - Schema compatibility (version checks, migrations)
 */
export class CacheManager {
  private readonly store: CacheStore;
  private readonly lru: LruTracker;
  private readonly evictor: Evictor;
  private readonly metrics: CacheMetrics;
  private readonly schemaVersion: number;
  private readonly migrationRegistry: MigrationRegistry;
  private readonly engineVersion: string;

  constructor(options?: CacheManagerOptions) {
    const maxEntries = options?.maxEntries ?? 1000;
    const maxSizeBytes = options?.maxSizeBytes ?? 100 * 1024 * 1024; // 100 MB
    const defaultTtlMs = options?.defaultTtlMs ?? 7 * 24 * 60 * 60 * 1000; // 7 days

    this.store = options?.store ?? new MemoryStore();
    this.lru = new LruTracker();
    this.evictor = new Evictor({ maxEntries, maxSizeBytes, defaultTtlMs }, this.lru);
    this.metrics = new CacheMetrics(maxSizeBytes);
    this.schemaVersion = options?.schemaVersion ?? CURRENT_SCHEMA_VERSION;
    this.migrationRegistry = options?.migrationRegistry ?? new MigrationRegistry();
    this.engineVersion = options?.engineVersion ?? '1.0.0';
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Public API
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Get an entry from the cache.
   *
   * Checks TTL on access. Expired entries are removed and count as misses.
   * Entries with incompatible schema versions are invalidated.
   *
   * @param key - The resolved cache key.
   * @returns The cached explanation, or undefined on miss.
   */
  get(key: ResolvedCacheKey): Explanation | undefined {
    const entry = this.store.get(key.key);

    if (!entry) {
      this.metrics.recordMiss();
      return undefined;
    }

    // Check schema compatibility
    const compatibility = checkSchemaCompatibility(entry.schemaVersion, this.schemaVersion);
    if (compatibility.shouldInvalidate) {
      this.store.delete(key.key);
      this.lru.remove(key.key);
      this.metrics.recordInvalidations(1);
      this.metrics.recordMiss();
      return undefined;
    }

    // Check TTL
    if (isEntryExpired(entry)) {
      this.store.delete(key.key);
      this.lru.remove(key.key);
      this.metrics.recordEvictions(1);
      this.metrics.recordMiss();
      return undefined;
    }

    // Update access tracking
    const touched = touchEntry(entry);
    this.store.set(key.key, touched);
    this.lru.touch(key.key);
    this.metrics.recordHit();
    this.updateStoreMetrics();

    return touched.explanation;
  }

  /**
   * Set an entry in the cache.
   *
   * Creates a new cache entry, stores it, and runs eviction if needed.
   *
   * @param key - The resolved cache key.
   * @param explanation - The explanation to cache.
   */
  set(key: ResolvedCacheKey, explanation: Explanation): void {
    const entry = createCacheEntry(
      explanation,
      this.evictor.getConfig().defaultTtlMs,
      this.schemaVersion,
    );

    this.store.set(key.key, entry);
    this.lru.touch(key.key);
    this.metrics.recordSet();
    this.updateStoreMetrics();

    // Run TTL eviction
    this.evictExpired();

    // Run capacity eviction
    this.evictIfNeeded();
  }

  /**
   * Check if a key exists in the cache.
   *
   * @param key - The resolved cache key.
   * @returns True if the key exists and is not expired.
   */
  has(key: ResolvedCacheKey): boolean {
    const entry = this.store.get(key.key);
    if (!entry) return false;

    // Check TTL
    if (isEntryExpired(entry)) {
      this.store.delete(key.key);
      this.lru.remove(key.key);
      this.metrics.recordEvictions(1);
      return false;
    }

    // Check schema compatibility
    const compatibility = checkSchemaCompatibility(entry.schemaVersion, this.schemaVersion);
    if (compatibility.shouldInvalidate) {
      this.store.delete(key.key);
      this.lru.remove(key.key);
      this.metrics.recordInvalidations(1);
      return false;
    }

    return true;
  }

  /**
   * Invalidate cache entries matching a filter.
   *
   * @param filter - The invalidation filter.
   * @returns Number of entries invalidated.
   */
  invalidate(filter: {
    readonly promptVersion?: string;
    readonly modelId?: string;
    readonly reportId?: string;
    readonly olderThan?: string;
  }): number {
    let count = 0;

    for (const [key, entry] of this.store.entries()) {
      // Parse the key components from the serialized key or from the entry metadata
      const parsed = this.parseCacheKey(key);
      if (!parsed) continue;

      if (filter.promptVersion && parsed.promptVersion !== filter.promptVersion) continue;
      if (filter.modelId && parsed.modelId !== filter.modelId) continue;

      // Check reportId by examining the explanation's subjectId
      if (filter.reportId) {
        // Explanation doesn't have reportId directly; check if subjectId matches
        // or if the explanation contains report-scoped identifiers
        const explanation = entry.explanation;
        if (explanation.subjectType === 'report' && explanation.subjectId !== filter.reportId)
          continue;
      }

      // Check olderThan timestamp
      if (filter.olderThan && entry.storedAt >= filter.olderThan) continue;

      // Invalidate this entry
      this.store.delete(key);
      this.lru.remove(key);
      count++;
    }

    if (count > 0) {
      this.metrics.recordInvalidations(count);
      this.updateStoreMetrics();
    }

    return count;
  }

  /**
   * Invalidate all entries that use a specific prompt version.
   *
   * @param promptVersion - The prompt version to invalidate.
   * @returns Number of entries invalidated.
   */
  invalidatePromptVersion(promptVersion: string): number {
    return this.invalidate({ promptVersion });
  }

  /**
   * Invalidate all entries from a specific model.
   *
   * @param modelId - The model ID to invalidate.
   * @returns Number of entries invalidated.
   */
  invalidateModel(modelId: string): number {
    return this.invalidate({ modelId });
  }

  /**
   * Invalidate all entries older than a specific timestamp.
   *
   * @param olderThan - ISO 8601 timestamp.
   * @returns Number of entries invalidated.
   */
  invalidateOlderThan(olderThan: string): number {
    return this.invalidate({ olderThan });
  }

  /**
   * Invalidate all entries with incompatible schema versions.
   *
   * Per SPEC-011 §11.3, only entries that should be invalidated
   * (future version or too-old version) are removed. Entries that
   * can be migrated (older but compatible) are kept and migrated
   * via the migrateAll method instead.
   *
   * @returns Number of entries invalidated.
   */
  invalidateIncompatibleSchema(): number {
    let count = 0;

    for (const [key, entry] of this.store.entries()) {
      const compatibility = checkSchemaCompatibility(entry.schemaVersion, this.schemaVersion);
      // Only invalidate if truly incompatible (future version or too-old version)
      if (compatibility.shouldInvalidate) {
        this.store.delete(key);
        this.lru.remove(key);
        count++;
      }
    }

    if (count > 0) {
      this.metrics.recordInvalidations(count);
      this.updateStoreMetrics();
    }

    return count;
  }

  /**
   * Get comprehensive cache statistics.
   *
   * @returns Cache statistics snapshot.
   */
  getStats(): CacheManagerStats {
    const metricSnapshot = this.metrics.snapshot(
      this.store.entries() as ReadonlyMap<string, CacheEntry>,
    );

    // Find oldest and newest entries
    let oldestEntry = '';
    let newestEntry = '';

    for (const [, entry] of this.store.entries()) {
      if (!oldestEntry || entry.storedAt < oldestEntry) oldestEntry = entry.storedAt;
      if (!newestEntry || entry.storedAt > newestEntry) newestEntry = entry.storedAt;
    }

    const maxSizeBytes = this.evictor.getConfig().maxSizeBytes;
    const utilizationPercent =
      maxSizeBytes > 0 ? Math.round((this.store.sizeBytes / maxSizeBytes) * 100) : 0;

    return {
      totalEntries: this.store.size,
      totalSizeBytes: this.store.sizeBytes,
      maxSizeBytes,
      utilizationPercent,
      hitRate: metricSnapshot.hitRate,
      missRate: metricSnapshot.missRate,
      oldestEntry: oldestEntry || new Date().toISOString(),
      newestEntry: newestEntry || new Date().toISOString(),
      entriesByMode: metricSnapshot.entriesByMode,
      entriesByProvider: metricSnapshot.entriesByProvider,
      schemaVersion: this.schemaVersion,
      totalGets: metricSnapshot.totalGets,
      totalSets: metricSnapshot.totalSets,
      totalEvictions: metricSnapshot.totalEvictions,
      totalInvalidations: metricSnapshot.totalInvalidations,
    };
  }

  /**
   * Clear all entries from the cache.
   */
  clear(): void {
    this.store.clear();
    this.lru.clear();
    this.metrics.reset();
  }

  /**
   * Build cache key components from pipeline inputs.
   *
   * @param promptVersion - Prompt template version.
   * @param modelId - Provider ID.
   * @param modelVersion - Model version string.
   * @param contextJson - Deterministic JSON string of the context.
   * @param mode - Explanation mode.
   * @returns Cache key components.
   */
  buildComponents(
    promptVersion: string,
    modelId: string,
    modelVersion: string,
    contextJson: string,
    mode: import('../types/explanation.js').ExplanationMode,
  ): CacheKeyComponents {
    return buildCacheKeyComponents(
      promptVersion,
      modelId,
      modelVersion,
      contextJson,
      this.engineVersion,
      mode,
    );
  }

  /**
   * Generate a resolved cache key from components.
   *
   * @param components - Cache key components.
   * @returns A resolved cache key.
   */
  resolveKey(components: CacheKeyComponents): ResolvedCacheKey {
    return generateCacheKeySync(components);
  }

  /**
   * Migrate all entries in the store to the current schema version.
   *
   * @returns Number of entries migrated.
   */
  migrateAll(): number {
    let migrated = 0;
    const toDelete: string[] = [];

    for (const [key, entry] of this.store.entries()) {
      const compatibility = checkSchemaCompatibility(entry.schemaVersion, this.schemaVersion);
      if (compatibility.shouldInvalidate) {
        toDelete.push(key);
      } else if (compatibility.shouldMigrate) {
        const result = migrateEntry(entry, this.migrationRegistry, this.schemaVersion);
        if (result) {
          this.store.set(key, result);
          migrated++;
        } else {
          toDelete.push(key);
        }
      }
    }

    // Delete invalidated entries
    for (const key of toDelete) {
      this.store.delete(key);
      this.lru.remove(key);
    }

    this.updateStoreMetrics();
    return migrated;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Private Helpers
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Evict expired entries from the store.
   */
  private evictExpired(): void {
    const expired = this.evictor.evictExpired(
      this.store.entries() as ReadonlyMap<string, CacheEntry>,
    );
    if (expired.evicted > 0) {
      for (const key of expired.evictedKeys) {
        this.store.delete(key);
        this.lru.remove(key);
      }
      this.metrics.recordEvictions(expired.evicted);
      this.updateStoreMetrics();
    }
  }

  /**
   * Evict entries if the store exceeds capacity.
   */
  private evictIfNeeded(): void {
    if (!this.evictor.needsEviction(this.store.size, this.store.sizeBytes)) {
      return;
    }

    // Evict LRU entries: the evictor tells us which keys are LRU,
    // and we delete them from both the store and LRU tracker
    let evicted = 0;
    while (this.evictor.needsEviction(this.store.size, this.store.sizeBytes)) {
      const key = this.lru.evictLru();
      if (!key) break;
      this.store.delete(key);
      evicted++;
    }

    if (evicted > 0) {
      this.metrics.recordEvictions(evicted);
      this.updateStoreMetrics();
    }
  }

  /**
   * Update store-level metrics.
   */
  private updateStoreMetrics(): void {
    this.metrics.updateStoreState(this.store.size, this.store.sizeBytes);
  }

  /**
   * Parse a cache key string back into its components.
   * Uses the simple hash format: `hash|version|mode|...`
   */
  private parseCacheKey(key: string): { promptVersion?: string; modelId?: string } | undefined {
    // The key is a SHA-256 hash, so we can't extract components from it directly.
    // Instead, we use the key to look up the entry and extract from its explanation.
    const entry = this.store.get(key);
    if (!entry) return undefined;

    return {
      promptVersion: entry.explanation.promptVersion,
      modelId: entry.explanation.provider.id,
    };
  }
}

// ── Factory ──

/**
 * Create a new CacheManager with default configuration.
 *
 * @param options - Optional configuration overrides.
 * @returns A new CacheManager instance.
 */
export function createCacheManager(options?: CacheManagerOptions): CacheManager {
  return new CacheManager(options);
}
