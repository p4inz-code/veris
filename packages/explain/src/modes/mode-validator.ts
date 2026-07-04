/**
 * Mode validator — deterministic validation of mode configurations.
 *
 * Validates that mode configuration objects are complete, well-typed,
 * and have valid field values. All validation is PURELY DETERMINISTIC —
 * no LLM provider is ever called.
 *
 * @module @veris/explain/modes/mode-validator
 */

import type { ExplanationMode } from '../types/explanation.js';

import { isValidMode, ALL_MODES } from './explanation-mode.js';
import { MODE_CONFIGS } from './mode-config.js';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

/** Severity of a mode validation issue. */
export type ModeValidationSeverity = 'error' | 'warning' | 'info';

/** A single validation issue found during mode validation. */
export interface ModeValidationIssue {
  /** Machine-readable issue code. */
  readonly code: string;
  /** Human-readable description. */
  readonly message: string;
  /** Severity level. */
  readonly severity: ModeValidationSeverity;
  /** The field name where the issue was found. */
  readonly field?: string;
  /** The problematic value. */
  readonly value?: unknown;
}

/** Result of mode validation. */
export interface ModeValidationResult {
  /** Whether the configuration passed all checks. */
  readonly valid: boolean;
  /** All issues found during validation. */
  readonly issues: readonly ModeValidationIssue[];
  /** The validated mode. */
  readonly mode?: ExplanationMode;
}

// ═══════════════════════════════════════════════════════════════════════════
// Validation Constants
// ═══════════════════════════════════════════════════════════════════════════

/** Allowed range for maxSentences (0 = unlimited). */
const MAX_SENTENCES_RANGE = { min: 0, max: 100 };

/** Allowed range for maxParagraphs (0 = unlimited). */
const MAX_PARAGRAPHS_RANGE = { min: 0, max: 50 };

/** Allowed range for citationsPerClaim (0 = all). */
const CITATIONS_PER_CLAIM_RANGE = { min: 0, max: 10 };

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate a mode identifier string.
 *
 * Checks that the string is one of the three valid mode names.
 *
 * @param value - The mode name to validate.
 * @returns The validation result.
 */
export function validateModeIdentifier(value: string): ModeValidationResult {
  const issues: ModeValidationIssue[] = [];

  if (!value || typeof value !== 'string') {
    issues.push({
      code: 'MODE_NOT_A_STRING',
      message: 'Mode identifier must be a non-empty string.',
      severity: 'error',
      field: 'mode',
      value,
    });
    return { valid: false, issues };
  }

  if (!isValidMode(value)) {
    const validModes = ALL_MODES.join(', ');
    issues.push({
      code: 'MODE_INVALID',
      message: `Invalid mode "${value}". Valid modes: ${validModes}.`,
      severity: 'error',
      field: 'mode',
      value,
    });
    return { valid: false, issues };
  }

  return { valid: true, issues: [], mode: value };
}

/**
 * Validate a mode configuration object.
 *
 * Checks that:
 * - All required fields are present
 * - Field values are within valid ranges
 * - Mode is a valid identifier
 * - No unknown fields are present
 *
 * @param config - The configuration object to validate.
 * @returns The validation result with any issues found.
 */
export function validateModeConfig(config: Record<string, unknown>): ModeValidationResult {
  const issues: ModeValidationIssue[] = [];
  let mode: ExplanationMode | undefined;

  // Check mode field
  if (config.mode === undefined || config.mode === null) {
    issues.push({
      code: 'MODE_MISSING',
      message: "Configuration is missing required field: 'mode'.",
      severity: 'error',
      field: 'mode',
    });
  } else if (typeof config.mode !== 'string') {
    issues.push({
      code: 'MODE_NOT_STRING',
      message: `'mode' must be a string, got ${typeof config.mode}.`,
      severity: 'error',
      field: 'mode',
      value: config.mode,
    });
  } else {
    const modeResult = validateModeIdentifier(config.mode);
    issues.push(...modeResult.issues);
    if (modeResult.mode) {
      mode = modeResult.mode;
    }
  }

  // Validate format config if present
  if (config.format !== undefined) {
    if (typeof config.format !== 'object' || config.format === null) {
      issues.push({
        code: 'FORMAT_NOT_OBJECT',
        message: "'format' must be an object.",
        severity: 'error',
        field: 'format',
        value: config.format,
      });
    } else {
      const format = config.format as Record<string, unknown>;
      validateFormatConfig(format, issues);
    }
  }

  // Validate boolean fields
  validateBooleanField(config, 'allowJargon', issues);
  validateBooleanField(config, 'showFullEvidence', issues);
  validateBooleanField(config, 'showTraceability', issues);
  validateBooleanField(config, 'showReportMeta', issues);
  validateBooleanField(config, 'showRecommendations', issues);

  return {
    valid: issues.filter((i) => i.severity === 'error').length === 0,
    issues,
    mode,
  };
}

