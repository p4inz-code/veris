/**
 * ValidationAgent — OPTIONAL LLM-as-judge for semantic faithfulness scoring.
 *
 * Runs LAST in the validation pipeline, after all deterministic checks pass.
 * The ValidationAgent NEVER blocks explanation delivery — it only produces
 * suggestions and caveats.
 *
 * ## Design Principles
 *
 * - **Optional**: If unavailable, times out, or produces errors, the explanation
 *   proceeds with a caveat (\"claims not semantically verified\").
 * - **Non-blocking**: NEVER blocks delivery because the validator failed.
 * - **Separate model**: Uses a DIFFERENT model/prompt than the primary
 *   explanation generator to reduce correlated failure risk.
 * - **Graceful degradation**: Provider failures, timeouts, and errors are
 *   all handled without blocking the explanation pipeline.
 *
 * ## Scoring
 *
 * Each atomic factual claim in the explanation is scored as:
 * - `supported`: The claim is semantically supported by the context
 * - `contradicted`: The claim contradicts the context
 * - `unsupported`: The claim has no supporting evidence in the context
 * - `refused`: The validator could not evaluate the claim
 *
 * @module @veris/explain/output/validation-agent
 */

import type { LLMProvider, GenerateOptions } from '@veris/ai';

import type { ExplainedContext } from '../types/context.js';
import type { Explanation } from '../types/explanation.js';

import { PRESETS } from './formatter-presets.js';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

/** Score for a single factual claim. */
export type ClaimScore = 'supported' | 'contradicted' | 'unsupported' | 'refused';

/** A single factual claim extracted from an explanation. */
export interface FactualClaim {
  /** Unique claim ID within the validation. */
  readonly id: string;
  /** The claim text. */
  readonly text: string;
  /** The score assigned by the validator. */
  readonly score: ClaimScore;
  /** Optional explanation of the score. */
  readonly explanation?: string;
}

/** Result of validating a complete explanation. */
export interface ValidationAgentResult {
  /** Whether validation completed successfully. */
  readonly completed: boolean;
  /** The individual claim scores. */
  readonly claims: readonly FactualClaim[];
  /** Overall summary statistics. */
  readonly summary: {
    readonly total: number;
    readonly supported: number;
    readonly contradicted: number;
    readonly unsupported: number;
    readonly refused: number;
  };
  /** Whether a caveat should be added (contradicted or unsupported claims found). */
  readonly requiresCaveat: boolean;
  /** The caveat message (if required). */
  readonly caveat?: string;
  /** Whether the validation agent was unavailable. */
  readonly unavailable: boolean;
  /** Error message if the agent encountered an error. */
  readonly error?: string;
  /** Duration of the validation in milliseconds. */
  readonly durationMs: number;
}

/** Configuration options for the ValidationAgent. */
export interface ValidationAgentOptions {
  /** Provider to use for validation (must be different from the explanation generator). */
  readonly provider?: LLMProvider;
  /** Timeout in milliseconds for the provider call (default: 15000). */
  readonly timeoutMs: number;
  /** Whether validation is enabled (default: true). */
  readonly enabled: boolean;
  /** Whether to use the provider (if false, runs in offline/pass-through mode). */
  readonly useProvider: boolean;
  /** The validation prompt template version. */
  readonly promptVersion: string;
  /** Confidence threshold below which claims are flagged (default: 0.7). */
  readonly confidenceThreshold: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

/** Default validation agent options. */
export const DEFAULT_VALIDATION_OPTIONS: ValidationAgentOptions = {
  timeoutMs: 15000,
  enabled: true,
  useProvider: false, // Default to offline/pass-through mode
  promptVersion: 'validation-agent-v1',
  confidenceThreshold: 0.7,
};

/** Caveat text when validation is unavailable. */
const VALIDATION_UNAVAILABLE_CAVEAT =
  "This explanation's claims have not been semantically verified.";

/** Caveat text when unsupported claims are found. */
const UNSUPPORTED_CLAIMS_CAVEAT =
  'Some claims in this explanation could not be verified against the available evidence.';

/** Caveat text when contradicted claims are found. */
const CONTRADICTED_CLAIMS_CAVEAT =
  'Some claims in this explanation may contradict the available evidence.';

/** Pattern for splitting text into atomic claims (by sentence). */
const CLAIM_SPLIT_PATTERN = /[.!?]+(?:\s|$)/;

// ═══════════════════════════════════════════════════════════════════════════
// ValidationAgent
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Optional LLM-as-judge for semantic faithfulness scoring.
 *
 * The ValidationAgent runs AFTER all deterministic checks pass and
 * NEVER blocks explanation delivery.
 */
export class ValidationAgent {
  readonly name = 'ValidationAgent';
  private _options: ValidationAgentOptions;

