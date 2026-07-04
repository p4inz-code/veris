/**
 * Finding, Evidence, and related types for VERIS.
 *
 * Findings are the primary output consumers care about — completed analytical
 * conclusions with supporting evidence, severity, and traceability.
 *
 * @module @veris/core/types/finding
 */

import type { SourceLocation, ArtifactRef } from './location.js';
import type { RuleId, MatchDetail } from './rule.js';
import type { Severity } from './severity.js';
import type { TaxonomyId } from './taxonomy.js';

/** Evidence ID (prefix: "ev_"). */
export type EvidenceId = string;

/** Finding ID (prefix: "fin_"). */
export type FindingId = string;

/** BehaviorChain ID (prefix: "bc_"). */
export type BehaviorChainId = string;

/** Recommendation ID (prefix: "rec_"). */
export type RecommendationId = string;

/**
 * Evidence — the binding between a Behavior and the Rule that matched it.
 * Immutable after creation.
 */
export interface Evidence {
  /** Deterministic evidence ID. */
  readonly id: EvidenceId;
  /** The Rule that matched. */
  readonly ruleId: RuleId;
  /** The Behavior that was matched. */
  readonly behaviorId: string;
  /** The Finding this evidence supports. */
  readonly findingId: FindingId;
  /** Owning session ID. */
  readonly sessionId: string;
  /** The subset of behavior properties that triggered the match. */
  readonly matchedProperties: Record<string, unknown>;
  /** How the rule matched. */
  readonly matchDetail: MatchDetail;
  /** Confidence contributed to the finding [0.0, 1.0]. */
  readonly confidence: number;
}

/**
 * Finding — a completed analytical conclusion.
 * The primary output consumers care about.
 */
export interface Finding {
  /** Deterministic finding ID. */
  readonly id: FindingId;
  /** Owning session ID. */
  readonly sessionId: string;
  /** The rule that produced this finding. */
  readonly ruleId: RuleId;
  /** Associated behavior chain ID, if any. */
  readonly behaviorChainId: BehaviorChainId | null;
  /** Human-readable title. */
  readonly title: string;
  /** Detailed description. */
  readonly description: string;
  /** Severity level and score. */
  readonly severity: Severity;
  /** Overall confidence [0.0, 1.0]. */
  readonly confidence: number;
  /** Supporting evidence IDs. */
  readonly evidenceIds: readonly EvidenceId[];
  /** Artifacts involved. */
  readonly affectedArtifacts: readonly ArtifactRef[];
  /** Remediation recommendation IDs. */
  readonly recommendationIds?: readonly RecommendationId[];
  /** Taxonomy nodes this finding relates to. */
  readonly taxonomyIds: readonly TaxonomyId[];
  /** Finding-specific properties. */
  readonly properties?: Record<string, unknown>;
  /** When the finding was created (ISO 8601). */
  readonly createdAt: string;
}

/** Chain relationship type — how behaviors in a chain relate. */
export type ChainRelationshipType =
  'sequential' | 'causal' | 'conditional' | 'correlated' | 'graph' | 'parent-child' | 'data-flow';

/**
 * BehaviorChain — a sequence or graph of related behaviors
 * that represent a multi-step pattern.
 */
export interface BehaviorChain {
  /** Deterministic chain ID. */
  readonly id: BehaviorChainId;
  /** Owning session ID. */
  readonly sessionId: string;
  /** How behaviors relate. */
  readonly relationshipType: ChainRelationshipType;
  /** Behaviors in the chain (ordered). */
  readonly behaviorIds: readonly string[];
  /** Findings produced from this chain. */
  readonly findingIds?: readonly FindingId[];
  /** Impact on trust score [-1.0, 1.0]. */
  readonly trustImpact?: number;
  /** Human-readable description of the chain. */
  readonly description?: string;
  /** Chain-specific metadata. */
  readonly metadata?: Record<string, unknown>;
}

/** Remediation priority. */
export type RecommendationPriority = 'critical' | 'high' | 'medium' | 'low';

/** Estimated remediation effort. */
export type RemediationEffort = 'minutes' | 'hours' | 'days';

/** A code example showing before/after remediation. */
export interface CodeExample {
  /** Programming language. */
  readonly language: string;
  /** Vulnerable code. */
  readonly before: string;
  /** Remediated code. */
  readonly after: string;
}

/** External reference (CWE, OWASP, documentation). */
export interface ExternalReference {
  /** Reference label/type (e.g., "CWE", "OWASP", "URL"). */
  readonly label: string;
  /** Reference URL or identifier. */
  readonly url: string;
}

/**
 * Recommendation — actionable remediation guidance.
 */
export interface Recommendation {
  /** Deterministic recommendation ID. */
  readonly id: RecommendationId;
  /** Owning session ID. */
  readonly sessionId: string;
  /** Findings this recommendation addresses. */
  readonly findingIds: readonly FindingId[];
  /** Short action title. */
  readonly title: string;
  /** Steps to remediate. */
  readonly description: string;
  /** Remediation priority. */
  readonly priority: RecommendationPriority;
  /** Estimated remediation effort. */
  readonly effort: RemediationEffort;
  /** Whether an automated fix exists. */
  readonly autoFixAvailable: boolean;
  /** CWE, OWASP, documentation links. */
  readonly references?: readonly ExternalReference[];
  /** Before/after code examples. */
  readonly codeExamples?: readonly CodeExample[];
}
