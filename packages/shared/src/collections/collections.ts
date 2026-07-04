/**
 * Immutable tracking collections for VERIS.
 *
 * Provides collections that track access patterns for diagnostics
 * and cache efficiency analysis.
 *
 * @module @veris/shared/collections
 */

/**
 * A read-only, tracking map that records access patterns.
 */
export class TrackingMap<K, V> {
  private readonly _data: Map<K, V>;
  private _hits = 0;
  private _misses = 0;
  private _sets = 0;

  constructor(entries?: readonly (readonly [K, V])[]) {
    this._data = new Map(entries);
  }

  /** Get a value by key, tracking hit/miss. */
  get(key: K): V | undefined {
    const value = this._data.get(key);
    if (value !== undefined) {
      this._hits++;
    } else {
      this._misses++;
    }
    return value;
  }

  /** Check if a key exists, tracking hit/miss. */
  has(key: K): boolean {
    const exists = this._data.has(key);
    if (exists) this._hits++;
    else this._misses++;
    return exists;
  }

  /** Set a value (returns a new instance — immutable). */
  set(key: K, value: V): TrackingMap<K, V> {
    const newMap = new TrackingMap([...this._data.entries()]);
    newMap._data.set(key, value);
    newMap._sets = this._sets + 1;
    newMap._hits = this._hits;
    newMap._misses = this._misses;
    return newMap;
  }

  /** Delete a key (returns a new instance — immutable). */
  delete(key: K): TrackingMap<K, V> {
    if (!this._data.has(key)) return this;
    const newMap = new TrackingMap([...this._data.entries()]);
    newMap._data.delete(key);
    newMap._sets = this._sets;
    newMap._hits = this._hits;
    newMap._misses = this._misses;
    return newMap;
  }

  /** Number of entries. */
  get size(): number {
    return this._data.size;
  }

  /** All keys. */
  keys(): IterableIterator<K> {
    return this._data.keys();
  }

  /** All values. */
  values(): IterableIterator<V> {
    return this._data.values();
  }

  /** All entries. */
  entries(): IterableIterator<[K, V]> {
    return this._data.entries();
  }

  /** Clear all entries (returns a new empty instance). */
  clear(): TrackingMap<K, V> {
    return new TrackingMap();
  }

  /** Cache hit ratio [0.0, 1.0]. */
  get hitRatio(): number {
    const total = this._hits + this._misses;
    return total === 0 ? 0 : this._hits / total;
  }

  /** Number of successful lookups. */
  get hits(): number {
    return this._hits;
  }

  /** Number of failed lookups. */
  get misses(): number {
    return this._misses;
  }

  /** Number of set operations. */
  get sets(): number {
    return this._sets;
  }

  /** Create an immutable snapshot of all entries. */
  toSnapshot(): Record<string, V> {
    const obj: Record<string, V> = {};
    for (const [key, value] of this._data) {
      obj[String(key)] = value;
    }
    return obj;
  }
}

/**
 * Create an immutable array with a unique constraint on a key function.
 * Throws if a duplicate is detected on insertion.
 */
export function uniqueBy<T>(items: readonly T[], keyFn: (item: T) => string): readonly T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) {
      throw new Error(`Duplicate key: ${key}`);
    }
    seen.add(key);
    result.push(item);
  }
  return Object.freeze(result);
}

/**
 * Group an array of items by a key function.
 */
export function groupBy<T>(
  items: readonly T[],
  keyFn: (item: T) => string,
): Record<string, readonly T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return Object.freeze(
    Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, Object.freeze(v)])),
  );
}

/**
 * Create a frozen, deduplicated array.
 */
export function unique<T>(items: readonly T[]): readonly T[] {
  return Object.freeze([...new Set(items)]);
}

/**
 * Zip two arrays together into an array of pairs.
 * Truncates to the shorter array.
 */
export function zip<T, U>(a: readonly T[], b: readonly U[]): readonly [T, U][] {
  const length = Math.min(a.length, b.length);
  const result: [T, U][] = [];
  for (let i = 0; i < length; i++) {
    result.push([a[i], b[i]]);
  }
  return Object.freeze(result);
}

/**
 * Partition an array into two based on a predicate.
 * Returns [passing, failing].
 */
export function partition<T>(
  items: readonly T[],
  predicate: (item: T) => boolean,
): [readonly T[], readonly T[]] {
  const pass: T[] = [];
  const fail: T[] = [];
  for (const item of items) {
    if (predicate(item)) pass.push(item);
    else fail.push(item);
  }
  return [Object.freeze(pass), Object.freeze(fail)] as const;
}
