/**
 * Core types for @veris/analysis.
 *
 * Defines the Evidence model, AnalysisContext, and diagnostics types
 * used throughout the analysis pipeline.
 *
 * Evidence ONLY — never findings, risk, severity, or scores.
 *
 * @module @veris/analysis/types
 */

import type { Artifact, SourceLocation } from '@veris/core';
import type { Logger } from '@veris/logger';
import type { CancellationToken } from '@veris/shared';

// ── Evidence ──

/**
 * Evidence category — the high-level classification of an evidence item.
 * Open enum — new categories can be added without breaking existing code.
 */
export type EvidenceCategory =
  | 'executable'
  | 'network'
  | 'persistence'
  | 'obfuscation'
  | 'certificate'
  | 'document'
  | 'archive'
  | 'script'
  | 'container'
  | 'dependency'
  | 'configuration'
  | 'behavior'
  | 'relationship'
  | 'metadata'
  | 'anomaly';

/**
 * A single piece of Evidence produced by an Analyzer.
 *
 * Evidence is the atomic output of the analysis layer. It represents
 * a discrete observation about an artifact that explains WHY a
 * particular fact is true, with supporting feature references and
 * source locations.
 *
 * Evidence is NOT:
 * - A finding (no severity, no rule match)
 * - A risk assessment
 * - A score
 * - AI reasoning
 */
export interface Evidence {
  /** Deterministic evidence ID (prefix: "ev_"). */
  readonly id: string;
  /** The artifact this evidence relates to. */
  readonly artifactId: string;
  /** Feature IDs that produced this evidence. */
  readonly featureIds: readonly string[];
  /** High-level evidence category. */
  readonly category: EvidenceCategory;
  /** Specific evidence type (e.g., "pe-import", "high-entropy", "expired-certificate"). */
  readonly type: string;
  /** Confidence score [0.0, 1.0]. */
  readonly confidence: number;
  /** Source locations in the artifact that support this evidence. */
  readonly locations: readonly SourceLocation[];
  /** Human-readable explanation of WHY this evidence exists. */
  readonly explanation: string;
  /** Machine-readable metadata for programmatic consumption. */
  readonly metadata: Readonly<Record<string, unknown>>;
  /** The analyzer that produced this evidence. */
  readonly analyzerId: string;
}

// ── Analysis Context ──

/**
 * Immutable context passed to every analyzer during analysis.
 */
export interface AnalysisContext {
  /** The artifact to analyze. */
  readonly artifact: Artifact;
  /** The owning session ID. */
  readonly sessionId: string;
  /** Raw artifact content buffer (null if unavailable). */
  readonly content: Buffer | null;
  /** Available features for this artifact (from Knowledge Engine). */
  readonly features: readonly import('./types-client.js').FeatureReference[];
  /** Cancellation token for cooperative cancellation. */
  readonly cancellationToken?: CancellationToken;
  /** Logger instance for the analysis session. */
  readonly logger?: Logger;
  /** Analyzer configuration. */
  readonly config?: Record<string, unknown>;
}

// ── Analyzer Interface ──

/**
 * Plugin-based analyzer contract.
 *
 * Every analyzer implements this interface. Analyzers are stateless,
 * deterministic, and MUST NOT produce side effects beyond returning evidence.
 *
 * Analyzers ONLY produce evidence — they NEVER:
 * - Assign severity
 * - Create findings
 * - Perform rule matching
 * - Score or rank
 */
export interface Analyzer {
  /** Unique analyzer identifier (e.g., "pe-analyzer", "entropy-analyzer"). */
  readonly id: string;
  /** Human-readable analyzer name. */
  readonly name: string;
  /** Semver version string. */
  readonly version: string;
  /** Artifact types this analyzer can process. */
  readonly supportedArtifactTypes: readonly string[];
  /**
   * Execution priority (lower = runs first).
   * Range: 0 (highest priority) to 1000 (lowest priority).
   * Default: 500.
   */
  readonly priority: number;

  /**
   * Check whether this analyzer can process the given context.
   * Called before analyze() to quickly filter non-applicable analyzers.
   * MUST be synchronous and fast (no I/O).
   */
  canAnalyze(context: AnalysisContext): boolean;

  /**
   * Analyze the artifact and produce evidence.
   * MUST be deterministic: same input → same output.
   * MUST NOT produce side effects.
   */
  analyze(context: AnalysisContext): Promise<AnalysisResult>;
}

// ── Analysis Result ──

/** The result of a single analyzer's analysis. */
export interface AnalysisResult {
  /** The evidence produced. */
  readonly evidence: readonly Evidence[];
  /** Per-analyzer diagnostics. */
  readonly diagnostics: AnalyzerRunDiagnostics;
}

// ── Diagnostics Types ──

/** A single analysis error or warning. */
export interface AnalysisIssue {
  /** Error or warning code (e.g., "PARSE_ERROR", "TIMEOUT"). */
  readonly code: string;
  /** Human-readable message. */
  readonly message: string;
  /** The analyzer that produced this issue. */
  readonly analyzerId: string;
  /** Whether this is an error (true) or warning (false). */
  readonly isError: boolean;
}

