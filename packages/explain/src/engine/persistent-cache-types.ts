/**
 * Cache-related interfaces extracted from explainer.ts.
 *
 * Extracted to break the circular dependency:
 *   cache.ts → explainer.ts → explanation-engine.ts → cache.ts
 *
 * Now both cache.ts and explainer.ts can import these without creating cycles.
 *
 * @module @veris/explain/engine/persistent-cache-types
 */

import type { ExplanationMode } from '../types/explanation.js';
import type { Explanation } from '../types/explanation.js';

/** @veris/explain persistent cache interface. */
export interface PersistentCache {
  get(key: CacheKey): Promise<Explanation | undefined>;
  set(key: CacheKey, explanation: Explanation): Promise<void>;
  has(key: CacheKey): Promise<boolean>;
  invalidate(filter: CacheInvalidationFilter): Promise<number>;
  getStats(): Promise<CacheStats>;
  clear(): Promise<void>;
}

/** @veris/explain cache key. */
export interface CacheKey {
  readonly promptVersion: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly inputHash: string;
  readonly engineVersion: string;
  readonly mode: ExplanationMode;
}

/** @veris/explain cache invalidation filter. */
export interface CacheInvalidationFilter {
  readonly promptVersion?: string;
  readonly modelId?: string;
  readonly reportId?: string;
  readonly olderThan?: string; // ISO 8601 timestamp
}

/** @veris/explain cache stats. */
export interface CacheStats {
  readonly totalEntries: number;
  readonly totalSizeBytes: number;
  readonly maxSizeBytes: number;
  readonly utilizationPercent: number;
  readonly hitRate: number;
  readonly missRate: number;
  readonly oldestEntry: string; // ISO 8601
  readonly newestEntry: string; // ISO 8601
  readonly entriesByMode: Record<string, number>;
  readonly entriesByProvider: Record<string, number>;
}
