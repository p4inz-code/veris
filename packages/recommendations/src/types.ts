/**
 * Core types for @veris/recommendations.
 *
 * The Recommendation Engine sits AFTER Risk and BEFORE the AI Assistant in the pipeline.
 *
 * ## Pipeline Position
 * Rules → Correlation → Risk → **Recommendations** → AI Assistant
 *
 * ## Core Invariants
 * - All outputs are immutable (readonly + frozen at construction).
 * - All IDs are deterministic — same input always produces same IDs.
 * - Recommendations NEVER invent advice — every recommendation originates from
 *   concrete evidence (rule matches, correlations, evidence, documentation).
 * - Recommendations are outputs of deterministic logic.
 * - AI may later explain recommendations, but AI NEVER creates them.
 * - Every recommendation is traceable to its source via references.
 *
 * @module @veris/recommendations/types
 */

// ── Recommendation Id ──

/**
 * Unique symbol for RecommendationId branded type safety.
 */
declare const RECOMMENDATION_ID_BRAND: unique symbol;

/**
 * Deterministic recommendation identifier.
 *
 * Branded string type — prevents accidental mixing of plain strings
 * with recommendation IDs at the type level.
 */
export type RecommendationId = string & { readonly [RECOMMENDATION_ID_BRAND]: true };

// ── Recommendation Priority ──

/**
 * Recommendation priority levels indicating urgency and importance.
 *
 * Priorities are ordered from most urgent to least urgent:
 * "critical" > "high" > "medium" > "low"
 *
 * Priority is derived deterministically from the impact and effort
 * assessment of a recommendation, never assigned arbitrarily.
 */
export type RecommendationPriority = 'critical' | 'high' | 'medium' | 'low';

// ── Recommendation Category ──

/**
 * Unique symbol for RecommendationCategory branded type safety.
 */
declare const RECOMMENDATION_CATEGORY_BRAND: unique symbol;

/**
 * The category of a recommendation.
 *
 * Branded string type — allows new categories to be added without
 * breaking consumers. Use the `CATEGORIES` constant for known values.
 *
 * Categories classify what KIND of action is being recommended,
 * which helps consumers group, filter, and prioritize recommendations.
 */
export type RecommendationCategory = string & { readonly [RECOMMENDATION_CATEGORY_BRAND]: true };

/**
 * Known recommendation category values.
 */
export const CATEGORIES: Readonly<{
  readonly REMEDIATION: RecommendationCategory;
  readonly MITIGATION: RecommendationCategory;
  readonly INVESTIGATION: RecommendationCategory;
  readonly PREVENTION: RecommendationCategory;
  readonly MONITORING: RecommendationCategory;
  readonly POLICY: RecommendationCategory;
}> = Object.freeze({
  /** Actions to fix or remove the identified issue. */
  REMEDIATION: 'remediation' as RecommendationCategory,
  /** Actions to reduce impact when full remediation is not possible. */
  MITIGATION: 'mitigation' as RecommendationCategory,
  /** Actions to gather more information. */
  INVESTIGATION: 'investigation' as RecommendationCategory,
  /** Actions to prevent similar issues in the future. */
  PREVENTION: 'prevention' as RecommendationCategory,
  /** Actions to monitor for changes or recurrence. */
  MONITORING: 'monitoring' as RecommendationCategory,
  /** Actions to update or create security policies. */
  POLICY: 'policy' as RecommendationCategory,
});

// ── Recommendation Action ──

/**
 * Unique symbol for RecommendationAction branded type safety.
 */
declare const RECOMMENDATION_ACTION_BRAND: unique symbol;

/**
 * The recommended course of action.
 *
 * Branded string type — allows new actions to be added without
 * breaking consumers. Use the `ACTIONS` constant for known values.
 *
 * An action answers: "What should be done?"
 * This is distinct from category, which answers: "What kind of action is this?"
 */
export type RecommendationAction = string & { readonly [RECOMMENDATION_ACTION_BRAND]: true };

/**
 * Known recommendation action values.
 */
export const ACTIONS: Readonly<{
  readonly REMOVE: RecommendationAction;
  readonly QUARANTINE: RecommendationAction;
  readonly REVIEW: RecommendationAction;
  readonly MONITOR: RecommendationAction;
  readonly UPDATE_POLICY: RecommendationAction;
  readonly ESCALATE: RecommendationAction;
  readonly NO_ACTION: RecommendationAction;
}> = Object.freeze({
  /** Remove the artifact or dependency entirely. */
  REMOVE: 'remove' as RecommendationAction,
  /** Quarantine the artifact for further analysis. */
  QUARANTINE: 'quarantine' as RecommendationAction,
  /** Review the artifact manually. */
  REVIEW: 'review' as RecommendationAction,
  /** Monitor the artifact for changes. */
  MONITOR: 'monitor' as RecommendationAction,
  /** Update security policies to detect similar issues. */
  UPDATE_POLICY: 'update-policy' as RecommendationAction,
  /** Escalate to a human analyst or security team. */
  ESCALATE: 'escalate' as RecommendationAction,
  /** No action required at this time. */
  NO_ACTION: 'no-action' as RecommendationAction,
});

