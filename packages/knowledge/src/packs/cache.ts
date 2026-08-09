/**
 * Knowledge Pack Cache — immutable, fast startup cache for pack data.
 *
 * Features:
 * - Immutable entries (never mutated after creation)
 * - Content-addressed caching (deterministic keys)
 * - Fast startup (no duplicated parsing)
 * - Bounded size (prevents memory exhaustion)
 *
 * @module @veris/knowledge/packs/cache
 */

import type { KnowledgePack } from './types.js';

/** Cache entry with metadata. */
interface CacheEntry {
  readonly packId: string;
  readonly version: string;
  readonly contentHash: string;
  readonly pack: KnowledgePack;
  readonly loadedAt: number;
  readonly accessCount: number;
}

/** Cache configuration. */
export interface CacheConfig {
  /** Maximum number of packs in cache (default: 50). */
  readonly maxPacks?: number;
  /** Maximum cache size in bytes (default: 50MB). */
  readonly maxSizeBytes?: number;
  /** Time-to-live for cache entries in ms (default: 1 hour). */
  readonly defaultTtlMs?: number;
}

/** Default cache configuration. */
const DEFAULT_CONFIG: Required<CacheConfig> = {
  maxPacks: 50,
  maxSizeBytes: 50 * 1024 * 1024, // 50 MB
  defaultTtlMs: 60 * 60 * 1000, // 1 hour
};

/**
 * Immutable cache for Knowledge Packs.
 *
 * Provides:
 * - Cache-by-content-hash (same content returns cached version)
 * - LRU eviction when cache is full
 * - TTL-based expiration
 * - Thread-safe access patterns (all data is immutable)
 */
export class PackCache {
  private readonly _entries: Map<string, CacheEntry> = new Map();
  private readonly _config: Required<CacheConfig>;
  private _currentSizeBytes: number = 0;
  private _hits: number = 0;
  private _misses: number = 0;

  constructor(config?: CacheConfig) {
    this._config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Number of cached packs. */
  get size(): number {
    return this._entries.size;
  }

  /** Cache hit count. */
  get hits(): number {
    return this._hits;
  }

  /** Cache miss count. */
  get misses(): number {
    return this._misses;
  }

  /** Cache hit ratio. */
  get hitRatio(): number {
    const total = this._hits + this._misses;
    return total > 0 ? this._hits / total : 0;
  }

  /**
   * Get a pack from cache by content hash.
   */
  get(contentHash: string): KnowledgePack | undefined {
    const entry = this._entries.get(contentHash);
    if (!entry) {
      this._misses++;
      return undefined;
    }

    // Check TTL
    if (Date.now() - entry.loadedAt > this._config.defaultTtlMs) {
      this._entries.delete(contentHash);
      this._currentSizeBytes -= this.estimateSize(entry.pack);
      this._misses++;
      return undefined;
    }

    this._hits++;
    return entry.pack;
  }

  /**
   * Store a pack in cache.
   */
  set(pack: KnowledgePack): void {
    const contentHash = pack.contentHash;

    // Already cached? Update access count
    if (this._entries.has(contentHash)) {
      return;
    }

    const entry: CacheEntry = {
      packId: pack.metadata.id,
      version: pack.metadata.version,
      contentHash,
      pack,
      loadedAt: Date.now(),
      accessCount: 0,
    };

    const entrySize = this.estimateSize(pack);

    // Evict if needed
    this.evict(entrySize);

    this._entries.set(contentHash, entry);
    this._currentSizeBytes += entrySize;
  }

  /**
   * Check if a content hash is cached.
   */
  has(contentHash: string): boolean {
    return this._entries.has(contentHash);
  }

  /**
   * Invalidate a specific cache entry.
   */
  invalidate(contentHash: string): boolean {
    const entry = this._entries.get(contentHash);
    if (entry) {
      this._currentSizeBytes -= this.estimateSize(entry.pack);
      this._entries.delete(contentHash);
      return true;
    }
    return false;
  }

  /**
   * Invalidate all cache entries for a pack ID.
   */
  invalidatePack(packId: string): number {
    let count = 0;
    for (const [hash, entry] of this._entries) {
      if (entry.packId === packId) {
        this._currentSizeBytes -= this.estimateSize(entry.pack);
        this._entries.delete(hash);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear the entire cache.
   */
  clear(): void {
    this._entries.clear();
    this._currentSizeBytes = 0;
    this._hits = 0;
    this._misses = 0;
  }

  /**
   * Get cache statistics.
   */
  getStats(): Record<string, unknown> {
    return {
      size: this._entries.size,
      maxPacks: this._config.maxPacks,
      currentSizeBytes: this._currentSizeBytes,
      maxSizeBytes: this._config.maxSizeBytes,
      hits: this._hits,
      misses: this._misses,
      hitRatio: this.hitRatio,
    };
  }

  // ── Private ──

  /**
   * Evict cache entries until we have enough space.
   * Uses simple LRU: evicts oldest accessed entries first.
   */
  private evict(neededSize: number): void {
    // Evict by count
    while (this._entries.size >= this._config.maxPacks && this._entries.size > 0) {
      // Find least recently accessed (lowest access count, or oldest)
      let oldestHash = '';
      let oldestTime = Infinity;

      for (const [hash, entry] of this._entries) {
        if (entry.loadedAt < oldestTime) {
          oldestTime = entry.loadedAt;
          oldestHash = hash;
        }
      }

      if (oldestHash) {
        const entry = this._entries.get(oldestHash)!;
        this._currentSizeBytes -= this.estimateSize(entry.pack);
        this._entries.delete(oldestHash);
      }
    }

    // Evict by size
    while (
      this._currentSizeBytes + neededSize > this._config.maxSizeBytes &&
      this._entries.size > 0
    ) {
      let largestHash = '';
      let largestSize = 0;

      for (const [hash, entry] of this._entries) {
        const size = this.estimateSize(entry.pack);
        if (size > largestSize) {
          largestSize = size;
          largestHash = hash;
        }
      }

      if (largestHash) {
        this._currentSizeBytes -= largestSize;
        this._entries.delete(largestHash);
      }
    }
  }

  /**
   * Estimate the memory size of a pack (approximate).
   */
  private estimateSize(pack: KnowledgePack): number {
    // Rough estimate: JSON string length * 2 (for object overhead)
    return JSON.stringify(pack).length * 2;
  }
}
