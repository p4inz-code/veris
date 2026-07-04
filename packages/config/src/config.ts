/**
 * Hierarchical configuration system for VERIS.
 *
 * Loads and merges configuration from multiple sources with
 * deterministic priority:
 *   Defaults < Global Config < Workspace Config < Profile < CLI Flags < Env Vars
 *
 * Public config interfaces are immutable (readonly).
 * Internal mutation is handled through the ConfigResolver.
 *
 * @module @veris/config/config
 */

// ─── Immutable Public Configuration Interfaces ──────────────────

/** Resolved configuration — immutable after construction. */
export interface VerisConfig {
  readonly scan?: ScanConfig;
  readonly plugins?: PluginConfig;
  readonly theme?: ThemeConfig;
  readonly diagnostics?: DiagnosticsConfig;
  readonly telemetry?: TelemetryConfig;
}

export interface ScanConfig {
  readonly target?: string;
  readonly profile?: string;
  readonly extractors?: ExtractorConfig;
  readonly rules?: RuleConfig;
  readonly output?: OutputConfig;
  readonly limits?: LimitsConfig;
}

export interface ExtractorConfig {
  readonly enabled?: readonly string[];
  readonly disabled?: readonly string[];
  readonly maxFileSize?: string;
  readonly maxDepth?: number;
  readonly timeoutMs?: number;
}

export interface RuleConfig {
  readonly enabledPacks?: readonly string[];
  readonly disabledPacks?: readonly string[];
  readonly severityThreshold?: string;
  readonly maxFindings?: number;
}

export interface OutputConfig {
  readonly format?: readonly string[];
  readonly outputDir?: string;
  readonly verbosity?: 'minimal' | 'normal' | 'detailed';
}

export interface LimitsConfig {
  readonly maxDuration?: string;
  readonly maxMemory?: string;
  readonly maxConcurrency?: number;
}

export interface PluginConfig {
  readonly enabled: boolean;
  readonly paths?: readonly string[];
  readonly config?: Readonly<Record<string, unknown>>;
}

export interface ThemeConfig {
  readonly mode: 'dark' | 'light' | 'auto';
  readonly customPath?: string;
}

export interface DiagnosticsConfig {
  readonly enabled: boolean;
  readonly level: 'basic' | 'detailed' | 'full';
  readonly outputPath?: string;
}

export interface TelemetryConfig {
  readonly enabled: boolean;
  readonly endpoint?: string;
}

// ─── Mutable Internal Types (for construction) ──────────────────

/** Mutable version of VerisConfig for internal construction. */
interface MutableConfig {
  scan?: MutableScanConfig;
  plugins?: MutablePluginConfig;
  theme?: MutableThemeConfig;
  diagnostics?: MutableDiagnosticsConfig;
  telemetry?: MutableTelemetryConfig;
}

interface MutableScanConfig {
  target?: string;
  profile?: string;
  extractors?: MutableExtractorConfig;
  rules?: MutableRuleConfig;
  output?: MutableOutputConfig;
  limits?: MutableLimitsConfig;
}

interface MutableExtractorConfig {
  enabled?: string[];
  disabled?: string[];
  maxFileSize?: string;
  maxDepth?: number;
  timeoutMs?: number;
}

interface MutableRuleConfig {
  enabledPacks?: string[];
  disabledPacks?: string[];
  severityThreshold?: string;
  maxFindings?: number;
}

interface MutableOutputConfig {
  format?: string[];
  outputDir?: string;
  verbosity?: 'minimal' | 'normal' | 'detailed';
}

interface MutableLimitsConfig {
  maxDuration?: string;
  maxMemory?: string;
  maxConcurrency?: number;
}

interface MutablePluginConfig {
  enabled: boolean;
  paths?: string[];
  config?: Record<string, unknown>;
}

interface MutableThemeConfig {
  mode: 'dark' | 'light' | 'auto';
  customPath?: string;
}

interface MutableDiagnosticsConfig {
  enabled: boolean;
  level: 'basic' | 'detailed' | 'full';
  outputPath?: string;
}

interface MutableTelemetryConfig {
  enabled: boolean;
  endpoint?: string;
}

/** Freeze a resolved config to make it deeply readonly. */
function freezeConfig(config: VerisConfig): VerisConfig {
  return JSON.parse(JSON.stringify(config)) as VerisConfig;
}

// ─── Default Configuration ──────────────────────────────────────

/** Default configuration values. */
export const DEFAULT_CONFIG: Readonly<VerisConfig> = Object.freeze({
  scan: Object.freeze({
    target: '.',
    profile: 'balanced',
    extractors: Object.freeze({
      maxFileSize: '100MB',
      maxDepth: 10,
      timeoutMs: 5000,
    }),
    rules: Object.freeze({
      enabledPacks: Object.freeze([]),
      disabledPacks: Object.freeze([]),
      maxFindings: 100_000,
    }),
    output: Object.freeze({
      format: Object.freeze(['json']),
      outputDir: './veris-output',
      verbosity: 'normal',
    }),
    limits: Object.freeze({
      maxDuration: '30min',
      maxMemory: '2GB',
      maxConcurrency: 4,
    }),
  }),
  plugins: Object.freeze({
    enabled: true,
    paths: Object.freeze([]),
  }),
  theme: Object.freeze({
    mode: 'dark',
  }),
  diagnostics: Object.freeze({
    enabled: false,
    level: 'basic',
  }),
  telemetry: Object.freeze({
    enabled: false,
  }),
});

// ─── Configuration Types ────────────────────────────────────────

/** Configuration layer identifiers in priority order (ascending). */
export type ConfigLayer = 'defaults' | 'global' | 'workspace' | 'profile' | 'cli' | 'env';

