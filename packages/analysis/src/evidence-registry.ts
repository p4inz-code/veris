/**
 * EvidenceRegistry — manages evidence collection, querying, and filtering.
 *
 * Provides:
 * - Collect evidence from multiple sources
 * - Query by artifact, category, type
 * - Filter by confidence threshold
 * - Deterministic ordering
 *
 * @module @veris/analysis/evidence-registry
 */

import type { Evidence, EvidenceCategory } from './types.js';

/**
 * Query options for retrieving evidence.
 */
export interface EvidenceQuery {
  /** Filter by artifact ID. */
  readonly artifactId?: string;
  /** Filter by evidence category. */
  readonly category?: EvidenceCategory;
  /** Filter by evidence type (prefix match). */
  readonly type?: string;
  /** Minimum confidence threshold [0.0, 1.0]. */
  readonly minConfidence?: number;
  /** Maximum number of results. */
  readonly limit?: number;
  /** Analyzer ID filter. */
  readonly analyzerId?: string;
}

/** Query result with evidence and metadata. */
export interface EvidenceQueryResult {
  /** Matching evidence items. */
  readonly evidence: readonly Evidence[];
  /** Total matched (before limit). */
  readonly total: number;
}

/**
 * Registry for collecting, storing, and querying evidence.
 *
 * Evidence is immutable once added. The registry provides
 * query capabilities with filtering by artifact, category,
 * type, confidence, and analyzer.
 */
export class EvidenceRegistry {
  private readonly _evidence: Evidence[] = [];

  /**
   * Add a single evidence item.
   */
  add(evidence: Evidence): void {
    this._evidence.push(evidence);
  }

  /**
   * Add multiple evidence items at once.
   */
  addAll(evidenceList: readonly Evidence[]): void {
    for (const ev of evidenceList) {
      this._evidence.push(ev);
    }
  }

  /**
   * Get all evidence.
   */
  getAll(): readonly Evidence[] {
    return Object.freeze([...this._evidence]);
  }

  /**
   * Query evidence with filters.
   */
  query(query: EvidenceQuery): EvidenceQueryResult {
    let results = [...this._evidence];

    if (query.artifactId) {
      results = results.filter((e) => e.artifactId === query.artifactId);
    }
    if (query.category) {
      results = results.filter((e) => e.category === query.category);
    }
    if (query.type) {
      results = results.filter((e) => e.type.startsWith(query.type!));
    }
    if (query.minConfidence !== undefined) {
      results = results.filter((e) => e.confidence >= query.minConfidence!);
    }
    if (query.analyzerId) {
      results = results.filter((e) => e.analyzerId === query.analyzerId);
    }

    const total = results.length;

    if (query.limit !== undefined && results.length > query.limit) {
      results = results.slice(0, query.limit);
    }

    return Object.freeze({
      evidence: Object.freeze(results),
      total,
    });
  }

  /**
   * Get evidence statistics.
   */
  getStats(): EvidenceRegistryStats {
    const categories = new Map<EvidenceCategory, number>();
    const analyzers = new Map<string, number>();

    for (const ev of this._evidence) {
      categories.set(ev.category, (categories.get(ev.category) ?? 0) + 1);
      analyzers.set(ev.analyzerId, (analyzers.get(ev.analyzerId) ?? 0) + 1);
    }

    return Object.freeze({
      totalEvidence: this._evidence.length,
      categories: Object.freeze(Object.fromEntries(categories)),
      analyzers: Object.freeze(Object.fromEntries(analyzers)),
    });
  }

  /**
   * Clear all evidence.
   */
  clear(): void {
    this._evidence.length = 0;
  }

  /**
   * Get the number of evidence items.
   */
  get size(): number {
    return this._evidence.length;
  }
}

/** Evidence registry statistics. */
export interface EvidenceRegistryStats {
  /** Total evidence items. */
  readonly totalEvidence: number;
  /** Evidence count per category. */
  readonly categories: Readonly<Record<string, number>>;
  /** Evidence count per analyzer. */
  readonly analyzers: Readonly<Record<string, number>>;
}
