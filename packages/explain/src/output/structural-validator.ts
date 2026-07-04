/**
 * StructuralValidator — Deterministic structural validation of explanation output.
 *
 * Runs SECOND in the M6a validation pipeline (after InputFilter).
 *
 * Responsibilities:
 * - Required fields check (subjectId, subjectType, mode, text, citations)
 * - Empty explanation detection
 * - Length validation (min/max)
 * - Markdown structure validation
 * - Citation presence check
 * - Invalid character detection
 * - Duplicate citation ID detection
 *
 * @module @veris/explain/output/structural-validator
 */

import type {
  StructuralValidator as StructuralValidatorInterface,
  StructuralValidationResult,
  ValidationIssue,
} from './validation-result.js';

// ── Constants ──

/** Minimum explanation text length in characters. */
const MIN_TEXT_LENGTH = 10;

/** Maximum explanation text length in characters (50 KB). */
const MAX_TEXT_LENGTH = 50 * 1024;

/** Pattern for extracting citation markers from text. */
const CITATION_MARKER_PATTERN = /\[(?:src|ref):([a-z-]+):([a-zA-Z0-9_:./-]+)\]/g;

/** Pattern for detecting Markdown headings. */
const MARKDOWN_HEADING_PATTERN = /^#{1,6}\s/m;

/** Pattern for detecting Markdown lists. */
const MARKDOWN_LIST_PATTERN = /^[\s]*[-*+]\s/m;

