/**
 * Pipeline Configuration — controls pipeline behavior.
 *
 * Supports:
 * - Enabling/disabling analyzers
 * - Priority overrides per analyzer
 * - Experimental analyzer flags
 * - Strict validation mode
 * - Cache configuration
 * - Stage enable/disable
 *
 * @module @veris/analysis/pipeline/config
 */

/** Pipeline configuration. */
export interface PipelineConfig {
  /** Whether to enable caching of parser outputs. */
  readonly enableCache?: boolean;
  /** Maximum cache entries. */
  readonly maxCacheEntries?: number;
  /** Whether to run in strict validation mode. */
  readonly strict?: boolean;
  /** Maximum evidence per artifact. */
  readonly maxEvidencePerArtifact?: number;
  /** Per-analyzer timeout in milliseconds. */
  readonly analyzerTimeoutMs?: number;
  /** Whether to run analyzers sequentially. */
  readonly sequential?: boolean;
  /** Maximum concurrent analyzers. */
  readonly maxConcurrency?: number;
  /** Analyzer-specific overrides. */
  readonly analyzers?: Readonly<Record<string, AnalyzerConfig>>;
  /** Which stages to enable. */
  readonly stages?: Readonly<Record<string, StageConfig>>;
  /** Whether to enable experimental analyzers. */
  readonly enableExperimental?: boolean;
}

/** Per-analyzer configuration overrides. */
export interface AnalyzerConfig {
  /** Whether this analyzer is enabled. */
  readonly enabled?: boolean;
  /** Priority override (lower = runs first). */
  readonly priority?: number;
  /** Whether this is an experimental analyzer. */
  readonly experimental?: boolean;
  /** Analyzer-specific options. */
  readonly options?: Record<string, unknown>;
}

/** Per-stage configuration. */
export interface StageConfig {
  /** Whether this stage is enabled. */
  readonly enabled?: boolean;
  /** Stage-specific options. */
  readonly options?: Record<string, unknown>;
}

/** Default pipeline configuration. */
export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = Object.freeze({
  enableCache: true,
  maxCacheEntries: 1024,
  strict: false,
  maxEvidencePerArtifact: 10000,
  analyzerTimeoutMs: 30000,
  sequential: false,
  maxConcurrency: 8,
  enableExperimental: false,
});

/** Pipeline stage identifiers. */
export const PIPELINE_STAGES = Object.freeze([
  'preprocessing',
  'parsers',
  'metadata',
  'binary-analyzers',
  'language-analyzers',
  'knowledge-enrichment',
  'evidence-normalization',
  'report-generation',
] as const);

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/** Stage dependency graph — maps stages to their dependencies. */
export const STAGE_DEPENDENCIES: Readonly<Record<PipelineStage, readonly PipelineStage[]>> =
  Object.freeze({
    preprocessing: [],
    parsers: ['preprocessing'],
    metadata: ['preprocessing'],
    'binary-analyzers': ['parsers', 'metadata'],
    'language-analyzers': ['preprocessing'],
    'knowledge-enrichment': ['binary-analyzers', 'language-analyzers'],
    'evidence-normalization': ['binary-analyzers', 'language-analyzers', 'knowledge-enrichment'],
    'report-generation': ['evidence-normalization'],
  } as Record<PipelineStage, readonly PipelineStage[]>);

/** Default stage configuration (all enabled). */
export const DEFAULT_STAGE_CONFIG: Readonly<Record<string, StageConfig>> = Object.freeze({
  preprocessing: Object.freeze({ enabled: true }),
  parsers: Object.freeze({ enabled: true }),
  metadata: Object.freeze({ enabled: true }),
  'binary-analyzers': Object.freeze({ enabled: true }),
  'language-analyzers': Object.freeze({ enabled: true }),
  'knowledge-enrichment': Object.freeze({ enabled: true }),
  'evidence-normalization': Object.freeze({ enabled: true }),
  'report-generation': Object.freeze({ enabled: false }), // Disabled by default; used by CLI
});

/** Merge user config with defaults. */
export function mergeConfig(userConfig?: PipelineConfig): PipelineConfig {
  const defaults = DEFAULT_PIPELINE_CONFIG as PipelineConfig;
  return {
    enableCache: userConfig?.enableCache ?? defaults.enableCache,
    maxCacheEntries: userConfig?.maxCacheEntries ?? defaults.maxCacheEntries,
    strict: userConfig?.strict ?? defaults.strict,
    maxEvidencePerArtifact: userConfig?.maxEvidencePerArtifact ?? defaults.maxEvidencePerArtifact,
    analyzerTimeoutMs: userConfig?.analyzerTimeoutMs ?? defaults.analyzerTimeoutMs,
    sequential: userConfig?.sequential ?? defaults.sequential,
    maxConcurrency: userConfig?.maxConcurrency ?? defaults.maxConcurrency,
    enableExperimental: userConfig?.enableExperimental ?? defaults.enableExperimental,
    analyzers: {
      ...(DEFAULT_PIPELINE_CONFIG.analyzers ?? {}),
      ...(userConfig?.analyzers ?? {}),
    },
    stages: {
      ...DEFAULT_STAGE_CONFIG,
      ...(userConfig?.stages ?? {}),
    },
  } as PipelineConfig;
}

/** Check if a stage is enabled in the config. */
export function isStageEnabled(config: PipelineConfig, stageId: string): boolean {
  return config.stages?.[stageId]?.enabled !== false;
}

/** Check if an analyzer is enabled in the config. */
export function isAnalyzerEnabled(config: PipelineConfig, analyzerId: string): boolean {
  const ac = config.analyzers?.[analyzerId];
  if (ac?.enabled === false) return false;
  if (ac?.experimental && !config.enableExperimental) return false;
  return true;
}

/** Get effective analyzer priority. */
export function getEffectivePriority(
  config: PipelineConfig,
  analyzerId: string,
  defaultPriority: number,
): number {
  return config.analyzers?.[analyzerId]?.priority ?? defaultPriority;
}
