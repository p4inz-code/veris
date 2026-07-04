/**
 * Formatter options — configuration types for the deterministic output formatter.
 *
 * Defines per-mode formatting configurations, citation formatting options,
 * and global formatter settings. All options are purely presentational —
 * they never modify the evidence, citations, or structural content.
 *
 * @module @veris/explain/output/formatter-options
 */

import type { ExplanationMode } from '../types/explanation.js';

// ── Citation Format ──

/** Citation formatting style for inline references. */
export type CitationStyle = 'numbered' | 'bracketed' | 'inline';

/** How citations appear at the end of an explanation. */
export type CitationSectionStyle = 'list' | 'table' | 'compact';

// ── Heading Style ──

/** Heading level for generated section headings. */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** Style for generated headings. */
export type HeadingStyle = 'atx' | 'setext' | 'none';

// ── Paragraph Options ──

/** Paragraph wrapping configuration. */
export interface ParagraphOptions {
  /** Maximum line width in characters (0 = no wrapping). */
  readonly maxWidth: number;
  /** Whether to preserve existing line breaks. */
  readonly preserveLineBreaks: boolean;
  /** Paragraph separator string (default: "\n\n"). */
  readonly separator: string;
}

// ── List Options ──

/** List formatting configuration. */
export interface ListOptions {
  /** Unordered list marker character. */
  readonly unorderedMarker: '-' | '*' | '+';
  /** Whether to add a blank line before and after lists. */
  readonly spacing: boolean;
  /** Whether to number ordered lists. */
  readonly numbered: boolean;
}

// ── Citation Format Options ──

/** Citation formatting configuration. */
export interface CitationFormatOptions {
  /** How inline citations are rendered. */
  readonly inlineStyle: CitationStyle;
  /** How the citations section is rendered. */
  readonly sectionStyle: CitationSectionStyle;
  /** Whether to show source IDs in the citations section. */
  readonly showSourceIds: boolean;
  /** Whether to show verification status. */
  readonly showVerificationStatus: boolean;
  /** Heading text for the citations section (empty = no heading). */
  readonly sectionHeading: string;
}

// ── Mode Configuration ──

/** Per-mode formatting configuration. */
export interface ModeFormatConfig {
  /** Maximum number of sentences (0 = no limit). */
  readonly maxSentences: number;
  /** Maximum number of paragraphs (0 = no limit). */
  readonly maxParagraphs: number;
  /** Whether technical jargon is allowed. */
  readonly allowTechnicalJargon: boolean;
  /** Maximum citations per claim (0 = all). */
  readonly citationsPerClaim: number;
  /** Whether to show severity labels. */
  readonly showSeverity: boolean;
  /** Whether to show confidence scores. */
  readonly showConfidence: boolean;
  /** Whether to show full traceability chain. */
  readonly showTraceability: boolean;
  /** Whether to show source locations (file:line). */
  readonly showSourceLocations: boolean;
  /** Whether to include the recommendation summary. */
  readonly showRecommendations: boolean;
  /** Whether to include the AI disclaimer. */
  readonly showDisclaimer: boolean;
  /** Whether to include a summary section heading. */
  readonly showSummaryHeading: boolean;
  /** Whether to include evidence details in the output. */
  readonly showEvidenceDetails: boolean;
  /** Whether to include rule definitions in the output. */
  readonly showRuleDetails: boolean;
  /** Whether to include risk context in the output. */
  readonly showRiskContext: boolean;
  /** Whether to include report metadata in the output. */
  readonly showReportMeta: boolean;
}

// ── Global Formatter Options ──

/** Global formatter configuration. */
export interface FormatterOptions {
  /** Per-mode formatting configuration. */
  readonly modes: Record<ExplanationMode, ModeFormatConfig>;
  /** Citation formatting options. */
  readonly citations: CitationFormatOptions;
  /** Paragraph wrapping options. */
  readonly paragraphs: ParagraphOptions;
  /** List formatting options. */
  readonly lists: ListOptions;
  /** Heading style for generated headings. */
  readonly headingStyle: HeadingStyle;
  /** Heading level for the summary section. */
  readonly summaryHeadingLevel: HeadingLevel;
  /** Whether to normalize whitespace. */
  readonly normalizeWhitespace: boolean;
  /** Whether to produce stable deterministic output ordering. */
  readonly stableOrdering: boolean;
  /** Whether to output as JSON instead of Markdown. */
  readonly jsonOutput: boolean;
  /** Whether to indent JSON output. */
  readonly jsonIndent: number;
  /** Whether to include the raw citation markers in the text. */
  readonly includeRawCitations: boolean;
}

// ── Defaults ──

/** Default paragraph options. */
export const DEFAULT_PARAGRAPH_OPTIONS: ParagraphOptions = {
  maxWidth: 80,
  preserveLineBreaks: false,
  separator: '\n\n',
};

/** Default list options. */
export const DEFAULT_LIST_OPTIONS: ListOptions = {
  unorderedMarker: '-',
  spacing: true,
  numbered: false,
};

/** Default citation format options. */
export const DEFAULT_CITATION_FORMAT_OPTIONS: CitationFormatOptions = {
  inlineStyle: 'numbered',
  sectionStyle: 'list',
  showSourceIds: true,
  showVerificationStatus: false,
  sectionHeading: 'Citations',
};

/** Default global formatter options. */
export const DEFAULT_FORMATTER_OPTIONS: FormatterOptions = {
  modes: {
    simple: {
      maxSentences: 5,
      maxParagraphs: 1,
      allowTechnicalJargon: false,
      citationsPerClaim: 1,
      showSeverity: false,
      showConfidence: false,
      showTraceability: false,
      showSourceLocations: false,
      showRecommendations: false,
      showDisclaimer: true,
      showSummaryHeading: false,
      showEvidenceDetails: false,
      showRuleDetails: false,
      showRiskContext: false,
      showReportMeta: false,
    },
    technical: {
      maxSentences: 0,
      maxParagraphs: 3,
      allowTechnicalJargon: true,
      citationsPerClaim: 0,
      showSeverity: true,
      showConfidence: true,
      showTraceability: false,
      showSourceLocations: true,
      showRecommendations: true,
      showDisclaimer: true,
      showSummaryHeading: true,
      showEvidenceDetails: true,
      showRuleDetails: true,
      showRiskContext: true,
      showReportMeta: false,
    },
    expert: {
      maxSentences: 0,
      maxParagraphs: 5,
      allowTechnicalJargon: true,
      citationsPerClaim: 0,
      showSeverity: true,
      showConfidence: true,
      showTraceability: true,
      showSourceLocations: true,
      showRecommendations: true,
      showDisclaimer: true,
      showSummaryHeading: true,
      showEvidenceDetails: true,
      showRuleDetails: true,
      showRiskContext: true,
      showReportMeta: true,
    },
  },
  citations: DEFAULT_CITATION_FORMAT_OPTIONS,
  paragraphs: DEFAULT_PARAGRAPH_OPTIONS,
  lists: DEFAULT_LIST_OPTIONS,
  headingStyle: 'atx',
  summaryHeadingLevel: 2,
  normalizeWhitespace: true,
  stableOrdering: true,
  jsonOutput: false,
  jsonIndent: 2,
  includeRawCitations: false,
};
