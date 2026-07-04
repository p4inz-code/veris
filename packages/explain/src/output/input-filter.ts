/**
 * InputFilter — Deterministic input validation and sanitization.
 *
 * Runs FIRST in the M6a validation pipeline.
 *
 * Responsibilities:
 * - Context sanity checks (rejects null/undefined/empty inputs)
 * - Size validation (rejects inputs exceeding maximum size)
 * - Unsupported subject detection (rejects non-explanation inputs)
 * - Schema version validation (rejects incompatible schema versions)
 * - Control character stripping
 * - Unicode bidirectional override removal
 * - Zero-width character removal
 * - Handlebars syntax escaping ({{ / }})
 * - Prompt injection pattern detection
 *
 * @module @veris/explain/output/input-filter
 */

import type {
  InputFilter as InputFilterInterface,
  InputValidationResult,
  ValidationIssue,
} from './validation-result.js';

// ── Constants ──

/** Maximum allowed input size in bytes (100 KB). */
const MAX_INPUT_BYTES = 100 * 1024;

/** Minimum allowed input length for a non-empty explanation (1 character). */
const MIN_INPUT_LENGTH = 1;

/** Schema version prefix that all inputs must match (semver major). */
const SUPPORTED_SCHEMA_MAJOR_VERSION = 1;

/** Pattern for detecting prompt injection attempts. */
const INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|directives|commands)/i,
  /forget\s+(all\s+)?(previous|above|prior)\s+(instructions|directives|commands)/i,
  /disregard\s+(all\s+)?(previous|above|prior)\s+(instructions|directives|commands)/i,
  /you\s+(are\s+)?(now|are\s+free|are\s+released)\s+(from|of)\s+(your\s+)?(role|instructions|constraints)/i,
  /new\s+(instructions|directives|commands|role|system\s+prompt)\s*[:\-=>]/i,
  /system\s+(prompt|message|instruction)\s*[:\-=>]/i,
  /override\s+(all\s+)?(instructions|directives|constraints)/i,
];

/** Handlebars syntax patterns that should be escaped. */
const HANDLEBARS_PATTERN = /\{\{|\}\}/g;

/** Control characters (0x00-0x1F, except tab/newline/carriage return). */
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/** Unicode bidirectional override characters. */
const BIDI_OVERRIDE_PATTERN =
  /[\u200E\u200F\u202A\u202B\u202C\u202D\u202E\u2066\u2067\u2068\u2069]/g;

/** Zero-width characters. */
const ZERO_WIDTH_PATTERN = /[\u200B\u200C\uFEFF\u00AD]/g;

/** Null byte. */
const NULL_BYTE_PATTERN = /\x00/g;

/** Valid subject types for explanations. */
const VALID_SUBJECT_TYPES_SET = new Set(['finding', 'chain', 'risk', 'report']);

// ── InputFilter Implementation ──

/**
 * Deterministic input filter that validates and sanitizes input
 * before it reaches any other validator in the pipeline.
 *
 * No LLM provider is ever called. All checks are pure deterministic.
 */
export class InputFilter implements InputFilterInterface {
  readonly name = 'InputFilter';

  private readonly VALID_SUBJECT_TYPES = VALID_SUBJECT_TYPES_SET;

  private lastSanitized: string = '';

  /**
   * Validate and sanitize the input.
   *
   * Performs the following checks in order:
   * 1. Null/undefined rejection
   * 2. Empty input detection
   * 3. Size validation
   * 4. Control character detection
   * 5. Bidirectional override detection
   * 6. Zero-width character detection
   * 7. Null byte detection
   * 8. Prompt injection detection
   * 9. Handlebars syntax detection
   *
   * @param input - The raw input string to validate.
   * @returns Input validation result.
   */
  validate(input: string): InputValidationResult {
    return this.validateWithContext(input);
  }

