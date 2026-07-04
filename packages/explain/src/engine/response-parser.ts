/**
 * Response parser — parses GenerateResult content into Explanation objects.
 *
 * Handles:
 * - Content extraction from markdown responses
 * - Citation extraction using [ref:type:id] markers
 * - Token usage mapping
 * - Refusal detection
 * - Provider metadata propagation
 *
 * @module @veris/explain/engine/response-parser
 */

import type { GenerateResult } from '@veris/ai';

import type {
  Explanation,
  ExplanationMode,
  Citation,
  CitationSourceType,
  TokenUsage,
} from '../types/explanation.js';

// ── Constants ──

/** Regex pattern for extracting citations from generated text. */
const CITATION_PATTERN = /\[ref:([a-z-]+):([a-zA-Z0-9_:.-]+)\]/g;

/** Valid citation source types. */
const VALID_SOURCE_TYPES = new Set<CitationSourceType>([
  'finding',
  'evidence',
  'rule',
  'behavior',
  'artifact',
  'chain',
  'risk-dimension',
  'recommendation',
  'rule-prop',
  'report-meta',
]);

/** AI disclaimer text for generated explanations. */
const AI_DISCLAIMER =
  'This explanation was AI-generated and is provided for informational purposes only. ' +
  'Always verify critical findings against the original scan results.';

// ── ResponseParser ──

/**
 * Parses provider responses into structured Explanation objects.
 */
export class ResponseParser {
  /**
   * Parse a GenerateResult into an Explanation object.
   *
   * @param result - The provider's generate result.
   * @param subjectId - The subject being explained.
   * @param subjectType - The type of subject.
   * @param mode - The explanation mode used.
   * @param promptVersion - The prompt version used.
   * @param cached - Whether this is a cached result.
   * @returns A complete Explanation object.
   */
  parse(
    result: GenerateResult,
    subjectId: string,
    subjectType: 'finding' | 'chain' | 'risk' | 'report',
    mode: ExplanationMode,
    promptVersion: string,
    cached: boolean = false,
  ): Explanation {
    const content = result.content;
    const citations = this.extractCitations(content);
    // Citations are marked unverified by default. M6 adds the CitationVerifier
    // which will validate each citation against the canonical report.
    const citationsWithStatus = citations;

    return {
      id: this.generateExplanationId(subjectId),
      subjectId,
      subjectType,
      mode,
      text: content,
      citations: citationsWithStatus,
      citationValidation: {
        valid: false,
        totalCitations: citationsWithStatus.length,
        verifiedCitations: 0,
        failedCitations: 0,
        citations: citationsWithStatus,
      },
      provider: {
        id: result.provider,
        model: result.model,
      },
      promptVersion,
      tokenUsage: this.mapTokenUsage(result.usage),
      cached,
      refused: this.detectRefusal(content),
      refusalReason: this.detectRefusalReason(content),
      generatedAt: new Date().toISOString(),
      disclaimer: AI_DISCLAIMER,
    };
  }

  /**
   * Extract citations from generated text using [ref:type:id] markers.
   *
   * Example: "The finding [ref:finding:SQL_INJECTION] was detected..."
   */
  private extractCitations(content: string): Citation[] {
    const citations: Citation[] = [];
    let match: RegExpExecArray | null;
    let index = 0;

    while ((match = CITATION_PATTERN.exec(content)) !== null) {
      const sourceType = match[1] as CitationSourceType;
      const sourceId = match[2];

      // Validate source type
      if (!VALID_SOURCE_TYPES.has(sourceType)) {
        continue;
      }

      index++;
      citations.push({
        id: `cit_${index}`,
        sourceType,
        sourceId,
        label: this.formatCitationLabel(sourceType, sourceId),
        verified: false, // Will be set to true by default in parse()
        verificationError: undefined,
      });
    }

    return citations;
  }

  /**
   * Generate a human-readable label for a citation.
   */
  private formatCitationLabel(sourceType: CitationSourceType, sourceId: string): string {
    const typeLabels: Record<CitationSourceType, string> = {
      finding: 'Finding',
      evidence: 'Evidence',
      rule: 'Rule',
      behavior: 'Behavior',
      artifact: 'Artifact',
      chain: 'Behavior Chain',
      'risk-dimension': 'Risk Dimension',
      recommendation: 'Recommendation',
      'rule-prop': 'Rule Property',
      'report-meta': 'Report Metadata',
    };

    const label = typeLabels[sourceType] ?? 'Reference';
    // Truncate sourceId for readability
    const shortId = sourceId.length > 40 ? sourceId.slice(0, 37) + '...' : sourceId;
    return `${label}: ${shortId}`;
  }

  /**
   * Map provider token usage to explanation token usage.
   */
  private mapTokenUsage(usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }): TokenUsage {
    return {
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
    };
  }

  /**
   * Detect if the response indicates a refusal to explain.
   *
   * The AI model may refuse to explain when:
   * - No evidence is available (null-evidence prompts)
   * - The content is too sensitive
   * - The model's safety filters are triggered
   */
  private detectRefusal(content: string): boolean {
    const normalized = content.toLowerCase().trim();
    const refusalPatterns = [
      'i cannot explain',
      'i cannot provide',
      "i'm unable to explain",
      'i am unable to explain',
      'i cannot generate',
      "i'm not able to explain",
      'i am not able to explain',
      "i don't have enough information",
      'i do not have enough information',
      'no evidence was found',
      'insufficient evidence',
    ];

    return refusalPatterns.some((pattern) => normalized.startsWith(pattern));
  }

  /**
   * Extract the refusal reason if the response is a refusal.
   */
  private detectRefusalReason(content: string): string | undefined {
    if (!this.detectRefusal(content)) return undefined;

    // Take the first sentence as the refusal reason
    const firstSentence = content.split(/[.!?]/)[0]?.trim();
    return firstSentence ?? 'The model was unable to explain this subject.';
  }

  /**
   * Generate a deterministic explanation ID.
   *
   * Uses a hash of subjectId to ensure reproducibility.
   */
  private generateExplanationId(subjectId: string): string {
    const prefix = 'exp';
    // Deterministic hash of subjectId
    let hash = 0;
    for (let i = 0; i < subjectId.length; i++) {
      hash = (hash << 5) - hash + subjectId.charCodeAt(i);
      hash |= 0;
    }
    const hashStr = Math.abs(hash).toString(36).slice(0, 6);
    return `${prefix}_${subjectId}_${hashStr}`;
  }
}
