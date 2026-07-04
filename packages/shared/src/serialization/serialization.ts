/**
 * Serialization helpers for VERIS canonical objects.
 *
 * Provides safe JSON serialization with support for bigints,
 * dates, and type-safe deserialization.
 *
 * @module @veris/shared/serialization
 */

/**
 * Safe JSON serialization with support for Date objects (serialized as ISO 8601).
 */
export function toJSON(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val instanceof Date) return val.toISOString();
    if (typeof val === 'bigint') return val.toString();
    return val;
  });
}

/**
 * Safe JSON serialization with pretty-printing.
 */
export function toJSONPretty(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, val) => {
      if (val instanceof Date) return val.toISOString();
      if (typeof val === 'bigint') return val.toString();
      return val;
    },
    2,
  );
}

/**
 * Safe JSON parsing that doesn't throw.
 * Returns [null, Error] on failure.
 */
export function tryParseJSON<T = unknown>(
  text: string,
): { ok: true; value: T } | { ok: false; error: Error } {
  try {
    const value = JSON.parse(text) as T;
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

/**
 * Clone a value through JSON serialization/deserialization.
 * This is a deep clone for JSON-safe values.
 */
export function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Check if a value is a plain object (not an array, not null).
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Keys that are rejected during deep merge to prevent prototype pollution. */
const DANGEROUS_MERGE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Deep merge two plain objects.
 * Arrays are replaced, not merged.
 * Returns a new object (immutable).
 *
 * Rejects prototype-polluting keys (`__proto__`, `constructor`, `prototype`)
 * at every recursion level for security.
 */
export function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target } as Record<string, unknown>;

  for (const key of Object.keys(source as Record<string, unknown>)) {
    // Skip dangerous keys that could enable prototype pollution
    if (DANGEROUS_MERGE_KEYS.has(key)) {
      continue;
    }

    const srcVal = (source as Record<string, unknown>)[key];
    const tgtVal = result[key];

    if (isPlainObject(srcVal) && isPlainObject(tgtVal)) {
      result[key] = deepMerge(tgtVal as Record<string, unknown>, srcVal as Record<string, unknown>);
    } else {
      result[key] = srcVal;
    }
  }

  return result as T;
}
