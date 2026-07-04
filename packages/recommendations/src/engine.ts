/**
 * RecommendationEngine — deterministic evaluation orchestrator.
 *
 * ## Evaluation Pipeline
 *
 * The `RecommendationEngine` transforms `RecommendationInput` into a
 * complete `RecommendationResult` using only the registered
 * recommendations in a `RecommendationRegistry`:
 *
 * ```
 * RecommendationInput
 *   ↓
 * 1. Validate input
 *   ↓
 * 2. Collect candidates from registry
 *   ↓
 * 3. Deduplicate (by recommendation ID)
 *   ↓
 * 4. Sort: priority → category → ID
 *   ↓
 * 5. Apply limits
 *   ↓
 * 6. Build counts
 *   ↓
 * 7. Construct immutable RecommendationResult
 * ```
 *
 * ## Core Invariants
 * - Offline only — no network access.
 * - Deterministic only — identical inputs always produce identical outputs.
 * - Pure functions — no side effects.
 * - Zero randomness — no Math.random() or similar.
 * - Zero hidden state — all state is passed explicitly.
 * - Immutable outputs — every object is frozen, every array is readonly.
 * - Registry is the ONLY source of recommendations — never invented.
 *
 * ## Ownership Boundaries
 * The engine orchestrates, never invents. Every recommendation
 * originates from the registry. The engine only:
 * - Collects candidates from the registry
 * - Deduplicates
 * - Sorts deterministically
 * - Limits
 * - Freezes outputs
 *
 * @module @veris/recommendations/engine
 */

import {
  SCHEMA_VERSION,
  ENGINE_VERSION,
  PRIORITY_RANK,
  DEFAULT_MAX_RECOMMENDATIONS,
  RECOMMENDATION_ID_PREFIX,
} from './constants.js';
import type { RecommendationRegistry } from './registry.js';
import type { Recommendation } from './types.js';
import type {
  RecommendationInput,
  RecommendationResult,
  RecommendationCollection,
} from './types.js';
import type { RecommendationPriority, RecommendationCategory } from './types.js';

// ── Engine Options ──

/**
 * Configuration options for the RecommendationEngine.
 *
 * All options are optional — sensible defaults are provided.
 */
export interface RecommendationEngineOptions {
  /**
   * The recommendation registry containing all known recommendations.
   * This is the exclusive source of recommendations — the engine
   * never invents advice.
   */
  readonly registry: RecommendationRegistry;

  /**
   * Maximum number of recommendations to include in the result.
   * @default DEFAULT_MAX_RECOMMENDATIONS (100)
   */
  readonly maxRecommendations?: number;

  /**
   * Deterministic timestamp override for the result's `generatedAt` field.
   *
   * When provided, the result uses this exact timestamp instead of
   * the current time. This enables fully deterministic results for
   * testing and reproducible builds.
   *
   * When omitted, the result uses the current time.
   */
  readonly generatedAt?: string;
}

// ── Engine Interface ──

/**
 * Deterministic recommendation evaluation engine.
 *
 * Transforms a `RecommendationInput` into a `RecommendationResult`
 * by collecting, sorting, and limiting recommendations from the
 * registry.
 */
export interface RecommendationEngine {
  /**
   * Evaluate input and produce a deterministic recommendation result.
   *
   * @param input - The recommendation input (risk assessment context).
   * @returns A frozen, immutable RecommendationResult.
   * @throws {TypeError} If input is null or undefined.
   */
  evaluate(input: RecommendationInput): RecommendationResult;
}

// ── Factory Function ──

/**
 * Create a new RecommendationEngine instance.
 *
 * @param options - Engine configuration (registry is required).
 * @returns A new RecommendationEngine instance.
 * @throws {TypeError} If registry is not provided.
 */
export function createRecommendationEngine(
  options: RecommendationEngineOptions,
): RecommendationEngine {
  if (!options || !options.registry) {
    throw new TypeError('RecommendationEngine: a registry is required');
  }
  return new RecommendationEngineImpl(options);
}

// ── Implementation ──

/**
 * Internal implementation of RecommendationEngine.
 *
 * Stateless — all mutable state is local to `evaluate()`.
 */
class RecommendationEngineImpl implements RecommendationEngine {
  private readonly _registry: RecommendationRegistry;
  private readonly _maxRecommendations: number;
  private readonly _generatedAt: string | undefined;

  constructor(options: RecommendationEngineOptions) {
    this._registry = options.registry;
    this._maxRecommendations = options.maxRecommendations ?? DEFAULT_MAX_RECOMMENDATIONS;
    this._generatedAt = options.generatedAt;
  }

  evaluate(input: RecommendationInput): RecommendationResult {
    // Stage 1 — validate input.
    if (!input) {
      throw new TypeError('RecommendationInput is required');
    }

    // Stage 2 — collect candidates from the registry.
    const allRecommendations = this._registry.list();

    // Stage 3 — filter candidates based on input evidence.
    // A recommendation matches if ANY of its references' sourceIds
    // appear in the input's ruleMatchIds, correlationIds, or evidenceIds.
    // When input has no IDs, no recommendations can be matched.
    const candidates = this._collectCandidates(allRecommendations, input);

    // Stage 4 — deduplicate by recommendation ID.
    const deduplicated = this._deduplicate(candidates);

    // Stage 5 — stable deterministic sort: priority → category → ID.
    const sorted = this._sort(deduplicated);

    // Stage 6 — apply limit.
    const limited = this._limit(sorted, this._maxRecommendations);
    const truncated = limited.length < sorted.length;

    // Stage 7 — build collection with counts.
    const collection = this._buildCollection(limited, truncated);

    // Stage 8 — build deterministic result ID.
    const id = this._generateResultId(input);

    // Stage 9 — resolve generatedAt timestamp.
    const generatedAt = this._generatedAt ?? new Date().toISOString();

    // Stage 10 — construct and freeze the result.
    return Object.freeze<RecommendationResult>({
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      id,
      sessionId: input.sessionId,
      artifactId: input.artifactId,
      recommendations: collection,
      totalCount: collection.totalCount,
      generatedAt,
    });
  }

