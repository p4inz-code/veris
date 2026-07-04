/**
 * Explanation document — unified export model for explanation output.
 *
 * Provides a single document structure that all exporters consume,
 * ensuring deterministic, consistent output across formats.
 *
 * @module @veris/explain/export/explanation-document
 */

import type { Explanation, Citation, ExplanationMode } from '../types/explanation.js';

// ── Document Section ──

/** A single section within the exported document. */
export interface DocumentSection {
  /** Section heading text. */
  readonly heading: string;
  /** Heading level (1-6). */
  readonly level: number;
  /** Section body content. */
  readonly body: string;
  /** Sub-sections nested within this section. */
  readonly subsections: readonly DocumentSection[];
  /** Ordering key for deterministic sort. */
  readonly orderKey: string;
}

// ── Citation Entry ──

/** Formatted citation entry for the citations section. */
export interface CitationEntry {
  readonly id: string;
  readonly label: string;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly verified: boolean;
  readonly verificationError?: string;
}

// ── Export Metadata ──

/** Metadata attached to every exported document. */
export interface ExportMetadata {
  readonly exportedAt: string;
  readonly schemaVersion: string;
  readonly engineVersion: string;
}

// ── Explanation Document ──

/**
 * Unified export document model.
 *
 * All exporters (Markdown, JSON) consume this structure to produce
 * their respective output formats. This ensures deterministic output
 * regardless of which exporter is used.
 */
export interface ExplanationDocument {
  /** Document metadata. */
  readonly metadata: ExportMetadata;
  /** The explanation being exported. */
  readonly explanation: {
    readonly id: string;
    readonly subjectId: string;
    readonly subjectType: string;
    readonly mode: ExplanationMode;
  };
  /** Provider information. */
  readonly provider: {
    readonly id: string;
    readonly model: string;
  };
  /** Token usage. */
  readonly tokenUsage: {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly totalTokens: number;
  };
  /** Whether this is a cached response. */
  readonly cached: boolean;
  /** Whether the AI refused to explain. */
  readonly refused: boolean;
  /** Refusal reason (if refused). */
  readonly refusalReason?: string;
  /** The main explanation content sections. */
  readonly sections: readonly DocumentSection[];
  /** Sorted list of citation entries for the citations section. */
  readonly citations: readonly CitationEntry[];
  /** AI disclaimer text. */
  readonly disclaimer: string;
}

// ── Helpers ──

/**
 * Build a CitationEntry from a Citation.
 *
 * @param citation - The citation to convert.
 * @returns A formatted citation entry.
 */
export function citationToEntry(citation: Citation): CitationEntry {
  return {
    id: citation.id,
    label: citation.label,
    sourceType: citation.sourceType,
    sourceId: citation.sourceId,
    verified: citation.verified,
    verificationError: citation.verificationError,
  };
}

/**
 * Build citation entries from an Explanation.
 * Entries are sorted deterministically by ID.
 *
 * @param explanation - The explanation containing citations.
 * @returns Sorted citation entries.
 */
export function buildCitationEntries(explanation: Explanation): readonly CitationEntry[] {
  return explanation.citations.map(citationToEntry).sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Build the main body sections from an Explanation.
 *
 * Creates sections for:
 * - Summary (the explanation text)
 * - Provider metadata
 * - Token usage
 *
 * @param explanation - The explanation to extract sections from.
 * @returns Deterministically ordered sections.
 */
export function buildSections(explanation: Explanation): readonly DocumentSection[] {
  const sections: DocumentSection[] = [];

  // Main explanation text as the first section
  if (explanation.text.length > 0) {
    sections.push({
      heading: 'Explanation',
      level: 2,
      body: explanation.text,
      subsections: [],
      orderKey: '010_explanation',
    });
  }

  // Provider info
  sections.push({
    heading: 'Provider',
    level: 2,
    body: `Provider: ${explanation.provider.id}\nModel: ${explanation.provider.model}`,
    subsections: [],
    orderKey: '020_provider',
  });

  // Token usage
  sections.push({
    heading: 'Token Usage',
    level: 2,
    body: [
      `Prompt tokens: ${explanation.tokenUsage.promptTokens}`,
      `Completion tokens: ${explanation.tokenUsage.completionTokens}`,
      `Total tokens: ${explanation.tokenUsage.totalTokens}`,
      explanation.cached ? 'Cached: yes' : 'Cached: no',
    ].join('\n'),
    subsections: [],
    orderKey: '030_tokens',
  });

  return sections;
}

/**
 * Build a complete ExplanationDocument from an Explanation.
 *
 * @param explanation - The explanation to export.
 * @param metadata - Export metadata (clock injected here).
 * @returns A complete, deterministic ExplanationDocument.
 */
export function buildDocument(
  explanation: Explanation,
  metadata: ExportMetadata,
): ExplanationDocument {
  const citations = buildCitationEntries(explanation);
  const sections = buildSections(explanation);

  return {
    metadata,
    explanation: {
      id: explanation.id,
      subjectId: explanation.subjectId,
      subjectType: explanation.subjectType,
      mode: explanation.mode,
    },
    provider: {
      id: explanation.provider.id,
      model: explanation.provider.model,
    },
    tokenUsage: {
      promptTokens: explanation.tokenUsage.promptTokens,
      completionTokens: explanation.tokenUsage.completionTokens,
      totalTokens: explanation.tokenUsage.totalTokens,
    },
    cached: explanation.cached,
    refused: explanation.refused,
    refusalReason: explanation.refusalReason,
    sections,
    citations,
    disclaimer: explanation.disclaimer,
  };
}
