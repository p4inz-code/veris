/**
 * Output validation pipeline — deterministic validation (M6a) + optional
 * LLM validation (M6b) + deterministic formatter (M6b).
 *
 * ## M6a — Deterministic Validation Pipeline
 *
 * Provides the 5-step deterministic validation pipeline:
 * InputFilter → StructuralValidator → CitationVerifier →
 * NullEvidenceRefusal → OutputFilter
 *
 * ALL M6a steps are PURELY DETERMINISTIC — no LLM provider is ever called.
 *
 * ## M6b — LLM Validation Agent
 *
 * Optional LLM-as-judge for semantic faithfulness scoring. Runs AFTER all
 * deterministic checks pass. NEVER blocks explanation delivery.
 *
 * ## M6b — Formatter
 *
 * Deterministic output formatting for explanations at three detail levels:
 * Simple, Technical, Expert. Supports Markdown and JSON output.
 *
 * @module @veris/explain/output
 */

// ── Validation Result Types ──

export type {
  ValidationSeverity,
  ValidationIssue,
  InputValidationResult,
  StructuralValidationResult,
  CitationVerificationResult,
  NullEvidenceRefusalResult,
  OutputFilterResult,
  ValidationPipelineResult,
  Validator,
  InputFilter as InputFilterInterface,
  StructuralValidator as StructuralValidatorInterface,
  CitationVerifier as CitationVerifierInterface,
  NullEvidenceRefusal as NullEvidenceRefusalInterface,
  OutputFilter as OutputFilterInterface,
} from './validation-result.js';

export { ValidationPipeline } from './validation-result.js';

// ── InputFilter ──

export { InputFilter } from './input-filter.js';

// ── StructuralValidator ──

export { StructuralValidator } from './structural-validator.js';

// ── CitationVerifier ──

export { CitationVerifier } from './citation-verifier.js';

// ── NullEvidenceRefusal ──

export { NullEvidenceRefusal } from './null-evidence-refusal.js';
export type { RefusalCode } from './null-evidence-refusal.js';
export { RefusalCodes } from './null-evidence-refusal.js';

// ── OutputFilter ──

export { OutputFilter } from './output-filter.js';

// ── M6b: ValidationAgent ──

export { ValidationAgent, createValidationAgent } from './validation-agent.js';
export type {
  ClaimScore,
  FactualClaim,
  ValidationAgentResult,
  ValidationAgentOptions,
} from './validation-agent.js';
export { DEFAULT_VALIDATION_OPTIONS } from './validation-agent.js';

// ── M6b: Formatter System ──

// Re-export everything from formatter/index.ts (barrel export)
export {
  // Formatter Core
  Formatter,
  createFormatter,

  // Explanation Formatter
  ExplanationFormatter,
  createExplanationFormatter,

  // Formatter Options
  DEFAULT_FORMATTER_OPTIONS,
  DEFAULT_PARAGRAPH_OPTIONS,
  DEFAULT_LIST_OPTIONS,
  DEFAULT_CITATION_FORMAT_OPTIONS,

  // Formatter Presets
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

  // Formatter Utilities
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
} from './formatter/index.js';

export type {
  FormatInput,
  FormatResult,
  ExplanationFormatResult,
  CitationStyle,
  CitationSectionStyle,
  HeadingLevel,
  HeadingStyle,
  ParagraphOptions,
  ListOptions,
  CitationFormatOptions,
  ModeFormatConfig,
  FormatterOptions,
} from './formatter/index.js';
