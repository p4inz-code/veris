/**
 * Configuration schema — schema version and field constraints for ExplainConfig.
 *
 * Defines the structural schema for configuration validation, including
 * field types, allowed ranges, required fields, and schema version tracking.
 *
 * All schema definitions are PURELY DETERMINISTIC and frozen.
 *
 * @module @veris/explain/config/config-schema
 */

import type { ExplainConfig } from '../types/config.js';

// ═══════════════════════════════════════════════════════════════════════════
// Schema Version
// ═══════════════════════════════════════════════════════════════════════════

/** Current schema version for ExplainConfig. */
export const CURRENT_CONFIG_SCHEMA = 1;

/** Minimum compatible schema version for loading. */
export const MIN_COMPATIBLE_CONFIG_SCHEMA = 1;

/** Maximum supported schema version for loading. */
export const MAX_SUPPORTED_CONFIG_SCHEMA = 1;

// ═══════════════════════════════════════════════════════════════════════════
// Field Constraints
// ═══════════════════════════════════════════════════════════════════════════

/** Valid explanation mode values. */
export const VALID_MODES = ['simple', 'technical', 'expert'] as const;

/** Valid provider types. */
export const VALID_PROVIDER_TYPES = [
  'openai',
  'anthropic',
  'ollama',
  'openai-compatible',
  'mock',
] as const;

/** Range constraints for numeric fields. */
export interface NumericRange {
  readonly min: number;
  readonly max: number;
}

/** Schema constraints for all configurable numeric fields. Deep-frozen. */
export const CONFIG_CONSTRAINTS: Readonly<{
  readonly provider: Readonly<{
    readonly timeoutMs: NumericRange;
    readonly maxRetries: NumericRange;
  }>;
  readonly tokenBudget: Readonly<{
    readonly maxContextTokens: NumericRange;
    readonly maxOutputTokens: NumericRange;
    readonly reservedForEvidence: NumericRange;
    readonly reservedForRules: NumericRange;
  }>;
  readonly citationValidation: Readonly<{
    readonly maxRetriesOnFailure: NumericRange;
  }>;
  readonly output: Readonly<{
    readonly maxLength: NumericRange;
  }>;
  readonly cache: Readonly<{
    readonly maxSizeMb: NumericRange;
    readonly defaultTtlMs: NumericRange;
    readonly schemaVersion: NumericRange;
  }>;
}> = Object.freeze({
  provider: Object.freeze({
    timeoutMs: Object.freeze({ min: 1_000, max: 300_000 }),
    maxRetries: Object.freeze({ min: 0, max: 10 }),
  }),
  tokenBudget: Object.freeze({
    maxContextTokens: Object.freeze({ min: 1_024, max: 128_000 }),
    maxOutputTokens: Object.freeze({ min: 128, max: 32_768 }),
    reservedForEvidence: Object.freeze({ min: 0, max: 64_000 }),
    reservedForRules: Object.freeze({ min: 0, max: 64_000 }),
  }),
  citationValidation: Object.freeze({
    maxRetriesOnFailure: Object.freeze({ min: 0, max: 5 }),
  }),
  output: Object.freeze({
    maxLength: Object.freeze({ min: 128, max: 65_536 }),
  }),
  cache: Object.freeze({
    maxSizeMb: Object.freeze({ min: 1, max: 10_000 }),
    defaultTtlMs: Object.freeze({ min: 60_000, max: 31_536_000_000 }),
    schemaVersion: Object.freeze({ min: 0, max: 999 }),
  }),
});

// ═══════════════════════════════════════════════════════════════════════════
// Required Fields per Section
// ═══════════════════════════════════════════════════════════════════════════

/** Required fields for each configuration section. */
export const REQUIRED_FIELDS: Record<string, readonly string[]> = {
  config: [
    'defaultMode',
    'caching',
    'provider',
    'tokenBudget',
    'citationValidation',
    'output',
    'logging',
  ],
  provider: ['active', 'timeoutMs', 'maxRetries'],
  tokenBudget: ['maxContextTokens', 'maxOutputTokens', 'reservedForEvidence', 'reservedForRules'],
  citationValidation: ['enabled', 'strictMode', 'maxRetriesOnFailure'],
  output: ['maxLength', 'includeDisclaimer'],
  logging: ['auditEnabled', 'metricsEnabled'],
  cacheOptions: ['maxSizeMb', 'defaultTtlMs', 'schemaVersion'],
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// Schema Validation Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a value is within a numeric range constraint.
 *
 * @param value - The value to check.
 * @param range - The range constraint.
 * @returns True if the value is within range (inclusive).
 */
export function isWithinRange(value: number, range: NumericRange): boolean {
  return Number.isFinite(value) && value >= range.min && value <= range.max;
}

/**
 * Check if a value is a valid explanation mode.
 *
 * @param value - The value to check.
 * @returns True if the value is a valid mode.
 */
export function isValidMode(value: unknown): value is string {
  return typeof value === 'string' && (VALID_MODES as readonly string[]).includes(value);
}

/**
 * Get a human-readable description of allowed mode values.
 *
 * @returns A string like '"simple", "technical", "expert"'.
 */
export function getAllowedModeValues(): string {
  return VALID_MODES.map((m) => `"${m}"`).join(', ');
}

/**
 * Check config schema compatibility.
 *
 * @param storedSchema - The schema version of stored config.
 * @param currentSchema - The current schema version.
 * @returns True if the stored schema is compatible.
 */
export function isSchemaCompatible(storedSchema: number, currentSchema: number): boolean {
  return (
    storedSchema >= MIN_COMPATIBLE_CONFIG_SCHEMA && storedSchema <= MAX_SUPPORTED_CONFIG_SCHEMA
  );
}

/**
 * Check whether config should be invalidated on schema version change.
 *
 * @param storedSchema - The schema version of stored config.
 * @param currentSchema - The current schema version.
 * @returns True if config with the stored schema should be invalidated.
 */
export function shouldInvalidateOnSchemaChange(
  storedSchema: number,
  currentSchema: number,
): boolean {
  return !isSchemaCompatible(storedSchema, currentSchema) || storedSchema > currentSchema;
}
