/**
 * Shared constants for @veris/recommendations.
 *
 * ## Invariants
 * - Schema version follows semver and is incremented on any breaking type change.
 * - Engine version follows semver and is incremented on any behavioral change.
 * - All constants are frozen at runtime to enforce immutability.
 * - All lookup tables are readonly and frozen.
 *
 * @module @veris/recommendations/constants
 */

import type {
  RecommendationPriority,
  RecommendationCategory,
  RecommendationAction,
  RecommendationSource,
} from './types.js';

// ── ID Prefixes ──

/** Recommendation ID prefix for deterministic IDs (e.g., "rec_a1b2c3..."). */
export const RECOMMENDATION_ID_PREFIX = 'rec' as const;

// ── Versioning ──

/**
 * Schema version for Recommendation/RecommendationResult serialization (semver).
 *
 * Matches the @veris/recommendations package version. Increment on any breaking
 * type change to the Recommendation or RecommendationResult interfaces.
 */
export const SCHEMA_VERSION = '0.1.0' as const;

/** Current recommendation engine version (semver). Updated with each release. */
export const ENGINE_VERSION = '0.1.0' as const;

// ── Priority Order ──

/**
 * Ordered recommendation priorities from most to least urgent.
 *
 * This ordering enables deterministic comparison and sorting:
 * critical (0) > high (1) > medium (2) > low (3)
 */
export const PRIORITY_ORDER: readonly RecommendationPriority[] = Object.freeze([
  'critical',
  'high',
  'medium',
  'low',
] as readonly RecommendationPriority[]);

/**
 * Priority order map for O(1) priority comparison.
 *
 * Maps each priority to its rank index for efficient sorting
 * and comparison. Lower index = higher priority.
 *
 * @example
 * ```typescript
 * if (PRIORITY_RANK[a] < PRIORITY_RANK[b]) { /* a is higher priority *\/ }
 * ```
 */
export const PRIORITY_RANK: Readonly<Record<RecommendationPriority, number>> = Object.freeze({
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
} as Record<RecommendationPriority, number>);

// ── Priority Labels ──

/**
 * Human-readable display labels for each priority level.
 * Frozen at runtime to enforce immutability.
 */
export const PRIORITY_LABELS: Readonly<Record<RecommendationPriority, string>> = Object.freeze({
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
} as Record<RecommendationPriority, string>);

// ── Category Lookup ──

/**
 * Human-readable display labels for each recommendation category.
 * Frozen at runtime to enforce immutability.
 */
export const CATEGORY_LABELS: Readonly<Record<RecommendationCategory, string>> = Object.freeze({
  remediation: 'Remediation',
  mitigation: 'Mitigation',
  investigation: 'Investigation',
  prevention: 'Prevention',
  monitoring: 'Monitoring',
  policy: 'Policy',
} as Record<RecommendationCategory, string>);

// ── Action Lookup ──

/**
 * Human-readable display labels for each recommendation action.
 * Frozen at runtime to enforce immutability.
 */
export const ACTION_LABELS: Readonly<Record<RecommendationAction, string>> = Object.freeze({
  remove: 'Remove',
  quarantine: 'Quarantine',
  review: 'Review',
  monitor: 'Monitor',
  'update-policy': 'Update Policy',
  escalate: 'Escalate',
  'no-action': 'No Action',
} as Record<RecommendationAction, string>);

// ── Priority-to-Action Map ──

/**
 * Default action for each priority level.
 *
 * Maps priorities to the most appropriate default action when
 * a more specific action cannot be determined.
 * Frozen at runtime to enforce immutability.
 */
export const PRIORITY_DEFAULT_ACTIONS: Readonly<
  Record<RecommendationPriority, RecommendationAction>
> = Object.freeze({
  critical: 'escalate' as RecommendationAction,
  high: 'review' as RecommendationAction,
  medium: 'monitor' as RecommendationAction,
  low: 'no-action' as RecommendationAction,
} as Record<RecommendationPriority, RecommendationAction>);

// ── Default Limits ──

/** Default maximum number of recommendations to generate. */
export const DEFAULT_MAX_RECOMMENDATIONS = 100;

/** Default minimum priority for generated recommendations. */
export const DEFAULT_MIN_PRIORITY: RecommendationPriority = 'low';

/** Default timeout in milliseconds for the evaluate operation. */
export const DEFAULT_TIMEOUT_MS = 30_000;

// ── Assessment Score Bounds ──

/** Minimum possible impact score. */
export const IMPACT_MIN = 0.0;

/** Maximum possible impact score. */
export const IMPACT_MAX = 10.0;

/** Minimum possible effort score. */
export const EFFORT_MIN = 0.0;

/** Maximum possible effort score. */
export const EFFORT_MAX = 10.0;

// ── Assessment Thresholds ──

/**
 * Default thresholds for deriving priority from (impact, effort).
 *
 * The impact-effort matrix partitions the [0.0, 10.0] × [0.0, 10.0] space into
 * four priority regions:
 *
 * - Critical:  high impact (≥ 7.0) AND low effort (≤ 3.0)
 * - High:      high impact (≥ 7.0) OR medium-high impact (≥ 4.0) with low effort
 * - Medium:    medium impact (≥ 4.0) OR high impact with high effort
 * - Low:       everything else
 *
 * The object is frozen at runtime to enforce immutability.
 */
export const ASSESSMENT_THRESHOLDS: AssessmentThresholdsConfig = Object.freeze({
  /** Impact threshold for "high impact" classification [0.0, 10.0]. */
  highImpactThreshold: 7.0,
  /** Impact threshold for "medium impact" classification [0.0, 10.0]. */
  mediumImpactThreshold: 4.0,
  /** Effort threshold for "low effort" classification [0.0, 10.0]. */
  lowEffortThreshold: 3.0,
  /** Effort threshold for "high effort" classification [0.0, 10.0]. */
  highEffortThreshold: 7.0,
});

/** Shape of the ASSESSMENT_THRESHOLDS constant for reuse in config types. */
export type AssessmentThresholdsConfig = {
  readonly highImpactThreshold: number;
  readonly mediumImpactThreshold: number;
  readonly lowEffortThreshold: number;
  readonly highEffortThreshold: number;
};

// ── Source Type Labels ──

/**
 * Human-readable display labels for each source type.
 * Frozen at runtime to enforce immutability.
 */
export const SOURCE_TYPE_LABELS: Readonly<Record<RecommendationSource, string>> = Object.freeze({
  rule: 'Rule Match',
  correlation: 'Correlation',
  evidence: 'Evidence',
  documentation: 'Documentation',
} as Record<RecommendationSource, string>);

// ── Source Type Order ──

/**
 * Ordered source types from most to least authoritative.
 * Frozen at runtime to enforce immutability.
 */
export const SOURCE_TYPE_ORDER: readonly RecommendationSource[] = Object.freeze([
  'rule' as RecommendationSource,
  'correlation' as RecommendationSource,
  'evidence' as RecommendationSource,
  'documentation' as RecommendationSource,
] as readonly RecommendationSource[]);
