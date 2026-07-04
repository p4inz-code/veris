/**
 * Configuration types for the AI explanation layer.
 *
 * @module @veris/explain/types/config
 */

import type { ExplanationMode } from './explanation.js';

// ── Cache Options ──

/** Configuration options for the persistent cache. */
export interface CacheOptions {
  /** Maximum cache size in MB (default: 100). */
  readonly maxSizeMb?: number;
  /** Default TTL in milliseconds (default: 7 days). */
  readonly defaultTtlMs?: number;
  /** Path to the SQLite database file. */
  readonly dbPath?: string;
  /** Schema version for cache compatibility. */
  readonly schemaVersion?: number;
}

// ── ExplainConfig ──

/**
 * Full configuration for the AI explanation engine.
 *
 * Every field is read-only and validated at startup.
 */
export interface ExplainConfig {
  /** Default explanation mode. */
  readonly defaultMode: ExplanationMode;
  /** Whether to use caching. */
  readonly caching: boolean;
  /** Cache settings. */
  readonly cacheOptions?: CacheOptions;
  /** Provider settings. */
  readonly provider: {
    readonly active: string; // Provider ID
    readonly fallback?: string; // Fallback provider ID
    readonly timeoutMs: number;
    readonly maxRetries: number;
  };
  /** Token budget settings. */
  readonly tokenBudget: {
    readonly maxContextTokens: number;
    readonly maxOutputTokens: number;
    readonly reservedForEvidence: number;
    readonly reservedForRules: number;
  };
  /** Citation validation settings. */
  readonly citationValidation: {
    readonly enabled: boolean;
    readonly strictMode: boolean; // Fail on any invalid citation
    readonly maxRetriesOnFailure: number;
  };
  /** Output settings. */
  readonly output: {
    readonly maxLength: number;
    readonly includeDisclaimer: boolean;
  };
  /** Logging settings. */
  readonly logging: {
    readonly auditEnabled: boolean;
    readonly metricsEnabled: boolean;
  };
}

// ── ProviderConfig ──

/**
 * Configuration for a single AI provider.
 * Used internally for configuration loading.
 */
export interface ProviderConfigEntry {
  readonly enabled: boolean;
  readonly type: string;
  readonly apiKey?: string;
  readonly model: string;
  readonly endpoint?: string;
  readonly organization?: string | null;
  readonly keepAlive?: string;
}
