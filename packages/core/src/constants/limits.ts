/**
 * System limits and thresholds for VERIS.
 *
 * These are the default limits used throughout the platform.
 * Most limits are configurable via the configuration system.
 *
 * @module @veris/core/constants/limits
 */

/** Maximum file size for extraction (default: 100 MB). */
export const MAX_FILE_SIZE = 100 * 1024 * 1024;

/** Maximum number of files to process in a single scan. */
export const MAX_FILES_PER_SCAN = 100_000;

/** Maximum lines in a text file before extraction is skipped. */
export const MAX_LINES = 1_000_000;

/** Maximum nesting depth for archive extraction. */
export const MAX_ARCHIVE_DEPTH = 10;

/** Maximum directory traversal depth. */
export const MAX_DIR_DEPTH = 50;

/** Maximum symlink resolution depth. */
export const MAX_SYMLINK_DEPTH = 40;

/** Maximum entries in a single archive. */
export const MAX_ARCHIVE_ENTRIES = 10_000;

/** Maximum compression ratio before zip bomb detection (100:1). */
export const MAX_COMPRESSION_RATIO = 100;

/** Maximum total decompressed bytes from archives. */
export const MAX_TOTAL_DECOMPRESSED_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

/** Maximum per-file extraction timeout (ms). */
export const DEFAULT_PARSER_TIMEOUT_MS = 5000;

/** Maximum per-rule execution time (ms). */
export const DEFAULT_RULE_TIMEOUT_MS = 100;

/** Maximum per-request plugin execution time (ms). */
export const DEFAULT_PLUGIN_TIMEOUT_MS = 30_000;

/** Maximum plugin memory (MB). */
export const MAX_PLUGIN_MEMORY_MB = 128;

/** Maximum per-plugin crash count before quarantine. */
export const MAX_PLUGIN_CRASHES = 3;

/** Plugin crash quarantine window (ms). */
export const PLUGIN_QUARANTINE_WINDOW_MS = 60_000;

/** Minimum confidence threshold [0.0, 1.0]. */
export const MIN_CONFIDENCE = 0.0;

/** Maximum confidence threshold [0.0, 1.0]. */
export const MAX_CONFIDENCE = 1.0;

/** Minimum risk score [0.0, 10.0]. */
export const MIN_RISK_SCORE = 0.0;

/** Maximum risk score [0.0, 10.0]. */
export const MAX_RISK_SCORE = 10.0;

/** Minimum trust score [0.0, 1.0]. */
export const MIN_TRUST_SCORE = 0.0;

/** Maximum trust score [0.0, 1.0]. */
export const MAX_TRUST_SCORE = 1.0;

/** Minimum severity score [0.0, 10.0]. */
export const MIN_SEVERITY_SCORE = 0.0;

/** Maximum severity score [0.0, 10.0]. */
export const MAX_SEVERITY_SCORE = 10.0;

/** Maximum number of findings in a single scan. */
export const MAX_FINDINGS = 100_000;

/** Maximum number of recommendations. */
export const MAX_RECOMMENDATIONS = 1_000;

/** Default cache size limits. */
export const CACHE_SIZES = {
  CLASSIFICATION: 100_000,
  AST: 1_000,
  FEATURE: 10_000,
  BEHAVIOR: 100_000,
  RULE_RESULT: 500_000,
  REGEX: 10_000,
  FILE_CONTENT: 500,
} as const;

/** Worker pool configuration defaults. */
export const WORKER_POOL = {
  MIN_WORKERS: 2,
  MAX_WORKERS: 8,
  IDLE_TIMEOUT_MS: 30_000,
  QUEUE_MULTIPLIER: 10,
} as const;

/** TUI rendering limits. */
export const TUI_LIMITS = {
  MAX_VISIBLE_FINDINGS: 1_000,
  MAX_VISIBLE_ARTIFACTS: 500,
  CONTEXT_SNIPPET_LENGTH: 100,
  PROGRESS_UPDATE_INTERVAL_MS: 200,
} as const;
