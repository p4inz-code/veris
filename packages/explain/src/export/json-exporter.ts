/**
 * JSON exporter — produces canonical JSON output from ExplanationDocument.
 *
 * Features:
 * - Deterministic key ordering (sorted keys at every level)
 * - Schema version embedded in output
 * - Pretty and compact modes
 * - Stable output across runs (no Date.now() — clock injected)
 *
 * @module @veris/explain/export/json-exporter
 */

import type {
  ExplanationDocument,
  DocumentSection,
  CitationEntry,
} from './explanation-document.js';
import type { ExportOptions } from './export-options.js';

// ── JSON Exporter ──

/**
 * Produces deterministic JSON output from an ExplanationDocument.
 *
 * Key ordering is enforced at every nesting level to ensure
 * stable, reproducible JSON output across runs.
 */
export class JsonExporter {
  private readonly options: ExportOptions;

  constructor(options: ExportOptions) {
    this.options = options;
  }

  /**
   * Export an ExplanationDocument as JSON.
   *
   * @param document - The document to export.
   * @returns The complete JSON string.
   */
  export(document: ExplanationDocument): string {
    const json = this.buildJson(document);
    return this.serialize(json);
  }

  // ── JSON Structure ──

  /**
   * Build the JSON-serializable object with deterministic key ordering.
   *
   * The JSON.stringify replacer (sortKeys) guarantees alphabetical key
   * ordering at every nesting level during serialization. The object
   * construction below uses a plain object — the replacer handles
   * deterministic ordering.
   */
  private buildJson(document: ExplanationDocument): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    result.cached = document.cached;
    result.citations = this.buildCitationArray(document.citations);
    result.disclaimer = document.disclaimer;
    result.explanation = {
      id: document.explanation.id,
      mode: document.explanation.mode,
      subjectId: document.explanation.subjectId,
      subjectType: document.explanation.subjectType,
    };
    result.metadata = {
      engineVersion: document.metadata.engineVersion,
      exportedAt: document.metadata.exportedAt,
      schemaVersion: document.metadata.schemaVersion,
    };
    result.provider = {
      id: document.provider.id,
      model: document.provider.model,
    };
    result.refused = document.refused;

    if (document.refusalReason !== undefined) {
      result.refusalReason = document.refusalReason;
    }

    result.sections = this.buildSectionArray(document.sections);
    result.tokenUsage = {
      completionTokens: document.tokenUsage.completionTokens,
      promptTokens: document.tokenUsage.promptTokens,
      totalTokens: document.tokenUsage.totalTokens,
    };

    return result;
  }

  /**
   * Build a citations array with deterministic ordering.
   * Key ordering is enforced by the JSON.stringify sortKeys replacer.
   */
  private buildCitationArray(citations: readonly CitationEntry[]): Record<string, unknown>[] {
    const sorted = [...citations].sort((a, b) => a.id.localeCompare(b.id));
    return sorted.map((c) => {
      const entry: Record<string, unknown> = {
        id: c.id,
        label: c.label,
        sourceId: c.sourceId,
        sourceType: c.sourceType,
        verified: c.verified,
      };
      if (c.verificationError !== undefined) {
        entry.verificationError = c.verificationError;
      }
      return entry;
    });
  }

  /**
   * Build a sections array with deterministic ordering.
   * Key ordering is enforced by the JSON.stringify sortKeys replacer.
   */
  private buildSectionArray(sections: readonly DocumentSection[]): Record<string, unknown>[] {
    const sorted = [...sections].sort((a, b) => a.orderKey.localeCompare(b.orderKey));
    return sorted.map((s) => {
      const section: Record<string, unknown> = {
        body: s.body,
        heading: s.heading,
        level: s.level,
        orderKey: s.orderKey,
      };

      if (s.subsections.length > 0) {
        section.subsections = this.buildSectionArray(s.subsections);
      }

      return section;
    });
  }

  // ── Serialization ──

  /**
   * Serialize the JSON object to a string.
   *
   * Enforces alphabetical key ordering by intercepting object keys
   * and sorting them deterministically.
   */
  private serialize(json: Record<string, unknown>): string {
    const indent = this.options.jsonMode === 'pretty' ? this.options.jsonIndent : 0;

    return JSON.stringify(json, this.sortKeys.bind(this), indent) + '\n';
  }

  /**
   * JSON.stringify replacer that sorts keys alphabetically.
   */
  private sortKeys(_key: string, value: unknown): unknown {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const ordered: Record<string, unknown> = {};
      const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
      for (const k of keys) {
        ordered[k] = (value as Record<string, unknown>)[k];
      }
      return ordered;
    }
    if (Array.isArray(value)) {
      // Don't reorder arrays — they have semantic ordering
      return value;
    }
    return value;
  }
}
