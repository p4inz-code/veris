/**
 * Export options — configuration types and validation for the explanation
 * export pipeline.
 *
 * All options are PURELY DETERMINISTIC and offline-first.
 * No Date.now() — clock is injected where needed.
 *
 * @module @veris/explain/export/export-options
 */

// ── Export Format ──

/** Supported export output formats. */
export type ExportFormat = 'markdown' | 'json';

// ── JSON Export Mode ──

/** JSON output formatting mode. */
export type JsonMode = 'pretty' | 'compact';

// ── Clock Interface ──

/**
 * Injectible clock for deterministic timestamps.
 * Default implementation uses Date but can be replaced in tests.
 */
export interface Clock {
  readonly now: () => Date;
}

/** Default clock using Date. */
export const SYSTEM_CLOCK: Clock = {
  now: () => new Date(),
};

// ── Export Options ──

/** Full export configuration. */
export interface ExportOptions {
  /** Output format. */
  readonly format: ExportFormat;
  /** JSON formatting mode (only for JSON format). */
  readonly jsonMode: JsonMode;
  /** JSON indent size for pretty mode (default: 2). */
  readonly jsonIndent: number;
  /** Whether to include a table of contents in Markdown output. */
  readonly includeToc: boolean;
  /** Whether to include citations section in Markdown output. */
  readonly includeCitations: boolean;
  /** Whether to include AI disclaimer text. */
  readonly includeDisclaimer: boolean;
  /** Whether to overwrite existing files. */
  readonly overwrite: boolean;
  /** Schema version string for JSON output. */
  readonly schemaVersion: string;
  /** Injectible clock for deterministic timestamps. */
  readonly clock: Clock;
  /** Whether to emit stable, deterministic ordering. */
  readonly stableOrdering: boolean;
  /** Character encoding for file output (default: "utf-8"). */
  readonly encoding: BufferEncoding;
}

// ── Validation Result ──

/** Severity of an export options validation issue. */
export type OptionSeverity = 'error' | 'warning';

/** A single validation issue. */
export interface OptionIssue {
  readonly severity: OptionSeverity;
  readonly code: string;
  readonly message: string;
  readonly path?: string;
  readonly value?: unknown;
  /** Optional suggestion for fixing the issue. */
  readonly suggestion?: string;
}

/** Result of validating export options. */
export interface OptionsValidationResult {
  readonly valid: boolean;
  readonly issues: readonly OptionIssue[];
}

// ── Defaults ──

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  format: 'markdown',
  jsonMode: 'pretty',
  jsonIndent: 2,
  includeToc: true,
  includeCitations: true,
  includeDisclaimer: true,
  overwrite: false,
  schemaVersion: '1.0.0',
  clock: SYSTEM_CLOCK,
  stableOrdering: true,
  encoding: 'utf-8',
};

// ── Validation ──

const VALID_FORMATS: readonly string[] = ['markdown', 'json'];
const VALID_JSON_MODES: readonly string[] = ['pretty', 'compact'];
const VALID_ENCODINGS: readonly string[] = [
  'ascii',
  'utf8',
  'utf-8',
  'utf16le',
  'ucs2',
  'ucs-2',
  'base64',
  'base64url',
  'latin1',
  'binary',
  'hex',
];

const MIN_JSON_INDENT = 0;
const MAX_JSON_INDENT = 8;

/**
 * Validate export options.
 *
 * @param options - Options to validate.
 * @returns Validation result with all issues.
 */
