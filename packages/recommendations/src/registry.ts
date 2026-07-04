/**
 * RecommendationRegistry — deterministic registry for recommendation storage, lookup, and validation.
 *
 * ## Invariants
 * - Deterministic — same registrations always produce same iteration order.
 * - Immutable after construction — recommendations cannot be modified once registered.
 * - Insertion-order preserving — iteration follows registration order.
 * - Duplicate detection — IDs and documentation references are checked for duplicates.
 * - Allocation-conscious — sorted cache is lazily rebuilt only when dirty.
 * - Zero hidden state — all state is explicit and inspectable.
 *
 * @module @veris/recommendations/registry
 */

import { PRIORITY_RANK, PRIORITY_ORDER } from './constants.js';
import { CATEGORIES, ACTIONS } from './types.js';
import type { Recommendation } from './types.js';
import type {
  RecommendationPriority,
  RecommendationCategory,
  RecommendationAction,
} from './types.js';

// ── Validation Types ──

/** Severity level for a validation finding. */
export type ValidationSeverity = 'error' | 'warning';

/**
 * A single validation finding.
 *
 * Each finding identifies a specific issue with a recommendation
 * or the registry state. Findings may be errors (blocking) or
 * warnings (advisory).
 */
export interface RegistryValidationFinding {
  /** Severity of the finding. */
  readonly severity: ValidationSeverity;
  /** Error/warning code for programmatic handling. */
  readonly code: string;
  /** Human-readable description of the finding. */
  readonly message: string;
  /** The recommendation ID this finding relates to, if applicable. */
  readonly recommendationId?: string;
  /** Path to the specific field that triggered the finding. */
  readonly path?: string;
}

/**
 * Complete validation result for a registry.
 *
 * Provides a summary of all findings, including both errors and warnings.
 * Consumers should check `valid` before relying on the registry state for
 * production use.
 */
export interface RegistryValidationResult {
  /** Whether the registry is valid (no error-level findings). */
  readonly valid: boolean;
  /** Total number of error-level findings. */
  readonly errorCount: number;
  /** Total number of warning-level findings. */
  readonly warningCount: number;
  /** All findings, sorted by recommendation ID then severity. */
  readonly findings: readonly RegistryValidationFinding[];
}

// ── Registry Interface ──

/**
 * Deterministic registry for recommendation storage and lookup.
 *
 * Provides CRUD-like operations, filtered listing, and structural validation.
 * All outputs are immutable. The registry itself is not intended to be
 * extended — compose with it rather than inherit from it.
 */
export interface RecommendationRegistry {
  /**
   * Register a single recommendation.
   *
   * @param recommendation - The recommendation to register (will be frozen).
   * @throws {Error} If a recommendation with the same ID is already registered.
   * @throws {Error} If the recommendation is not a valid object.
   */
  register(recommendation: Recommendation): void;

  /**
   * Register multiple recommendations in a single call.
   *
   * Registration is atomic — if any recommendation in the batch fails,
   * the entire batch is rejected and the registry state is unchanged.
   *
   * @param recommendations - Recommendations to register.
   * @throws {Error} If any recommendation is invalid or a duplicate.
   */
  registerMany(recommendations: readonly Recommendation[]): void;

  /**
   * Look up a recommendation by ID.
   *
   * @param id - The recommendation ID.
   * @returns The recommendation, or undefined if not found.
   */
  get(id: string): Recommendation | undefined;

  /**
   * Check if a recommendation is registered.
   *
   * @param id - The recommendation ID.
   * @returns True if a recommendation with this ID is registered.
   */
  has(id: string): boolean;

  /**
   * List all registered recommendations in insertion order.
   *
   * @returns Immutable array of all registered recommendations.
   */
  list(): readonly Recommendation[];

  /**
   * List recommendations filtered by category.
   *
   * @param category - The category to filter by.
   * @returns Immutable array of matching recommendations.
   */
  listByCategory(category: RecommendationCategory): readonly Recommendation[];

  /**
   * List recommendations filtered by priority.
   *
   * @param priority - The priority to filter by.
   * @returns Immutable array of matching recommendations.
   */
  listByPriority(priority: RecommendationPriority): readonly Recommendation[];

  /**
   * List recommendations filtered by action.
   *
   * @param action - The action to filter by.
   * @returns Immutable array of matching recommendations.
   */
  listByAction(action: RecommendationAction): readonly Recommendation[];

