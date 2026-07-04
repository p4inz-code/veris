/**
 * Formatter — deterministic output formatter for explanation text.
 *
 * Formats validated explanation content at three detail levels:
 * - Simple: one paragraph, one citation per claim, no technical jargon
 * - Technical: multiple paragraphs, all citations, technical details
 * - Expert: full traceability chain, all evidence, source locations
 *
 * The Formatter is PURELY DETERMINISTIC — no LLM provider is ever called.
 * It enforces mode-specific structural rules and produces valid Markdown.
 *
 * @module @veris/explain/output/formatter
 */

import type { ExplanationMode } from '../types/explanation.js';

import type { FormatterOptions, ModeFormatConfig } from './formatter-options.js';
import { DEFAULT_FORMATTER_OPTIONS } from './formatter-options.js';
import { getPreset } from './formatter-presets.js';
import {
  normalizeWhitespace,
  wrapParagraph,
  generateHeading,
  countSentences,
  countParagraphs,
  truncateToSentences,
  truncateToParagraphs,
  replaceCitationMarkers,
  stripCitationMarkers,
  formatCitationsSection,
  formatSeverityLabel,
  formatConfidence,
  formatSourceLocation,
} from './formatter-utils.js';

// ── Formatting Input ──

/** Input data required by the formatter to produce formatted output. */
export interface FormatInput {
  /** The explanation text (may contain [src:...] citation markers). */
  readonly text: string;
  /** The explanation mode to format for. */
  readonly mode: ExplanationMode;
  /** The subject type being explained. */
  readonly subjectType: string;
  /** The subject title/name. */
  readonly subjectTitle: string;
  /** Severity level of the subject (optional). */
  readonly severityLevel?: string;
  /** Severity score (optional). */
  readonly severityScore?: number;
  /** Confidence score (optional). */
  readonly confidence?: number;
  /** Source locations (optional, for technical/expert modes). */
  readonly sourceLocations?: readonly string[];
  /** Rule name (optional). */
  readonly ruleName?: string;
  /** Rule description (optional). */
  readonly ruleDescription?: string;
  /** Risk dimension name (optional). */
  readonly riskDimension?: string;
  /** Overall risk score (optional). */
  readonly riskScore?: number;
}

// ── Formatting Result ──

/** The result of formatting an explanation. */
export interface FormatResult {
  /** The formatted text (Markdown). */
  readonly text: string;
  /** The formatted citations section. */
  readonly citationsSection: string;
  /** The disclaimer text (if included). */
  readonly disclaimer: string;
  /** Number of sentences in the formatted output. */
  readonly sentenceCount: number;
  /** Number of paragraphs in the formatted output. */
  readonly paragraphCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Formatter
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Deterministic output formatter for AI-generated explanations.
 *
 * Formats content according to mode-specific configuration rules.
 * Every formatting decision is deterministic and reproducible.
 */
export class Formatter {
  readonly name = 'Formatter';
  private readonly options: FormatterOptions;

  constructor(options?: Partial<FormatterOptions>) {
    this.options = this.mergeOptions(options ?? {});
  }