  /**
   * Validate and sanitize input with optional context info.
   *
   * Extends validate() with:
   * - Schema version validation
   * - Unsupported subject detection
   *
   * @param input - The raw input string to validate.
   * @param contextInfo - Optional context information for additional checks.
   * @returns Input validation result.
   */
  validateWithContext(
    input: string,
    contextInfo?: {
      /** Schema version of the context (semver string like "1.0.0"). */
      readonly schemaVersion?: string;
      /** Subject type being explained. */
      readonly subjectType?: string;
    },
  ): InputValidationResult {
    const issues: ValidationIssue[] = [];

    // Step 1: Null/undefined rejection
    if (input === null || input === undefined) {
      issues.push({
        code: 'NULL_INPUT',
        message: 'Input is null or undefined.',
        severity: 'error',
      });
      this.lastSanitized = '';
      return { valid: false, issues, filtered: false };
    }

    // Step 2: Empty input detection
    if (typeof input !== 'string') {
      issues.push({
        code: 'INVALID_INPUT_TYPE',
        message: `Input must be a string, got ${typeof input}.`,
        severity: 'error',
      });
      this.lastSanitized = '';
      return { valid: false, issues, filtered: false };
    }

    if (input.length < MIN_INPUT_LENGTH) {
      issues.push({
        code: 'EMPTY_INPUT',
        message: 'Input is empty.',
        severity: 'error',
      });
      this.lastSanitized = '';
      return { valid: false, issues, filtered: false };
    }

    // Step 3: Size validation
    const byteSize = new TextEncoder().encode(input).length;
    if (byteSize > MAX_INPUT_BYTES) {
      issues.push({
        code: 'INPUT_TOO_LARGE',
        message: `Input exceeds maximum size of ${MAX_INPUT_BYTES} bytes (got ${byteSize} bytes).`,
        severity: 'error',
        value: `${byteSize} bytes`,
      });
      this.lastSanitized = '';
      return { valid: false, issues, filtered: false };
    }

    // Step 4-7: Sanitize dangerous characters
    let sanitized = input;
    let filtered = false;

    if (CONTROL_CHAR_PATTERN.test(input)) {
      issues.push({
        code: 'CONTROL_CHARS_DETECTED',
        message: 'Control characters detected and removed from input.',
        severity: 'warning',
      });
      sanitized = sanitized.replace(CONTROL_CHAR_PATTERN, '');
      filtered = true;
    }

    if (BIDI_OVERRIDE_PATTERN.test(input)) {
      issues.push({
        code: 'BIDI_OVERRIDE_DETECTED',
        message: 'Unicode bidirectional override characters detected and removed.',
        severity: 'warning',
      });
      sanitized = sanitized.replace(BIDI_OVERRIDE_PATTERN, '');
      filtered = true;
    }

    if (ZERO_WIDTH_PATTERN.test(input)) {
      issues.push({
        code: 'ZERO_WIDTH_CHARS_DETECTED',
        message: 'Zero-width characters detected and removed.',
        severity: 'warning',
      });
      sanitized = sanitized.replace(ZERO_WIDTH_PATTERN, '');
      filtered = true;
    }

    if (NULL_BYTE_PATTERN.test(input)) {
      issues.push({
        code: 'NULL_BYTES_DETECTED',
        message: 'Null bytes detected and removed.',
        severity: 'warning',
      });
      sanitized = sanitized.replace(NULL_BYTE_PATTERN, '');
      filtered = true;
    }

    // Step 8: Prompt injection detection
    for (const pattern of INJECTION_PATTERNS) {
      const match = sanitized.match(pattern);
      if (match) {
        issues.push({
          code: 'PROMPT_INJECTION_DETECTED',
          message: 'Prompt injection pattern detected in input.',
          severity: 'error',
          value: match[0].substring(0, 100),
        });
        this.lastSanitized = '';
        return { valid: false, issues, filtered };
      }
    }

    // Step 9: Handlebars syntax detection (escape, not reject)
    if (HANDLEBARS_PATTERN.test(input)) {
      issues.push({
        code: 'HANDLEBARS_SYNTAX_DETECTED',
        message: 'Handlebars template syntax detected in input.',
        severity: 'warning',
      });
      filtered = true;
    }

    // Step 10: Schema version validation
    if (contextInfo?.schemaVersion) {
      const major = this.getMajorVersion(contextInfo.schemaVersion);
      if (major < 0) {
        issues.push({
          code: 'INVALID_SCHEMA_VERSION',
          message: `Schema version "${contextInfo.schemaVersion}" is not a valid semver string.`,
          severity: 'error',
          value: contextInfo.schemaVersion,
        });
      } else if (major !== SUPPORTED_SCHEMA_MAJOR_VERSION) {
        issues.push({
          code: 'UNSUPPORTED_SCHEMA_VERSION',
          message: `Schema version ${contextInfo.schemaVersion} has major version ${major}, but only major version ${SUPPORTED_SCHEMA_MAJOR_VERSION} is supported.`,
          severity: 'error',
          value: contextInfo.schemaVersion,
        });
      }
    }

    // Step 11: Unsupported subject detection
    if (contextInfo?.subjectType) {
      if (!this.VALID_SUBJECT_TYPES.has(contextInfo.subjectType)) {
        issues.push({
          code: 'UNSUPPORTED_SUBJECT_TYPE',
          message: `Subject type "${contextInfo.subjectType}" is not supported. Valid types: finding, chain, risk, report.`,
          severity: 'error',
          value: contextInfo.subjectType,
        });
      }
    }

    this.lastSanitized = sanitized;

    const hasErrors = issues.some((i) => i.severity === 'error');

    return {
      valid: !hasErrors,
      issues,
      filtered,
    };
  }

  /**
   * Get the sanitized input after the last validate() call.
   * Returns the original input if no filtering was needed.
   * Returns empty string if validation failed with errors.
   */
  getSanitized(): string {
    return this.lastSanitized;
  }

  /**
   * Extract the major version from a semver string.
   * Returns -1 if the string is not a valid semver string.
   */
  private getMajorVersion(version: string): number {
    const parts = version.split('.');
    const major = parseInt(parts[0], 10);
    if (isNaN(major) || parts.length < 2) {
      return -1;
    }
    return major;
  }
}
