/**
 * NullEvidenceRefusal — Deterministic refusal detection for explanations
 * with insufficient or fabricated evidence.
 *
 * Runs FOURTH in the M6a validation pipeline (after CitationVerifier).
 *
 * Responsibilities:
 * - Refuse explanations with zero supporting evidence
 * - Refuse hallucinated citations (citations to non-existent evidence)
 * - Deterministic refusal object with consistent structure
 * - Refusal reason codes for machine-readable handling
 *
 * Uses deterministic matching FIRST; pattern heuristics SECOND.
 *
 * @module @veris/explain/output/null-evidence-refusal
 */

import type {
  NullEvidenceRefusal as NullEvidenceRefusalInterface,
  NullEvidenceRefusalResult,
  CitationVerificationResult,
  ValidationIssue,
} from './validation-result.js';

// ── Refusal Reason Codes ──

/**
 * Machine-readable refusal reason codes.
 */
export const RefusalCodes = {
  /** No evidence objects in context. */
  ZERO_EVIDENCE: 'ZERO_EVIDENCE',
  /** No citations in explanation despite having evidence. */
  NO_CITATIONS_PROVIDED: 'NO_CITATIONS_PROVIDED',
  /** All citations failed verification (orphan/hallucinated). */
  ALL_CITATIONS_FAILED: 'ALL_CITATIONS_FAILED',
  /** Some citations failed verification. */
  PARTIAL_CITATION_FAILURE: 'PARTIAL_CITATION_FAILURE',
  /** Citation references an object that doesn't exist in context. */
  HALLUCINATED_CITATION: 'HALLUCINATED_CITATION',
  /** Explanation content is a refusal message from the AI. */
  AI_REFUSAL_DETECTED: 'AI_REFUSAL_DETECTED',
} as const;

/** Union type of all refusal codes. */
export type RefusalCode = (typeof RefusalCodes)[keyof typeof RefusalCodes];

// ── Refusal Messages ──

const REFUSAL_MESSAGES: Record<RefusalCode, string> = {
  [RefusalCodes.ZERO_EVIDENCE]:
    'I cannot explain this finding because the necessary evidence is not available.',
  [RefusalCodes.NO_CITATIONS_PROVIDED]:
    'I cannot explain this finding because the explanation contains no citations to evidence.',
  [RefusalCodes.ALL_CITATIONS_FAILED]:
    'I cannot explain this finding because none of the citations could be verified against the available evidence.',
  [RefusalCodes.PARTIAL_CITATION_FAILURE]:
    'Some citations in this explanation could not be verified against the available evidence.',
  [RefusalCodes.HALLUCINATED_CITATION]:
    'I cannot explain this finding because the explanation references evidence that does not exist.',
  [RefusalCodes.AI_REFUSAL_DETECTED]: 'The AI was unable to explain this finding.',
};

// ── AI Refusal Detection Patterns ──

const AI_REFUSAL_PATTERNS: readonly RegExp[] = [
  /^i cannot explain/i,
  /^i cannot provide/i,
  /^i'm unable to explain/i,
  /^i am unable to explain/i,
  /^i cannot generate/i,
  /^i'm not able to explain/i,
  /^i am not able to explain/i,
  /^i don't have enough information/i,
  /^i do not have enough information/i,
  /^no evidence was found/i,
  /^insufficient evidence/i,
  /^i'm sorry[,:]?\s+(but\s+)?i/i,
  /^sorry[,:]?\s+(but\s+)?i/i,
];

// ── NullEvidenceRefusal Implementation ──

/**
 * Deterministic null-evidence refusal detector.
 *
 * Detects explanations with insufficient or fabricated evidence and
 * produces a structured refusal with a machine-readable reason code.
 *
 * Uses deterministic matching FIRST; pattern heuristics SECOND.
 *
 * No LLM provider is ever called. All checks are pure deterministic.
 */
export class NullEvidenceRefusal implements NullEvidenceRefusalInterface {
  readonly name = 'NullEvidenceRefusal';