  /**
   * Run structural validation on the registry.
   *
   * Checks all recommendations for:
   * - Unique IDs across the registry
   * - Unique documentation reference IDs per recommendation
   * - Valid priority, category, and action values
   * - Frozen recommendation objects
   * - Readonly arrays on all recommendations
   *
   * Does NOT throw for normal validation failures — returns a structured result.
   *
   * @returns Validation result with all findings.
   */
  validate(): RegistryValidationResult;

  /**
   * Get the number of registered recommendations.
   *
   * @returns The total count of registered recommendations.
   */
  size(): number;
}

// ── Internal State Types ──

/** Internal recommendation entry stored in the registry. */
interface InternalEntry {
  /** The frozen recommendation object. */
  readonly recommendation: Recommendation;
  /** Unique documentation IDs extracted from this recommendation. */
  readonly documentationIds: readonly string[];
}

// ── Factory Function ──

/**
 * Create a new empty recommendation registry.
 *
 * The registry is deterministic, insertion-order preserving, and all
 * outputs are immutable.
 *
 * @returns A new RecommendationRegistry instance.
 */
export function createRecommendationRegistry(): RecommendationRegistry {
  return new RecommendationRegistryImpl();
}

// ── Implementation ──

/**
 * Internal implementation of RecommendationRegistry.
 *
 * Uses a Map for O(1) lookup and insertion-order preservation.
 * Sorted iteration is cached and lazily rebuilt on mutation.
 */
class RecommendationRegistryImpl implements RecommendationRegistry {
  /** Internal storage: Map<recommendationId, InternalEntry>. */
  private readonly _entries = new Map<string, InternalEntry>();

  /** Tracks registered documentation IDs for duplicate detection: Map<docId, recommendationId>. */
  private readonly _docIdIndex = new Map<string, string>();

  /** Whether the cached list needs rebuilding. */
  private _dirty = true;

  /** Cached sorted list of all recommendations. */
  private _cachedList: readonly Recommendation[] = Object.freeze([]);

  // ── Registration ──

  register(recommendation: Recommendation): void {
    this._validateRecommendationObject(recommendation);

    const id = recommendation.id;

    if (this._entries.has(id)) {
      throw new Error(
        `RecommendationRegistry: duplicate recommendation ID "${id}" — already registered`,
      );
    }

    // Freeze the recommendation to enforce immutability
    const frozen = Object.freeze({ ...recommendation });

    // Check for duplicate documentation IDs within this recommendation
    // BEFORE deduplication — checks raw documentationRefs, not de-duped IDs
    this._detectInternalDocIdDuplicatesInRaw(frozen);

    // Extract unique documentation IDs
    const docIds = this._extractDocumentationIds(frozen);

    // Check for documentation ID conflicts across the registry
    for (const docId of docIds) {
      if (this._docIdIndex.has(docId)) {
        throw new Error(
          `RecommendationRegistry: duplicate documentation reference ID "${docId}" ` +
            `— already used by recommendation "${this._docIdIndex.get(docId)}"`,
        );
      }
    }

    // Store
    const entry: InternalEntry = {
      recommendation: frozen,
      documentationIds: docIds,
    };

    this._entries.set(id, entry);

    // Index documentation IDs
    for (const docId of docIds) {
      this._docIdIndex.set(docId, id);
    }

    this._dirty = true;
  }

  registerMany(recommendations: readonly Recommendation[]): void {
    if (recommendations.length === 0) return;

    // Snapshot current state for rollback on failure
    const entriesSnapshot = new Map(this._entries);
    const docIdIndexSnapshot = new Map(this._docIdIndex);
    const dirtySnapshot = this._dirty;
    const cachedListSnapshot = this._cachedList;

    try {
      for (const recommendation of recommendations) {
        this.register(recommendation);
      }
    } catch (error) {
      // Rollback to snapshot state
      this._entries.clear();
      for (const [key, value] of entriesSnapshot) {
        this._entries.set(key, value);
      }
      this._docIdIndex.clear();
      for (const [key, value] of docIdIndexSnapshot) {
        this._docIdIndex.set(key, value);
      }
      this._dirty = dirtySnapshot;
      this._cachedList = cachedListSnapshot;
      throw error;
    }
  }

