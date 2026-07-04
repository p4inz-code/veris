/**
 * Cache key — deterministic 6-component cache key generation.
 *
 * Implements SPEC-011 §11.1 cache key composition:
 *   cacheKey = SHA-256(concatenation of):
 *     1. prompt_version     — Version of the prompt template used
 *     2. model_id           — Provider ID (e.g., "ollama")
 *     3. model_version      — Model name/version (e.g., "llama3.1:8b")
 *     4. input_hash         — SHA-256 of the serialized ExplaineContext
 *     5. engine_version     — @veris/explain engine version
 *     6. mode               — Explanation mode ("simple", "technical", "expert")
 *
 * @module @veris/explain/cache/cache-key
 */

import type { ExplanationMode } from '../types/explanation.js';

// ── Cache Key Components ──

/** The 6 components that make up a deterministic cache key. */
export interface CacheKeyComponents {
  /** Version of the prompt template used. */
  readonly promptVersion: string;
  /** Provider ID (e.g., "ollama", "openai"). */
  readonly modelId: string;
  /** Model name/version (e.g., "llama3.1:8b", "gpt-4o"). */
  readonly modelVersion: string;
  /** SHA-256 hash of the serialized context. */
  readonly inputHash: string;
  /** @veris/explain engine version (e.g., "1.0.0"). */
  readonly engineVersion: string;
  /** Explanation mode. */
  readonly mode: ExplanationMode;
}

/** A resolved, serializable cache key. */
export interface ResolvedCacheKey {
  /** Unique cache key string (SHA-256 hex digest). */
  readonly key: string;
  /** The 6 components that produced this key. */
  readonly components: CacheKeyComponents;
  /** Human-readable representation for debugging. */
  readonly display: string;
}

// ── Serialization ──

/**
 * Deterministic JSON serialization with sorted keys.
 *
 * Ensures the same data always produces the same JSON string,
 * which is critical for cache key generation.
 *
 * @param obj - The object to serialize.
 * @returns Deterministic JSON string.
 */
export function stableStringify(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, stableReplacer());
}

function stableReplacer(): (this: unknown, key: string, value: unknown) => unknown {
  const seen = new WeakSet<object>();
  return function deepSort(_key: string, value: unknown): unknown {
    if (value !== null && typeof value === 'object') {
      if (seen.has(value as object)) return;
      seen.add(value as object);
      if (Array.isArray(value)) {
        return value.map((v) => (typeof v === 'object' && v !== null ? deepSort('', v) : v));
      }
      const sorted: Record<string, unknown> = {};
      const keys = Object.keys(value as Record<string, unknown>).sort();
      for (const k of keys) {
        sorted[k] = (value as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return value;
  };
}

/**
 * Compute a SHA-256 hex digest from a string.
 *
 * Uses the Web Crypto API (available in Node.js 15+) for secure hashing.
 *
 * @param data - The string to hash.
 * @returns SHA-256 hex digest (64 characters).
 */
export async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compute a synchronous hex hash using a non-cryptographic algorithm.
 *
 * Used when async SHA-256 is not available or for offline contexts.
 * This is a backup — SHA-256 is the primary hash function.
 *
 * @param data - The string to hash.
 * @returns Hex digest string.
 */
export function simpleHash(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// ── Key Generation ──

/**
 * Serialize cache key components into a deterministic concatenated string.
 *
 * Format: `promptVersion|modelId|modelVersion|inputHash|engineVersion|mode`
 *
 * @param components - The cache key components.
 * @returns Deterministic concatenated string.
 */
export function serializeComponents(components: CacheKeyComponents): string {
  return [
    components.promptVersion,
    components.modelId,
    components.modelVersion,
    components.inputHash,
    components.engineVersion,
    components.mode,
  ].join('|');
}

/**
 * Generate a human-readable display string for cache key components.
 *
 * Format: `{mode}:{modelId}/{modelVersion}:pv{promptVersion}:ev{engineVersion}`
 *
 * @param components - The cache key components.
 * @returns Human-readable string.
 */
export function formatDisplayKey(components: CacheKeyComponents): string {
  return `${components.mode}:${components.modelId}/${components.modelVersion}:pv${components.promptVersion}:ev${components.engineVersion}`;
}

/**
 * Generate a deterministic cache key from the 6 components.
 *
 * Steps:
 * 1. Serialize all 6 components into a deterministic string
 * 2. Compute SHA-256 hash of the serialized string
 * 3. Return ResolvedCacheKey with key, components, and display info
 *
 * @param components - The 6 cache key components.
 * @returns A resolved cache key with SHA-256 digest.
 */
export async function generateCacheKey(components: CacheKeyComponents): Promise<ResolvedCacheKey> {
  const serialized = serializeComponents(components);
  const key = await sha256(serialized);

  return {
    key,
    components,
    display: formatDisplayKey(components),
  };
}

/**
 * Generate a cache key synchronously (using simple hash).
 *
 * Useful for synchronous code paths where async SHA-256 is unavailable.
 *
 * @param components - The 6 cache key components.
 * @returns A resolved cache key with simple hash.
 */
export function generateCacheKeySync(components: CacheKeyComponents): ResolvedCacheKey {
  const serialized = serializeComponents(components);
  const key = simpleHash(serialized);

  return {
    key,
    components,
    display: formatDisplayKey(components),
  };
}

/**
 * Build a cache key from context for the pipeline.
 *
 * @param promptVersion - Prompt template version.
 * @param modelId - Provider ID.
 * @param modelVersion - Model version string.
 * @param contextJson - Deterministic JSON string of the context.
 * @param engineVersion - Engine version.
 * @param mode - Explanation mode.
 * @returns Cache key components for use in cache operations.
 */
export function buildCacheKeyComponents(
  promptVersion: string,
  modelId: string,
  modelVersion: string,
  contextJson: string,
  engineVersion: string,
  mode: ExplanationMode,
): CacheKeyComponents {
  // Compute input hash from context
  const inputHash = simpleHash(contextJson);

  return {
    promptVersion,
    modelId,
    modelVersion,
    inputHash,
    engineVersion,
    mode,
  };
}