  /**
   * Evaluate whether the explanation should be refused.
   *
   * Performs the following checks in order:
   * 1. Check if context has zero evidence objects
   * 2. Check if explanation has zero citations
   * 3. Check if all citations failed verification
   * 4. Check for AI-generated refusal patterns in content
   * 5. Check for hallucinated citations (failed + orphan)
   *
   * @param citationResult - The result from CitationVerifier.
   * @param context - The ExplainedContext containing evidence objects.
   * @returns Null-evidence refusal evaluation result.
   */
  evaluate(
    citationResult: CitationVerificationResult,
    context: { readonly evidence?: readonly unknown[]; readonly [key: string]: unknown },
    content?: string,
  ): NullEvidenceRefusalResult {
    const issues: ValidationIssue[] = [];

    // Step 1: Check zero evidence in context
    const evidenceCount = context.evidence ? context.evidence.length : 0;

    if (evidenceCount === 0) {
      issues.push({
        code: 'ZERO_EVIDENCE_IN_CONTEXT',
        message: 'The context contains no evidence objects.',
        severity: 'error',
      });

      return {
        refused: true,
        reason: REFUSAL_MESSAGES[RefusalCodes.ZERO_EVIDENCE],
        reasonCode: RefusalCodes.ZERO_EVIDENCE,
        issues,
      };
    }

    // Step 2: Check zero citations
    if (citationResult.totalCitations === 0) {
      issues.push({
        code: 'NO_CITATIONS_IN_EXPLANATION',
        message: 'The explanation contains no citations to evidence.',
        severity: 'error',
      });

      return {
        refused: true,
        reason: REFUSAL_MESSAGES[RefusalCodes.NO_CITATIONS_PROVIDED],
        reasonCode: RefusalCodes.NO_CITATIONS_PROVIDED,
        issues,
      };
    }

    // Step 3: Check all citations failed
    if (
      citationResult.totalCitations > 0 &&
      citationResult.failedCitations === citationResult.totalCitations
    ) {
      issues.push({
        code: 'ALL_CITATIONS_FAILED_VERIFICATION',
        message: 'All citations in the explanation failed verification.',
        severity: 'error',
        value: `${citationResult.failedCitations} of ${citationResult.totalCitations} failed`,
      });

      return {
        refused: true,
        reason: REFUSAL_MESSAGES[RefusalCodes.ALL_CITATIONS_FAILED],
        reasonCode: RefusalCodes.ALL_CITATIONS_FAILED,
        issues,
      };
    }

    // Step 4: Check for hallucinated citations (orphan citations)
    if (citationResult.orphanCitations.length > 0) {
      issues.push({
        code: 'HALLUCINATED_CITATIONS_DETECTED',
        message: `${citationResult.orphanCitations.length} citation(s) reference non-existent objects.`,
        severity: 'error',
        value: citationResult.orphanCitations.join(', ').substring(0, 200),
      });

      return {
        refused: true,
        reason: REFUSAL_MESSAGES[RefusalCodes.HALLUCINATED_CITATION],
        reasonCode: RefusalCodes.HALLUCINATED_CITATION,
        issues,
      };
    }

    // Step 5: Check for AI refusal patterns in content
    if (content) {
      const normalizedContent = content.trim();
      for (const pattern of AI_REFUSAL_PATTERNS) {
        if (pattern.test(normalizedContent)) {
          issues.push({
            code: 'AI_REFUSAL_PATTERN_DETECTED',
            message: 'AI-generated refusal pattern detected in explanation content.',
            severity: 'info',
          });

          return {
            refused: true,
            reason: REFUSAL_MESSAGES[RefusalCodes.AI_REFUSAL_DETECTED],
            reasonCode: RefusalCodes.AI_REFUSAL_DETECTED,
            issues,
          };
        }
      }
    }

    // Not refused
    return {
      refused: false,
      issues,
    };
  }
}