/** Pattern for detecting Markdown code blocks. */
const MARKDOWN_CODE_BLOCK_PATTERN = /```/;

/** Pattern for detecting Markdown links. */
const MARKDOWN_LINK_PATTERN = /\[.+?\]\(.+?\)/;

/** Pattern for detecting invalid characters (control chars except common whitespace). */
const INVALID_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

/** Pattern for citation IDs (e.g., cit_1, cit_2). */
const CITATION_ID_PATTERN = /^cit_\d+$/;

/** Pattern for [src:type:id] citation markers. */
const SRC_CITATION_PATTERN = /\[src:([a-z-]+):([a-zA-Z0-9_:./-]+)\]/g;

/** Expected fields that must be present in a valid explanation object. */
const REQUIRED_FIELDS: readonly string[] = [
  'id',
  'subjectId',
  'subjectType',
  'mode',
  'text',
  'citations',
  'provider',
  'promptVersion',
  'tokenUsage',
  'generatedAt',
  'disclaimer',
];

/** Valid subjectType values per SPEC-011. */
const VALID_SUBJECT_TYPES = new Set(['finding', 'chain', 'risk', 'report']);

/** Valid ExplanationMode values. */
const VALID_MODES = new Set(['simple', 'technical', 'expert']);

// ── StructuralValidator Implementation ──

/**
 * Deterministic structural validator that checks explanation output
 * for structural correctness.
 *
 * No LLM provider is ever called. All checks are pure deterministic.
 */
export class StructuralValidator implements StructuralValidatorInterface {
  readonly name = 'StructuralValidator';

  /**
   * Validate the structure of an explanation output.
   *
   * Performs the following checks in order:
   * 1. Attempt to parse as JSON object (if applicable)
   * 2. Required fields check
   * 3. Empty explanation detection
   * 4. Length validation
   * 5. Markdown structure validation
   * 6. Citation presence
   * 7. Invalid character detection
   * 8. Duplicate citation ID detection
   *
   * @param input - The explanation text or JSON string.
   * @returns Structural validation result.
   */
  validate(input: string): StructuralValidationResult {
    const issues: ValidationIssue[] = [];
    const fieldPresence: Record<string, boolean> = {};
    let hasCitations = false;
    let hasDuplicateCitations = false;

    // Step 1: Attempt to parse as JSON
    let parsed: Record<string, unknown> | null = null;
    let text = input;

    try {
      parsed = JSON.parse(input) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object' && 'text' in parsed) {
        text = String(parsed.text);
      }
    } catch {
      // Not valid JSON — treat as raw text
      parsed = null;
    }

    // Step 2: Required fields check (for JSON objects)
    if (parsed && typeof parsed === 'object') {
      for (const field of REQUIRED_FIELDS) {
        const present = field in parsed && parsed[field] !== null && parsed[field] !== undefined;
        fieldPresence[field] = present;

        if (!present) {
          issues.push({
            code: 'MISSING_REQUIRED_FIELD',
            message: `Required field "${field}" is missing or null.`,
            severity: 'error',
            field,
          });
        }
      }

      // Validate subjectType enum
      const subjectType = parsed.subjectType;
      if (subjectType !== undefined && subjectType !== null) {
        if (!VALID_SUBJECT_TYPES.has(String(subjectType))) {
          issues.push({
            code: 'INVALID_SUBJECT_TYPE',
            message: `subjectType "${String(subjectType)}" is not a valid value. Must be one of: finding, chain, risk, report.`,
            severity: 'error',
            field: 'subjectType',
            value: String(subjectType),
          });
        }
      }

      // Validate mode enum
      const mode = parsed.mode;
      if (mode !== undefined && mode !== null) {
        if (!VALID_MODES.has(String(mode))) {
          issues.push({
            code: 'INVALID_EXPLANATION_MODE',
            message: `mode "${String(mode)}" is not a valid value. Must be one of: simple, technical, expert.`,
            severity: 'error',
            field: 'mode',
            value: String(mode),
          });
        }
      }
    } else {
      // Raw text: mark all fields as unknown
      for (const field of REQUIRED_FIELDS) {
        fieldPresence[field] = false;
      }
    }

    // Step 3: Empty explanation detection
    const trimmedText = text.trim();
    if (trimmedText.length === 0) {
      issues.push({
        code: 'EMPTY_EXPLANATION',
        message: 'Explanation text is empty.',
        severity: 'error',
      });
    }

    // Step 4: Length validation
    if (trimmedText.length > 0 && trimmedText.length < MIN_TEXT_LENGTH) {
      issues.push({
        code: 'EXPLANATION_TOO_SHORT',
        message: `Explanation text is too short (${trimmedText.length} chars, minimum ${MIN_TEXT_LENGTH}).`,
        severity: 'warning',
        value: `${trimmedText.length} chars`,
      });
    }

    if (trimmedText.length > MAX_TEXT_LENGTH) {
      issues.push({
        code: 'EXPLANATION_TOO_LONG',
        message: `Explanation text exceeds maximum length (${trimmedText.length} chars, max ${MAX_TEXT_LENGTH}).`,
        severity: 'error',
        value: `${trimmedText.length} chars`,
      });
    }

    // Step 5: Markdown structure validation
    const hasHeadings = MARKDOWN_HEADING_PATTERN.test(trimmedText);
    const hasLists = MARKDOWN_LIST_PATTERN.test(trimmedText);
    const hasCodeBlocks = MARKDOWN_CODE_BLOCK_PATTERN.test(trimmedText);
    const hasLinks = MARKDOWN_LINK_PATTERN.test(trimmedText);

    // Check for broken markdown (unclosed code blocks)
    if (hasCodeBlocks) {
      const backtickMatches = trimmedText.match(/```/g);
      if (backtickMatches && backtickMatches.length % 2 !== 0) {
        issues.push({
          code: 'UNCLOSED_CODE_BLOCK',
          message: 'Explanation contains an unclosed Markdown code block.',
          severity: 'warning',
        });
      }
    }

    // Step 6: Citation presence
    const citationMatches = [...trimmedText.matchAll(SRC_CITATION_PATTERN)];
    hasCitations = citationMatches.length > 0;

    // Also check for old-style [ref:type:id] markers
    const refCitationMatches = [...trimmedText.matchAll(CITATION_MARKER_PATTERN)];
    if (refCitationMatches.length > 0 && !hasCitations) {
      hasCitations = true;
    }

    // Step 7: Invalid character detection
    if (INVALID_CHAR_PATTERN.test(trimmedText)) {
      issues.push({
        code: 'INVALID_CHARACTERS',
        message: 'Explanation contains invalid control characters.',
        severity: 'error',
      });
    }

    // Step 8: Duplicate citation ID detection
    // Check for [src:...] markers with duplicate sourceId+sourceType pairs
    const citationPairs = new Set<string>();
    for (const match of citationMatches) {
      const key = `${match[1]}:${match[2]}`;
      if (citationPairs.has(key)) {
        hasDuplicateCitations = true;
        issues.push({
          code: 'DUPLICATE_CITATION_REFERENCE',
          message: `Duplicate citation reference: ${key}.`,
          severity: 'warning',
          value: key,
        });
      }
      citationPairs.add(key);
    }

    // Also check old-style citation markers for duplicates
    const refPairs = new Set<string>();
    for (const match of refCitationMatches) {
      const key = `${match[1]}:${match[2]}`;
      if (refPairs.has(key)) {
        hasDuplicateCitations = true;
        issues.push({
          code: 'DUPLICATE_CITATION_REFERENCE',
          message: `Duplicate citation reference (ref format): ${key}.`,
          severity: 'warning',
          value: key,
        });
      }
      refPairs.add(key);
    }

    const errorCount = issues.filter((i) => i.severity === 'error').length;

    return {
      valid: errorCount === 0,
      issues,
      hasCitations,
      fieldPresence,
      textLength: trimmedText.length,
      hasDuplicateCitations,
    };
  }
}