  // ── Lookup ──

  get(id: string): Recommendation | undefined {
    return this._entries.get(id)?.recommendation;
  }

  has(id: string): boolean {
    return this._entries.has(id);
  }

  // ── Listing ──

  list(): readonly Recommendation[] {
    this._maybeRebuildCache();
    return this._cachedList;
  }

  listByCategory(category: RecommendationCategory): readonly Recommendation[] {
    return Object.freeze(this.list().filter((r) => r.category === category));
  }

  listByPriority(priority: RecommendationPriority): readonly Recommendation[] {
    return Object.freeze(this.list().filter((r) => r.priority === priority));
  }

  listByAction(action: RecommendationAction): readonly Recommendation[] {
    return Object.freeze(this.list().filter((r) => r.action === action));
  }

  // ── Validation ──

  validate(): RegistryValidationResult {
    const findings: RegistryValidationFinding[] = [];
    const seenIds = new Set<string>();
    const seenDocIds = new Map<string, string>();

    for (const [, entry] of this._entries) {
      const rec = entry.recommendation;

      // Check frozen-ness
      if (!Object.isFrozen(rec)) {
        findings.push({
          severity: 'error',
          code: 'NOT_FROZEN',
          message: `Recommendation "${rec.id}" is not frozen`,
          recommendationId: rec.id,
        });
      }

      // Check readonly arrays
      if (!isReadonlyArray(rec.references)) {
        findings.push({
          severity: 'error',
          code: 'REFERENCES_NOT_READONLY',
          message: `Recommendation "${rec.id}" references array is not readonly`,
          recommendationId: rec.id,
          path: 'references',
        });
      }

      if (!isReadonlyArray(rec.documentationRefs)) {
        findings.push({
          severity: 'error',
          code: 'DOCUMENTATION_REFS_NOT_READONLY',
          message: `Recommendation "${rec.id}" documentationRefs array is not readonly`,
          recommendationId: rec.id,
          path: 'documentationRefs',
        });
      }

      // Check has references
      if (!rec.references || rec.references.length === 0) {
        findings.push({
          severity: 'error',
          code: 'EMPTY_REFERENCES',
          message: `Recommendation "${rec.id}" must have at least one reference`,
          recommendationId: rec.id,
          path: 'references',
        });
      }

      // Check for duplicate recommendation IDs (cross-registry)
      if (!seenIds.has(rec.id)) {
        seenIds.add(rec.id);
      } else {
        findings.push({
          severity: 'error',
          code: 'DUPLICATE_RECOMMENDATION_ID',
          message: `Duplicate recommendation ID "${rec.id}" found in registry`,
          recommendationId: rec.id,
        });
      }

      // Check documentation reference IDs
      if (rec.documentationRefs && rec.documentationRefs.length > 0) {
        const localDocIds = new Set<string>();

        for (const docRef of rec.documentationRefs) {
          // Check within same recommendation
          if (localDocIds.has(docRef.documentId)) {
            findings.push({
              severity: 'warning',
              code: 'DUPLICATE_DOC_ID_WITHIN_RECOMMENDATION',
              message: `Duplicate documentation reference ID "${docRef.documentId}" within recommendation "${rec.id}"`,
              recommendationId: rec.id,
              path: `documentationRefs[].documentId`,
            });
          }
          localDocIds.add(docRef.documentId);

          // Check across the registry
          if (seenDocIds.has(docRef.documentId)) {
            findings.push({
              severity: 'warning',
              code: 'DUPLICATE_DOC_ID_ACROSS_RECOMMENDATIONS',
              message: `Documentation reference ID "${docRef.documentId}" is used by both "${seenDocIds.get(docRef.documentId)}" and "${rec.id}"`,
              recommendationId: rec.id,
              path: `documentationRefs[].documentId`,
            });
          } else {
            seenDocIds.set(docRef.documentId, rec.id);
          }
        }
      }

      // Check valid priority
      if (!PRIORITY_ORDER.includes(rec.priority)) {
        findings.push({
          severity: 'error',
          code: 'INVALID_PRIORITY',
          message: `Recommendation "${rec.id}" has invalid priority "${rec.priority}"`,
          recommendationId: rec.id,
          path: 'priority',
        });
      }

      // Check valid category
      const validCategories = Object.values(CATEGORIES) as readonly string[];
      if (!validCategories.includes(rec.category)) {
        findings.push({
          severity: 'error',
          code: 'INVALID_CATEGORY',
          message: `Recommendation "${rec.id}" has invalid category "${rec.category}"`,
          recommendationId: rec.id,
          path: 'category',
        });
      }

      // Check valid action
      const validActions = Object.values(ACTIONS) as readonly string[];
      if (!validActions.includes(rec.action)) {
        findings.push({
          severity: 'error',
          code: 'INVALID_ACTION',
          message: `Recommendation "${rec.id}" has invalid action "${rec.action}"`,
          recommendationId: rec.id,
          path: 'action',
        });
      }
    }

    // Sort findings by recommendation ID then severity (errors first)
    const sorted = Object.freeze(
      [...findings].sort((a, b) => {
        const idA = a.recommendationId ?? '';
        const idB = b.recommendationId ?? '';
        if (idA !== idB) return idA.localeCompare(idB);
        // Errors before warnings
        if (a.severity !== b.severity) {
          return a.severity === 'error' ? -1 : 1;
        }
        return a.code.localeCompare(b.code);
      }),
    );

    const errorCount = sorted.filter((f) => f.severity === 'error').length;
    const warningCount = sorted.filter((f) => f.severity === 'warning').length;

    return Object.freeze({
      valid: errorCount === 0,
      errorCount,
      warningCount,
      findings: sorted,
    });
  }