  // ── Private: Candidate Collection ──

  /**
   * Collect recommendation candidates by matching input IDs against
   * recommendation references.
   *
   * A recommendation matches if any of its reference sourceIds appear
   * in the input's ruleMatchIds, correlationIds, or evidenceIds.
   *
   * When the input has NO IDs, no recommendations are returned.
   *
   * This is a pure, deterministic matching function — no AI, no NLP,
   * no heuristics, no scoring, no probabilities.
   */
  private _collectCandidates(
    recommendations: readonly Recommendation[],
    input: RecommendationInput,
  ): readonly Recommendation[] {
    // Build a set of all input IDs for O(1) lookup
    const inputIds = new Set<string>();
    for (const id of input.ruleMatchIds) inputIds.add(id);
    for (const id of input.correlationIds) inputIds.add(id);
    for (const id of input.evidenceIds) inputIds.add(id);

    // If input has no IDs, no recommendations can be matched
    if (inputIds.size === 0) {
      return Object.freeze([]);
    }

    // Match: a recommendation matches if any reference sourceId is in inputIds
    const matched: Recommendation[] = [];

    for (const rec of recommendations) {
      for (const ref of rec.references) {
        if (inputIds.has(ref.sourceId)) {
          matched.push(rec);
          break; // One match per recommendation is enough
        }
      }
    }

    return Object.freeze(matched);
  }

  // ── Private: Deduplication ──

  /**
   * Deduplicate recommendations by ID, preserving the first occurrence.
   *
   * Uses a Set for O(1) deduplication. Stable — preserves order.
   */
  private _deduplicate(recommendations: readonly Recommendation[]): readonly Recommendation[] {
    const seen = new Set<string>();
    const deduped: Recommendation[] = [];

    for (const rec of recommendations) {
      if (!seen.has(rec.id)) {
        seen.add(rec.id);
        deduped.push(rec);
      }
    }

    return Object.freeze(deduped);
  }

  // ── Private: Sorting ──

  /**
   * Stable deterministic sort: priority → category → recommendation ID.
   *
   * Priority ordering uses PRIORITY_RANK (lower rank = higher priority).
   * Category ordering uses localeCompare for deterministic string comparison.
   * ID ordering uses localeCompare as final tiebreaker.
   *
   * Never relies on insertion order — always explicit triple-key sort.
   */
  private _sort(recommendations: readonly Recommendation[]): readonly Recommendation[] {
    const sorted = [...recommendations].sort((a, b) => {
      // 1. Sort by priority rank (ascending = higher priority first)
      const priorityA = PRIORITY_RANK[a.priority] ?? 99;
      const priorityB = PRIORITY_RANK[b.priority] ?? 99;
      if (priorityA !== priorityB) return priorityA - priorityB;

      // 2. Sort by category (ascending alphabetical)
      const catCompare = a.category.localeCompare(b.category);
      if (catCompare !== 0) return catCompare;

      // 3. Sort by recommendation ID (ascending alphabetical)
      return a.id.localeCompare(b.id);
    });

    return Object.freeze(sorted);
  }

  // ── Private: Limiting ──

  /**
   * Limit recommendations to at most maxCount items.
   */
  private _limit(
    recommendations: readonly Recommendation[],
    maxCount: number,
  ): readonly Recommendation[] {
    if (recommendations.length <= maxCount) {
      return recommendations;
    }
    return Object.freeze(recommendations.slice(0, maxCount));
  }

  // ── Private: Collection Building ──

  /**
   * Build a RecommendationCollection from the final list.
   *
   * Pre-computes priority counts for efficient display without
   * requiring consumers to iterate the list.
   */
  private _buildCollection(
    recommendations: readonly Recommendation[],
    truncated: boolean,
  ): RecommendationCollection {
    let critical = 0;
    let high = 0;
    let medium = 0;
    let low = 0;

    for (const rec of recommendations) {
      switch (rec.priority) {
        case 'critical':
          critical++;
          break;
        case 'high':
          high++;
          break;
        case 'medium':
          medium++;
          break;
        case 'low':
          low++;
          break;
      }
    }

    return Object.freeze<RecommendationCollection>({
      items: recommendations,
      totalCount: recommendations.length,
      truncated,
      counts: Object.freeze({ critical, high, medium, low }),
    });
  }

  // ── Private: Result ID Generation ──

  /**
   * Generate a deterministic result ID from the input.
   *
   * The ID uses the RECOMMENDATION_ID_PREFIX followed by a
   * deterministic hash of the session ID and artifact ID.
   *
   * Same input always produces the same ID.
   */
  private _generateResultId(input: RecommendationInput): string {
    const base = `${input.sessionId}:${input.artifactId ?? ''}`;
    // Simple deterministic hash (Fowler-Noll-Vo-1a 32-bit)
    const hash = this._fnv1a(base);
    return `${RECOMMENDATION_ID_PREFIX}_${hash}`;
  }

  /**
   * FNV-1a 32-bit hash — deterministic, fast, no dependencies.
   *
   * Returns a hex string of the hash value.
   */
  private _fnv1a(input: string): string {
    let hash = 0x811c9dc5; // FNV offset basis (32-bit)
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193); // FNV prime (32-bit)
    }
    // Convert to unsigned 32-bit integer and then to hex
    return (hash >>> 0).toString(16);
  }
}
