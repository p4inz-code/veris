/**
 * Cache metrics — statistics and performance tracking for the cache.
 *
 * Tracks:
 * - Hit/miss rates
 * - Eviction counts
 * - Entry counts and sizes
 * - Per-mode and per-provider breakdowns
 *
 * @module @veris/explain/cache/cache-metrics
 */

import type { ExplanationMode } from '../types/explanation.js';

import type { CacheEntry } from './cache-entry.js';

// ── Metrics Snapshot ──

/** A snapshot of cache metrics at a point in time. */
export interface CacheMetricsSnapshot {
  /** Total number of get operations. */
  readonly totalGets: number;
  /** Total number of successful get operations. */
  readonly totalHits: number;
  /** Total number of failed get operations. */
  readonly totalMisses: number;
  /** Total number of set operations. */
  readonly totalSets: number;
  /** Total number of evictions. */
  readonly totalEvictions: number;
  /** Total number of invalidations. */
  readonly totalInvalidations: number;
  /** Current hit rate (0-1). */
  readonly hitRate: number;
  /** Current miss rate (0-1). */
  readonly missRate: number;
  /** Current number of entries in the cache. */
  readonly currentEntries: number;
  /** Current total size in bytes. */
  readonly currentSizeBytes: number;
  /** Maximum size in bytes. */
  readonly maxSizeBytes: number;
  /** Entry count by mode. */
  readonly entriesByMode: Record<string, number>;
  /** Entry count by provider. */
  readonly entriesByProvider: Record<string, number>;
  /** Size in bytes by mode. */
  readonly sizeByMode: Record<string, number>;
}

// ── CacheMetrics ──

/**
 * Collects and reports cache performance metrics.
 *
 * Thread-safe for single-threaded JS. All operations are synchronous.
 */
export class CacheMetrics {
  private _totalGets = 0;
  private _totalHits = 0;
  private _totalMisses = 0;
  private _totalSets = 0;
  private _totalEvictions = 0;
  private _totalInvalidations = 0;
  private _currentEntries = 0;
  private _currentSizeBytes = 0;
  private readonly _maxSizeBytes: number;

  constructor(maxSizeBytes: number = 100 * 1024 * 1024) {
    this._maxSizeBytes = maxSizeBytes;
  }

  // ── Recording Methods ──

  /** Record a cache hit. */
  recordHit(): void {
    this._totalGets++;
    this._totalHits++;
  }

  /** Record a cache miss. */
  recordMiss(): void {
    this._totalGets++;
    this._totalMisses++;
  }

  /** Record a cache set. */
  recordSet(): void {
    this._totalSets++;
  }

  /** Record cache evictions. */
  recordEvictions(count: number): void {
    this._totalEvictions += count;
  }

  /** Record cache invalidations. */
  recordInvalidations(count: number): void {
    this._totalInvalidations += count;
  }

  /** Update entry count and size. */
  updateStoreState(entries: number, sizeBytes: number): void {
    this._currentEntries = entries;
    this._currentSizeBytes = sizeBytes;
  }

  // ── Snapshot ──

  /**
   * Take a snapshot of current metrics.
   *
   * @param entries - Current entries for breakdown analysis.
   * @returns A snapshot of all metrics.
   */
  snapshot(entries?: ReadonlyMap<string, CacheEntry>): CacheMetricsSnapshot {
    const hitRate =
      this._totalGets > 0 ? Math.round((this._totalHits / this._totalGets) * 10000) / 10000 : 0;
    const missRate =
      this._totalGets > 0 ? Math.round((this._totalMisses / this._totalGets) * 10000) / 10000 : 0;

    const entriesByMode: Record<string, number> = {};
    const entriesByProvider: Record<string, number> = {};
    const sizeByMode: Record<string, number> = {};

    if (entries) {
      for (const [, entry] of entries) {
        const mode = entry.explanation.mode;
        entriesByMode[mode] = (entriesByMode[mode] ?? 0) + 1;
        sizeByMode[mode] = (sizeByMode[mode] ?? 0) + entry.sizeBytes;

        const provider = entry.explanation.provider.id;
        entriesByProvider[provider] = (entriesByProvider[provider] ?? 0) + 1;
      }
    }

    return {
      totalGets: this._totalGets,
      totalHits: this._totalHits,
      totalMisses: this._totalMisses,
      totalSets: this._totalSets,
      totalEvictions: this._totalEvictions,
      totalInvalidations: this._totalInvalidations,
      hitRate,
      missRate,
      currentEntries: this._currentEntries,
      currentSizeBytes: this._currentSizeBytes,
      maxSizeBytes: this._maxSizeBytes,
      entriesByMode,
      entriesByProvider,
      sizeByMode,
    };
  }

  /**
   * Reset all metrics to zero.
   */
  reset(): void {
    this._totalGets = 0;
    this._totalHits = 0;
    this._totalMisses = 0;
    this._totalSets = 0;
    this._totalEvictions = 0;
    this._totalInvalidations = 0;
  }
}

// ── Factory ──

/**
 * Create a new CacheMetrics instance.
 *
 * @param maxSizeBytes - Maximum cache size in bytes.
 * @returns A new CacheMetrics instance.
 */
export function createCacheMetrics(maxSizeBytes?: number): CacheMetrics {
  return new CacheMetrics(maxSizeBytes);
}
