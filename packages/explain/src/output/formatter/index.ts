/**
 * Formatter module — deterministic output formatting for explanations.
 *
 * The formatter system consists of:
 * - {@link Formatter} — Main formatter class using presets and utilities
 * - {@link ExplanationFormatter} — Higher-level formatter for Explanation objects
 * - {@link FormatterOptions} — Global formatter configuration types
 * - {@link ModeFormatConfig} — Per-mode formatting configuration
 * - Presets for simple, technical, and expert modes
 * - Pure utility functions for markdown, citations, and text processing
 *
 * ALL formatting is PURELY DETERMINISTIC — no LLM provider is ever called.
 *
 * @module @veris/explain/output/formatter
 */

// ── Formatter Core ──

export { Formatter, createFormatter } from '../formatter.js';
export type { FormatInput, FormatResult } from '../formatter.js';

// ── Explanation Formatter ──

export { ExplanationFormatter, createExplanationFormatter } from '../explanation-formatter.js';
export type { ExplanationFormatResult } from '../explanation-formatter.js';

// ── Formatter Options ──

export {
  DEFAULT_FORMATTER_OPTIONS,
  DEFAULT_PARAGRAPH_OPTIONS,
  DEFAULT_LIST_OPTIONS,
  DEFAULT_CITATION_FORMAT_OPTIONS,
} from '../formatter-options.js';
export type {
  CitationStyle,
  CitationSectionStyle,
  HeadingLevel,
  HeadingStyle,
  ParagraphOptions,
  ListOptions,
  CitationFormatOptions,
  ModeFormatConfig,
  FormatterOptions,
} from '../formatter-options.js';

// ── Formatter Presets ──

export {
  SIMPLE_PRESET,
  TECHNICAL_PRESET,
  EXPERT_PRESET,
  PRESETS,
  PRESET_NAMES,
  PRESET_DESCRIPTIONS,
  getPreset,
  allowsTechnicalJargon,
  getMaxParagraphs,
  getMaxSentences,
} from '../formatter-presets.js';

// ── Formatter Utilities ──

export {
  formatInlineCitation,
  extractCitations,
  replaceCitationMarkers,
  stripCitationMarkers,
  formatCitationsSection,
  getCitationSourceTypes,
  generateHeading,
  formatUnorderedList,
  formatOrderedList,
  formatTable,
  formatInlineCode,
  formatCodeBlock,
  formatJSON,
  normalizeWhitespace,
  wrapParagraph,
  stableSortCitations,
  stableSortArray,
  deterministicStringify,
  countSentences,
  countParagraphs,
  truncateToSentences,
  truncateToParagraphs,
  formatSeverityLabel,
  formatConfidence,
  formatSourceLocation,
  getModeDescription,
} from '../formatter-utils.js';
