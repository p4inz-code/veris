/**
 * Configuration loader — loads ExplainConfig from multiple sources.
 *
 * Loads configuration in priority order (lowest to highest):
 *   1. Built-in defaults (DEFAULT_EXPLAIN_CONFIG)
 *   2. Environment variables (VERIS_EXPLAIN_*)
 *   3. User-provided overrides (partial config object)
 *
 * The result is validated and frozen before return.
 *
 * @module @veris/explain/config/config-loader
 */

import type { ExplainConfig } from '../types/config.js';

import { mergeConfigs, mergeConfigSequence, freezeConfig } from './config-merger.js';
import { validateConfig } from './config-validator.js';
import type { ConfigValidationResult, ConfigValidationIssue } from './config-validator.js';
import { getDefaultConfig } from './defaults.js';
import { loadConfigFromEnv } from './environment.js';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

/** Configuration source identifier. */
export type ConfigSourceType = 'defaults' | 'env' | 'user' | 'file';

/** A single configuration source with metadata. */
export interface ConfigSource {
  /** The type of source. */
  readonly type: ConfigSourceType;
  /** Human-readable description of the source. */
  readonly label: string;
  /** The partial config from this source. */
  readonly config: Partial<ExplainConfig>;
}

/** Result of loading and resolving configuration. */
export interface ConfigLoadResult {
  /** The resolved, validated, frozen configuration. */
  readonly config: ExplainConfig;
  /** Validation result for the config. */
  readonly validation: ConfigValidationResult;
  /** All sources that contributed to the config. */
  readonly sources: readonly ConfigSource[];
  /** Any warnings from env var parsing. */
  readonly envWarnings: readonly string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Config Loader
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Load the complete ExplainConfig from all available sources.
 *
 * Priority order:
 *   1. Built-in defaults (lowest)
 *   2. User-provided config overrides
 *   3. Environment variables (highest)
 *
 * @param userConfig - Optional user-provided partial config overrides.
 * @param userConfigLabel - Optional label for the user config source.
 * @returns The resolved config load result.
 */
export function loadExplainConfig(
  userConfig?: Partial<ExplainConfig>,
  userConfigLabel?: string,
): ConfigLoadResult {
  const sources: ConfigSource[] = [];

  // 1. Start with defaults
  const defaultConfig = getDefaultConfig();
  sources.push({ type: 'defaults', label: 'Built-in defaults', config: defaultConfig });

  // 2. Apply user config (if provided)
  let merged = defaultConfig;
  if (userConfig && Object.keys(userConfig).length > 0) {
    merged = mergeConfigs(merged, userConfig);
    sources.push({ type: 'user', label: userConfigLabel ?? 'User config', config: userConfig });
  }

  // 3. Apply environment variables (highest priority)
  const envResult = loadConfigFromEnv();

  if (Object.keys(envResult.config).length > 0) {
    merged = mergeConfigs(merged, envResult.config);
    sources.push({ type: 'env', label: 'Environment variables', config: envResult.config });
  }

  // 4. Validate the merged config
  const validation = validateConfig(merged);

  // 5. Ensure provider.active is set — use empty string default if missing
  if (!merged.provider.active) {
    merged = {
      ...merged,
      provider: { ...merged.provider, active: '' },
    };
  }

  // 6. Freeze the config
  const frozenConfig = freezeConfig(merged);

  return {
    config: frozenConfig,
    validation,
    sources: Object.freeze(sources),
    envWarnings: envResult.warnings,
  };
}

/**
 * Load configuration with custom config sequence for fine-grained control.
 *
 * This allows callers to specify multiple layers of configuration
 * in a specific priority order.
 *
 * @param configs - Ordered array of partial configs (lowest priority first).
 * @returns The resolved config load result.
 */
export function loadExplainConfigSequence(...configs: Partial<ExplainConfig>[]): ConfigLoadResult {
  const sources: ConfigSource[] = [];

  // Start with defaults
  const defaultConfig = getDefaultConfig();
  sources.push({ type: 'defaults', label: 'Built-in defaults', config: defaultConfig });

  // Apply all configs in order
  let merged = mergeConfigSequence(defaultConfig, ...configs);

  // Apply environment variables on top
  const envResult = loadConfigFromEnv();

  if (Object.keys(envResult.config).length > 0) {
    merged = mergeConfigs(merged, envResult.config);
    sources.push({ type: 'env', label: 'Environment variables', config: envResult.config });
  }

  // Validate
  const validation = validateConfig(merged);

  // Ensure provider.active is set
  if (!merged.provider.active) {
    merged = {
      ...merged,
      provider: { ...merged.provider, active: '' },
    };
  }

  // Freeze
  const frozenConfig = freezeConfig(merged);

  return {
    config: frozenConfig,
    validation,
    sources: Object.freeze(sources),
    envWarnings: envResult.warnings,
  };
}

/**
 * Create an ExplanationEngine-compatible configuration from a user config.
 *
 * This is the primary entry point for integrating with M5's ExplanationEngine.
 * It loads defaults, applies user overrides and env vars, validates, and freezes.
 *
 * @param userConfig - Optional user configuration overrides.
 * @returns The frozen, validated configuration.
 * @throws {TypeError} If the config validation fails with critical errors.
 */
export function createEngineConfig(userConfig?: Partial<ExplainConfig>): ExplainConfig {
  const result = loadExplainConfig(userConfig);

  if (!result.validation.valid && !result.validation.canFallback) {
    const messages = result.validation.issues
      .filter((i) => i.severity === 'error')
      .map((i) => `${i.message}`)
      .join('; ');
    throw new TypeError(`Invalid engine configuration: ${messages}`);
  }

  return result.config;
}
