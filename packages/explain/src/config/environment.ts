/**
 * Environment variable configuration — loads ExplainConfig from environment variables.
 *
 * Maps VERIS_EXPLAIN_* environment variables to ExplainConfig fields with
 * type coercion (booleans, numbers, strings). All environment variable names
 * are documented constants for traceability.
 *
 * @module @veris/explain/config/environment
 */

import type { ExplainConfig, CacheOptions } from '../types/config.js';
import type { ExplanationMode } from '../types/explanation.js';

// ═══════════════════════════════════════════════════════════════════════════
// Environment Variable Names
// ═══════════════════════════════════════════════════════════════════════════

export const ENV_VARS = {
  DEFAULT_MODE: 'VERIS_EXPLAIN_DEFAULT_MODE',
  CACHING: 'VERIS_EXPLAIN_CACHING',
  CACHE_MAX_SIZE_MB: 'VERIS_EXPLAIN_CACHE_MAX_SIZE_MB',
  CACHE_TTL_MS: 'VERIS_EXPLAIN_CACHE_TTL_MS',
  CACHE_DB_PATH: 'VERIS_EXPLAIN_CACHE_DB_PATH',
  PROVIDER_ACTIVE: 'VERIS_EXPLAIN_PROVIDER_ACTIVE',
  PROVIDER_FALLBACK: 'VERIS_EXPLAIN_PROVIDER_FALLBACK',
  PROVIDER_TIMEOUT_MS: 'VERIS_EXPLAIN_PROVIDER_TIMEOUT_MS',
  PROVIDER_MAX_RETRIES: 'VERIS_EXPLAIN_PROVIDER_MAX_RETRIES',
  TOKEN_MAX_CONTEXT: 'VERIS_EXPLAIN_TOKEN_MAX_CONTEXT',
  TOKEN_MAX_OUTPUT: 'VERIS_EXPLAIN_TOKEN_MAX_OUTPUT',
  TOKEN_EVIDENCE_RESERVE: 'VERIS_EXPLAIN_TOKEN_EVIDENCE_RESERVE',
  TOKEN_RULES_RESERVE: 'VERIS_EXPLAIN_TOKEN_RULES_RESERVE',
  CITATION_ENABLED: 'VERIS_EXPLAIN_CITATION_ENABLED',
  CITATION_STRICT: 'VERIS_EXPLAIN_CITATION_STRICT',
  CITATION_MAX_RETRIES: 'VERIS_EXPLAIN_CITATION_MAX_RETRIES',
  OUTPUT_MAX_LENGTH: 'VERIS_EXPLAIN_OUTPUT_MAX_LENGTH',
  OUTPUT_DISCLAIMER: 'VERIS_EXPLAIN_OUTPUT_DISCLAIMER',
  LOGGING_AUDIT: 'VERIS_EXPLAIN_LOGGING_AUDIT',
  LOGGING_METRICS: 'VERIS_EXPLAIN_LOGGING_METRICS',
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

/** A map of env var name to its parsed value. */
export interface EnvVarSource {
  /** The environment variable name. */
  readonly name: string;
  /** The raw string value from the environment. */
  readonly rawValue: string;
  /** The parsed/coerced value. */
  readonly parsedValue: unknown;
  /** The config path this maps to (e.g., "provider.timeoutMs"). */
  readonly configPath: string;
}

/** Result of loading configuration from environment variables. */
export interface EnvConfigResult {
  /** The partial config loaded from env vars. */
  readonly config: Partial<ExplainConfig>;
  /** Sources of each env var that was found and parsed. */
  readonly sources: readonly EnvVarSource[];
  /** Any warnings encountered during parsing. */
  readonly warnings: readonly string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Mutable Builder Types (for constructing readonly ExplainConfig)
// ═══════════════════════════════════════════════════════════════════════════

interface MutableProvider {
  active?: string;
  fallback?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

interface MutableTokenBudget {
  maxContextTokens?: number;
  maxOutputTokens?: number;
  reservedForEvidence?: number;
  reservedForRules?: number;
}

interface MutableCitationValidation {
  enabled?: boolean;
  strictMode?: boolean;
  maxRetriesOnFailure?: number;
}

interface MutableOutput {
  maxLength?: number;
  includeDisclaimer?: boolean;
}

interface MutableLogging {
  auditEnabled?: boolean;
  metricsEnabled?: boolean;
}

interface MutableCacheOptions {
  maxSizeMb?: number;
  defaultTtlMs?: number;
  dbPath?: string;
  schemaVersion?: number;
}

interface MutableExplainConfig {
  defaultMode?: ExplanationMode;
  caching?: boolean;
  cacheOptions?: MutableCacheOptions;
  provider?: MutableProvider;
  tokenBudget?: MutableTokenBudget;
  citationValidation?: MutableCitationValidation;
  output?: MutableOutput;
  logging?: MutableLogging;
}

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

const VALID_EXPLANATION_MODES: readonly string[] = ['simple', 'technical', 'expert'];

/**
 * Load ExplainConfig overrides from environment variables.
 *
 * Reads VERIS_EXPLAIN_* environment variables and returns a partial
 * ExplainConfig with the overrides applied. Invalid values are skipped
 * with a warning.
 *
 * @param env - Optional custom environment (defaults to process.env).
 * @returns The env config result with overrides and source tracking.
 */
export function loadConfigFromEnv(env?: Record<string, string | undefined>): EnvConfigResult {
  const envRecord =
    env ??
    (typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>) : {});
  const mutable: MutableExplainConfig = {};
  const sources: EnvVarSource[] = [];
  const warnings: string[] = [];

  // Helper to read a string env var
  function readString(envVar: string): string | undefined {
    return envRecord[envVar];
  }

  // Helper to read a number env var
  function readNumber(envVar: string): number | undefined {
    const raw = envRecord[envVar];
    if (raw === undefined) return undefined;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      warnings.push(`Invalid number in ${envVar}: "${raw}". Skipping.`);
      return undefined;
    }
    return parsed;
  }

  // Helper to read a boolean env var
  function readBoolean(envVar: string): boolean | undefined {
    const raw = envRecord[envVar];
    if (raw === undefined) return undefined;
    const lower = raw.toLowerCase().trim();
    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'no') return false;
    warnings.push(`Invalid boolean in ${envVar}: "${raw}". Use true/false. Skipping.`);
    return undefined;
  }

  // ── Default Mode ──
  const defaultMode = readString(ENV_VARS.DEFAULT_MODE);
  if (defaultMode !== undefined) {
    const mode = defaultMode.toLowerCase().trim();
    if (VALID_EXPLANATION_MODES.includes(mode)) {
      mutable.defaultMode = mode as ExplanationMode;
      sources.push({
        name: ENV_VARS.DEFAULT_MODE,
        rawValue: defaultMode,
        parsedValue: mode,
        configPath: 'defaultMode',
      });
    } else {
      warnings.push(
        `Invalid mode in ${ENV_VARS.DEFAULT_MODE}: "${defaultMode}". Use simple, technical, or expert.`,
      );
    }
  }

  // ── Caching ──
  const caching = readBoolean(ENV_VARS.CACHING);
  if (caching !== undefined) {
    mutable.caching = caching;
    sources.push({
      name: ENV_VARS.CACHING,
      rawValue: String(caching),
      parsedValue: caching,
      configPath: 'caching',
    });
  }

  // ── Cache Options ──
  const maxSizeMb = readNumber(ENV_VARS.CACHE_MAX_SIZE_MB);
  const cacheTtlMs = readNumber(ENV_VARS.CACHE_TTL_MS);
  const dbPath = readString(ENV_VARS.CACHE_DB_PATH);

  if (maxSizeMb !== undefined || cacheTtlMs !== undefined || dbPath !== undefined) {
    const cacheOpts: MutableCacheOptions = {};
    let hasCacheOpts = false;
    if (maxSizeMb !== undefined) {
      cacheOpts.maxSizeMb = maxSizeMb;
      sources.push({
        name: ENV_VARS.CACHE_MAX_SIZE_MB,
        rawValue: String(maxSizeMb),
        parsedValue: maxSizeMb,
        configPath: 'cacheOptions.maxSizeMb',
      });
      hasCacheOpts = true;
    }
    if (cacheTtlMs !== undefined) {
      cacheOpts.defaultTtlMs = cacheTtlMs;
      sources.push({
        name: ENV_VARS.CACHE_TTL_MS,
        rawValue: String(cacheTtlMs),
        parsedValue: cacheTtlMs,
        configPath: 'cacheOptions.defaultTtlMs',
      });
      hasCacheOpts = true;
    }
    if (dbPath !== undefined) {
      cacheOpts.dbPath = dbPath;
      sources.push({
        name: ENV_VARS.CACHE_DB_PATH,
        rawValue: dbPath,
        parsedValue: dbPath,
        configPath: 'cacheOptions.dbPath',
      });
      hasCacheOpts = true;
    }
    if (hasCacheOpts) {
      mutable.cacheOptions = cacheOpts;
    }
  }

  // ── Provider ──
  const active = readString(ENV_VARS.PROVIDER_ACTIVE);
  const fallback = readString(ENV_VARS.PROVIDER_FALLBACK);
  const timeoutMs = readNumber(ENV_VARS.PROVIDER_TIMEOUT_MS);
  const maxRetries = readNumber(ENV_VARS.PROVIDER_MAX_RETRIES);

  if (
    active !== undefined ||
    fallback !== undefined ||
    timeoutMs !== undefined ||
    maxRetries !== undefined
  ) {
    const provider: MutableProvider = {};
    if (active !== undefined) {
      provider.active = active;
      sources.push({
        name: ENV_VARS.PROVIDER_ACTIVE,
        rawValue: active,
        parsedValue: active,
        configPath: 'provider.active',
      });
    }
    if (fallback !== undefined) {
      provider.fallback = fallback;
      sources.push({
        name: ENV_VARS.PROVIDER_FALLBACK,
        rawValue: fallback,
        parsedValue: fallback,
        configPath: 'provider.fallback',
      });
    }
    if (timeoutMs !== undefined) {
      provider.timeoutMs = timeoutMs;
      sources.push({
        name: ENV_VARS.PROVIDER_TIMEOUT_MS,
        rawValue: String(timeoutMs),
        parsedValue: timeoutMs,
        configPath: 'provider.timeoutMs',
      });
    }
    if (maxRetries !== undefined) {
      provider.maxRetries = maxRetries;
      sources.push({
        name: ENV_VARS.PROVIDER_MAX_RETRIES,
        rawValue: String(maxRetries),
        parsedValue: maxRetries,
        configPath: 'provider.maxRetries',
      });
    }
    mutable.provider = provider;
  }

  // ── Token Budget ──
  const maxContext = readNumber(ENV_VARS.TOKEN_MAX_CONTEXT);
  const maxOutput = readNumber(ENV_VARS.TOKEN_MAX_OUTPUT);
  const evidenceReserve = readNumber(ENV_VARS.TOKEN_EVIDENCE_RESERVE);
  const rulesReserve = readNumber(ENV_VARS.TOKEN_RULES_RESERVE);

  if (
    maxContext !== undefined ||
    maxOutput !== undefined ||
    evidenceReserve !== undefined ||
    rulesReserve !== undefined
  ) {
    const budget: MutableTokenBudget = {};
    if (maxContext !== undefined) {
      budget.maxContextTokens = maxContext;
      sources.push({
        name: ENV_VARS.TOKEN_MAX_CONTEXT,
        rawValue: String(maxContext),
        parsedValue: maxContext,
        configPath: 'tokenBudget.maxContextTokens',
      });
    }
    if (maxOutput !== undefined) {
      budget.maxOutputTokens = maxOutput;
      sources.push({
        name: ENV_VARS.TOKEN_MAX_OUTPUT,
        rawValue: String(maxOutput),
        parsedValue: maxOutput,
        configPath: 'tokenBudget.maxOutputTokens',
      });
    }
    if (evidenceReserve !== undefined) {
      budget.reservedForEvidence = evidenceReserve;
      sources.push({
        name: ENV_VARS.TOKEN_EVIDENCE_RESERVE,
        rawValue: String(evidenceReserve),
        parsedValue: evidenceReserve,
        configPath: 'tokenBudget.reservedForEvidence',
      });
    }
    if (rulesReserve !== undefined) {
      budget.reservedForRules = rulesReserve;
      sources.push({
        name: ENV_VARS.TOKEN_RULES_RESERVE,
        rawValue: String(rulesReserve),
        parsedValue: rulesReserve,
        configPath: 'tokenBudget.reservedForRules',
      });
    }
    mutable.tokenBudget = budget as ExplainConfig['tokenBudget'];
  }

  // ── Citation Validation ──
  const citEnabled = readBoolean(ENV_VARS.CITATION_ENABLED);
  const citStrict = readBoolean(ENV_VARS.CITATION_STRICT);
  const citMaxRetries = readNumber(ENV_VARS.CITATION_MAX_RETRIES);

  if (citEnabled !== undefined || citStrict !== undefined || citMaxRetries !== undefined) {
    const cit: MutableCitationValidation = {};
    if (citEnabled !== undefined) {
      cit.enabled = citEnabled;
      sources.push({
        name: ENV_VARS.CITATION_ENABLED,
        rawValue: String(citEnabled),
        parsedValue: citEnabled,
        configPath: 'citationValidation.enabled',
      });
    }
    if (citStrict !== undefined) {
      cit.strictMode = citStrict;
      sources.push({
        name: ENV_VARS.CITATION_STRICT,
        rawValue: String(citStrict),
        parsedValue: citStrict,
        configPath: 'citationValidation.strictMode',
      });
    }
    if (citMaxRetries !== undefined) {
      cit.maxRetriesOnFailure = citMaxRetries;
      sources.push({
        name: ENV_VARS.CITATION_MAX_RETRIES,
        rawValue: String(citMaxRetries),
        parsedValue: citMaxRetries,
        configPath: 'citationValidation.maxRetriesOnFailure',
      });
    }
    mutable.citationValidation = cit as ExplainConfig['citationValidation'];
  }

  // ── Output ──
  const maxLength = readNumber(ENV_VARS.OUTPUT_MAX_LENGTH);
  const includeDisclaimer = readBoolean(ENV_VARS.OUTPUT_DISCLAIMER);

  if (maxLength !== undefined || includeDisclaimer !== undefined) {
    const out: MutableOutput = {};
    if (maxLength !== undefined) {
      out.maxLength = maxLength;
      sources.push({
        name: ENV_VARS.OUTPUT_MAX_LENGTH,
        rawValue: String(maxLength),
        parsedValue: maxLength,
        configPath: 'output.maxLength',
      });
    }
    if (includeDisclaimer !== undefined) {
      out.includeDisclaimer = includeDisclaimer;
      sources.push({
        name: ENV_VARS.OUTPUT_DISCLAIMER,
        rawValue: String(includeDisclaimer),
        parsedValue: includeDisclaimer,
        configPath: 'output.includeDisclaimer',
      });
    }
    mutable.output = out as ExplainConfig['output'];
  }

  // ── Logging ──
  const auditEnabled = readBoolean(ENV_VARS.LOGGING_AUDIT);
  const metricsEnabled = readBoolean(ENV_VARS.LOGGING_METRICS);

  if (auditEnabled !== undefined || metricsEnabled !== undefined) {
    const log: MutableLogging = {};
    if (auditEnabled !== undefined) {
      log.auditEnabled = auditEnabled;
      sources.push({
        name: ENV_VARS.LOGGING_AUDIT,
        rawValue: String(auditEnabled),
        parsedValue: auditEnabled,
        configPath: 'logging.auditEnabled',
      });
    }
    if (metricsEnabled !== undefined) {
      log.metricsEnabled = metricsEnabled;
      sources.push({
        name: ENV_VARS.LOGGING_METRICS,
        rawValue: String(metricsEnabled),
        parsedValue: metricsEnabled,
        configPath: 'logging.metricsEnabled',
      });
    }
    mutable.logging = log as ExplainConfig['logging'];
  }

  // Convert mutable builder to Partial<ExplainConfig> using a plain object
  // (Partial<ExplainConfig> preserves readonly, so we build with Record and cast)
  const result: Record<string, unknown> = {};

  if (mutable.defaultMode !== undefined) result.defaultMode = mutable.defaultMode;
  if (mutable.caching !== undefined) result.caching = mutable.caching;

  if (mutable.cacheOptions) {
    const opts: Record<string, unknown> = {};
    if (mutable.cacheOptions.maxSizeMb !== undefined)
      opts.maxSizeMb = mutable.cacheOptions.maxSizeMb;
    if (mutable.cacheOptions.defaultTtlMs !== undefined)
      opts.defaultTtlMs = mutable.cacheOptions.defaultTtlMs;
    if (mutable.cacheOptions.dbPath !== undefined) opts.dbPath = mutable.cacheOptions.dbPath;
    result.cacheOptions = opts as CacheOptions;
  }

  if (mutable.provider) {
    const prov: Record<string, unknown> = {};
    if (mutable.provider.active !== undefined) prov.active = mutable.provider.active;
    if (mutable.provider.fallback !== undefined) prov.fallback = mutable.provider.fallback;
    if (mutable.provider.timeoutMs !== undefined) prov.timeoutMs = mutable.provider.timeoutMs;
    if (mutable.provider.maxRetries !== undefined) prov.maxRetries = mutable.provider.maxRetries;
    result.provider = prov;
  }

  if (mutable.tokenBudget) {
    const budget: Record<string, unknown> = {};
    if (mutable.tokenBudget.maxContextTokens !== undefined)
      budget.maxContextTokens = mutable.tokenBudget.maxContextTokens;
    if (mutable.tokenBudget.maxOutputTokens !== undefined)
      budget.maxOutputTokens = mutable.tokenBudget.maxOutputTokens;
    if (mutable.tokenBudget.reservedForEvidence !== undefined)
      budget.reservedForEvidence = mutable.tokenBudget.reservedForEvidence;
    if (mutable.tokenBudget.reservedForRules !== undefined)
      budget.reservedForRules = mutable.tokenBudget.reservedForRules;
    result.tokenBudget = budget;
  }

  if (mutable.citationValidation) {
    const cit: Record<string, unknown> = {};
    if (mutable.citationValidation.enabled !== undefined)
      cit.enabled = mutable.citationValidation.enabled;
    if (mutable.citationValidation.strictMode !== undefined)
      cit.strictMode = mutable.citationValidation.strictMode;
    if (mutable.citationValidation.maxRetriesOnFailure !== undefined)
      cit.maxRetriesOnFailure = mutable.citationValidation.maxRetriesOnFailure;
    result.citationValidation = cit;
  }

  if (mutable.output) {
    const out: Record<string, unknown> = {};
    if (mutable.output.maxLength !== undefined) out.maxLength = mutable.output.maxLength;
    if (mutable.output.includeDisclaimer !== undefined)
      out.includeDisclaimer = mutable.output.includeDisclaimer;
    result.output = out;
  }

  if (mutable.logging) {
    const log: Record<string, unknown> = {};
    if (mutable.logging.auditEnabled !== undefined) log.auditEnabled = mutable.logging.auditEnabled;
    if (mutable.logging.metricsEnabled !== undefined)
      log.metricsEnabled = mutable.logging.metricsEnabled;
    result.logging = log;
  }

  const config = result as Partial<ExplainConfig>;

  return {
    config,
    sources: Object.freeze(sources),
    warnings: Object.freeze(warnings),
  };
}

/**
 * Check whether environment variable configuration is available.
 *
 * @returns True if VERIS_EXPLAIN_* env vars are present.
 */
export function hasEnvConfig(): boolean {
  return Object.values(ENV_VARS).some((envVar) => {
    try {
      return typeof process !== 'undefined' && process.env?.[envVar] !== undefined;
    } catch {
      return false;
    }
  });
}