/**
 * Create a validated mode configuration that is guaranteed to be complete.
 *
 * Takes a partial configuration and fills in missing fields with defaults
 * from the built-in mode config, then validates the result.
 *
 * @param mode - The explanation mode.
 * @param overrides - Optional partial overrides.
 * @returns A validated mode configuration record.
 * @throws {TypeError} If validation fails.
 */
export function createValidatedModeConfig(
  mode: ExplanationMode,
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  const base = MODE_CONFIGS[mode];

  const formatCopy = { ...base.format };
  const merged: Record<string, unknown> = {
    mode,
    format: formatCopy,
    allowJargon: base.allowJargon,
    showFullEvidence: base.showFullEvidence,
    showTraceability: base.showTraceability,
    showReportMeta: base.showReportMeta,
    showRecommendations: base.showRecommendations,
    ...overrides,
  };

  // Merge format sub-object
  if (overrides?.format && typeof overrides.format === 'object') {
    merged.format = {
      ...formatCopy,
      ...(overrides.format as Record<string, unknown>),
    };
  }

  const result = validateModeConfig(merged);
  if (!result.valid) {
    const messages = result.issues
      .filter((i) => i.severity === 'error')
      .map((i) => `${i.code}: ${i.message}`)
      .join('; ');
    throw new TypeError(`Invalid mode configuration: ${messages}`);
  }

  return merged;
}

// ═══════════════════════════════════════════════════════════════════════════
// Internal Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate the sub-fields of a format configuration.
 */
function validateFormatConfig(
  format: Record<string, unknown>,
  issues: ModeValidationIssue[],
): void {
  // Check maxSentences
  validateNumericField(format, 'maxSentences', MAX_SENTENCES_RANGE, true, issues);

  // Check maxParagraphs
  validateNumericField(format, 'maxParagraphs', MAX_PARAGRAPHS_RANGE, true, issues);

  // Check citationsPerClaim
  validateNumericField(format, 'citationsPerClaim', CITATIONS_PER_CLAIM_RANGE, true, issues);

  // Check boolean fields
  const booleanFields = [
    'allowTechnicalJargon',
    'showSeverity',
    'showConfidence',
    'showTraceability',
    'showSourceLocations',
    'showRecommendations',
    'showDisclaimer',
    'showSummaryHeading',
    'showEvidenceDetails',
    'showRuleDetails',
    'showRiskContext',
    'showReportMeta',
  ];

  for (const field of booleanFields) {
    validateBooleanField(format, field, issues);
  }
}

/**
 * Validate a numeric field in a configuration object.
 */
function validateNumericField(
  obj: Record<string, unknown>,
  field: string,
  range: { min: number; max: number },
  allowZero: boolean,
  issues: ModeValidationIssue[],
): void {
  const value = obj[field];

  if (value === undefined) {
    return;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push({
      code: `${field.toUpperCase()}_NOT_NUMBER`,
      message: `'${field}' must be a finite number.`,
      severity: 'error',
      field,
      value,
    });
    return;
  }

  if (!allowZero && value === 0) {
    issues.push({
      code: `${field.toUpperCase()}_ZERO`,
      message: `'${field}' must not be zero.`,
      severity: 'error',
      field,
      value,
    });
    return;
  }

  if (value < range.min || value > range.max) {
    issues.push({
      code: `${field.toUpperCase()}_OUT_OF_RANGE`,
      message: `'${field}' must be between ${range.min} and ${range.max}. Got ${value}.`,
      severity: 'error',
      field,
      value,
    });
  }
}

/**
 * Validate a boolean field in a configuration object.
 */
function validateBooleanField(
  obj: Record<string, unknown>,
  field: string,
  issues: ModeValidationIssue[],
): void {
  const value = obj[field];

  if (value === undefined) {
    return;
  }

  if (typeof value !== 'boolean') {
    issues.push({
      code: `${field.toUpperCase()}_NOT_BOOLEAN`,
      message: `'${field}' must be a boolean, got ${typeof value}.`,
      severity: 'error',
      field,
      value,
    });
  }
}