export function validateExportOptions(options: unknown): OptionsValidationResult {
  const issues: OptionIssue[] = [];

  if (!options || typeof options !== 'object') {
    issues.push({
      severity: 'error',
      code: 'OPTIONS_NOT_OBJECT',
      message: 'Export options must be a non-null object.',
    });
    return { valid: false, issues };
  }

  const opts = options as Record<string, unknown>;

  // format
  if (opts.format !== undefined) {
    if (typeof opts.format !== 'string' || !VALID_FORMATS.includes(opts.format)) {
      issues.push({
        severity: 'error',
        code: 'INVALID_FORMAT',
        message: `Invalid format: "${String(opts.format)}". Must be one of: ${VALID_FORMATS.join(', ')}.`,
        path: 'format',
        value: opts.format,
      });
    }
  }

  // jsonMode
  if (opts.jsonMode !== undefined) {
    if (typeof opts.jsonMode !== 'string' || !VALID_JSON_MODES.includes(opts.jsonMode)) {
      issues.push({
        severity: 'error',
        code: 'INVALID_JSON_MODE',
        message: `Invalid jsonMode: "${String(opts.jsonMode)}". Must be one of: ${VALID_JSON_MODES.join(', ')}.`,
        path: 'jsonMode',
        value: opts.jsonMode,
      });
    }
  }

  // jsonIndent
  if (opts.jsonIndent !== undefined) {
    if (typeof opts.jsonIndent !== 'number' || !Number.isInteger(opts.jsonIndent)) {
      issues.push({
        severity: 'warning',
        code: 'JSON_INDENT_NOT_INTEGER',
        message: 'jsonIndent must be an integer.',
        path: 'jsonIndent',
        value: opts.jsonIndent,
        suggestion: String(DEFAULT_EXPORT_OPTIONS.jsonIndent),
      });
    } else if (opts.jsonIndent < MIN_JSON_INDENT || opts.jsonIndent > MAX_JSON_INDENT) {
      issues.push({
        severity: 'warning',
        code: 'JSON_INDENT_OUT_OF_RANGE',
        message: `jsonIndent must be between ${MIN_JSON_INDENT} and ${MAX_JSON_INDENT}.`,
        path: 'jsonIndent',
        value: opts.jsonIndent,
        suggestion: String(DEFAULT_EXPORT_OPTIONS.jsonIndent),
      });
    }
  }

  // includeToc
  if (opts.includeToc !== undefined && typeof opts.includeToc !== 'boolean') {
    issues.push({
      severity: 'warning',
      code: 'INCLUDE_TOC_NOT_BOOLEAN',
      message: 'includeToc must be a boolean.',
      path: 'includeToc',
      value: opts.includeToc,
    });
  }

  // includeCitations
  if (opts.includeCitations !== undefined && typeof opts.includeCitations !== 'boolean') {
    issues.push({
      severity: 'warning',
      code: 'INCLUDE_CITATIONS_NOT_BOOLEAN',
      message: 'includeCitations must be a boolean.',
      path: 'includeCitations',
      value: opts.includeCitations,
    });
  }

  // overwrite
  if (opts.overwrite !== undefined && typeof opts.overwrite !== 'boolean') {
    issues.push({
      severity: 'warning',
      code: 'OVERWRITE_NOT_BOOLEAN',
      message: 'overwrite must be a boolean.',
      path: 'overwrite',
      value: opts.overwrite,
    });
  }

  // schemaVersion
  if (opts.schemaVersion !== undefined) {
    if (typeof opts.schemaVersion !== 'string' || opts.schemaVersion.length === 0) {
      issues.push({
        severity: 'error',
        code: 'SCHEMA_VERSION_INVALID',
        message: 'schemaVersion must be a non-empty string.',
        path: 'schemaVersion',
        value: opts.schemaVersion,
      });
    }
  }

  // encoding
  if (opts.encoding !== undefined) {
    if (typeof opts.encoding !== 'string' || !VALID_ENCODINGS.includes(opts.encoding)) {
      issues.push({
        severity: 'warning',
        code: 'INVALID_ENCODING',
        message: `Invalid encoding: "${String(opts.encoding)}".`,
        path: 'encoding',
        value: opts.encoding,
        suggestion: DEFAULT_EXPORT_OPTIONS.encoding,
      });
    }
  }

  const errors = issues.filter((i) => i.severity === 'error');
  return { valid: errors.length === 0, issues };
}
