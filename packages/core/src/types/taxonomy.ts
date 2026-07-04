/**
 * Taxonomy types for VERIS.
 *
 * The knowledge taxonomy provides canonical, language-agnostic
 * behavioral categories used throughout the analysis pipeline.
 *
 * @module @veris/core/types/taxonomy
 */

/** Taxonomy node ID (e.g., "T6100", "T1120"). */
export type TaxonomyId = string;

/**
 * A single node in the taxonomy tree.
 * Nodes are permanent once assigned (SPEC-010 §3 D4).
 */
export interface TaxonomyNode {
  /** Canonical taxonomy ID (e.g., "T6100"). */
  readonly id: TaxonomyId;
  /** Human-readable name (e.g., "File Read"). */
  readonly name: string;
  /** Parent node ID, or null for root categories. */
  readonly parentId: TaxonomyId | null;
  /** Description of what this taxonomy node represents. */
  readonly description: string;
  /** Default severity if unmitigated, or null. */
  readonly severity: { readonly level: string; readonly score: number } | null;
  /** Related CWE IDs. */
  readonly cweIds: readonly string[];
  /** Related OWASP category. */
  readonly owaspCategory: string | null;
  /** Related NIST control. */
  readonly nistControl: string | null;
  /** Search keywords for behavioral matching. */
  readonly keywords: readonly string[];
  /** Metadata about the node itself. */
  readonly metadata: TaxonomyNodeMetadata;
}

/** Metadata about a taxonomy node. */
export interface TaxonomyNodeMetadata {
  /** Depth in the hierarchy (0 = root, 1, 2, 3 max). */
  readonly depth: number;
  /** Whether behaviors can map directly to this node. */
  readonly isAbstract: boolean;
  /** Taxonomy version when this node was introduced. */
  readonly sinceVersion: string;
  /** Whether this node is deprecated. */
  readonly deprecated: boolean;
  /** Replacement node ID if deprecated. */
  readonly supersededBy: TaxonomyId | null;
}

/** A behavior observation mapped to a taxonomy node. */
export interface Behavior {
  /** Deterministic behavior ID. */
  readonly id: string;
  /** Source artifact ID. */
  readonly artifactId: string;
  /** Owning session ID. */
  readonly sessionId: string;
  /** Canonical taxonomy node this behavior maps to. */
  readonly taxonomyId: TaxonomyId;
  /** Feature IDs that produced this behavior. */
  readonly featureIds: readonly string[];
  /** Combined confidence [0.0, 1.0]. */
  readonly confidence: number;
  /** Behavior-specific properties. */
  readonly properties?: Record<string, unknown>;
  /** Classifier metadata. */
  readonly metadata?: Record<string, unknown>;
}
