/**
 * Recommendation Explainer — deterministic view layer for recommendations.
 *
 * ## Purpose
 * The explainer exposes existing deterministic recommendation data in
 * user-friendly structures. It NEVER creates recommendations, NEVER
 * modifies recommendations, and performs ZERO business logic.
 *
 * ## What It Does
 * - `explainRecommendation()` — explains WHY a recommendation exists
 *   by tracing its references back to input evidence IDs.
 * - `explainCategory()` — summarizes all recommendations in a category
 *   with priority distribution and documentation references.
 * - `breakdownByCategory()` — groups recommendations by category with
 *   stable deterministic ordering.
 * - `topRecommendations()` — returns highest-priority recommendations
 *   with a configurable limit.
 *
 * ## Ownership Boundaries
 * - Registry remains source of truth for recommendation storage.
 * - Engine remains source of truth for evaluation and matching.
 * - Explainer ONLY exposes deterministic views — no business logic,
 *   no AI, no NLP, no summaries, no generated text.
 *
 * @module @veris/recommendations/explainer
 */

import { PRIORITY_RANK } from './constants.js';
import { SOURCE_TYPES } from './types.js';
import type {
  Recommendation,
  RecommendationInput,
  RecommendationCollection,
  RecommendationReference,
  DocumentationReference,
  RecommendationPriority,
  RecommendationCategory,
} from './types.js';
import type { RecommendationSource } from './types.js';

// ── Explanation Types ──

/**
 * Deterministic explanation of why a recommendation exists.
 *
 * Every field is derived from existing data — no generated text,
 * no AI, no summaries.
 */
export interface RecommendationExplanation {
  /** The recommendation being explained. */
  readonly recommendation: Recommendation;

  /**
   * Rule match IDs from the input that matched this recommendation's
   * references. Empty when no rule references matched.
   */
  readonly matchedRuleIds: readonly string[];

  /**
   * Correlation IDs from the input that matched this recommendation's
   * references. Empty when no correlation references matched.
   */
  readonly matchedCorrelationIds: readonly string[];

  /**
   * Evidence IDs from the input that matched this recommendation's
   * references. Empty when no evidence references matched.
   */
  readonly matchedEvidenceIds: readonly string[];

  /**
   * All documentation references attached to this recommendation.
   * Empty when no documentation is available.
   */
  readonly documentationRefs: readonly DocumentationReference[];

  /** Priority level of the recommendation. */
  readonly priority: RecommendationPriority;

  /** Category of the recommendation. */
  readonly category: RecommendationCategory;

  /** Action recommended. */
  readonly action: string;

  /**
   * Human-readable reasons explaining the match.
   * Each reason corresponds to a matched reference.
   * No generated text — only references back to source names and IDs.
   */
  readonly matchReasons: readonly string[];
}

/**
 * Summary of recommendations within a single category.
 */
export interface CategoryExplanation {
  /** The category being explained. */
  readonly category: RecommendationCategory;

  /** Total number of recommendations in this category. */
  readonly recommendationCount: number;

  /** Distribution of priorities within this category. */
  readonly priorityDistribution: {
    readonly critical: number;
    readonly high: number;
    readonly medium: number;
    readonly low: number;
  };

  /** Recommendations in this category, sorted by priority → ID. */
  readonly recommendations: readonly Recommendation[];

  /**
   * All unique documentation references across recommendations
   * in this category. Sorted by documentId for deterministic ordering.
   */
  readonly documentationRefs: readonly DocumentationReference[];
}

/**
 * Complete breakdown of a collection grouped by category.
 */
export interface CategoryBreakdown {
  /** Explanations for each category that has recommendations. */
  readonly categories: readonly CategoryExplanation[];

  /** Total number of recommendations across all categories. */
  readonly totalCount: number;
}

// ── explainRecommendation ──

/**
 * Explain why a single recommendation exists by tracing its references
 * back to the input evidence IDs.
 *
 * @param recommendation - The recommendation to explain.
 * @param input - The recommendation input that was evaluated.
 * @returns A frozen RecommendationExplanation.
 *
 * ## Determinism
 * Pure function — same recommendation + input always produces the same
 * explanation. No AI, no NLP, no generated text.
 */
export function explainRecommendation(
  recommendation: Recommendation,
  input: RecommendationInput,
): RecommendationExplanation {
  // Build lookup sets from input IDs for O(1) matching
  const inputRuleIds = new Set(input.ruleMatchIds);
  const inputCorrelationIds = new Set(input.correlationIds);
  const inputEvidenceIds = new Set(input.evidenceIds);

  // Collect matched IDs and match reasons from the recommendation's references
  const matchedRuleIds: string[] = [];
  const matchedCorrelationIds: string[] = [];
  const matchedEvidenceIds: string[] = [];
  const matchReasons: string[] = [];

  for (const ref of recommendation.references) {
    const sourceId = ref.sourceId;

    if (
      ref.sourceType === (SOURCE_TYPES.RULE as RecommendationSource) &&
      inputRuleIds.has(sourceId)
    ) {
      matchedRuleIds.push(sourceId);
      matchReasons.push(`Matched rule: ${ref.sourceName} (${sourceId})`);
    } else if (
      ref.sourceType === (SOURCE_TYPES.CORRELATION as RecommendationSource) &&
      inputCorrelationIds.has(sourceId)
    ) {
      matchedCorrelationIds.push(sourceId);
      matchReasons.push(`Matched correlation: ${ref.sourceName} (${sourceId})`);
    } else if (
      ref.sourceType === (SOURCE_TYPES.EVIDENCE as RecommendationSource) &&
      inputEvidenceIds.has(sourceId)
    ) {
      matchedEvidenceIds.push(sourceId);
      matchReasons.push(`Matched evidence: ${ref.sourceName} (${sourceId})`);
    }
  }

  return Object.freeze<RecommendationExplanation>({
    recommendation,
    matchedRuleIds: Object.freeze(matchedRuleIds),
    matchedCorrelationIds: Object.freeze(matchedCorrelationIds),
    matchedEvidenceIds: Object.freeze(matchedEvidenceIds),
    documentationRefs: recommendation.documentationRefs,
    priority: recommendation.priority,
    category: recommendation.category,
    action: recommendation.action,
    matchReasons: Object.freeze(matchReasons),
  });
}

