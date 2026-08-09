/**
 * Evidence Enricher — attaches Knowledge Pack data to analysis evidence.
 *
 * When evidence matches a pack entry, the enricher attaches:
 * - Knowledge ID
 * - Family/category
 * - Description
 * - Behavior
 * - References
 * - Severity guidance
 * - Recommended remediation
 *
 * @module @veris/knowledge/packs/enricher
 */

import { EvidenceValueExtractor, type ExtractedValue } from './evidence-extractor.js';
import { PackResolver } from './resolver.js';
import type {
  KnowledgePack,
  KnowledgeEntry,
  PackEnrichment,
  ResolverMatch,
  KnowledgeReference,
  KnowledgeSeverity,
} from './types.js';

/** Input evidence for enrichment. */
export interface EvidenceForEnrichment {
  /** Evidence ID. */
  readonly id: string;
  /** Evidence type (e.g., "pe-import", "high-entropy"). */
  readonly type: string;
  /** Evidence category. */
  readonly category: string;
  /** Evidence value or name. */
  readonly value: string;
  /** Additional metadata. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Enrichment result. */
export interface EnrichmentResult {
  /** The evidence ID. */
  readonly evidenceId: string;
  /** Enrichments found (may be empty). */
  readonly enrichments: readonly PackEnrichment[];
  /** Whether any enrichment matched. */
  readonly enriched: boolean;
}

/**
 * Evidence Enricher — matches evidence against knowledge packs
 * and produces enrichment data.
 */
export class EvidenceEnricher {
  private readonly _resolver: PackResolver;
  private readonly _matchThreshold: number;
  private readonly _extractor: EvidenceValueExtractor;

  constructor(resolver: PackResolver, matchThreshold?: number, extractor?: EvidenceValueExtractor) {
    this._resolver = resolver;
    this._matchThreshold = matchThreshold ?? 0.3;
    this._extractor = extractor ?? new EvidenceValueExtractor();
  }

  /** The underlying resolver. */
  get resolver(): PackResolver {
    return this._resolver;
  }

  /**
   * Enrich a single piece of evidence with deep value extraction.
   */
  enrich(evidence: EvidenceForEnrichment): EnrichmentResult {
    const indicators: Array<{ type: string; value: string }> = [];

    // Build search indicators from evidence
    if (evidence.value) {
      indicators.push({ type: this.mapToIndicatorType(evidence.type), value: evidence.value });
    }

    // Also search by type
    indicators.push({ type: 'evidence-type', value: evidence.type });

    // Deep extraction: use EvidenceValueExtractor to pull values from metadata
    if (evidence.metadata) {
      const extractedValues = this._extractor.extract(
        evidence.type,
        evidence.category,
        evidence.metadata,
      );
      for (const ev of extractedValues) {
        indicators.push({ type: ev.indicatorType, value: ev.value });
        // Also try with the evidence type as a secondary search
        indicators.push({ type: 'evidence-type', value: ev.value });
      }
    }

    const matches = this._resolver.resolveByIndicators(indicators);

    const enrichments: PackEnrichment[] = matches
      .filter((m) => m.confidence >= this._matchThreshold)
      .map((m) => this.createEnrichment(m));

    return {
      evidenceId: evidence.id,
      enrichments: Object.freeze(enrichments),
      enriched: enrichments.length > 0,
    };
  }

  /**
   * Enrich multiple pieces of evidence.
   */
  enrichBatch(evidence: readonly EvidenceForEnrichment[]): readonly EnrichmentResult[] {
    return Object.freeze(evidence.map((e) => this.enrich(e)));
  }

  /**
   * Get all enrichments across evidence, deduplicated by entry.
   */
  getUniqueEnrichments(results: readonly EnrichmentResult[]): readonly PackEnrichment[] {
    const seen = new Set<string>();
    const unique: PackEnrichment[] = [];

    for (const result of results) {
      for (const enrichment of result.enrichments) {
        const key = `${enrichment.packId}:${enrichment.entryId}`;
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(enrichment);
        }
      }
    }

    return Object.freeze(unique);
  }

  /**
   * Map evidence type to indicator type for lookup.
   */
  private mapToIndicatorType(evidenceType: string): string {
    const typeMap: Record<string, string> = {
      'pe-import': 'import-name',
      'pe-export': 'import-name',
      'elf-import': 'import-name',
      'macho-import': 'import-name',
      'string-literal': 'string-pattern',
      'file-path': 'file-path',
      'registry-key': 'registry-key',
      'process-name': 'process-name',
      'service-name': 'service-name',
      'named-pipe': 'named-pipe',
      mutex: 'mutex',
      'api-call': 'api-call',
      'function-call': 'api-call',
      'ip-address': 'ip-address',
      'domain-name': 'domain-name',
      url: 'url-pattern',
      capability: 'capability-type',
      'import-statement': 'string-pattern',
      'section-header': 'section-name',
    };

    return typeMap[evidenceType] ?? evidenceType;
  }

  /**
   * Create a PackEnrichment from a resolver match.
   */
  private createEnrichment(match: ResolverMatch): PackEnrichment {
    const entry = match.entry;
    const cweIds: string[] = [];
    for (const ref of entry.references) {
      if (ref.source === 'cwe' || ref.label.startsWith('CWE-')) {
        cweIds.push(ref.label);
      }
    }
    return Object.freeze({
      packId: match.pack.metadata.id,
      entryId: entry.id,
      name: entry.name,
      family: entry.category,
      description: entry.description,
      behavior: entry.behavior,
      severity: entry.severity,
      remediation: entry.recommendedAction,
      references: Object.freeze(entry.references),
      mitreTechniques: Object.freeze(entry.mitreTechniques),
      cweIds: Object.freeze(cweIds),
      matchConfidence: match.confidence,
      matchedIndicators: Object.freeze(match.matchedIndicators),
      packVersion: match.pack.metadata.version,
    });
  }
}