// ── Recommendation Source ──

/**
 * Unique symbol for RecommendationSource branded type safety.
 */
declare const RECOMMENDATION_SOURCE_BRAND: unique symbol;

/**
 * The type of source that triggered a recommendation.
 *
 * Branded string type — new source types can be added without breaking
 * existing consumers. Use the `SOURCE_TYPES` constant for known values.
 */
export type RecommendationSource = string & { readonly [RECOMMENDATION_SOURCE_BRAND]: true };

/**
 * Known recommendation source type values.
 */
export const SOURCE_TYPES: Readonly<{
  readonly RULE: RecommendationSource;
  readonly CORRELATION: RecommendationSource;
  readonly EVIDENCE: RecommendationSource;
  readonly DOCUMENTATION: RecommendationSource;
}> = Object.freeze({
  /** Recommendation originating from a rule match. */
  RULE: 'rule' as RecommendationSource,
  /** Recommendation originating from a correlation (behavioral chain). */
  CORRELATION: 'correlation' as RecommendationSource,
  /** Recommendation originating directly from evidence. */
  EVIDENCE: 'evidence' as RecommendationSource,
  /** Recommendation originating from documentation references. */
  DOCUMENTATION: 'documentation' as RecommendationSource,
});

// ── Recommendation Reference ──

/**
 * A reference to the source evidence that produced a recommendation.
 *
 * Every recommendation must trace back to concrete evidence. This reference
 * records which source (rule, correlation, evidence, documentation) triggered
 * the recommendation and the specific ID of that source.
 *
 * A recommendation may have multiple references when it is derived from
 * multiple correlated pieces of evidence.
 */
export interface RecommendationReference {
  /** The type of source that triggered this recommendation. */
  readonly sourceType: RecommendationSource;
  /** The ID of the source (rule ID, correlation ID, evidence ID, document ID). */
  readonly sourceId: string;
  /** Human-readable name of the source for display purposes. */
  readonly sourceName: string;
}

// ── Documentation Reference ──

/**
 * A reference to external documentation relevant to a recommendation.
 *
 * Documentation references provide links to security best practices,
 * CVE descriptions, vendor documentation, or internal runbooks that
 * support the recommendation.
 */
export interface DocumentationReference {
  /** Documentation ID (e.g., "doc_cve-2024-1234", "doc_owasp-top10"). */
  readonly documentId: string;
  /** Human-readable title of the documentation. */
  readonly documentTitle: string;
  /** Specific section within the document, if applicable. */
  readonly section?: string;
  /** URL to the documentation, if publicly available. */
  readonly url?: string;
}

// ── Recommendation Assessment ──

/**
 * Impact and effort assessment for a recommendation.
 *
 * Assessments help prioritize recommendations by evaluating both the
 * potential impact of the issue and the effort required to address it.
 *
 * Both impact and effort are scored on a [0.0, 10.0] scale:
 * - impact: How severe is the issue if left unaddressed?
 * - effort: How much work is required to implement the recommendation?
 *
 * Priority is derived from the combination of impact and effort:
 * - High impact + Low effort → "critical"
 * - High impact + High effort → "high"
 * - Low impact + Low effort → "medium"
 * - Low impact + High effort → "low"
 */
export interface RecommendationAssessment {
  /**
   * Estimated impact of the issue if left unaddressed [0.0, 10.0].
   * Higher values indicate more severe impact.
   */
  readonly impact: number;
  /**
   * Estimated effort required to implement the recommendation [0.0, 10.0].
   * Higher values indicate more effort required.
   */
  readonly effort: number;
  /**
   * Overall priority derived from impact and effort.
   * This is the authoritative priority for the recommendation.
   */
  readonly priority: RecommendationPriority;
  /**
   * Human-readable explanation of why this assessment was reached.
   * Explains the reasoning behind impact, effort, and priority.
   */
  readonly rationale: string;
}

// ── Recommendation ──

/**
 * A single actionable recommendation produced by the recommendation engine.
 *
 * Recommendations are deterministic outputs derived from concrete evidence.
 * Every recommendation has a clear action, priority, category, and references
 * back to the evidence that produced it.
 *
 * ## Invariants
 * - `references` is never empty — every recommendation must originate from evidence.
 * - `id` is deterministic — same input always produces the same recommendation ID.
 * - `action`, `priority`, and `category` are derived from evidence, never invented.
 * - `assessment` is present when impact/effort scoring has been performed.
 *
 * ## Schema Versioning
 * The `schemaVersion` field MUST be checked before deserialization.
 * Consumers expecting schema version X should reject recommendations
 * with schema version Y where major versions differ.
 */
export interface Recommendation {
  /**
   * Data model schema version (semver).
   * MUST be the first field for schema detection during deserialization.
   */
  readonly schemaVersion: string;

