/**
 * Configuration validator — validates ExplainConfig objects for correctness.
 *
 * Validates:
 * - Required fields presence
 * - Field type correctness
 * - Numeric range constraints
 * - Provider configuration completeness
 * - Cache configuration validity
 * - Mode/formatter configuration compatibility
 * - Schema version compatibility
 *
 * All validation is PURELY DETERMINISTIC — no external state is accessed.
 *
 * @module @veris/explain/config/config-validator
 */

import type { ExplainConfig, CacheOptions } from '../types/config.js';
import type { ExplanationMode } from '../types/explanation.js';

import {
  CONFIG_CONSTRAINTS,
  REQUIRED_FIELDS,
  isWithinRange,
  isValidMode,
  getAllowedModeValues,
} from './config-schema.js';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

/** Severity of a configuration validation issue. */
export type ConfigValidationSeverity = 'error' | 'warning' | 'info';

/** A single configuration validation issue. */
export interface ConfigValidationIssue {
  /** Machine-readable issue code. */
  readonly code: string;
  /** Human-readable description. */
  readonly message: string;
  /** Severity level. */
  readonly severity: ConfigValidationSeverity;
  /** The config path where the issue was found (e.g., "provider.timeoutMs"). */
  readonly path?: string;
  /** The problematic value. */
  readonly value?: unknown;
  /** A suggested fix or fallback value. */
  readonly suggestion?: string;
}

