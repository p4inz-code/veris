/**
 * Knowledge Pack Types — core type definitions for the Veris Knowledge Pack System.
 *
 * Knowledge Packs are deterministic offline intelligence databases that enrich
 * analysis. They are NOT signatures — they are structured threat intelligence
 * data that provides context, categorization, and enrichment for findings.
 *
 * Design principles:
 * - Offline-first: all pack data is loaded from disk, no network access
 * - Immutable: packs are frozen after loading
 * - Versioned: semantic versioning with compatibility checks
 * - Deterministic: same files → same loaded data
 * - Modular: packs can depend on other packs
 *
 * @module @veris/knowledge/packs/types
 */

// ── Pack Metadata ──

/** A pack dependency reference. */
export interface PackDependency {
  /** The dependent pack ID. */
  readonly id: string;
  /** Required version range (semver). */
  readonly version: string;
  /** Whether this dependency is optional. */
  readonly optional?: boolean;
}

/** An external reference for a knowledge entry. */
export interface KnowledgeReference {
  /** Reference label/name. */
  readonly label: string;
  /** Reference URL. */
  readonly url: string;
  /** Reference source (e.g., "mitre-attack", "owasp", "cwe"). */
  readonly source: string;
}

/** Complete pack metadata. */
export interface PackMetadata {
  /** Unique pack identifier (e.g., "malware-families"). */
  readonly id: string;
  /** Human-readable pack name. */
  readonly name: string;
  /** Pack version (semver). */
  readonly version: string;
  /** Detailed description of the pack contents. */
  readonly description: string;
  /** Pack author/creator. */
  readonly author: string;
  /** Pack license. */
  readonly license: string;
  /** Source URL for the pack. */
  readonly source: string;
  /** SHA-256 checksum of the pack file. */
  readonly checksum: string;
  /** Knowledge categories in this pack. */
  readonly categories: readonly string[];
  /** Tags for search/filtering. */
  readonly tags: readonly string[];
  /** Minimum supported Veris version. */
  readonly supportedVerisVersion: string;
  /** Pack creation date (ISO 8601). */
  readonly createdAt: string;
  /** Pack last updated date (ISO 8601). */
  readonly updatedAt: string;
  /** Pack dependencies. */
  readonly dependencies: readonly PackDependency[];
  /** External references for the pack itself. */
  readonly references: readonly KnowledgeReference[];
}

// ── Knowledge Entry ──

/** Severity guidance for a knowledge entry. */
export type KnowledgeSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** A single knowledge entry within a pack. */
export interface KnowledgeEntry {
  /** Unique entry ID within the pack (e.g., "mimikatz", "reflective-loading"). */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Detailed description. */
  readonly description: string;
  /** Knowledge category this entry belongs to. */
  readonly category: string;
  /** Tags for search/filtering. */
  readonly tags: readonly string[];
  /** Severity guidance (not final severity, just a hint). */
  readonly severity: KnowledgeSeverity;
  /** Behavioral description. */
  readonly behavior: string;
  /** Recommended remediation/action. */
  readonly recommendedAction: string;
  /** Detection indicators (features, patterns, strings, etc.). */
  readonly indicators: readonly KnowledgeIndicator[];
  /** External references. */
  readonly references: readonly KnowledgeReference[];
  /** MITRE ATT&CK technique IDs. */
  readonly mitreTechniques: readonly string[];
  /** Related entry IDs within the pack. */
  readonly relatedEntries: readonly string[];
  /** Additional metadata. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ── Knowledge Indicators ──

/** Types of indicators that can be used for matching. */
export type IndicatorType =
  | 'string-pattern'
  | 'file-name'
  | 'file-path'
  | 'registry-key'
  | 'process-name'
  | 'service-name'
  | 'named-pipe'
  | 'mutex'
  | 'api-call'
  | 'import-name'
  | 'section-name'
  | 'hash-md5'
  | 'hash-sha1'
  | 'hash-sha256'
  | 'ip-address'
  | 'domain-name'
  | 'url-pattern'
  | 'network-port'
  | 'feature-type'
  | 'capability-type'
  | 'evidence-type';

/** A single indicator used for matching knowledge entries to evidence. */
export interface KnowledgeIndicator {
  /** Indicator type. */
  readonly type: IndicatorType;
  /** The indicator value or pattern. */
  readonly value: string;
  /** Optional regex pattern (for string-pattern type). */
  readonly pattern?: string;
  /** Optional confidence contribution [0.0, 1.0]. */
  readonly confidence?: number;
  /** Optional context/description for this indicator. */
  readonly description?: string;
}

// ── Complete Knowledge Pack ──

/** A complete, validated knowledge pack. */
export interface KnowledgePack {
  /** Pack metadata. */
  readonly metadata: PackMetadata;
  /** Knowledge entries. */
  readonly entries: readonly KnowledgeEntry[];
  /** Pack content hash (for cache invalidation). */
  readonly contentHash: string;
}

// ── Pack File Format ──

/** The file format for loading packs from disk. */
export interface KnowledgePackFile {
  /** Pack metadata (required). */
  readonly metadata: Omit<PackMetadata, 'checksum'>;
  /** Knowledge entries (required). */
  readonly entries: readonly (Omit<KnowledgeEntry, 'references'> & {
    readonly references?: readonly KnowledgeReference[];
  })[];
}

// ── Enriched Evidence ──

/** Enrichment data attached to evidence when it matches a pack entry. */
export interface PackEnrichment {
  /** The pack ID that provided this enrichment. */
  readonly packId: string;
  /** The matching entry ID. */
  readonly entryId: string;
  /** The matching entry name. */
  readonly name: string;
  /** The knowledge family/category. */
  readonly family: string;
  /** Detailed description. */
  readonly description: string;
  /** Behavioral description. */
  readonly behavior: string;
  /** Severity guidance. */
  readonly severity: KnowledgeSeverity;
  /** Recommended remediation. */
  readonly remediation: string;
  /** External references. */
  readonly references: readonly KnowledgeReference[];
  /** MITRE ATT&CK technique IDs. */
  readonly mitreTechniques: readonly string[];
  /** CWE IDs associated with this entry. */
  readonly cweIds: readonly string[];
  /** Match confidence [0.0, 1.0]. */
  readonly matchConfidence: number;
  /** Which indicators matched. */
  readonly matchedIndicators: readonly string[];
  /** Source pack version for provenance. */
  readonly packVersion: string;
}

// ── Pack Load Result ──

/** Result of loading a pack file. */
export interface PackLoadResult {
  /** The loaded pack (undefined if failed). */
  readonly pack?: KnowledgePack;
  /** Load errors. */
  readonly errors: readonly PackError[];
  /** Load warnings. */
  readonly warnings: readonly string[];
}

/** A pack validation or loading error. */
export interface PackError {
  /** Error code. */
  readonly code: string;
  /** Human-readable message. */
  readonly message: string;
  /** Pack ID if pack-specific. */
  readonly packId?: string;
  /** Entry ID if entry-specific. */
  readonly entryId?: string;
  /** Field path if field-specific. */
  readonly path?: string;
}

/** Resolver match result. */
export interface ResolverMatch {
  /** The matching entry. */
  readonly entry: KnowledgeEntry;
  /** The pack this entry belongs to. */
  readonly pack: KnowledgePack;
  /** Match confidence [0.0, 1.0]. */
  readonly confidence: number;
  /** Which indicators matched. */
  readonly matchedIndicators: readonly string[];
}
