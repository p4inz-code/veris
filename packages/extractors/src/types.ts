/**
 * Core types for @veris/extractors.
 *
 * Defines the extractor plugin contract, raw feature output, extraction context,
 * and diagnostics types used throughout the extraction framework.
 *
 * @module @veris/extractors/types
 */

import type { ExtractorConfig } from '@veris/config';
import type { Artifact, ArtifactType, SourceLocation } from '@veris/core';
import type { Logger } from '@veris/logger';
import type { CancellationToken } from '@veris/shared';

// ── RawFeature ──

/**
 * A raw, unnormalized feature extracted from an artifact by an extractor.
 *
 * RawFeatures are the atomic output of the extraction layer. They are NOT:
 * - Normalized (no canonical types)
 * - Deduplicated
 * - Assigned IDs
 * - Findings or evidence
 * - Scored for severity or risk
 *
 * Normalization and deduplication happen in the Knowledge Engine layer.
 */
export interface RawFeature {
  /** The extractor that produced this feature. */
  readonly extractorId: string;
  /** Extractor-specific type string (e.g., "pe-import", "string-literal", "sha256-hash"). */
  readonly type: string;
  /** The extracted value. Type depends on the feature type. */
  readonly value: unknown;
  /** Extractor's confidence in this feature [0.0, 1.0]. */
  readonly confidence: number;
  /** Source location in the artifact, if applicable. */
  readonly location?: SourceLocation;
  /** Extractor-specific metadata. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ── Extraction Context ──

/**
 * Immutable context passed to every extractor during extraction.
 * Provides access to the artifact being processed, session information,
 * cancellation support, logging, configuration, and diagnostics collection.
 */
export interface ExtractionContext {
  /** The artifact to extract features from. */
  readonly artifact: Artifact;
  /** The owning session ID. */
  readonly sessionId: string;
  /** Raw artifact content buffer (null if unavailable). */
  readonly content: Buffer | null;
  /** Cancellation token for cooperative cancellation. */
  readonly cancellationToken?: CancellationToken;
  /** Logger instance for the extraction session. */
  readonly logger?: Logger;
  /** Extractor configuration. */
  readonly config?: ExtractorConfig;
  /** Diagnostics collector for reporting extraction metrics. */
  readonly diagnostics?: DiagnosticsCollector;
}

// ── Extractor Interface ──

/**
 * Plugin-based extractor contract.
 *
 * Every extractor implements this interface. Extractors are stateless,
 * deterministic, and MUST NOT produce side effects beyond returning features.
 *
 * @example
 * ```typescript
 * class MyExtractor implements Extractor {
 *   readonly id = "my-extractor";
 *   readonly name = "My Extractor";
 *   readonly version = "0.1.0";
 *   readonly supportedArtifactTypes = ["file", "binary-blob"];
 *   readonly priority = 100;
 *
 *   canExtract(context: ExtractionContext): boolean {
 *     return context.artifact.size > 0;
 *   }
 *
 *   async extract(context: ExtractionContext): Promise<ExtractionResult> {
 *     const features: RawFeature[] = [];
 *     // ... extraction logic
 *     return { features, diagnostics: createEmptyDiagnostics(this.id) };
 *   }
 * }
 * ```
 */
export interface Extractor {
  /** Unique extractor identifier (e.g., "pe-extractor", "string-extractor"). */
  readonly id: string;
  /** Human-readable extractor name. */
  readonly name: string;
  /** Semver version string. */
  readonly version: string;
  /** Artifact types this extractor can process. */
  readonly supportedArtifactTypes: readonly ArtifactType[];
  /**
   * Execution priority (lower = runs first).
   * Range: 0 (highest priority) to 1000 (lowest priority).
   * Default: 500.
   */
  readonly priority: number;

  /**
   * Check whether this extractor can process the given context.
   * Called before extract() to quickly filter non-applicable extractors.
   * MUST be synchronous and fast (no I/O).
   */
  canExtract(context: ExtractionContext): boolean;