/** A loaded configuration entry with its source layer. */
export interface ConfigEntry {
  readonly layer: ConfigLayer;
  readonly source: string;
  readonly config: Partial<VerisConfig>;
}

/** Configuration resolution trace — for debugging merge priority. */
export interface ConfigTrace {
  readonly entries: readonly ConfigEntry[];
  readonly resolved: Readonly<VerisConfig>;
}

// ─── Config Resolver ────────────────────────────────────────────

/**
 * Configuration resolver — merges config layers with deterministic priority.
 * Higher priority layers override lower ones.
 */
export class ConfigResolver {
  private readonly entries: ConfigEntry[] = [];

  /**
   * Add a configuration layer.
   * Higher priority layers override lower ones.
   */
  add(layer: ConfigLayer, source: string, config: Partial<VerisConfig>): void {
    this.entries.push({ layer, source, config });
  }

  /**
   * Resolve all layers into a single immutable configuration.
   * Layers are applied in priority order (defaults first, env last).
   */
  resolve(): VerisConfig {
    const layerOrder: ConfigLayer[] = ['defaults', 'global', 'workspace', 'profile', 'cli', 'env'];
    let resolved = DEFAULT_CONFIG as MutableConfig;

    for (const layer of layerOrder) {
      const layerEntries = this.entries.filter((e) => e.layer === layer);
      for (const entry of layerEntries) {
        resolved = this.merge(resolved, entry.config);
      }
    }

    return freezeConfig(resolved as VerisConfig);
  }

  /**
   * Resolve all layers and return a resolution trace.
   */
  resolveWithTrace(): ConfigTrace {
    const resolved = this.resolve();
    return {
      entries: Object.freeze([...this.entries]),
      resolved,
    };
  }

  /**
   * Deep merge two config objects.
   * Source values override target values for same keys.
   * Arrays are replaced, not merged.
   */
  private merge(target: MutableConfig, source: Partial<VerisConfig>): MutableConfig {
    const result: MutableConfig = { ...target };

    for (const [key, value] of Object.entries(source)) {
      if (value === undefined) continue;

      const existing = (target as Record<string, unknown>)[key];

      if (this.isObject(value) && this.isObject(existing)) {
        result[key as keyof MutableConfig] = this.mergeDeep(
          existing as Record<string, unknown>,
          value as Record<string, unknown>,
        ) as never;
      } else {
        result[key as keyof MutableConfig] = value as never;
      }
    }

    return result;
  }

  private mergeDeep(
    target: Record<string, unknown>,
    source: Record<string, unknown>,
  ): Record<string, unknown> {
    const result = { ...target };

    for (const [key, value] of Object.entries(source)) {
      if (value === undefined) continue;

      if (this.isObject(value) && this.isObject(result[key])) {
        result[key] = this.mergeDeep(
          result[key] as Record<string, unknown>,
          value as Record<string, unknown>,
        );
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}

// ─── Environment Variable Loading ───────────────────────────────

/**
 * Load configuration from environment variables.
 * Converts VERIS_* environment variables to config values.
 */
export function loadFromEnv(): Partial<VerisConfig> {
  const config: VerisConfig = {};

  const envVarMapping: Record<string, keyof VerisConfig | string> = {
    VERIS_PROFILE: 'scan.profile',
    VERIS_TARGET: 'scan.target',
    VERIS_OUTPUT: 'scan.output.format',
    VERIS_PLUGINS_ENABLED: 'plugins.enabled',
    VERIS_DIAGNOSTICS: 'diagnostics.enabled',
    VERIS_THEME: 'theme.mode',
  };

  for (const [envVar] of Object.entries(envVarMapping)) {
    const value = process.env[envVar];
    if (value === undefined) continue;

    switch (envVar) {
      case 'VERIS_PROFILE': {
        (config as MutableConfig).scan = {
          ...(config as MutableConfig).scan,
          profile: value,
        } as MutableScanConfig;
        break;
      }
      case 'VERIS_TARGET': {
        (config as MutableConfig).scan = {
          ...(config as MutableConfig).scan,
          target: value,
        } as MutableScanConfig;
        break;
      }
      case 'VERIS_OUTPUT': {
        const scan = { ...(config as MutableConfig).scan } as MutableScanConfig;
        scan.output = { ...scan.output, format: value.split(',') } as MutableOutputConfig;
        (config as MutableConfig).scan = scan;
        break;
      }
      case 'VERIS_PLUGINS_ENABLED': {
        (config as MutableConfig).plugins = {
          ...(config as MutableConfig).plugins,
          enabled: value === 'true',
        } as MutablePluginConfig;
        break;
      }
      case 'VERIS_DIAGNOSTICS': {
        (config as MutableConfig).diagnostics = {
          ...(config as MutableConfig).diagnostics,
          enabled: value === 'true',
        } as MutableDiagnosticsConfig;
        break;
      }
      case 'VERIS_THEME': {
        (config as MutableConfig).theme = {
          ...(config as MutableConfig).theme,
          mode: value as 'dark' | 'light' | 'auto',
        };
        break;
      }
    }
  }

  return config;
}

// ─── Factory ────────────────────────────────────────────────────

/**
 * Create a default-merged configuration resolver.
 */
export function createConfigResolver(): ConfigResolver {
  const resolver = new ConfigResolver();

  // Add default layer
  resolver.add('defaults', 'internal:defaults', {});

  // Add environment layer last (highest priority)
  const envConfig = loadFromEnv();
  if (Object.keys(envConfig).length > 0) {
    resolver.add('env', 'process.env', envConfig);
  }

  return resolver;
}