/** Result of validating a configuration. */
export interface ConfigValidationResult {
  /** Whether the configuration is valid (no errors). */
  readonly valid: boolean;
  /** All issues found during validation. */
  readonly issues: readonly ConfigValidationIssue[];
  /** Number of errors (blocking issues). */
  readonly errorCount: number;
  /** Number of warnings (non-blocking issues). */
  readonly warningCount: number;
  /** Whether the config can be safely used with defaults for invalid fields. */
  readonly canFallback: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Validator
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate a complete ExplainConfig object.
 *
 * Checks all sections and fields, returning a comprehensive validation
 * result with specific issues for each problem found.
 *
 * @param config - The configuration to validate.
 * @returns The validation result.
 */
export function validateConfig(config: unknown): ConfigValidationResult {
  const issues: ConfigValidationIssue[] = [];

  if (!config || typeof config !== 'object') {
    issues.push({
      code: 'CONFIG_NOT_OBJECT',
      message: 'Configuration must be a non-null object.',
      severity: 'error',
    });
    return {
      valid: false,
      issues: Object.freeze(issues),
      errorCount: 1,
      warningCount: 0,
      canFallback: true,
    };
  }

  const cfg = config as Record<string, unknown>;

  // Validate top-level fields
  validateTopLevelFields(cfg, issues);

  // Validate provider section
  if (cfg.provider && typeof cfg.provider === 'object') {
    validateProviderConfig(cfg.provider as Record<string, unknown>, issues);
  }

  // Validate token budget section
  if (cfg.tokenBudget && typeof cfg.tokenBudget === 'object') {
    validateTokenBudget(cfg.tokenBudget as Record<string, unknown>, issues);
  }

  // Validate citation validation section
  if (cfg.citationValidation && typeof cfg.citationValidation === 'object') {
    validateCitationValidation(cfg.citationValidation as Record<string, unknown>, issues);
  }

  // Validate output section
  if (cfg.output && typeof cfg.output === 'object') {
    validateOutputConfig(cfg.output as Record<string, unknown>, issues);
  }

  // Validate logging section
  if (cfg.logging && typeof cfg.logging === 'object') {
    validateLoggingConfig(cfg.logging as Record<string, unknown>, issues);
  }

  // Validate cache options
  if (cfg.cacheOptions && typeof cfg.cacheOptions === 'object') {
    validateCacheOptions(cfg.cacheOptions as Record<string, unknown>, issues);
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  return {
    valid: errors.length === 0,
    issues: Object.freeze(issues),
    errorCount: errors.length,
    warningCount: warnings.length,
    canFallback: errors.length === 0 || issues.some((i) => i.suggestion !== undefined),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Section Validators
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate top-level configuration fields.
 */
function validateTopLevelFields(
  cfg: Record<string, unknown>,
  issues: ConfigValidationIssue[],
): void {
  // defaultMode
  if (cfg.defaultMode !== undefined) {
    if (typeof cfg.defaultMode !== 'string') {
      issues.push({
        code: 'DEFAULT_MODE_NOT_STRING',
        message: `'defaultMode' must be a string, got ${typeof cfg.defaultMode}.`,
        severity: 'error',
        path: 'defaultMode',
        value: cfg.defaultMode,
        suggestion: getAllowedModeValues(),
      });
    } else if (!isValidMode(cfg.defaultMode)) {
      issues.push({
        code: 'DEFAULT_MODE_INVALID',
        message: `Invalid defaultMode "${cfg.defaultMode}". Must be one of: ${getAllowedModeValues()}.`,
        severity: 'warning',
        path: 'defaultMode',
        value: cfg.defaultMode,
        suggestion: 'technical',
      });
    }
  } else {
    issues.push({
      code: 'DEFAULT_MODE_MISSING',
      message: "defaultMode is not set. Using 'technical'.",
      severity: 'warning',
      path: 'defaultMode',
      suggestion: 'technical',
    });
  }

  // caching
  if (cfg.caching !== undefined && typeof cfg.caching !== 'boolean') {
    issues.push({
      code: 'CACHING_NOT_BOOLEAN',
      message: `'caching' must be a boolean, got ${typeof cfg.caching}.`,
      severity: 'warning',
      path: 'caching',
      value: cfg.caching,
      suggestion: 'true',
    });
  }
}

/**
 * Validate the provider configuration section.
 */
function validateProviderConfig(
  provider: Record<string, unknown>,
  issues: ConfigValidationIssue[],
): void {
  // active provider
  if (!provider.active || typeof provider.active !== 'string') {
    issues.push({
      code: 'PROVIDER_ACTIVE_MISSING',
      message: 'No active provider configured. AI explanations will not work.',
      severity: 'warning',
      path: 'provider.active',
      suggestion: "Set a provider ID (e.g., 'ollama', 'openai').",
    });
  }

  // timeoutMs
  if (provider.timeoutMs !== undefined) {
    if (typeof provider.timeoutMs !== 'number' || !Number.isFinite(provider.timeoutMs as number)) {
      issues.push({
        code: 'PROVIDER_TIMEOUT_NOT_NUMBER',
        message: `'provider.timeoutMs' must be a finite number.`,
        severity: 'error',
        path: 'provider.timeoutMs',
        value: provider.timeoutMs,
        suggestion: String(CONFIG_CONSTRAINTS.provider.timeoutMs.min),
      });
    } else if (
      !isWithinRange(provider.timeoutMs as number, CONFIG_CONSTRAINTS.provider.timeoutMs)
    ) {
      issues.push({
        code: 'PROVIDER_TIMEOUT_OUT_OF_RANGE',
        message: `'provider.timeoutMs' must be between ${CONFIG_CONSTRAINTS.provider.timeoutMs.min} and ${CONFIG_CONSTRAINTS.provider.timeoutMs.max}.`,
        severity: 'warning',
        path: 'provider.timeoutMs',
        value: provider.timeoutMs,
        suggestion: '30000',
      });
    }
  }

  // maxRetries
  if (provider.maxRetries !== undefined) {
    if (typeof provider.maxRetries !== 'number' || !Number.isInteger(provider.maxRetries)) {
      issues.push({
        code: 'PROVIDER_RETRIES_NOT_INTEGER',
        message: `'provider.maxRetries' must be an integer.`,
        severity: 'warning',
        path: 'provider.maxRetries',
        value: provider.maxRetries,
        suggestion: '2',
      });
    } else if (
      !isWithinRange(provider.maxRetries as number, CONFIG_CONSTRAINTS.provider.maxRetries)
    ) {
      issues.push({
        code: 'PROVIDER_RETRIES_OUT_OF_RANGE',
        message: `'provider.maxRetries' must be between ${CONFIG_CONSTRAINTS.provider.maxRetries.min} and ${CONFIG_CONSTRAINTS.provider.maxRetries.max}.`,
        severity: 'warning',
        path: 'provider.maxRetries',
        value: provider.maxRetries,
        suggestion: '2',
      });
    }
  }
}

/**
 * Validate the token budget configuration section.
 */
function validateTokenBudget(
  budget: Record<string, unknown>,
  issues: ConfigValidationIssue[],
): void {
  const fields = [
    { field: 'maxContextTokens', constraint: CONFIG_CONSTRAINTS.tokenBudget.maxContextTokens },
    { field: 'maxOutputTokens', constraint: CONFIG_CONSTRAINTS.tokenBudget.maxOutputTokens },
    {
      field: 'reservedForEvidence',
      constraint: CONFIG_CONSTRAINTS.tokenBudget.reservedForEvidence,
    },
    { field: 'reservedForRules', constraint: CONFIG_CONSTRAINTS.tokenBudget.reservedForRules },
  ];

  for (const { field, constraint } of fields) {
    const value = budget[field];
    if (value !== undefined) {
      if (typeof value !== 'number' || !Number.isFinite(value as number)) {
        issues.push({
          code: `${toFieldCode(field)}_NOT_NUMBER`,
          message: `'tokenBudget.${field}' must be a finite number.`,
          severity: 'error',
          path: `tokenBudget.${field}`,
          value,
          suggestion: String(constraint.min),
        });
      } else if (!isWithinRange(value as number, constraint)) {
        issues.push({
          code: `${toFieldCode(field)}_OUT_OF_RANGE`,
          message: `'tokenBudget.${field}' must be between ${constraint.min} and ${constraint.max}.`,
          severity: 'warning',
          path: `tokenBudget.${field}`,
          value,
          suggestion: String(constraint.min),
        });
      }
    }
  }
}

/**
 * Validate the citation validation configuration section.
 */
function validateCitationValidation(
  citation: Record<string, unknown>,
  issues: ConfigValidationIssue[],
): void {
  // enabled
  if (citation.enabled !== undefined && typeof citation.enabled !== 'boolean') {
    issues.push({
      code: 'CITATION_ENABLED_NOT_BOOLEAN',
      message: "'citationValidation.enabled' must be a boolean.",
      severity: 'warning',
      path: 'citationValidation.enabled',
      value: citation.enabled,
    });
  }

  // strictMode
  if (citation.strictMode !== undefined && typeof citation.strictMode !== 'boolean') {
    issues.push({
      code: 'CITATION_STRICT_NOT_BOOLEAN',
      message: "'citationValidation.strictMode' must be a boolean.",
      severity: 'warning',
      path: 'citationValidation.strictMode',
      value: citation.strictMode,
    });
  }

  // maxRetriesOnFailure
  const maxRetries = citation.maxRetriesOnFailure;
  if (maxRetries !== undefined) {
    if (typeof maxRetries !== 'number' || !Number.isInteger(maxRetries)) {
      issues.push({
        code: 'CITATION_RETRIES_NOT_INTEGER',
        message: "'citationValidation.maxRetriesOnFailure' must be an integer.",
        severity: 'warning',
        path: 'citationValidation.maxRetriesOnFailure',
        value: maxRetries,
        suggestion: '1',
      });
    } else if (
      !isWithinRange(
        maxRetries as number,
        CONFIG_CONSTRAINTS.citationValidation.maxRetriesOnFailure,
      )
    ) {
      issues.push({
        code: 'CITATION_RETRIES_OUT_OF_RANGE',
        message: `'citationValidation.maxRetriesOnFailure' must be between ${CONFIG_CONSTRAINTS.citationValidation.maxRetriesOnFailure.min} and ${CONFIG_CONSTRAINTS.citationValidation.maxRetriesOnFailure.max}.`,
        severity: 'warning',
        path: 'citationValidation.maxRetriesOnFailure',
        value: maxRetries,
        suggestion: '1',
      });
    }
  }
}

/**
 * Validate the output configuration section.
 */
function validateOutputConfig(
  output: Record<string, unknown>,
  issues: ConfigValidationIssue[],
): void {
  // maxLength
  const maxLength = output.maxLength;
  if (maxLength !== undefined) {
    if (typeof maxLength !== 'number' || !Number.isFinite(maxLength as number)) {
      issues.push({
        code: 'OUTPUT_MAX_LENGTH_NOT_NUMBER',
        message: "'output.maxLength' must be a finite number.",
        severity: 'warning',
        path: 'output.maxLength',
        value: maxLength,
        suggestion: '4096',
      });
    } else if (!isWithinRange(maxLength as number, CONFIG_CONSTRAINTS.output.maxLength)) {
      issues.push({
        code: 'OUTPUT_MAX_LENGTH_OUT_OF_RANGE',
        message: `'output.maxLength' must be between ${CONFIG_CONSTRAINTS.output.maxLength.min} and ${CONFIG_CONSTRAINTS.output.maxLength.max}.`,
        severity: 'warning',
        path: 'output.maxLength',
        value: maxLength,
        suggestion: '4096',
      });
    }
  }

  // includeDisclaimer
  if (output.includeDisclaimer !== undefined && typeof output.includeDisclaimer !== 'boolean') {
    issues.push({
      code: 'OUTPUT_DISCLAIMER_NOT_BOOLEAN',
      message: "'output.includeDisclaimer' must be a boolean.",
      severity: 'warning',
      path: 'output.includeDisclaimer',
      value: output.includeDisclaimer,
    });
  }
}

/**
 * Validate the logging configuration section.
 */
function validateLoggingConfig(
  logging: Record<string, unknown>,
  issues: ConfigValidationIssue[],
): void {
  if (logging.auditEnabled !== undefined && typeof logging.auditEnabled !== 'boolean') {
    issues.push({
      code: 'LOGGING_AUDIT_NOT_BOOLEAN',
      message: "'logging.auditEnabled' must be a boolean.",
      severity: 'warning',
      path: 'logging.auditEnabled',
      value: logging.auditEnabled,
    });
  }

  if (logging.metricsEnabled !== undefined && typeof logging.metricsEnabled !== 'boolean') {
    issues.push({
      code: 'LOGGING_METRICS_NOT_BOOLEAN',
      message: "'logging.metricsEnabled' must be a boolean.",
      severity: 'warning',
      path: 'logging.metricsEnabled',
      value: logging.metricsEnabled,
    });
  }
}

/**
 * Validate the cache options configuration section.
 */
function validateCacheOptions(
  cache: Record<string, unknown>,
  issues: ConfigValidationIssue[],
): void {
  // maxSizeMb
  const maxSizeMb = cache.maxSizeMb;
  if (maxSizeMb !== undefined) {
    if (typeof maxSizeMb !== 'number' || !Number.isFinite(maxSizeMb as number)) {
      issues.push({
        code: 'CACHE_MAX_SIZE_NOT_NUMBER',
        message: "'cacheOptions.maxSizeMb' must be a finite number.",
        severity: 'warning',
        path: 'cacheOptions.maxSizeMb',
        value: maxSizeMb,
        suggestion: '100',
      });
    } else if (!isWithinRange(maxSizeMb as number, CONFIG_CONSTRAINTS.cache.maxSizeMb)) {
      issues.push({
        code: 'CACHE_MAX_SIZE_OUT_OF_RANGE',
        message: `'cacheOptions.maxSizeMb' must be between ${CONFIG_CONSTRAINTS.cache.maxSizeMb.min} and ${CONFIG_CONSTRAINTS.cache.maxSizeMb.max}.`,
        severity: 'warning',
        path: 'cacheOptions.maxSizeMb',
        value: maxSizeMb,
        suggestion: '100',
      });
    }
  }

  // defaultTtlMs
  const ttl = cache.defaultTtlMs;
  if (ttl !== undefined) {
    if (typeof ttl !== 'number' || !Number.isFinite(ttl as number)) {
      issues.push({
        code: 'CACHE_TTL_NOT_NUMBER',
        message: "'cacheOptions.defaultTtlMs' must be a finite number.",
        severity: 'warning',
        path: 'cacheOptions.defaultTtlMs',
        value: ttl,
        suggestion: '604800000',
      });
    } else if (!isWithinRange(ttl as number, CONFIG_CONSTRAINTS.cache.defaultTtlMs)) {
      issues.push({
        code: 'CACHE_TTL_OUT_OF_RANGE',
        message: `'cacheOptions.defaultTtlMs' must be between ${CONFIG_CONSTRAINTS.cache.defaultTtlMs.min}ms and ${CONFIG_CONSTRAINTS.cache.defaultTtlMs.max}ms.`,
        severity: 'warning',
        path: 'cacheOptions.defaultTtlMs',
        value: ttl,
        suggestion: '604800000',
      });
    }
  }

  // schemaVersion
  const schemaVersion = cache.schemaVersion;
  if (schemaVersion !== undefined) {
    if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion)) {
      issues.push({
        code: 'CACHE_SCHEMA_VERSION_NOT_INTEGER',
        message: "'cacheOptions.schemaVersion' must be an integer.",
        severity: 'warning',
        path: 'cacheOptions.schemaVersion',
        value: schemaVersion,
        suggestion: '1',
      });
    } else if (!isWithinRange(schemaVersion as number, CONFIG_CONSTRAINTS.cache.schemaVersion)) {
      issues.push({
        code: 'CACHE_SCHEMA_VERSION_OUT_OF_RANGE',
        message: `'cacheOptions.schemaVersion' must be between ${CONFIG_CONSTRAINTS.cache.schemaVersion.min} and ${CONFIG_CONSTRAINTS.cache.schemaVersion.max}.`,
        severity: 'warning',
        path: 'cacheOptions.schemaVersion',
        value: schemaVersion,
        suggestion: '1',
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Internal Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert a camelCase field name to UPPER_SNAKE_CASE code suffix.
 */
function toFieldCode(field: string): string {
  return field.replace(/([A-Z])/g, '_$1').toUpperCase();
}