  /**
   * Format an explanation according to the specified mode.
   *
   * @param input - The formatting input data.
   * @param outputOptions - Optional override options for this format call.
   * @returns The formatted result.
   */
  format(input: FormatInput, outputOptions?: Partial<FormatterOptions>): FormatResult {
    const options = outputOptions ? this.mergeOptions(outputOptions) : this.options;
    const modeConfig = options.modes[input.mode];
    const { text, mode, subjectTitle } = input;

    // Step 1: Normalize whitespace
    let formatted = options.normalizeWhitespace ? normalizeWhitespace(text) : text;

    // Step 2: Replace citation markers with styled inline citations (if not preserving raw)
    if (!options.includeRawCitations) {
      formatted = replaceCitationMarkers(formatted, options.citations.inlineStyle);
      // Step 3: Strip any remaining raw citation markers
      formatted = stripCitationMarkers(formatted);
    }

    // Step 4: Truncate to mode limits
    formatted = truncateToSentences(formatted, modeConfig.maxSentences);
    formatted = truncateToParagraphs(formatted, modeConfig.maxParagraphs);

    // Step 5: Build structured output with headings
    const parts: string[] = [];

    // Summary heading
    if (modeConfig.showSummaryHeading) {
      parts.push(
        generateHeading(
          this.getSummaryHeading(subjectTitle, mode),
          options.summaryHeadingLevel,
          options.headingStyle,
        ),
      );
      parts.push('');
    }

    // Severity line (for technical/expert)
    if (modeConfig.showSeverity && input.severityLevel) {
      const severity = formatSeverityLabel(input.severityLevel);
      const score = input.severityScore !== undefined ? ` (${input.severityScore}/10)` : '';
      parts.push(`**Severity:** ${severity}${score}`);
      parts.push('');
    }

    // Confidence (for technical/expert)
    if (modeConfig.showConfidence && input.confidence !== undefined) {
      parts.push(`**Confidence:** ${formatConfidence(input.confidence)}`);
      parts.push('');
    }

    // Main explanation text
    parts.push(formatted);

    // Source locations (for technical/expert)
    if (
      modeConfig.showSourceLocations &&
      input.sourceLocations &&
      input.sourceLocations.length > 0
    ) {
      parts.push('');
      parts.push(generateHeading('Source Locations', 3, options.headingStyle));
      for (const loc of input.sourceLocations) {
        parts.push(`- ${loc}`);
      }
    }

    // Rule details (for technical/expert)
    if (modeConfig.showRuleDetails && input.ruleName) {
      parts.push('');
      parts.push(generateHeading('Rule', 3, options.headingStyle));
      parts.push(`**Rule:** ${input.ruleName}`);
      if (input.ruleDescription) {
        parts.push(input.ruleDescription);
      }
    }

    // Risk context (for technical/expert)
    if (modeConfig.showRiskContext && input.riskDimension) {
      parts.push('');
      parts.push(generateHeading('Risk Context', 3, options.headingStyle));
      parts.push(`**Dimension:** ${input.riskDimension}`);
      if (input.riskScore !== undefined) {
        parts.push(`**Score:** ${input.riskScore}/10`);
      }
    }

    // Evidence details
    if (
      modeConfig.showEvidenceDetails &&
      input.sourceLocations &&
      input.sourceLocations.length > 0
    ) {
      parts.push('');
      parts.push(generateHeading('Evidence Details', 3, options.headingStyle));
      for (const loc of input.sourceLocations) {
        parts.push(`- Location: ${loc}`);
      }
    }

    // Join parts
    let finalText = parts.join('\n');

    // Step 6: Wrap paragraphs if configured
    if (options.paragraphs.maxWidth > 0) {
      finalText = this.wrapText(finalText, options.paragraphs.maxWidth);
    }

    // Step 7: Final whitespace normalization
    if (options.normalizeWhitespace) {
      finalText = normalizeWhitespace(finalText);
    }

    // Build disclaimer
    const disclaimer = modeConfig.showDisclaimer
      ? 'This explanation was AI-generated and is provided for informational purposes only. Always verify critical findings against the original scan results.'
      : '';

    return {
      text: finalText,
      citationsSection: '',
      disclaimer,
      sentenceCount: countSentences(finalText),
      paragraphCount: countParagraphs(finalText),
    };
  }

  /**
   * Format just the citations section for an explanation.
   *
   * @param input - The formatting input (used for context).
   * @param citations - The citations to format.
   * @param outputOptions - Optional override options.
   * @returns The formatted citations section as a string.
   */
  formatCitationsSection(
    input: FormatInput,
    citations: readonly {
      id: string;
      sourceType: string;
      sourceId: string;
      label: string;
      verified: boolean;
      verificationError?: string;
    }[],
    outputOptions?: Partial<FormatterOptions>,
  ): string {
    const options = outputOptions ? this.mergeOptions(outputOptions) : this.options;

    const mappedCitations = citations.map((c) => ({
      id: c.id,
      sourceType: c.sourceType as import('../types/explanation.js').CitationSourceType,
      sourceId: c.sourceId,
      label: c.label,
      verified: c.verified,
      verificationError: c.verificationError,
    }));

    return formatCitationsSection(
      mappedCitations,
      options.citations.sectionStyle,
      options.citations.showSourceIds,
      options.citations.showVerificationStatus,
      options.citations.sectionHeading,
    );
  }

