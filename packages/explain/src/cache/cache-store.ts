/**
 * Cache store — interface for pluggable cache storage backends.
 *
 * Defines the contract for storage implementations. The in-memory store
 * (memory-store.ts) provides the default implementation. Future backends
 * (SQLite, Redis, etc.) implement this interface.
 *
 * ## SQLite Fallback
 *
 * `better-sqlite3` is declared as an optionalDependency (see package.json)
 * but no SQLite store implementation currently exists. When implemented:
 * - The SQLite import must be wrapped in a dynamic import() try-catch
 * - On failure, fall back to MemoryStore transparently
 * - Never crash because the optional dependency failed to load
 *
 * @module @veris/explain/cache/cache-store
 */

import type { CacheEntry } from './cache-entry.js';

// ── Store Interface ──

/**
 * Pluggable storage backend for cache entries.
 *
 * Implementations must be thread-safe for single-threaded JS
 * and must return frozen CacheEntry objects.
 */
export interface CacheStore {
  /**
   * Get an entry by key.
   *
   * @param key - The cache key.
   * @returns The cache entry, or undefined if not found.
   */
  get(key: string): CacheEntry | undefined;

  /**
   * Set an entry by key.
   *
   * @param key - The cache key.
   * @param entry - The cache entry to store.
   */
  set(key: string, entry: CacheEntry): void;

  /**
   * Check if a key exists in the store.
   *
   * @param key - The cache key.
   * @returns True if the key exists.
   */
  has(key: string): boolean;

  /**
   * Delete an entry by key.
   *
   * @param key - The cache key to delete.
   * @returns True if the entry was deleted, false if not found.
   */
  delete(key: string): boolean;

  /**
   * Get all entries (for iteration/eviction).
   *
   * @returns Readonly map of all entries.
   */
  entries(): ReadonlyMap<string, CacheEntry>;

  /**
   * Get the number of entries in the store.
   */
  size: number;

  /**
   * Get the total size of all entries in bytes.
   */
  sizeBytes: number;

  /**
   * Clear all entries from the store.
   */
  clear(): void;

  /**
   * Get store type identifier.
   */
  readonly type: string;
}

// ── Store Events ──

/** Events emitted by a cache store. */
export interface StoreEvents {
  /** Called before an entry is evicted. */
  onEvict?: (key: string, entry: CacheEntry) => void;
  /** Called after an entry is set. */
  onSet?: (key: string, entry: CacheEntry) => void;
  /** Called after the store is cleared. */
  onClear?: () => void;
}