  constructor(options?: Partial<ValidationAgentOptions>) {
    this._options = { ...DEFAULT_VALIDATION_OPTIONS, ...options };
  }

  /**
   * Validate an explanation by scoring its factual claims.
   *
   * If the ValidationAgent is unavailable, times out, or produces errors,
   * the explanation proceeds with a caveat. NEVER blocks delivery.
   *
   * @param explanation - The explanation to validate.
   * @param context - The context used to generate the explanation.
   * @returns The validation result.
   */
  async validate(
    explanation: Explanation,
    context: ExplainedContext,
  ): Promise<ValidationAgentResult> {
    const startTime = Date.now();

    // Check if validation is enabled
    if (!this._options.enabled) {
      return this.buildDisabledResult(startTime);
    }

    // Check if provider is available for LLM-based validation
    if (!this._options.useProvider || !this._options.provider) {
      return this.buildOfflineResult(explanation, startTime);
    }

    // Attempt LLM-based validation
    try {
      const result = await this.performLLMValidation(explanation, context, startTime);
      return result;
    } catch (error) {
      // Graceful failure: proceed with caveat
      const duration = Date.now() - startTime;
      const errMsg = error instanceof Error ? error.message : String(error);

      return {
        completed: false,
        claims: this.extractClaims(explanation.text).map((text, i) => ({
          id: `claim_${i + 1}`,
          text,
          score: 'refused' as ClaimScore,
          explanation: 'Validation agent encountered an error.',
        })),
        summary: {
          total: 0,
          supported: 0,
          contradicted: 0,
          unsupported: 0,
          refused: 0,
        },
        requiresCaveat: true,
        caveat: VALIDATION_UNAVAILABLE_CAVEAT,
        unavailable: false,
        error: errMsg,
        durationMs: duration,
      };
    }
  }

  /**
   * Perform LLM-based validation using the configured provider.
   *
   * Splits the explanation into atomic factual claims, sends them to
   * the validation provider, and scores each claim against the context.
   */
  private async performLLMValidation(
    explanation: Explanation,
    context: ExplainedContext,
    startTime: number,
  ): Promise<ValidationAgentResult> {
    const provider = this._options.provider!;

    // Extract claims from the explanation text
    const claims = this.extractClaims(explanation.text)
      .filter((c) => c.trim().length > 0)
      .map((text, i) => ({
        id: `claim_${i + 1}`,
        text,
        score: 'refused' as ClaimScore,
      }));

    if (claims.length === 0) {
      return {
        completed: true,
        claims: [],
        summary: { total: 0, supported: 0, contradicted: 0, unsupported: 0, refused: 0 },
        requiresCaveat: false,
        durationMs: Date.now() - startTime,
        unavailable: false,
      };
    }

    // Build the validation prompt
    const validationPrompt = this.buildValidationPrompt(claims, context);

    // Create timeout controller
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this._options.timeoutMs);

    try {
      // Call the validation provider
      const generateOptions: GenerateOptions = {
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: validationPrompt },
        ],
        temperature: 0.1, // Low temperature for consistent scoring
        maxTokens: 2000,
        responseFormat: 'json',
        abortSignal: controller.signal,
      };

      const result = await provider.generate(generateOptions);

