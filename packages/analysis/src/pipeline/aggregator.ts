/**
 * EvidenceAggregator — merges evidence from multiple analyzers.
 *
 * Functions:
 * - Merge evidence from every analyzer into a single ordered collection
 * - Deduplicate by evidence ID (deterministic)
 * - Normalize metadata across sources
 * - Maintain deterministic ordering (by type, then analyzer, then confidence)
 *
 * @module @veris/analysis/pipeline/aggregator
 */

import type { Evidence, EvidenceCategory } from '../types.js';

/** Ordering options for aggregated evidence. */
export type EvidenceOrder =
  'type-then-analyzer' | 'analyzer-then-type' | 'confidence-desc' | 'input-order';

/** Aggregation options. */
export interface AggregationOptions {
  /** Ordering strategy. */
  readonly order?: EvidenceOrder;
  /** Whether to deduplicate by evidence ID. */
  readonly deduplicate?: boolean;
  /** Minimum confidence to include [0.0, 1.0]. */
  readonly minConfidence?: number;
}

/** Default aggregation options. */
const DEFAULT_OPTIONS: AggregationOptions = Object.freeze({
  order: 'type-then-analyzer',
  deduplicate: true,
  minConfidence: 0,
});

/**
 * EvidenceAggregator — merges, deduplicates, and orders evidence.
 */
export class EvidenceAggregator {
  private readonly _options: AggregationOptions;

  constructor(options?: AggregationOptions) {
    this._options = Object.freeze({ ...DEFAULT_OPTIONS, ...options });
  }

  /**
   * Aggregate evidence from multiple sources.
   *
   * @param sources - Array of evidence arrays from different analyzers
   * @returns Merged, deduplicated, and ordered evidence
   */
  aggregate(...sources: readonly (readonly Evidence[])[]): readonly Evidence[] {
    // Merge all sources
    let all: Evidence[] = [];
    for (const source of sources) {
      all = all.concat(...source);
    }

    // Filter by confidence
    if (this._options.minConfidence && this._options.minConfidence > 0) {
      all = all.filter((e) => e.confidence >= this._options.minConfidence!);
    }

    // Deduplicate by evidence ID
    if (this._options.deduplicate) {
      all = this._deduplicate(all);
    }

    // Sort deterministically
    all = this._sort(all, this._options.order ?? 'type-then-analyzer');

    return Object.freeze(all);
  }

  /**
   * Aggregate with category statistics.
   */
  aggregateWithStats(...sources: readonly (readonly Evidence[])[]): AggregatedEvidence {
    const evidence = this.aggregate(...sources);
    const stats = this._computeStats(evidence);
    return Object.freeze({ evidence, stats });
  }

  /**
   * Merge two aggregated evidence sets.
   */
  merge(a: readonly Evidence[], b: readonly Evidence[]): readonly Evidence[] {
    return this.aggregate(a, b);
  }

  /**
   * Deduplicate by evidence ID (first occurrence wins).
   */
  private _deduplicate(evidence: Evidence[]): Evidence[] {
    const seen = new Set<string>();
    const result: Evidence[] = [];

    for (const ev of evidence) {
      if (!seen.has(ev.id)) {
        seen.add(ev.id);
        result.push(ev);
      }
    }

    return result;
  }

  /**
   * Sort evidence deterministically.
   */
  private _sort(evidence: Evidence[], order: EvidenceOrder): Evidence[] {
    const sorted = [...evidence];

    switch (order) {
      case 'type-then-analyzer':
        sorted.sort((a, b) => {
          const typeCmp = a.type.localeCompare(b.type);
          if (typeCmp !== 0) return typeCmp;
          const analyzerCmp = a.analyzerId.localeCompare(b.analyzerId);
          if (analyzerCmp !== 0) return analyzerCmp;
          return b.confidence - a.confidence;
        });
        break;

      case 'analyzer-then-type':
        sorted.sort((a, b) => {
          const analyzerCmp = a.analyzerId.localeCompare(b.analyzerId);
          if (analyzerCmp !== 0) return analyzerCmp;
          const typeCmp = a.type.localeCompare(b.type);
          if (typeCmp !== 0) return typeCmp;
          return b.confidence - a.confidence;
        });
        break;

      case 'confidence-desc':
        sorted.sort((a, b) => b.confidence - a.confidence);
        break;

      case 'input-order':
        // Already in input order
        break;
    }

    return sorted;
  }

  /**
   * Compute evidence statistics.
   */
  private _computeStats(evidence: readonly Evidence[]): AggregationStats {
    const byCategory = new Map<EvidenceCategory, number>();
    const byAnalyzer = new Map<string, number>();
    const byType = new Map<string, number>();

    for (const ev of evidence) {
      byCategory.set(ev.category, (byCategory.get(ev.category) ?? 0) + 1);
      byAnalyzer.set(ev.analyzerId, (byAnalyzer.get(ev.analyzerId) ?? 0) + 1);
      byType.set(ev.type, (byType.get(ev.type) ?? 0) + 1);
    }

    const confidenceValues = evidence.map((e) => e.confidence);
    const avgConfidence =
      confidenceValues.length > 0
        ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length
        : 0;

    return Object.freeze({
      totalEvidence: evidence.length,
      uniqueAnalyzers: byAnalyzer.size,
      uniqueCategories: byCategory.size,
      evidenceByCategory: Object.freeze(Object.fromEntries(byCategory)),
      evidenceByAnalyzer: Object.freeze(Object.fromEntries(byAnalyzer)),
      evidenceByType: Object.freeze(Object.fromEntries(byType)),
      averageConfidence: avgConfidence,
      maxConfidence: confidenceValues.length > 0 ? Math.max(...confidenceValues) : 0,
      minConfidence: confidenceValues.length > 0 ? Math.min(...confidenceValues) : 0,
    });
  }
}

/** Aggregated evidence with statistics. */
export interface AggregatedEvidence {
  readonly evidence: readonly Evidence[];
  readonly stats: AggregationStats;
}

/** Evidence aggregation statistics. */
export interface AggregationStats {
  readonly totalEvidence: number;
  readonly uniqueAnalyzers: number;
  readonly uniqueCategories: number;
  readonly evidenceByCategory: Readonly<Record<string, number>>;
  readonly evidenceByAnalyzer: Readonly<Record<string, number>>;
  readonly evidenceByType: Readonly<Record<string, number>>;
  readonly averageConfidence: number;
  readonly maxConfidence: number;
  readonly minConfidence: number;
}

/** Singleton instance. */
export const defaultAggregator = new EvidenceAggregator();
