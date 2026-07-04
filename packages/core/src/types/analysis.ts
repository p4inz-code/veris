/**
 * Analysis session types for VERIS.
 *
 * A ScanSession represents a single invocation of the VERIS analyzer.
 *
 * @module @veris/core/types/analysis
 */

/** Session status — the final state of a scan. */
export type SessionStatus = 'completed' | 'partial' | 'failed' | 'cancelled';

/** Configuration snapshot for a scan session. */
export interface SessionConfig {
  /** Scan profile ID used (if any). */
  readonly profile?: string;
  /** Scan target path. */
  readonly target?: string;
  /** Enabled rule packs. */
  readonly enabledPacks?: string[];
  /** Disabled rule packs. */
  readonly disabledPacks?: string[];
  /** Minimum severity threshold for reporting. */
  readonly severityThreshold?: string;
  /** Maximum number of findings before stopping. */
  readonly maxFindings?: number;
}

/** Environment information for the scan session. */
export interface EnvironmentInfo {
  /** Operating system (e.g., "linux", "darwin", "win32"). */
  readonly os: string;
  /** Platform architecture (e.g., "x64", "arm64"). */
  readonly arch: string;
  /** Node.js runtime version. */
  readonly runtimeVersion: string;
  /** VERIS engine version. */
  readonly engineVersion: string;
}

/** Non-fatal error encountered during scan. */
export interface SessionError {
  /** Error code (e.g., "EXTRACTOR_FAILURE", "PARSER_TIMEOUT"). */
  readonly code: string;
  /** Human-readable error message. */
  readonly message: string;
  /** Optional artifact ID associated with the error. */
  readonly artifactId?: string;
  /** Optional stack trace (debugging only, not user-facing). */
  readonly stack?: string;
}

/**
 * ScanSession — represents a single invocation of the VERIS analyzer.
 * Immutable after completion.
 */
export interface ScanSession {
  /** Globally unique session identifier (UUID). */
  readonly id: string;
  /** Data model schema version (semver). */
  readonly schemaVersion: string;
  /** VERIS engine version that produced this session. */
  readonly engineVersion: string;
  /** Start timestamp (ISO 8601). */
  readonly startedAt: string;
  /** Completion timestamp (ISO 8601). */
  readonly completedAt: string;
  /** Duration in milliseconds (completedAt - startedAt). */
  readonly durationMs: number;
  /** Snapshot of scan configuration. */
  readonly config: SessionConfig;
  /** OS, platform, runtime metadata. */
  readonly environment: EnvironmentInfo;
  /** Total artifacts processed. */
  readonly artifactCount: number;
  /** Total findings generated. */
  readonly findingCount: number;
  /** Session completion status. */
  readonly status: SessionStatus;
  /** Non-fatal errors encountered during scan. */
  readonly errors?: SessionError[];
  /** User-defined tags for categorization. */
  readonly tags?: Record<string, string>;
}

/** Scan session error codes. */
export const SessionErrorCodes = {
  EXTRACTOR_FAILURE: 'EXTRACTOR_FAILURE',
  PARSER_TIMEOUT: 'PARSER_TIMEOUT',
  MEMORY_LIMIT_EXCEEDED: 'MEMORY_LIMIT_EXCEEDED',
  CANCELLED: 'CANCELLED',
  UNKNOWN: 'UNKNOWN',
} as const;
