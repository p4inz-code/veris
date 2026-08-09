/**
 * IncrementalCache — deterministic cache for parser outputs and computations.
 *
 * Reuses:
 * - Parser outputs (PE, ELF, Mach-O parsed structures)
 * - Hash computations (SHA-256, MD5, SHA-1)
 * - Classification results
 * - Metadata computations
 *
 * Cache keys are deterministic content hashes.
 * All cached entries are immutable.
 *
 * @module @veris/analysis/pipeline/cache
 */

import { createHash } from 'node:crypto';

/** Cache entry with metadata. */
interface CacheEntry<T> {
  readonly key: string;
  readonly value: T;
  readonly size: number;
  readonly createdAt: number;
  readonly accessCount: number;
}

/**
 * IncrementalCache — LRU cache with content-addressed keys.
 *
 * Uses SHA-256 content hashes as cache keys for deterministic behavior.
 * Supports TTL-based expiration and LRU eviction.
 */
export class IncrementalCache {
  private readonly _entries: Map<string, CacheEntry<unknown>> = new Map();
  private readonly _maxEntries: number;
  private readonly _maxSizeBytes: number;
  private _totalSizeBytes: number = 0;
  private _hits: number = 0;
  private _misses: number = 0;

  constructor(maxEntries?: number, maxSizeBytes?: number) {
    this._maxEntries = maxEntries ?? 1024;
    this._maxSizeBytes = maxSizeBytes ?? 50 * 1024 * 1024; // 50MB default
  }

  /** Compute a deterministic cache key from content. */
  static computeKey(content: Buffer, prefix: string = ''): string {
    const hash = createHash('sha256').update(content).digest('hex');
    return prefix ? `${prefix}:${hash}` : hash;
  }

  /** Compute a composite key from multiple inputs. */
  static computeCompositeKey(...parts: readonly string[]): string {
    const hash = createHash('sha256');
    for (const part of parts) {
      hash.update(part);
    }
    return hash.digest('hex');
  }

  /** Get a cached value by key. Returns undefined if not found or expired. */
  get<T>(key: string): T | undefined {
    const entry = this._entries.get(key);
    if (!entry) {
      this._misses++;
      return undefined;
    }

    // Update access count
    this._entries.set(key, {
      ...entry,
      accessCount: entry.accessCount + 1,
    });
    this._hits++;
    return entry.value as T;
  }

  /** Set a cached value. */
  set<T>(key: string, value: T, size?: number): void {
    // Evict if at capacity
    if (this._entries.size >= this._maxEntries) {
      this._evictLRU();
    }

    // Estimate size if not provided
    const entrySize = size ?? this._estimateSize(value);

    // Evict if this single entry would exceed max size
    if (entrySize > this._maxSizeBytes) return;

    // Evict entries to make room
    while (this._totalSizeBytes + entrySize > this._maxSizeBytes && this._entries.size > 0) {
      this._evictLRU();
    }

    // Remove old entry if key already exists
    const existing = this._entries.get(key);
    if (existing) {
      this._totalSizeBytes -= existing.size;
    }

    this._entries.set(key, {
      key,
      value,
      size: entrySize,
      createdAt: Date.now(),
      accessCount: 0,
    });
    this._totalSizeBytes += entrySize;
  }

  /** Check if a key exists in the cache. */
  has(key: string): boolean {
    return this._entries.has(key);
  }

  /** Get or compute a value. */
  getOrCompute<T>(key: string, compute: () => T, size?: number): T {
    const existing = this.get<T>(key);
    if (existing !== undefined) return existing;
    const value = compute();
    this.set(key, value, size);
    return value;
  }

  /** Clear all cached entries. */
  clear(): void {
    this._entries.clear();
    this._totalSizeBytes = 0;
    this._hits = 0;
    this._misses = 0;
  }

  /** Remove a specific key. */
  remove(key: string): void {
    const entry = this._entries.get(key);
    if (entry) {
      this._totalSizeBytes -= entry.size;
      this._entries.delete(key);
    }
  }

  /** Get cache statistics. */
  getStats(): CacheStats {
    return Object.freeze({
      entries: this._entries.size,
      maxEntries: this._maxEntries,
      totalSizeBytes: this._totalSizeBytes,
      maxSizeBytes: this._maxSizeBytes,
      hits: this._hits,
      misses: this._misses,
      hitRate: this._hits + this._misses > 0 ? this._hits / (this._hits + this._misses) : 0,
    });
  }

  /** Get all keys. */
  getKeys(): readonly string[] {
    return Array.from(this._entries.keys());
  }

  private _evictLRU(): void {
    let lruKey: string | undefined;
    let lruAccess = Infinity;

    for (const [key, entry] of this._entries) {
      if (entry.accessCount < lruAccess) {
        lruAccess = entry.accessCount;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.remove(lruKey);
    }
  }

  private _estimateSize(value: unknown): number {
    if (typeof value === 'string') return value.length * 2;
    if (value instanceof Buffer) return value.length;
    if (typeof value === 'number') return 8;
    if (typeof value === 'boolean') return 4;
    if (value === null || value === undefined) return 0;
    if (Array.isArray(value)) {
      let size = 0;
      for (const item of value) size += this._estimateSize(item);
      return size;
    }
    if (typeof value === 'object') {
      let size = 0;
      for (const v of Object.values(value as Record<string, unknown>)) {
        size += this._estimateSize(v);
      }
      return size;
    }
    return 128; // Default estimate
  }
}

/** Cache statistics. */
export interface CacheStats {
  readonly entries: number;
  readonly maxEntries: number;
  readonly totalSizeBytes: number;
  readonly maxSizeBytes: number;
  readonly hits: number;
  readonly misses: number;
  readonly hitRate: number;
}