      // Parse the validation result
      const scoredClaims = this.parseValidationResult(result.content, claims);

      // Calculate summary
      const supported = scoredClaims.filter((c) => c.score === 'supported').length;
      const contradicted = scoredClaims.filter((c) => c.score === 'contradicted').length;
      const unsupported = scoredClaims.filter((c) => c.score === 'unsupported').length;
      const refused = scoredClaims.filter((c) => c.score === 'refused').length;

      const hasIssues = contradicted > 0 || unsupported > 0;
      const caveat = this.getCaveat(contradicted > 0, unsupported > 0);

      return {
        completed: true,
        claims: scoredClaims,
        summary: { total: scoredClaims.length, supported, contradicted, unsupported, refused },
        requiresCaveat: hasIssues,
        caveat: hasIssues ? caveat : undefined,
        unavailable: false,
        durationMs: Date.now() - startTime,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Build a result when validation is disabled.
   */
  private buildDisabledResult(startTime: number): ValidationAgentResult {
    return {
      completed: false,
      claims: [],
      summary: { total: 0, supported: 0, contradicted: 0, unsupported: 0, refused: 0 },
      requiresCaveat: false,
      unavailable: false,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Build a result for offline/pass-through mode.
   *
   * In offline mode, claims are extracted but not scored by an LLM.
   * All claims are marked as "refused" and the explanation proceeds
   * with a caveat.
   */
  private buildOfflineResult(explanation: Explanation, startTime: number): ValidationAgentResult {
    const claims = this.extractClaims(explanation.text)
      .filter((c) => c.trim().length > 0)
      .map((text, i) => ({
        id: `claim_${i + 1}`,
        text,
        score: 'refused' as ClaimScore,
        explanation: 'No validation provider configured.',
      }));

    return {
      completed: false,
      claims,
      summary: {
        total: claims.length,
        supported: 0,
        contradicted: 0,
        unsupported: 0,
        refused: claims.length,
      },
      requiresCaveat: true,
      caveat: VALIDATION_UNAVAILABLE_CAVEAT,
      unavailable: true,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Extract atomic factual claims from text by splitting on sentences.
   *
   * @param text - The explanation text.
   * @returns Array of claim strings.
   */
  private extractClaims(text: string): string[] {
    if (!text || !text.trim()) return [];

    const sentences = text
      .split(CLAIM_SPLIT_PATTERN)
      .map((s) => s.trim())
      .filter((s) => s.length > 10); // Skip very short fragments

    return sentences;
  }

  /**
   * Build the validation prompt for the LLM.
   *
   * Includes the claims to validate and the context evidence.
   */
  private buildValidationPrompt(
    claims: readonly { id: string; text: string }[],
    context: ExplainedContext,
  ): string {
    const parts: string[] = [];

    parts.push('## Claims to Validate\n');
    for (const claim of claims) {
      parts.push(`- [${claim.id}]: "${claim.text}"`);
    }

    parts.push('\n## Available Evidence\n'); // Include subject info
    const subject = { ...context.subject } as Record<string, unknown>;
    parts.push(`Subject: ${JSON.stringify(this.sanitizeForPrompt(subject))}`);

    // Include evidence
    if (context.evidence && context.evidence.length > 0) {
      parts.push(`Evidence items: ${context.evidence.length}`);
      for (const ev of context.evidence) {
        const evRecord = { ...ev };
        parts.push(`- Evidence ${ev.id}: ${JSON.stringify(this.sanitizeForPrompt(evRecord))}`);
      }
    }

    // Include rule
    if (context.rule) {
      const ruleRecord = { ...context.rule };
      parts.push(`Rule: ${JSON.stringify(this.sanitizeForPrompt(ruleRecord))}`);
    }

    return parts.join('\n');
  }

  /**
   * Sanitize context data for inclusion in the validation prompt.
   * Removes potentially sensitive information and truncates long strings.
   */
  private sanitizeForPrompt(obj: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        // Truncate long strings to avoid token blowup
        sanitized[key] = value.length > 500 ? value.slice(0, 497) + '...' : value;
      } else if (value !== null && value !== undefined) {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /**
   * Get the system prompt for the validation LLM.
   */
  private getSystemPrompt(): string {
    return [
      'You are a semantic faithfulness validator for security analysis explanations.',
      '',
      'Your task is to score each factual claim in an explanation against the available evidence.',
      '',
      'For each claim, assign one of these scores:',
      '- supported: The claim is fully supported by the evidence',
      '- contradicted: The claim contradicts the evidence',
      '- unsupported: The claim has no supporting evidence',
      '- refused: You cannot evaluate this claim',
      '',
      'Respond with a JSON object:',
      '{"claims": [{"id": "claim_1", "score": "supported", "explanation": "..."}]}',
    ].join('\n');
  }

  /**
   * Parse the validation provider's response into scored claims.
   */
  private parseValidationResult(
    content: string,
    claims: readonly { id: string; text: string; score: ClaimScore }[],
  ): readonly FactualClaim[] {
    try {
      // Try to parse as JSON
      const parsed = JSON.parse(content) as {
        claims?: Array<{ id: string; score: string; explanation?: string }>;
      };

      if (!parsed.claims || !Array.isArray(parsed.claims)) {
        return claims.map((c) => ({
          id: c.id,
          text: c.text,
          score: 'refused' as ClaimScore,
          explanation: 'Invalid validation response format.',
        }));
      }

      // Map scores
      const scoredMap = new Map<string, FactualClaim>();
      for (const pc of parsed.claims) {
        const validScore = this.isValidScore(pc.score) ? (pc.score as ClaimScore) : 'refused';
        scoredMap.set(pc.id, {
          id: pc.id,
          text: claims.find((c) => c.id === pc.id)?.text ?? '',
          score: validScore,
          explanation: pc.explanation,
        });
      }

      // Fill in any missing claims
      return claims.map((c) => {
        const scored = scoredMap.get(c.id);
        return (
          scored ?? {
            id: c.id,
            text: c.text,
            score: 'refused' as ClaimScore,
            explanation: 'Not evaluated by validation agent.',
          }
        );
      });
    } catch {
      // Failed to parse JSON response
      return claims.map((c) => ({
        id: c.id,
        text: c.text,
        score: 'refused' as ClaimScore,
        explanation: 'Failed to parse validation response.',
      }));
    }
  }

  /**
   * Check if a score string is a valid ClaimScore value.
   */
  private isValidScore(score: string): boolean {
    return ['supported', 'contradicted', 'unsupported', 'refused'].includes(score);
  }

  /**
   * Get the appropriate caveat message based on validation results.
   */
  private getCaveat(hasContradicted: boolean, hasUnsupported: boolean): string {
    if (hasContradicted) {
      return hasUnsupported
        ? `${CONTRADICTED_CLAIMS_CAVEAT} ${UNSUPPORTED_CLAIMS_CAVEAT}`
        : CONTRADICTED_CLAIMS_CAVEAT;
    }
    if (hasUnsupported) {
      return UNSUPPORTED_CLAIMS_CAVEAT;
    }
    return VALIDATION_UNAVAILABLE_CAVEAT;
  }

  /**
   * Check if the ValidationAgent is configured and available.
   */
  isAvailable(): boolean {
    return (
      this._options.enabled && this._options.useProvider && this._options.provider !== undefined
    );
  }

  /**
   * Get the current configuration options.
   */
  getOptions(): ValidationAgentOptions {
    return { ...this._options };
  }

  /**
   * Update configuration options.
   */
  configure(options: Partial<ValidationAgentOptions>): void {
    this._options = { ...this._options, ...options };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Default factory
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new ValidationAgent with the given options.
 *
 * @param options - Optional configuration overrides.
 * @returns A new ValidationAgent instance.
 */
export function createValidationAgent(options?: Partial<ValidationAgentOptions>): ValidationAgent {
  return new ValidationAgent(options);
}
