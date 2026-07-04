/**
 * @veris/config — VERIS multi-source configuration.
 *
 * Loads and merges configuration from multiple sources:
 * - Defaults
 * - Configuration files (JSON, YAML, TOML) — global, workspace, repo
 * - Scan profiles
 * - CLI flags
 * - Environment variables
 *
 * ## Invariants
 * - Config is immutable after loading
 * - Config loading is reproducible
 *
 * @module @veris/config
 */

export type {
  VerisConfig,
  ScanConfig,
  ExtractorConfig,
  RuleConfig,
  OutputConfig,
  LimitsConfig,
  PluginConfig,
  ThemeConfig,
  DiagnosticsConfig,
  TelemetryConfig,
  ConfigLayer,
  ConfigEntry,
  ConfigTrace,
} from './config.js';
export { DEFAULT_CONFIG, ConfigResolver, loadFromEnv, createConfigResolver } from './config.js';
