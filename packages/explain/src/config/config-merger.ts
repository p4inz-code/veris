/**
 * Configuration merger — deep deterministic merging of ExplainConfig objects.
 *
 * Merges configuration objects with source-override semantics: later sources
 * override earlier ones for the same keys. Nested sub-objects are merged
 * recursively. Arrays are replaced, not merged.
 *
 * All merge operations are PURELY DETERMINISTIC — the same inputs always
 * produce the same output.
 *
 * @module @veris/explain/config/config-merger
 */

import type { ExplainConfig, CacheOptions } from '../types/config.js';

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Deep merge two ExplainConfig objects.
 *
 * `source` values override `target` values for the same keys.
 * Nested objects are merged recursively.
 *
 * @param target - The base configuration (lower priority).
 * @param source - The override configuration (higher priority).
 * @returns A new merged ExplainConfig (NOT frozen).
 */
export function mergeConfigs(target: ExplainConfig, source: Partial<ExplainConfig>): ExplainConfig {
  return {
    defaultMode: source.defaultMode ?? target.defaultMode,
    caching: source.caching ?? target.caching,
    cacheOptions: mergeCacheOptions(target.cacheOptions, source.cacheOptions),
    provider: {
      active: source.provider?.active ?? target.provider.active,
      fallback: source.provider?.fallback ?? target.provider.fallback,
      timeoutMs: source.provider?.timeoutMs ?? target.provider.timeoutMs,
      maxRetries: source.provider?.maxRetries ?? target.provider.maxRetries,
    },
    tokenBudget: {
      maxContextTokens: source.tokenBudget?.maxContextTokens ?? target.tokenBudget.maxContextTokens,
      maxOutputTokens: source.tokenBudget?.maxOutputTokens ?? target.tokenBudget.maxOutputTokens,
      reservedForEvidence:
        source.tokenBudget?.reservedForEvidence ?? target.tokenBudget.reservedForEvidence,
      reservedForRules: source.tokenBudget?.reservedForRules ?? target.tokenBudget.reservedForRules,
    },
    citationValidation: {
      enabled: source.citationValidation?.enabled ?? target.citationValidation.enabled,
      strictMode: source.citationValidation?.strictMode ?? target.citationValidation.strictMode,
      maxRetriesOnFailure:
        source.citationValidation?.maxRetriesOnFailure ??
        target.citationValidation.maxRetriesOnFailure,
    },
    output: {
      maxLength: source.output?.maxLength ?? target.output.maxLength,
      includeDisclaimer: source.output?.includeDisclaimer ?? target.output.includeDisclaimer,
    },
    logging: {
      auditEnabled: source.logging?.auditEnabled ?? target.logging.auditEnabled,
      metricsEnabled: source.logging?.metricsEnabled ?? target.logging.metricsEnabled,
    },
  };
}

/**
 * Deep merge a sequence of partial configs into a base config.
 *
 * Configs are applied in order: `configs[0]` is the lowest priority,
 * `configs[configs.length - 1]` is the highest priority.
 *
 * @param target - The base configuration.
 * @param configs - Ordered array of partial config overrides.
 * @returns A new merged ExplainConfig.
 */
export function mergeConfigSequence(
  target: ExplainConfig,
  ...configs: Partial<ExplainConfig>[]
): ExplainConfig {
  let result = { ...target };

  for (const config of configs) {
    if (config && Object.keys(config).length > 0) {
      result = mergeConfigs(result, config);
    }
  }

  return result;
}

/**
 * Deep freeze an ExplainConfig (and all nested objects).
 *
 * @param config - The config to freeze.
 * @returns The frozen config (same reference).
 */
export function freezeConfig(config: ExplainConfig): ExplainConfig {
  // Safe: ExplainConfig is reconstructed via deep cloning, then frozen.
  // The intermediate cast via unknown is needed because ExplainConfig
  // doesn't extend Record<string, unknown> (uses optional/discriminated fields).
  const frozen: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(config as unknown as Record<string, unknown>)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      frozen[key] = deepFreezeObject(value as Record<string, unknown>);
    } else {
      frozen[key] = value;
    }
  }

  return Object.freeze(frozen) as unknown as ExplainConfig;
}

/**
 * Recursively deep-freeze a plain object.
 */
function deepFreezeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const frozen: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      frozen[key] = deepFreezeObject(value as Record<string, unknown>);
    } else {
      frozen[key] = value;
    }
  }
  return Object.freeze(frozen);
}

// ═══════════════════════════════════════════════════════════════════════════
// Internal Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Merge cache options, handling the case where either may be undefined.
 */
function mergeCacheOptions(target?: CacheOptions, source?: CacheOptions): CacheOptions | undefined {
  if (!target && !source) return undefined;
  if (!source) return target ? { ...target } : undefined;
  if (!target) return { ...source };

  return {
    maxSizeMb: source.maxSizeMb ?? target.maxSizeMb,
    defaultTtlMs: source.defaultTtlMs ?? target.defaultTtlMs,
    dbPath: source.dbPath ?? target.dbPath,
    schemaVersion: source.schemaVersion ?? target.schemaVersion,
  };
}
