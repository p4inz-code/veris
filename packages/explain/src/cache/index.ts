/**
 * Cache module — persistent cache with LRU eviction, TTL, and schema versioning.
 *
 * Implements SPEC-011 §11 (Caching Strategy) with:
 * - Deterministic 6-component cache key generation (SHA-256)
 * - In-memory storage with MemoryStore
 * - LRU eviction (doubly-linked list)
 * - TTL expiration
 * - Schema-version-aware invalidation
 * - Prompt-version invalidation
 * - Engine-version invalidation
 * - Cache migration helpers
 * - Cache statistics and metrics
 * - Thread-safe async access
 * - Frozen cache entries for immutability
 *
 * @module @veris/explain/cache
 */

// ── Main Cache ──

export { Cache, createCache, createTestCache } from './cache.js';
export type { CacheConfig } from './cache.js';

// ── Cache Key ──

export {
  generateCacheKey,
  generateCacheKeySync,
  buildCacheKeyComponents,
  serializeComponents,
  formatDisplayKey,
  stableStringify,
  sha256,
  simpleHash,
} from './cache-key.js';
export type { CacheKeyComponents, ResolvedCacheKey } from './cache-key.js';

// ── Cache Entry ──

export {
  createCacheEntry,
  createEntryBuilder,
  freezeEntry,
  touchEntry,
  isEntryExpired,
  calculateEntrySize,
  serializeEntry,
  deserializeEntry,
  getRemainingTtl,
} from './cache-entry.js';
export type { CacheEntry, CacheEntryBuilder } from './cache-entry.js';

// ── Cache Manager ──

export { CacheManager, createCacheManager } from './cache-manager.js';
export type { CacheManagerOptions, CacheManagerStats } from './cache-manager.js';

// ── Cache Store ──

export type { CacheStore, StoreEvents } from './cache-store.js';

// ── Memory Store ──

export { MemoryStore, createMemoryStore } from './memory-store.js';

// ── LRU ──

export { LruTracker } from './lru.js';

// ── Eviction ──

export { Evictor, createEvictor } from './eviction.js';
export type { EvictionResult, EvictionReason, EvictionConfig } from './eviction.js';

// ── Schema Version ──

export {
  CURRENT_SCHEMA_VERSION,
  MIN_COMPATIBLE_SCHEMA_VERSION,
  MAX_SUPPORTED_SCHEMA_VERSION,
  checkSchemaCompatibility,
  shouldInvalidateOnEngineChange,
  getCurrentSchemaVersion,
  normalizeSchemaVersion,
} from './schema-version.js';
export type { SchemaCompatibilityResult } from './schema-version.js';

// ── Migration ──

export {
  MigrationRegistry,
  migrateEntry,
  migrateAll,
  migrateSerializedEntries,
  createDefaultMigrationSteps,
} from './migration.js';
export type { MigrationResult, MigrationStep } from './migration.js';

// ── Cache Metrics ──

export { CacheMetrics, createCacheMetrics } from './cache-metrics.js';
export type { CacheMetricsSnapshot } from './cache-metrics.js';