  /**
   * Version of @veris/recommendations that produced this recommendation (semver).
   * Enables consumers to identify which engine version produced the output.
   */
  readonly engineVersion: string;

  /** Deterministic recommendation ID (prefix: "rec_"). */
  readonly id: string;

  /**
   * Priority level indicating urgency.
   * Derived deterministically from the assessment (impact × effort matrix).
   */
  readonly priority: RecommendationPriority;

  /**
   * Category classifying what kind of action is recommended.
   */
  readonly category: RecommendationCategory;

  /**
   * The specific course of action recommended.
   */
  readonly action: RecommendationAction;

  /**
   * Short, human-readable title for the recommendation.
   * One line summary suitable for listing in a dashboard.
   */
  readonly title: string;

  /**
   * Detailed description of the recommendation.
   * Explains what the issue is, why it matters, and what to do.
   */
  readonly description: string;

  /**
   * Evidence references that produced this recommendation.
   * Every recommendation must have at least one reference.
   * Never empty — all recommendations originate from concrete evidence.
   */
  readonly references: readonly RecommendationReference[];

  /**
   * Documentation references supporting this recommendation.
   * May be empty when no relevant documentation exists.
   */
  readonly documentationRefs: readonly DocumentationReference[];

  /**
   * Impact and effort assessment for this recommendation.
   * Present when assessment has been performed; null otherwise.
   */
  readonly assessment: RecommendationAssessment | null;

  /**
   * Human-readable rationale explaining why this recommendation was generated.
   * Traces the deterministic logic from evidence to recommendation.
   */
  readonly rationale: string;

  /**
   * Extensible metadata for consumer-specific context.
   * Consumers may store additional information here without modifying
   * the Recommendation type. All metadata is immutable.
   */
  readonly metadata: Readonly<Record<string, unknown>>;
}

// ── Recommendation Input ──

/**
 * The input context for the recommendation engine.
 *
 * Contains lightweight references to upstream pipeline outputs
 * (risk assessment, rule matches, correlations, evidence) that the
 * recommendation engine uses to derive actionable recommendations.
 *
 * All fields are lightweight references — no full domain objects.
 * This decouples the recommendation engine from upstream type changes.
 */
export interface RecommendationInput {
  /** Risk assessment ID that this recommendation is based on. */
  readonly riskAssessmentId: string;
  /** Owning session ID. */
  readonly sessionId: string;
  /** Artifact ID (null for repository-level recommendation). */
  readonly artifactId: string | null;
  /** Rule match IDs that triggered recommendations. */
  readonly ruleMatchIds: readonly string[];
  /** Correlation IDs that triggered recommendations. */
  readonly correlationIds: readonly string[];
  /** Evidence IDs that triggered recommendations. */
  readonly evidenceIds: readonly string[];
}

// ── Recommendation Result ──

/**
 * The complete output of a recommendation engine evaluation.
 *
 * Contains all generated recommendations along with summary counts
 * grouped by priority for efficient display and filtering.
 *
 * ## Schema Versioning
 * The `schemaVersion` field MUST be checked before deserialization.
 *
 * ## Immutability
 * Every field is readonly. The object itself is frozen at construction.
 */
export interface RecommendationResult {
  /**
   * Data model schema version (semver).
   * MUST be the first field for schema detection during deserialization.
   */
  readonly schemaVersion: string;

  /**
   * Version of @veris/recommendations that produced this result (semver).
   */
  readonly engineVersion: string;

  /** Deterministic result ID. */
  readonly id: string;

  /** Owning session ID. */
  readonly sessionId: string;

  /**
   * Artifact this recommendation result applies to.
   * `null` indicates a repository-level (aggregate) result.
   */
  readonly artifactId: string | null;

  /** Generated recommendations, organized as a collection. */
  readonly recommendations: RecommendationCollection;

  /** Total number of unique recommendations generated. */
  readonly totalCount: number;

  /** ISO 8601 timestamp when the result was generated. */
  readonly generatedAt: string;
}

// ── Recommendation Collection ──

/**
 * A collection of recommendations with priority-based summary counts.
 *
 * Provides both the full list of recommendations and pre-computed
 * counts for each priority level, enabling efficient UI rendering
 * without iterating the entire list.
 */
export interface RecommendationCollection {
  /** Ordered list of recommendations (sorted by priority descending). */
  readonly items: readonly Recommendation[];

  /** Total number of recommendations in this collection. */
  readonly totalCount: number;

  /** Whether recommendations were truncated (limited to max). */
  readonly truncated: boolean;

  /** Pre-computed counts by priority level for efficient display. */
  readonly counts: {
    /** Number of critical priority recommendations. */
    readonly critical: number;
    /** Number of high priority recommendations. */
    readonly high: number;
    /** Number of medium priority recommendations. */
    readonly medium: number;
    /** Number of low priority recommendations. */
    readonly low: number;
  };
}
