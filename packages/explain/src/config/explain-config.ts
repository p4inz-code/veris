/**
 * Explain configuration — complete configuration pipeline orchestration.
 *
 * Wires together defaults, loading, merging, validation, and freezing into
 * a single pipeline. Provides factory functions for creating validated,
 * frozen configurations that integrate with ExplanationEngine, Cache,
 * ProviderManager, and Formatter/Modes.
 *
 * @module @veris/explain/config/explain-config
 */

import type { ExplainConfig } from '../types/config.js';
import type { ExplanationMode } from '../types/explanation.js';

import { loadExplainConfig, createEngineConfig } from './config-loader.js';
import type { ConfigLoadResult, ConfigSource } from './config-loader.js';
import { mergeConfigs, freezeConfig } from './config-merger.js';
import {
  CURRENT_CONFIG_SCHEMA,
  isSchemaCompatible,
  shouldInvalidateOnSchemaChange,
} from './config-schema.js';
import { validateConfig } from './config-validator.js';
import type { ConfigValidationResult, ConfigValidationIssue } from './config-validator.js';
import { DEFAULT_EXPLAIN_CONFIG, getDefaultConfig, CONFIG_SCHEMA_VERSION } from './defaults.js';
import { loadConfigFromEnv } from './environment.js';
import type { EnvConfigResult } from './environment.js';

// ═══════════════════════════════════════════════════════════════════════════
// Re-exported Types
// ═══════════════════════════════════════════════════════════════════════════

export type { ConfigLoadResult, ConfigSource } from './config-loader.js';
export type {
  ConfigValidationResult,
  ConfigValidationIssue,
  ConfigValidationSeverity,
} from './config-validator.js';

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a complete ExplainConfig for the explanation engine.
 *
 * This is the primary factory function. It:
 * 1. Loads built-in defaults
 * 2. Applies user-provided overrides
 * 3. Applies environment variable overrides
 * 4. Validates the complete config
 * 5. Freezes the result
 *
 * @param userConfig - Optional user configuration overrides.
 * @returns The frozen, validated config.
 */
export function createExplainConfig(userConfig?: Partial<ExplainConfig>): ExplainConfig {
  return createEngineConfig(userConfig);
}

/**
 * Get the default configuration.
 *
 * @returns A mutable copy of the default config.
 */
export function getDefaultExplainConfig(): ExplainConfig {
  return getDefaultConfig();
}

/**
 * Deep-freeze an ExplainConfig.
 *
 * @param config - The config to freeze.
 * @returns The frozen config.
 */
export function freezeExplainConfig(config: ExplainConfig): ExplainConfig {
  return freezeConfig(config);
}

/**
 * Validate an ExplainConfig.
 *
 * @param config - The config to validate.
 * @returns The validation result.
 */
export function validateExplainConfig(config: unknown): ConfigValidationResult {
  return validateConfig(config);
}

/**
 * Merge two ExplainConfigs, with source overriding target.
 *
 * @param target - The base config (lower priority).
 * @param source - The override config (higher priority).
 * @returns A new merged config (not frozen).
 */
export function mergeExplainConfigs(
  target: ExplainConfig,
  source: Partial<ExplainConfig>,
): ExplainConfig {
  return mergeConfigs(target, source);
}

/**
 * Load configuration from environment variables.
 *
 * @returns The env config result.
 */
export function loadExplainConfigFromEnv(): EnvConfigResult {
  return loadConfigFromEnv();
}

/**
 * Get the current config schema version.
 *
 * @returns The schema version number.
 */
export function getConfigSchemaVersion(): number {
  return CURRENT_CONFIG_SCHEMA;
}

// ═══════════════════════════════════════════════════════════════════════════
// Integration Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Integration: Create cache-compatible options from ExplainConfig.
 *
 * Extracts the cache-related fields from an ExplainConfig into the
 * format expected by the Cache module.
 *
 * @param config - The frozen explain config.
 * @returns Cache configuration compatible with the Cache module.
 */
export function extractCacheConfig(config: ExplainConfig): {
  readonly maxEntries?: number;
  readonly maxSizeBytes?: number;
  readonly defaultTtlMs?: number;
} {
  const maxSizeMb = config.cacheOptions?.maxSizeMb ?? 100;
  return {
    maxSizeBytes: maxSizeMb * 1024 * 1024,
    defaultTtlMs: config.cacheOptions?.defaultTtlMs ?? 604_800_000,
  };
}

/**
 * Integration: Create provider-compatible configuration from ExplainConfig.
 *
 * Extracts provider timeout and retry settings.
 *
 * @param config - The frozen explain config.
 * @returns Provider configuration.
 */
export function extractProviderConfig(config: ExplainConfig): {
  readonly active: string;
  readonly fallback?: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
} {
  return {
    active: config.provider.active,
    fallback: config.provider.fallback,
    timeoutMs: config.provider.timeoutMs,
    maxRetries: config.provider.maxRetries,
  };
}

/**
 * Integration: Resolve the effective explanation mode from config.
 *
 * Takes an optional requested mode and falls back to the config default.
 *
 * @param config - The frozen explain config.
 * @param requestedMode - Optional requested mode from the caller.
 * @returns The resolved explanation mode.
 */
export function resolveConfigMode(
  config: ExplainConfig,
  requestedMode?: ExplanationMode,
): ExplanationMode {
  return requestedMode ?? config.defaultMode;
}

// ═══════════════════════════════════════════════════════════════════════════
// Default Configuration Constant
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A frozen, ready-to-use instance of the default configuration.
 *
 * Use this when you need the default configuration without any overrides.
 * For custom configurations, use {@link createExplainConfig} instead.
 */
export const DEFAULT_CONFIG: ExplainConfig = DEFAULT_EXPLAIN_CONFIG;
