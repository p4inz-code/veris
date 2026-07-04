/**
 * Memory store — in-memory Map-based cache store implementation.
 *
 * Provides fast synchronous storage for cache entries with:
 * - O(1) get/set/has/delete
 * - Size tracking in bytes
 * - Frozen entry returns (immutability guarantee)
 * - Event hooks for eviction callbacks
 *
 * ## Growth Bounds
 *
 * **MemoryStore itself has NO built-in size limit.** It is intended to be
 * wrapped by CacheManager which enforces capacity eviction (LRU + TTL + size)
 * via `evictIfNeeded()` after each `set()` call. When used standalone
 * (without CacheManager), the store can grow unbounded.
 *
 * See `CacheManager` for the bounded, production-safe wrapper.
 *
 * @module @veris/explain/cache/memory-store
 */

import type { CacheEntry } from './cache-entry.js';
import type { CacheStore, StoreEvents } from './cache-store.js';

// ── MemoryStore ──

/**
 * In-memory cache store implementation.
 *
 * Stores all entries in a Map. This is the primary storage for M7.
 * Persistence (SQLite) can be added as an alternative backend.
 *
 * **Note:** This store has NO built-in eviction. It MUST be wrapped by
 * CacheManager (which enforces LRU + TTL + size-based eviction) to
 * prevent unbounded growth in production use.
 */
export class MemoryStore implements CacheStore {
  readonly type = 'memory';
  private readonly store = new Map<string, CacheEntry>();
  private totalSizeBytes = 0;
  private readonly events?: StoreEvents;

  constructor(events?: StoreEvents) {
    this.events = events;
  }

  // ── CacheStore Implementation ──

  get(key: string): CacheEntry | undefined {
    return this.store.get(key);
  }

  set(key: string, entry: CacheEntry): void {
    const existing = this.store.get(key);
    if (existing) {
      this.totalSizeBytes -= existing.sizeBytes;
    }
    this.store.set(key, entry);
    this.totalSizeBytes += entry.sizeBytes;
    this.events?.onSet?.(key, entry);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  delete(key: string): boolean {
    const existing = this.store.get(key);
    if (!existing) return false;

    this.store.delete(key);
    this.totalSizeBytes -= existing.sizeBytes;
    this.events?.onEvict?.(key, existing);
    return true;
  }

  entries(): ReadonlyMap<string, CacheEntry> {
    return this.store;
  }

  get size(): number {
    return this.store.size;
  }

  get sizeBytes(): number {
    return this.totalSizeBytes;
  }

  clear(): void {
    this.store.clear();
    this.totalSizeBytes = 0;
    this.events?.onClear?.();
  }

  /**
   * Delete multiple entries at once.
   *
   * @param keys - The keys to delete.
   * @returns Number of entries deleted.
   */
  deleteMany(keys: readonly string[]): number {
    let count = 0;
    for (const key of keys) {
      if (this.delete(key)) {
        count++;
      }
    }
    return count;
  }
}

// ── Factory ──

/**
 * Create a new MemoryStore instance.
 *
 * @param events - Optional event hooks.
 * @returns A new MemoryStore.
 */
export function createMemoryStore(events?: StoreEvents): MemoryStore {
  return new MemoryStore(events);
}