  // ── Size ──

  size(): number {
    return this._entries.size;
  }

  // ── Private Helpers ──

  /**
   * Validate that the recommendation is a proper object.
   * Throws for programmer errors (null, undefined, missing id).
   */
  private _validateRecommendationObject(recommendation: Recommendation): void {
    if (!recommendation || typeof recommendation !== 'object') {
      throw new Error('RecommendationRegistry: invalid recommendation — must be a non-null object');
    }

    if (!recommendation.id || typeof recommendation.id !== 'string') {
      throw new Error(
        'RecommendationRegistry: invalid recommendation — id must be a non-empty string',
      );
    }
  }

  /**
   * Extract unique documentation reference IDs from a recommendation.
   */
  private _extractDocumentationIds(recommendation: Recommendation): readonly string[] {
    if (!recommendation.documentationRefs) {
      return Object.freeze([]);
    }
    const ids = new Set<string>();
    for (const docRef of recommendation.documentationRefs) {
      if (docRef.documentId) {
        ids.add(docRef.documentId);
      }
    }
    return Object.freeze([...ids]);
  }

  /**
   * Detect duplicate documentation IDs within the raw documentationRefs array.
   *
   * This checks the ORIGINAL array (not deduplicated) to catch duplicates
   * before `_extractDocumentationIds` deduplicates them via Set.
   */
  private _detectInternalDocIdDuplicatesInRaw(recommendation: Recommendation): void {
    if (!recommendation.documentationRefs) return;
    const seen = new Set<string>();
    for (const docRef of recommendation.documentationRefs) {
      if (!docRef.documentId) continue;
      if (seen.has(docRef.documentId)) {
        throw new Error(
          `RecommendationRegistry: duplicate documentation reference ID "${docRef.documentId}" within recommendation "${recommendation.id}"`,
        );
      }
      seen.add(docRef.documentId);
    }
  }

  /**
   * Rebuild the sorted cache if the registry has been mutated.
   */
  private _maybeRebuildCache(): void {
    if (!this._dirty) return;
    this._dirty = false;

    // Sort by priority (highest first), then by ID for deterministic ordering
    const sorted = [...this._entries.values()]
      .map((e) => e.recommendation)
      .sort((a, b) => {
        const rankA = PRIORITY_RANK[a.priority] ?? 99;
        const rankB = PRIORITY_RANK[b.priority] ?? 99;
        if (rankA !== rankB) return rankA - rankB;
        return a.id.localeCompare(b.id);
      });

    this._cachedList = Object.freeze(sorted);
  }
}

// ── Utility ──

/**
 * Check if a value is a readonly array at runtime.
 *
 * A readonly array is one that is both an Array and frozen,
 * such that its elements cannot be mutated.
 */
function isReadonlyArray(value: unknown): boolean {
  return Array.isArray(value) && Object.isFrozen(value);
}