  /**
   * Extract features from the artifact.
   * MUST be deterministic: same input → same output.
   * MUST NOT produce side effects.
   */
  extract(context: ExtractionContext): Promise<ExtractionResult>;
}

// ── Extraction Result ──

/** The result of a single extractor's extraction. */
export interface ExtractionResult {
  /** The features extracted. */
  readonly features: readonly RawFeature[];
  /** Per-extractor diagnostics. */
  readonly diagnostics: ExtractorRunDiagnostics;
}

// ── Diagnostics Types ──

/** A single extraction error or warning. */
export interface ExtractionIssue {
  /** Error or warning code (e.g., "PARSE_ERROR", "TIMEOUT"). */
  readonly code: string;
  /** Human-readable message. */
  readonly message: string;
  /** The extractor that produced this issue. */
  readonly extractorId: string;
  /** Whether this is an error (true) or warning (false). */
  readonly isError: boolean;
}

/** Per-extractor run diagnostics. */
export interface ExtractorRunDiagnostics {
  /** The extractor ID. */
  readonly extractorId: string;
  /** Whether the extractor was skipped. */
  readonly skipped: boolean;
  /** Reason for skipping, if applicable. */
  readonly skipReason?: string;
  /** Unix timestamp when extraction started (ms). */
  readonly startTime: number;
  /** Unix timestamp when extraction ended (ms). */
  readonly endTime: number;
  /** Duration in milliseconds. */
  readonly durationMs: number;
  /** Number of bytes processed. */
  readonly bytesProcessed: number;
  /** Number of features emitted. */
  readonly featuresEmitted: number;
  /** Errors and warnings encountered. */
  readonly issues: readonly ExtractionIssue[];
}

/** Aggregate diagnostics for a registry-level extraction run. */
export interface RegistryExtractionDiagnostics {
  /** Total extractors registered. */
  readonly totalExtractors: number;
  /** Extractors that matched and ran. */
  readonly matchedExtractors: number;
  /** Extractors that were skipped. */
  readonly skippedExtractors: readonly { id: string; reason: string }[];
  /** All errors across all extractors. */
  readonly errors: readonly ExtractionIssue[];
  /** All warnings across all extractors. */
  readonly warnings: readonly ExtractionIssue[];
  /** Total duration in milliseconds. */
  readonly totalDurationMs: number;
  /** Total features emitted across all extractors. */
  readonly totalFeaturesEmitted: number;
  /** Total bytes processed across all extractors. */
  readonly totalBytesProcessed: number;
}

// ── Diagnostics Collector ──

/**
 * Mutable diagnostics collector passed to extractors.
 * Extractors report timing, issues, and metrics through this interface.
 */
export interface DiagnosticsCollector {
  /** Record that an extractor has started. */
  recordStart(extractorId: string, time: number): void;
  /** Record that an extractor has ended. */
  recordEnd(extractorId: string, time: number): void;
  /** Record bytes processed by an extractor. */
  recordBytesProcessed(extractorId: string, bytes: number): void;
  /** Record features emitted by an extractor. */
  recordFeaturesEmitted(extractorId: string, count: number): void;
  /** Record an issue (error or warning) from an extractor. */
  recordIssue(extractorId: string, code: string, message: string, isError: boolean): void;
  /** Mark an extractor as skipped. */
  recordSkipped(extractorId: string, reason: string): void;
  /** Get the run diagnostics for a specific extractor. */
  getExtractorDiagnostics(extractorId: string): ExtractorRunDiagnostics | undefined;
  /** Get all extractor run diagnostics. */
  getAllDiagnostics(): readonly ExtractorRunDiagnostics[];
  /** Build the aggregate diagnostics. */
  buildRegistryDiagnostics(): RegistryExtractionDiagnostics;
}

// ── Extraction Options ──

/** Options for the extractor registry when running extraction. */
export interface ExtractionOptions {
  /** Timeout in milliseconds per extractor (default: 5000). */
  readonly timeoutMs?: number;
  /** Whether to run extractors sequentially (default: false = parallel). */
  readonly sequential?: boolean;
  /** Abort signal for cooperative cancellation. */
  readonly signal?: AbortSignal;
  /** Maximum concurrent extractors (default: number of CPUs). */
  readonly maxConcurrency?: number;
}

// ── Error Types ──

/** Error thrown by the extraction framework. */
export class ExtractionError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'EXTRACTION_ERROR',
    public readonly extractorId?: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}

// ── Factory Helpers ──

/** Create an empty ExtractorRunDiagnostics for a skipped extractor. */
export function createSkippedDiagnostics(
  extractorId: string,
  reason: string,
): ExtractorRunDiagnostics {
  const now = Date.now();
  return Object.freeze({
    extractorId,
    skipped: true,
    skipReason: reason,
    startTime: now,
    endTime: now,
    durationMs: 0,
    bytesProcessed: 0,
    featuresEmitted: 0,
    issues: Object.freeze([]),
  });
}

/** Create a RawFeature with the given parameters. */
export function createRawFeature(params: {
  extractorId: string;
  type: string;
  value: unknown;
  confidence?: number;
  location?: SourceLocation;
  metadata?: Record<string, unknown>;
}): RawFeature {
  return Object.freeze({
    extractorId: params.extractorId,
    type: params.type,
    value: params.value,
    confidence: params.confidence ?? 1.0,
    location: params.location,
    metadata: params.metadata ? Object.freeze({ ...params.metadata }) : undefined,
  });
}

/** Create an immutable ExtractionIssue. */
export function createExtractionIssue(
  extractorId: string,
  code: string,
  message: string,
  isError: boolean,
): ExtractionIssue {
  return Object.freeze({ extractorId, code, message, isError });
}

/** Create an empty Issues array. */
export function noIssues(): readonly ExtractionIssue[] {
  return Object.freeze([]);
}
