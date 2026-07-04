/**
 * Explanation formatter — formats complete Explanation objects into presentation-ready output.
 *
 * Wraps the base Formatter to work with Explanation types, extracting
 * the relevant fields from the Explanation's citations, provider metadata,
 * and text content to produce mode-formatted Markdown or JSON output.
 *
 * The ExplanationFormatter is PURELY DETERMINISTIC — no LLM provider is ever called.
 *
 * @module @veris/explain/output/explanation-formatter
 */

import type { ExplainedContext } from '../types/context.js';
import type { Explanation, ExplanationMode } from '../types/explanation.js';

import type { FormatterOptions } from './formatter-options.js';
import { DEFAULT_FORMATTER_OPTIONS } from './formatter-options.js';
import { formatJSON } from './formatter-utils.js';
import { Formatter, type FormatInput } from './formatter.js';

// ── Explanation Format Result ──

/** Result of formatting a complete Explanation. */
export interface ExplanationFormatResult {
  /** The formatted explanation text (Markdown). */
  readonly text: string;
  /** The formatted and sorted citations section. */
  readonly citationsSection: string;
  /** The full explanation formatted as JSON (if jsonOutput is true). */
  readonly json?: string;
  /** The AI disclaimer text. */
  readonly disclaimer: string;
  /** Number of sentences in the formatted output. */
  readonly sentenceCount: number;
  /** Number of paragraphs in the formatted output. */
  readonly paragraphCount: number;
  /** Whether the explanation was refused. */
  readonly refused: boolean;
  /** Refusal reason (if refused). */
  readonly refusalReason?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// ExplanationFormatter
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Formats complete Explanation objects into presentation-ready output.
 *
 * Extracts all relevant data from the Explanation (citations, provider info,
 * text content) and produces deterministic Markdown or JSON output.
 */
export class ExplanationFormatter {
  readonly name = 'ExplanationFormatter';
  private readonly formatter: Formatter;
  private readonly options: FormatterOptions;

  constructor(options?: Partial<FormatterOptions>) {
    this.options = { ...DEFAULT_FORMATTER_OPTIONS, ...options };
    this.formatter = new Formatter(this.options);
  }

  /**
   * Format a complete Explanation object.
   *
   * @param explanation - The explanation to format.
   * @param context - Optional context for additional formatting context.
   * @param outputOptions - Optional override options for this format call.
   * @returns The formatted result.
   */
  format(
    explanation: Explanation,
    context?: ExplainedContext,
    outputOptions?: Partial<FormatterOptions>,
  ): ExplanationFormatResult {
    const options = outputOptions
      ? { ...DEFAULT_FORMATTER_OPTIONS, ...outputOptions }
      : this.options;

    // Extract source locations from citations for technical/expert modes
    const sourceLocations = this.extractSourceLocations(explanation, context);

    // Build format input
    const formatInput: FormatInput = {
      text: explanation.text,
      mode: explanation.mode,
      subjectType: explanation.subjectType,
      subjectTitle: this.getSubjectTitle(explanation, context),
      severityLevel: this.extractSeverityLevel(context),
      severityScore: this.extractSeverityScore(context),
      confidence: this.extractConfidence(context),
      sourceLocations,
      ruleName: this.extractRuleName(context),
      ruleDescription: this.extractRuleDescription(context),
      riskDimension: this.extractRiskDimension(context),
      riskScore: this.extractRiskScore(context),
    };

    // Run through base formatter
    const formatted = this.formatter.format(formatInput, outputOptions);

    // Format citations section
    const citationsSection = this.formatter.formatCitationsSection(
      formatInput,
      explanation.citations,
      outputOptions,
    );

    // Include disclaimer from explanation
    const disclaimer = options.modes[explanation.mode].showDisclaimer ? explanation.disclaimer : '';

    // Build result — use a mutable intermediate to handle the optional json field
    const result: {
      text: string;
      citationsSection: string;
      disclaimer: string;
      sentenceCount: number;
      paragraphCount: number;
      refused: boolean;
      refusalReason?: string;
      json?: string;
    } = {
      text: formatted.text,
      citationsSection,
      disclaimer,
      sentenceCount: formatted.sentenceCount,
      paragraphCount: formatted.paragraphCount,
      refused: explanation.refused,
      refusalReason: explanation.refusalReason,
    };

    // JSON output if requested
    if (options.jsonOutput) {
      result.json = this.formatAsJSON(explanation, options.jsonIndent);
    }

    return result as ExplanationFormatResult;
  }

  /**
   * Format the explanations for all modes and return the results keyed by mode.
   *
   * @param explanation - The explanation to format across all modes.
   * @param context - Optional context for additional formatting context.
   * @returns Record of formatted results keyed by mode.
   */
  formatAllModes(
    explanation: Explanation,
    context?: ExplainedContext,
  ): Record<ExplanationMode, ExplanationFormatResult> {
    return {
      simple: this.format({ ...explanation, mode: 'simple' }, context),
      technical: this.format({ ...explanation, mode: 'technical' }, context),
      expert: this.format({ ...explanation, mode: 'expert' }, context),
    };
  }

