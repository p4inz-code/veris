/**
 * Explain Configuration module — complete config loading, validation,
 * merging, environment support, and integration with the explanation engine.
 *
 * ## Module Structure
 *
 * | Module | Purpose |
 * |--------|---------|
 * | `defaults.ts` | Frozen default ExplainConfig with factory functions |
 * | `config-schema.ts` | Schema versions, field constraints, compatibility checks |
 * | `config-validator.ts` | Comprehensive config validation for all sections |
 * | `config-merger.ts` | Deep deterministic config merging with source-override semantics |
 * | `environment.ts` | VERIS_EXPLAIN_* environment variable loading |
 * | `config-loader.ts` | Multi-source config loader orchestrating all sources |
 * | `explain-config.ts` | Complete pipeline orchestration with engine integration hooks |
 *
 * ## Integration Points
 *
 * - **ExplanationEngine**: `createExplainConfig()` → provides frozen ExplainConfig
 * - **Cache**: `extractCacheConfig()` → extracts cache-compatible options
 * - **ProviderManager**: `extractProviderConfig()` → extracts provider settings
 * - **Pipeline**: `resolveConfigMode()` → resolves effective mode from config
 *
 * @module @veris/explain/config
 */

// ── Defaults ──

export { DEFAULT_EXPLAIN_CONFIG, getDefaultConfig, CONFIG_SCHEMA_VERSION } from './defaults.js';

// ── Schema ──

export {
  CURRENT_CONFIG_SCHEMA,
  MIN_COMPATIBLE_CONFIG_SCHEMA,
  MAX_SUPPORTED_CONFIG_SCHEMA,
  VALID_MODES,
  VALID_PROVIDER_TYPES,
  CONFIG_CONSTRAINTS,
  REQUIRED_FIELDS,
  isWithinRange,
  isSchemaCompatible,
  shouldInvalidateOnSchemaChange,
  getAllowedModeValues,
} from './config-schema.js';

export type { NumericRange } from './config-schema.js';

// ── Validator ──

export type {
  ConfigValidationSeverity,
  ConfigValidationIssue,
  ConfigValidationResult,
} from './config-validator.js';

export { validateConfig } from './config-validator.js';

// ── Merger ──

export { mergeConfigs, mergeConfigSequence, freezeConfig } from './config-merger.js';

// ── Environment ──

export type { EnvVarSource, EnvConfigResult } from './environment.js';

export { ENV_VARS, loadConfigFromEnv, hasEnvConfig } from './environment.js';

// ── Loader ──

export type { ConfigSourceType, ConfigSource, ConfigLoadResult } from './config-loader.js';

export {
  loadExplainConfig,
  loadExplainConfigSequence,
  createEngineConfig,
} from './config-loader.js';

// ── Explain Config ──

export {
  createExplainConfig,
  getDefaultExplainConfig,
  freezeExplainConfig,
  validateExplainConfig,
  mergeExplainConfigs,
  loadExplainConfigFromEnv,
  getConfigSchemaVersion,
  extractCacheConfig,
  extractProviderConfig,
  resolveConfigMode,
  DEFAULT_CONFIG,
} from './explain-config.js';
