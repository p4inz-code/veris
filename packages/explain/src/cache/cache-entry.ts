/**
 * Cache entry — metadata and serialization for cached explanations.
 *
 * Each cache entry wraps an Explanation with:
 * - storage timestamps for TTL enforcement
 * - schema version for forward/backward compatibility
 * - access tracking for LRU eviction
 * - serialized size for memory/persistence budgeting
 *
 * @module @veris/explain/cache/cache-entry
 */

import type { Explanation } from '../types/explanation.js';

// ── Serialized Cache Entry ──

/**
 * A cache entry stored in the cache store.
 *
 * Entries are immutable after creation — modifying an entry requires
 * creating a new one.
 */
export interface CacheEntry {
  /** The cached explanation. */
  readonly explanation: Explanation;
  /** ISO 8601 timestamp when the entry was created. */
  readonly storedAt: string;
  /** ISO 8601 timestamp when the entry expires. */
  readonly expiresAt: string;
  /** Schema version of the cached data (for migration checks). */
  readonly schemaVersion: number;
  /** Serialized size of the entry in bytes. */
  readonly sizeBytes: number;
  /** Number of times this entry has been accessed. */
  readonly accessCount: number;
  /** ISO 8601 timestamp of the last access. */
  readonly lastAccessedAt: string;
}

// ── Mutable Builder (for internal construction) ──

/** Internal builder for constructing cache entries. */
export interface CacheEntryBuilder {
  explanation: Explanation;
  storedAt: string;
  expiresAt: string;
  schemaVersion: number;
  sizeBytes: number;
  accessCount: number;
  lastAccessedAt: string;
}

// ── Serialization ──

/**
 * Calculate the serialized size of an Explanation in bytes.
 *
 * Uses JSON.stringify length as an approximation of storage size.
 *
 * @param explanation - The explanation to measure.
 * @returns Size in bytes.
 */
export function calculateEntrySize(explanation: Explanation): number {
  const json = JSON.stringify(explanation);
  return new TextEncoder().encode(json).length;
}

/**
 * Create a new immutable cache entry.
 *
 * @param explanation - The explanation to cache.
 * @param ttlMs - Time-to-live in milliseconds.
 * @param schemaVersion - Current cache schema version.
 * @param now - Optional timestamp override (for testing).
 * @returns A frozen cache entry.
 */
export function createCacheEntry(
  explanation: Explanation,
  ttlMs: number,
  schemaVersion: number,
  now?: number,
): CacheEntry {
  const timestamp = now ?? Date.now();
  const storedAt = new Date(timestamp).toISOString();
  const expiresAt = new Date(timestamp + ttlMs).toISOString();
  const sizeBytes = calculateEntrySize(explanation);

  return Object.freeze({
    explanation,
    storedAt,
    expiresAt,
    schemaVersion,
    sizeBytes,
    accessCount: 1,
    lastAccessedAt: storedAt,
  });
}

/**
 * Create a builder for constructing cache entries programmatically.
 *
 * @param explanation - The explanation to cache.
 * @param ttlMs - Time-to-live in milliseconds.
 * @param schemaVersion - Current cache schema version.
 * @param now - Optional timestamp override (for testing).
 * @returns A mutable CacheEntryBuilder.
 */
export function createEntryBuilder(
  explanation: Explanation,
  ttlMs: number,
  schemaVersion: number,
  now?: number,
): CacheEntryBuilder {
  const timestamp = now ?? Date.now();
  const storedAt = new Date(timestamp).toISOString();
  const expiresAt = new Date(timestamp + ttlMs).toISOString();
  const sizeBytes = calculateEntrySize(explanation);

  return {
    explanation,
    storedAt,
    expiresAt,
    schemaVersion,
    sizeBytes,
    accessCount: 1,
    lastAccessedAt: storedAt,
  };
}

/**
 * Convert a builder to an immutable cache entry.
 *
 * @param builder - The builder to freeze.
 * @returns A frozen cache entry.
 */
export function freezeEntry(builder: CacheEntryBuilder): CacheEntry {
  return Object.freeze({
    explanation: builder.explanation,
    storedAt: builder.storedAt,
    expiresAt: builder.expiresAt,
    schemaVersion: builder.schemaVersion,
    sizeBytes: builder.sizeBytes,
    accessCount: builder.accessCount,
    lastAccessedAt: builder.lastAccessedAt,
  });
}

/**
 * Clone a cache entry with an incremented access count.
 *
 * @param entry - The entry to update.
 * @param now - Optional timestamp override (for testing).
 * @returns A new frozen cache entry with updated access metadata.
 */
export function touchEntry(entry: CacheEntry, now?: number): CacheEntry {
  const timestamp = now ?? Date.now();
  return Object.freeze({
    ...entry,
    accessCount: entry.accessCount + 1,
    lastAccessedAt: new Date(timestamp).toISOString(),
  });
}

/**
 * Check if a cache entry has expired.
 *
 * @param entry - The entry to check.
 * @returns True if the entry has expired.
 */
export function isEntryExpired(entry: CacheEntry): boolean {
  return Date.now() > new Date(entry.expiresAt).getTime();
}

/**
 * Create a serializable representation of a cache entry for persistence.
 *
 * @param entry - The entry to serialize.
 * @returns JSON-serializable object.
 */
export function serializeEntry(entry: CacheEntry): Record<string, unknown> {
  return {
    v: entry.schemaVersion,
    s: entry.storedAt,
    e: entry.expiresAt,
    a: entry.accessCount,
    l: entry.lastAccessedAt,
    x: entry.explanation,
  };
}

/**
 * Deserialize a cache entry from its serialized form.
 *
 * @param data - The serialized entry data.
 * @returns A cache entry, or undefined if deserialization fails.
 */
export function deserializeEntry(
  data: Record<string, unknown>,
  currentSchemaVersion: number,
): CacheEntry | undefined {
  try {
    const schemaVersion = Number(data.v) || 0;
    const storedAt = String(data.s ?? '');
    const expiresAt = String(data.e ?? '');
    const accessCount = Number(data.a) || 0;
    const lastAccessedAt = String(data.l ?? '');
    const explanation = data.x as Explanation | undefined;

    if (!explanation || !storedAt || !expiresAt) {
      return undefined;
    }

    // Calculate size from deserialized data
    const json = JSON.stringify(data.x);
    const sizeBytes = new TextEncoder().encode(json).length;

    return Object.freeze({
      explanation,
      storedAt,
      expiresAt,
      schemaVersion,
      sizeBytes,
      accessCount,
      lastAccessedAt,
    });
  } catch {
    return undefined;
  }
}

/**
 * Calculate the remaining TTL of an entry in milliseconds.
 *
 * @param entry - The entry to check.
 * @returns Remaining TTL in ms (0 if already expired).
 */
export function getRemainingTtl(entry: CacheEntry): number {
  const remaining = new Date(entry.expiresAt).getTime() - Date.now();
  return Math.max(0, remaining);
}