  /**
   * Format an explanation refusal.
   *
   * @param refusalReason - The reason for the refusal.
   * @param subjectType - The subject type that was refused.
   * @param mode - The explanation mode.
   * @returns The formatted refusal result.
   */
  formatRefusal(
    refusalReason: string,
    subjectType: string,
    mode: ExplanationMode,
  ): ExplanationFormatResult {
    const text = `I cannot explain this ${subjectType}. ${refusalReason}`;

    return {
      text,
      citationsSection: '',
      disclaimer: '',
      sentenceCount: 1,
      paragraphCount: 1,
      refused: true,
      refusalReason,
    };
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Private Helpers
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Get a human-readable subject title from the explanation or context.
   */
  private getSubjectTitle(explanation: Explanation, context?: ExplainedContext): string {
    // Try to get from context first
    if (context?.subject) {
      const subject = { ...context.subject } as Record<string, unknown>;
      if (typeof subject.title === 'string') return subject.title;
      if (typeof subject.name === 'string') return subject.name;
    }

    // Fall back to citation labels
    if (explanation.citations.length > 0) {
      return explanation.citations[0].label;
    }

    return explanation.subjectId;
  }

  /**
   * Extract severity level from context.
   */
  private extractSeverityLevel(context?: ExplainedContext): string | undefined {
    if (!context?.subject) return undefined;
    const subject = { ...context.subject } as Record<string, unknown>;
    const severity = subject.severity as { level?: string } | undefined;
    return severity?.level;
  }

  /**
   * Extract severity score from context.
   */
  private extractSeverityScore(context?: ExplainedContext): number | undefined {
    if (!context?.subject) return undefined;
    const subject = { ...context.subject } as Record<string, unknown>;
    const severity = subject.severity as { score?: number } | undefined;
    return severity?.score;
  }

  /**
   * Extract confidence from context.
   */
  private extractConfidence(context?: ExplainedContext): number | undefined {
    if (!context?.subject) return undefined;
    const subject = { ...context.subject } as Record<string, unknown>;
    return subject.confidence as number | undefined;
  }

  /**
   * Extract source locations from evidence citations.
   */
  private extractSourceLocations(
    explanation: Explanation,
    context?: ExplainedContext,
  ): readonly string[] {
    if (!context?.evidence) return [];
    const locations: string[] = [];

    for (const citation of explanation.citations) {
      if (citation.sourceType !== 'evidence') continue;
      const evidence = context.evidence.find((e) => e.id === citation.sourceId);
      if (evidence) {
        const loc = `${evidence.sourceLocation.path}:${evidence.sourceLocation.startLine}`;
        if (!locations.includes(loc)) {
          locations.push(loc);
        }
      }
    }

    return locations.sort((a, b) => a.localeCompare(b));
  }

  /**
   * Extract rule name from context.
   */
  private extractRuleName(context?: ExplainedContext): string | undefined {
    return context?.rule?.name;
  }

  /**
   * Extract rule description from context.
   */
  private extractRuleDescription(context?: ExplainedContext): string | undefined {
    return context?.rule?.description;
  }

  /**
   * Extract risk dimension from context.
   */
  private extractRiskDimension(context?: ExplainedContext): string | undefined {
    const risk = context?.risk;
    if (!risk?.dimensions || risk.dimensions.length === 0) return undefined;
    return risk.dimensions[0].name;
  }

  /**
   * Extract risk score from context.
   */
  private extractRiskScore(context?: ExplainedContext): number | undefined {
    return context?.risk?.overallScore;
  }

  /**
   * Format the explanation as JSON with deterministic key ordering.
   */
  private formatAsJSON(explanation: Explanation, indent: number): string {
    const json: Record<string, unknown> = {
      id: explanation.id,
      subjectId: explanation.subjectId,
      subjectType: explanation.subjectType,
      mode: explanation.mode,
      text: explanation.text,
      citations: explanation.citations.map((c) => ({
        id: c.id,
        sourceType: c.sourceType,
        sourceId: c.sourceId,
        label: c.label,
        verified: c.verified,
        verificationError: c.verificationError,
      })),
      provider: {
        id: explanation.provider.id,
        model: explanation.provider.model,
      },
      promptVersion: explanation.promptVersion,
      tokenUsage: {
        promptTokens: explanation.tokenUsage.promptTokens,
        completionTokens: explanation.tokenUsage.completionTokens,
        totalTokens: explanation.tokenUsage.totalTokens,
      },
      cached: explanation.cached,
      refused: explanation.refused,
      refusalReason: explanation.refusalReason,
      generatedAt: explanation.generatedAt,
      disclaimer: explanation.disclaimer,
    };

    return formatJSON(json, indent);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Default factory
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new ExplanationFormatter with the given options.
 *
 * @param options - Optional formatter configuration overrides.
 * @returns A new ExplanationFormatter instance.
 */
export function createExplanationFormatter(
  options?: Partial<FormatterOptions>,
): ExplanationFormatter {
  return new ExplanationFormatter(options);
}
