/**
 * Context serializer — deterministic serialization and hashing for context objects.
 *
 * Provides:
 * - Deterministic JSON serialization of ExplainedContext objects
 * - SHA-256 content hashing for cache key generation
 * - Deep freezing of context objects
 *
 * @module @veris/explain/context/serializer
 */

import { sha256 } from '@veris/shared';

import type { ExplainedContext } from '../types/context.js';

// ── Deterministic Serialization ──

/**
 * Serialize a context object to a deterministic JSON string.
 *
 * Uses a stable key ordering to ensure the same object always produces
 * the same JSON string, regardless of property insertion order.
 *
 * @param context - The context object to serialize.
 * @returns A deterministic JSON string.
 */
export function serializeContext(context: ExplainedContext): string {
  return deterministicStringify(context);
}

/**
 * Compute the SHA-256 hash of a serialized context.
 *
 * This is used as the `inputHash` component of the cache key.
 *
 * @param context - The context to hash.
 * @returns The SHA-256 hex digest string.
 */
export function hashContext(context: ExplainedContext): string {
  const serialized = serializeContext(context);
  return sha256(serialized);
}

/**
 * Get the context schema version string.
 * Increment this when the ExplainedContext structure changes.
 */
export function getContextSchemaVersion(): string {
  return '1.0.0';
}

// ── Deep Freeze ──

/**
 * Deep freeze an object and all its properties (recursive).
 *
 * Ensures that context objects are truly immutable at runtime.
 *
 * @param obj - The object to freeze.
 * @returns The frozen object (same reference).
 */
export function deepFreeze<T extends Record<string, unknown>>(obj: T): T {
  // Freeze own properties first
  const propNames = Object.getOwnPropertyNames(obj);
  for (const name of propNames) {
    const value = obj[name];

    // Recursively freeze if it's an object (but not null)
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      if (Array.isArray(value)) {
        deepFreezeArray(value);
      } else {
        deepFreeze(value as Record<string, unknown>);
      }
    }
  }

  return Object.freeze(obj);
}

/**
 * Deep freeze an array and all its elements.
 */
function deepFreezeArray<T>(arr: T[]): void {
  for (let i = 0; i < arr.length; i++) {
    const value = arr[i];
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      if (Array.isArray(value)) {
        deepFreezeArray(value);
      } else {
        deepFreeze(value as Record<string, unknown>);
      }
    }
  }
  Object.freeze(arr);
}

// ── Helpers ──

/**
 * Deterministic JSON stringification with sorted keys.
 */
function deterministicStringify(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'undefined') return 'null';
  if (typeof value === 'boolean') return value.toString();
  if (typeof value === 'number') return Number.isFinite(value) ? value.toString() : 'null';
  if (typeof value === 'string') return JSON.stringify(value);

  if (Array.isArray(value)) {
    const items = value.map(deterministicStringify);
    return `[${items.join(',')}]`;
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const pairs = keys
      .filter((k) => typeof (value as Record<string, unknown>)[k] !== 'undefined')
      .map(
        (k) =>
          `${JSON.stringify(k)}:${deterministicStringify((value as Record<string, unknown>)[k])}`,
      );
    return `{${pairs.join(',')}}`;
  }

  return 'null';
}
