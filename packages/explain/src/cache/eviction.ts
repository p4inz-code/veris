/**
 * Eviction — eviction policies for cache management.
 *
 * Provides:
 * - TTL-based expiration: remove entries older than their TTL
 * - LRU eviction: remove least recently used entries when at capacity
 * - Size-based eviction: remove entries when total size exceeds max
 *
 * @module @veris/explain/cache/eviction
 */

import type { CacheEntry } from './cache-entry.js';
import { isEntryExpired } from './cache-entry.js';
import { LruTracker } from './lru.js';

// ── Eviction Result ──

/** Result of an eviction operation. */
export interface EvictionResult {
  /** Number of entries evicted. */
  readonly evicted: number;
  /** Keys of evicted entries. */
  readonly evictedKeys: readonly string[];
  /** Total size in bytes of evicted entries. */
  readonly evictedSizeBytes: number;
  /** Reason for eviction. */
  readonly reason: EvictionReason;
}

/** Reason for eviction. */
export type EvictionReason = 'ttl_expired' | 'lru_capacity' | 'size_capacity' | 'manual';

// ── Eviction Policy ──

/** Configuration for eviction. */
export interface EvictionConfig {
  /** Maximum number of entries (0 = unlimited). */
  readonly maxEntries: number;
  /** Maximum total size in bytes (0 = unlimited). */
  readonly maxSizeBytes: number;
  /** Default TTL in milliseconds. */
  readonly defaultTtlMs: number;
}

// ── Evictor ──

/**
 * Manages eviction policies for the cache.
 *
 * Combines TTL checks, LRU eviction, and size-based eviction.
 */
export class Evictor {
  private readonly config: EvictionConfig;
  private readonly lru: LruTracker;

  constructor(config: EvictionConfig, lru: LruTracker) {
    this.config = config;
    this.lru = lru;
  }

  /**
   * Check and evict expired TTL entries from a store.
   *
   * @param entries - Current entries map (key → CacheEntry).
   * @returns Eviction result for TTL-expired entries.
   */
  evictExpired(entries: ReadonlyMap<string, CacheEntry>): EvictionResult {
    const evicted: string[] = [];
    let evictedSizeBytes = 0;

    for (const [key, entry] of entries) {
      if (isEntryExpired(entry)) {
        evicted.push(key);
        evictedSizeBytes += entry.sizeBytes;
      }
    }

    return {
      evicted: evicted.length,
      evictedKeys: evicted,
      evictedSizeBytes,
      reason: 'ttl_expired',
    };
  }

  /**
   * Evict entries using LRU until the store is within capacity limits.
   *
   * @param currentSize - Current number of entries.
   * @param currentSizeBytes - Current total size in bytes.
   * @returns Eviction result for LRU-evicted entries.
   */
  evictLru(currentSize: number, currentSizeBytes: number): EvictionResult {
    const evicted: string[] = [];
    const evictedSizeBytes = 0;
    let size = currentSize;
    const sizeBytes = currentSizeBytes;

    while (this.needsEviction(size, sizeBytes)) {
      const key = this.lru.evictLru();
      if (!key) break; // No more entries to evict

      evicted.push(key);
      // Size will be tracked by the caller; we just track keys here
      size--;
    }

    return {
      evicted: evicted.length,
      evictedKeys: evicted,
      evictedSizeBytes,
      reason:
        evicted.length > 0
          ? currentSize > this.config.maxEntries
            ? 'lru_capacity'
            : 'size_capacity'
          : 'manual',
    };
  }

  /**
   * Check if a single entry has expired.
   *
   * @param entry - The entry to check.
   * @param now - Optional timestamp override (for testing).
   * @returns True if the entry has expired.
   */
  isExpired(entry: CacheEntry, now?: number): boolean {
    if (now !== undefined) {
      return now > new Date(entry.expiresAt).getTime();
    }
    return isEntryExpired(entry);
  }

  /**
   * Check if the store needs eviction based on current size.
   *
   * @param currentSize - Current number of entries.
   * @param currentSizeBytes - Current total size in bytes.
   * @returns True if eviction is needed.
   */
  needsEviction(currentSize: number, currentSizeBytes: number): boolean {
    if (this.config.maxEntries > 0 && currentSize > this.config.maxEntries) {
      return true;
    }
    if (this.config.maxSizeBytes > 0 && currentSizeBytes > this.config.maxSizeBytes) {
      return true;
    }
    return false;
  }

  /**
   * Update the eviction configuration.
   *
   * @param config - New configuration values.
   */
  updateConfig(config: Partial<EvictionConfig>): void {
    Object.assign(this.config, config);
  }

  /**
   * Get the current eviction configuration.
   */
  getConfig(): EvictionConfig {
    return { ...this.config };
  }
}

// ── Factory ──

/**
 * Create a new Evictor with the given configuration and LRU tracker.
 *
 * @param config - Eviction configuration.
 * @param lru - LRU tracker instance.
 * @returns A new Evictor.
 */
export function createEvictor(config: EvictionConfig, lru: LruTracker): Evictor {
  return new Evictor(config, lru);
}