  /**
   * Get the current formatter options.
   */
  getOptions(): FormatterOptions {
    return { ...this.options };
  }

  /**
   * Get the mode configuration for a specific mode.
   */
  getModeConfig(mode: ExplanationMode): ModeFormatConfig {
    return this.options.modes[mode];
  }

  /**
   * Create a mode-specific FormatInput from raw data.
   * This is a convenience for building input objects.
   */
  createInput(params: {
    readonly text: string;
    readonly mode: ExplanationMode;
    readonly subjectType: string;
    readonly subjectTitle: string;
    readonly severityLevel?: string;
    readonly severityScore?: number;
    readonly confidence?: number;
    readonly sourceLocations?: readonly string[];
    readonly ruleName?: string;
    readonly ruleDescription?: string;
    readonly riskDimension?: string;
    readonly riskScore?: number;
  }): FormatInput {
    return { ...params };
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Private Helpers
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Merge user-provided options with defaults.
   */
  private mergeOptions(overrides: Partial<FormatterOptions>): FormatterOptions {
    return {
      modes: {
        simple: { ...DEFAULT_FORMATTER_OPTIONS.modes.simple, ...overrides.modes?.simple },
        technical: { ...DEFAULT_FORMATTER_OPTIONS.modes.technical, ...overrides.modes?.technical },
        expert: { ...DEFAULT_FORMATTER_OPTIONS.modes.expert, ...overrides.modes?.expert },
      },
      citations: { ...DEFAULT_FORMATTER_OPTIONS.citations, ...overrides.citations },
      paragraphs: { ...DEFAULT_FORMATTER_OPTIONS.paragraphs, ...overrides.paragraphs },
      lists: { ...DEFAULT_FORMATTER_OPTIONS.lists, ...overrides.lists },
      headingStyle: overrides.headingStyle ?? DEFAULT_FORMATTER_OPTIONS.headingStyle,
      summaryHeadingLevel:
        overrides.summaryHeadingLevel ?? DEFAULT_FORMATTER_OPTIONS.summaryHeadingLevel,
      normalizeWhitespace:
        overrides.normalizeWhitespace ?? DEFAULT_FORMATTER_OPTIONS.normalizeWhitespace,
      stableOrdering: overrides.stableOrdering ?? DEFAULT_FORMATTER_OPTIONS.stableOrdering,
      jsonOutput: overrides.jsonOutput ?? DEFAULT_FORMATTER_OPTIONS.jsonOutput,
      jsonIndent: overrides.jsonIndent ?? DEFAULT_FORMATTER_OPTIONS.jsonIndent,
      includeRawCitations:
        overrides.includeRawCitations ?? DEFAULT_FORMATTER_OPTIONS.includeRawCitations,
    };
  }

  /**
   * Get a summary heading for the explanation.
   */
  private getSummaryHeading(subjectTitle: string, mode: ExplanationMode): string {
    switch (mode) {
      case 'simple':
        return `Summary: ${subjectTitle}`;
      case 'technical':
        return `Analysis: ${subjectTitle}`;
      case 'expert':
        return `Full Traceability: ${subjectTitle}`;
    }
  }

  /**
   * Wrap text paragraphs to a maximum width.
   */
  private wrapText(text: string, maxWidth: number): string {
    const paragraphs = text.split(/\n\s*\n/);
    const wrapped = paragraphs.map((para) => {
      // Don't wrap markdown tables, code blocks, or lists
      if (
        para.startsWith('|') ||
        para.startsWith('```') ||
        para.startsWith('- ') ||
        para.startsWith('* ') ||
        para.startsWith('#') ||
        para.startsWith('---')
      ) {
        return para;
      }
      return wrapParagraph(para, maxWidth);
    });
    return wrapped.join('\n\n');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Default factory
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new Formatter with the given options.
 *
 * @param options - Optional formatter configuration overrides.
 * @returns A new Formatter instance.
 */
export function createFormatter(options?: Partial<FormatterOptions>): Formatter {
  return new Formatter(options);
}
