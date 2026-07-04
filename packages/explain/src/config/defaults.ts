/**
 * Default configuration for the AI explanation engine.
 *
 * Provides the canonical default `ExplainConfig` with all fields populated.
 * Every field is frozen and PURELY DETERMINISTIC.
 *
 * @module @veris/explain/config/defaults
 */

import type { ExplainConfig } from '../types/config.js';

// ═══════════════════════════════════════════════════════════════════════════
// Default Configuration
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The canonical default configuration for the explanation engine.
 *
 * Every field is explicitly defined — no implicit defaults.
 * The object is deep-frozen for immutability.
 */
export const DEFAULT_EXPLAIN_CONFIG: ExplainConfig = {
  defaultMode: 'technical',
  caching: true,
  cacheOptions: {
    maxSizeMb: 100,
    defaultTtlMs: 604_800_000, // 7 days in ms
    schemaVersion: 1,
  },
  provider: {
    active: '',
    fallback: undefined,
    timeoutMs: 30_000,
    maxRetries: 2,
  },
  tokenBudget: {
    maxContextTokens: 8_192,
    maxOutputTokens: 2_048,
    reservedForEvidence: 1_500,
    reservedForRules: 500,
  },
  citationValidation: {
    enabled: true,
    strictMode: false,
    maxRetriesOnFailure: 1,
  },
  output: {
    maxLength: 4_096,
    includeDisclaimer: true,
  },
  logging: {
    auditEnabled: true,
    metricsEnabled: true,
  },
};

// Deep-freeze the default config
function deepFreeze<T extends Record<string, unknown>>(obj: T): T {
  const frozen = Object.freeze(obj) as Record<string, unknown>;
  for (const value of Object.values(frozen)) {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value as Record<string, unknown>);
    }
  }
  return frozen as T;
}

// Safe: deepFreeze recursively freezes the object in-place and returns the same reference.
// The cast is necessary because deepFreeze's type parameter requires a Record type.
deepFreeze(DEFAULT_EXPLAIN_CONFIG as unknown as Record<string, unknown>);

// ═══════════════════════════════════════════════════════════════════════════
// Defaults Factory
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get a mutable copy of the default configuration.
 *
 * The returned object is a shallow copy (deep copy for nested objects)
 * that can be safely modified without affecting the frozen default.
 *
 * @returns A mutable copy of the default configuration.
 */
export function getDefaultConfig(): ExplainConfig {
  return {
    defaultMode: DEFAULT_EXPLAIN_CONFIG.defaultMode,
    caching: DEFAULT_EXPLAIN_CONFIG.caching,
    cacheOptions: DEFAULT_EXPLAIN_CONFIG.cacheOptions
      ? { ...DEFAULT_EXPLAIN_CONFIG.cacheOptions }
      : undefined,
    provider: { ...DEFAULT_EXPLAIN_CONFIG.provider },
    tokenBudget: { ...DEFAULT_EXPLAIN_CONFIG.tokenBudget },
    citationValidation: { ...DEFAULT_EXPLAIN_CONFIG.citationValidation },
    output: { ...DEFAULT_EXPLAIN_CONFIG.output },
    logging: { ...DEFAULT_EXPLAIN_CONFIG.logging },
  };
}

/**
 * The schema version for the current config structure.
 * Increment when breaking changes are made to ExplainConfig.
 */
export const CONFIG_SCHEMA_VERSION = 1;