/** Per-analyzer run diagnostics. */
export interface AnalyzerRunDiagnostics {
  /** The analyzer ID. */
  readonly analyzerId: string;
  /** Whether the analyzer was skipped. */
  readonly skipped: boolean;
  /** Reason for skipping, if applicable. */
  readonly skipReason?: string;
  /** Unix timestamp when analysis started (ms). */
  readonly startTime: number;
  /** Unix timestamp when analysis ended (ms). */
  readonly endTime: number;
  /** Duration in milliseconds. */
  readonly durationMs: number;
  /** Number of evidence items produced. */
  readonly evidenceEmitted: number;
  /** Errors and warnings encountered. */
  readonly issues: readonly AnalysisIssue[];
}

/** Aggregate diagnostics for a registry-level analysis run. */
export interface RegistryAnalysisDiagnostics {
  /** Total analyzers registered. */
  readonly totalAnalyzers: number;
  /** Analyzers that matched and ran. */
  readonly matchedAnalyzers: number;
  /** Analyzers that were skipped. */
  readonly skippedAnalyzers: readonly { id: string; reason: string }[];
  /** All errors across all analyzers. */
  readonly errors: readonly AnalysisIssue[];
  /** All warnings across all analyzers. */
  readonly warnings: readonly AnalysisIssue[];
  /** Total duration in milliseconds. */
  readonly totalDurationMs: number;
  /** Total evidence emitted across all analyzers. */
  readonly totalEvidenceEmitted: number;
}

// ── Diagnostics Collector ──

/**
 * Mutable diagnostics collector passed to analyzers.
 */
export interface DiagnosticsCollector {
  /** Record that an analyzer has started. */
  recordStart(analyzerId: string, time: number): void;
  /** Record that an analyzer has ended. */
  recordEnd(analyzerId: string, time: number): void;
  /** Record evidence emitted by an analyzer. */
  recordEvidenceEmitted(analyzerId: string, count: number): void;
  /** Record an issue (error or warning) from an analyzer. */
  recordIssue(analyzerId: string, code: string, message: string, isError: boolean): void;
  /** Mark an analyzer as skipped. */
  recordSkipped(analyzerId: string, reason: string): void;
  /** Get the run diagnostics for a specific analyzer. */
  getAnalyzerDiagnostics(analyzerId: string): AnalyzerRunDiagnostics | undefined;
  /** Get all analyzer run diagnostics. */
  getAllDiagnostics(): readonly AnalyzerRunDiagnostics[];
  /** Build the aggregate diagnostics. */
  buildRegistryDiagnostics(): RegistryAnalysisDiagnostics;
}

// ── Analysis Options ──

/** Options for the analyzer registry when running analysis. */
export interface AnalysisOptions {
  /** Timeout in milliseconds per analyzer (default: 10000). */
  readonly timeoutMs?: number;
  /** Whether to run analyzers sequentially (default: false = parallel). */
  readonly sequential?: boolean;
  /** Abort signal for cooperative cancellation. */
  readonly signal?: AbortSignal;
  /** Maximum concurrent analyzers (default: number of CPUs). */
  readonly maxConcurrency?: number;
}

// ── Error Types ──

/** Error thrown by the analysis framework. */
export class AnalysisError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'ANALYSIS_ERROR',
    public readonly analyzerId?: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'AnalysisError';
  }
}

// ── Factory Helpers ──

/** Create an immutable Evidence item. */
export function createEvidence(params: {
  id: string;
  artifactId: string;
  featureIds?: readonly string[];
  category: EvidenceCategory;
  type: string;
  confidence: number;
  locations?: readonly SourceLocation[];
  explanation: string;
  metadata?: Record<string, unknown>;
  analyzerId: string;
}): Evidence {
  return Object.freeze({
    id: params.id,
    artifactId: params.artifactId,
    featureIds: params.featureIds ? Object.freeze([...params.featureIds]) : Object.freeze([]),
    category: params.category,
    type: params.type,
    confidence: params.confidence,
    locations: params.locations ? Object.freeze([...params.locations]) : Object.freeze([]),
    explanation: params.explanation,
    metadata: params.metadata ? Object.freeze({ ...params.metadata }) : Object.freeze({}),
    analyzerId: params.analyzerId,
  });
}

/** Create skipped analyzer diagnostics. */
export function createSkippedDiagnostics(
  analyzerId: string,
  reason: string,
): AnalyzerRunDiagnostics {
  const now = Date.now();
  return Object.freeze({
    analyzerId,
    skipped: true,
    skipReason: reason,
    startTime: now,
    endTime: now,
    durationMs: 0,
    evidenceEmitted: 0,
    issues: Object.freeze([]),
  });
}

/** Create an immutable AnalysisIssue. */
export function createAnalysisIssue(
  analyzerId: string,
  code: string,
  message: string,
  isError: boolean,
): AnalysisIssue {
  return Object.freeze({ analyzerId, code, message, isError });
}

/** Create an empty issues array. */
export function noIssues(): readonly AnalysisIssue[] {
  return Object.freeze([]);
}