// ── explainCategory ──

/**
 * Summarize all recommendations within a single category.
 *
 * @param collection - The recommendation collection to analyze.
 * @param category - The category to explain.
 * @returns A frozen CategoryExplanation.
 *
 * ## Ordering
 * Recommendations within the category maintain the collection's
 * ordering (priority → category → ID).
 */
export function explainCategory(
  collection: RecommendationCollection,
  category: RecommendationCategory,
): CategoryExplanation {
  const unsorted: Recommendation[] = [];
  let critical = 0;
  let high = 0;
  let medium = 0;
  let low = 0;
  const docRefMap = new Map<string, DocumentationReference>();

  for (const rec of collection.items) {
    if (rec.category !== category) continue;

    unsorted.push(rec);

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

    // Collect unique documentation references
    for (const docRef of rec.documentationRefs) {
      if (!docRefMap.has(docRef.documentId)) {
        docRefMap.set(docRef.documentId, docRef);
      }
    }
  }

  // Sort recommendations by priority → ID for stable deterministic ordering
  const recs = [...unsorted].sort((a, b) => {
    const rankA = PRIORITY_RANK[a.priority] ?? 99;
    const rankB = PRIORITY_RANK[b.priority] ?? 99;
    if (rankA !== rankB) return rankA - rankB;
    return a.id.localeCompare(b.id);
  });

  // Sort documentation references by ID for deterministic ordering
  const docRefs = [...docRefMap.values()].sort((a, b) => a.documentId.localeCompare(b.documentId));

  return Object.freeze<CategoryExplanation>({
    category,
    recommendationCount: recs.length,
    priorityDistribution: Object.freeze({ critical, high, medium, low }),
    recommendations: Object.freeze(recs),
    documentationRefs: Object.freeze(docRefs),
  });
}

// ── breakdownByCategory ──

/**
 * Break down a collection into category-based groupings.
 *
 * Each category group is sorted by priority → ID within the category.
 * Categories are ordered alphabetically by category name.
 *
 * @param collection - The recommendation collection to break down.
 * @returns A frozen CategoryBreakdown.
 *
 * ## Determinism
 * Pure function — same collection always produces the same breakdown.
 */
export function breakdownByCategory(collection: RecommendationCollection): CategoryBreakdown {
  // Group recommendations by category
  const categoryMap = new Map<RecommendationCategory, Recommendation[]>();

  for (const rec of collection.items) {
    const existing = categoryMap.get(rec.category);
    if (existing) {
      existing.push(rec);
    } else {
      categoryMap.set(rec.category, [rec]);
    }
  }

  // Build category explanations with sorted categories
  const categories: CategoryExplanation[] = [];
  const sortedCategoryNames = [...categoryMap.keys()].sort((a, b) => a.localeCompare(b));

  for (const categoryName of sortedCategoryNames) {
    const recs = categoryMap.get(categoryName)!;

    // Initial sort to ensure priority → ID ordering within category
    const sortedRecs = [...recs].sort((a, b) => {
      const rankA = PRIORITY_RANK[a.priority] ?? 99;
      const rankB = PRIORITY_RANK[b.priority] ?? 99;
      if (rankA !== rankB) return rankA - rankB;
      return a.id.localeCompare(b.id);
    });

    let critical = 0;
    let high = 0;
    let medium = 0;
    let low = 0;
    const docRefMap = new Map<string, DocumentationReference>();

    for (const rec of sortedRecs) {
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
      for (const docRef of rec.documentationRefs) {
        if (!docRefMap.has(docRef.documentId)) {
          docRefMap.set(docRef.documentId, docRef);
        }
      }
    }

    const docRefs = [...docRefMap.values()].sort((a, b) =>
      a.documentId.localeCompare(b.documentId),
    );

    categories.push(
      Object.freeze<CategoryExplanation>({
        category: categoryName,
        recommendationCount: sortedRecs.length,
        priorityDistribution: Object.freeze({ critical, high, medium, low }),
        recommendations: Object.freeze(sortedRecs),
        documentationRefs: Object.freeze(docRefs),
      }),
    );
  }

  const totalCount = collection.totalCount;

  return Object.freeze<CategoryBreakdown>({
    categories: Object.freeze(categories),
    totalCount,
  });
}

// ── topRecommendations ──

/**
 * Return the highest-priority recommendations from a collection.
 *
 * The collection is assumed to already be sorted in the correct order
 * (priority → category → ID). No re-sorting is performed.
 *
 * @param collection - The recommendation collection to extract from.
 * @param limit - Maximum number of recommendations to return.
 *                Defaults to the collection's total count.
 * @returns A frozen array of the top N recommendations.
 *
 * ## No Mutation
 * The original collection is never modified. A new frozen array slice
 * is returned.
 *
 * ## No Unnecessary Sorting
 * When the collection is already ordered (which it always is from the
 * engine), this is O(n) for slicing.
 */
export function topRecommendations(
  collection: RecommendationCollection,
  limit?: number,
): readonly Recommendation[] {
  const count = limit ?? collection.totalCount;
  if (count <= 0) return Object.freeze([]);

  const sliced = collection.items.slice(0, Math.min(count, collection.items.length));
  return Object.freeze(sliced);
}
