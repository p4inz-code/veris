/**
 * PipelineDiagnostics — comprehensive diagnostics for the analysis pipeline.
 *
 * Tracks per-analyzer:
 * - Runtime (ms)
 * - Evidence produced count
 * - Skipped reason (if applicable)
 * - Failure reason (if applicable)
 * - Warnings
 *
 * @module @veris/analysis/pipeline/diagnostics
 */

import type { AnalysisIssue } from '../types.js';

/** Per-analyzer diagnostic entry. */
export interface AnalyzerDiagnosticEntry {
  /** Analyzer ID. */
  readonly analyzerId: string;
  /** Analyzer version. */
  readonly analyzerVersion: string;
  /** Runtime in milliseconds. */
  readonly runtimeMs: number;
  /** Number of evidence items produced. */
  readonly evidenceCount: number;
  /** Whether the analyzer was skipped. */
  readonly skipped: boolean;
  /** Reason for skipping (if applicable). */
  readonly skipReason?: string;
  /** Whether the analyzer failed. */
  readonly failed: boolean;
  /** Failure reason (if applicable). */
  readonly failureReason?: string;
  /** Warnings produced by this analyzer. */
  readonly warnings: readonly string[];
  /** Errors produced by this analyzer. */
  readonly errors: readonly string[];
}

/** Complete pipeline diagnostics. */
export interface PipelineDiagnosticsResult {
  /** Per-analyzer diagnostics. */
  readonly analyzers: readonly AnalyzerDiagnosticEntry[];
  /** Total analyzers registered. */
  readonly totalAnalyzers: number;
  /** Analyzers that matched and ran. */
  readonly matchedAnalyzers: number;
  /** Analyzers that were skipped. */
  readonly skippedAnalyzers: number;
  /** Analyzers that failed. */
  readonly failedAnalyzers: number;
  /** Total evidence produced. */
  readonly totalEvidence: number;
  /** Total runtime in milliseconds. */
  readonly totalRuntimeMs: number;
  /** Per-stage runtime in milliseconds. */
  readonly stageRuntimes: Readonly<Record<string, number>>;
}

/**
 * Collects and builds pipeline diagnostics.
 */
export class PipelineDiagnosticsCollector {
  private readonly _analyzers: Map<string, AnalyzerDiagnosticEntry> = new Map();
  private readonly _stageRuntimes: Map<string, number> = new Map();
  private _totalRuntimeMs: number = 0;

  /** Record an analyzer run result. */
  recordAnalyzer(params: {
    analyzerId: string;
    analyzerVersion: string;
    runtimeMs: number;
    evidenceCount: number;
    skipped?: boolean;
    skipReason?: string;
    failed?: boolean;
    failureReason?: string;
    warnings?: readonly string[];
    errors?: readonly string[];
  }): void {
    this._analyzers.set(
      params.analyzerId,
      Object.freeze({
        analyzerId: params.analyzerId,
        analyzerVersion: params.analyzerVersion,
        runtimeMs: params.runtimeMs,
        evidenceCount: params.evidenceCount,
        skipped: params.skipped ?? false,
        skipReason: params.skipReason,
        failed: params.failed ?? false,
        failureReason: params.failureReason,
        warnings: Object.freeze([...(params.warnings ?? [])]),
        errors: Object.freeze([...(params.errors ?? [])]),
      }),
    );
  }

  /** Record a stage runtime. */
  recordStage(stageId: string, runtimeMs: number): void {
    this._stageRuntimes.set(stageId, runtimeMs);
  }

  /** Set total pipeline runtime. */
  setTotalRuntime(runtimeMs: number): void {
    this._totalRuntimeMs = runtimeMs;
  }

  /** Build the final diagnostics result. */
  build(): PipelineDiagnosticsResult {
    const entries = Array.from(this._analyzers.values());
    const matched = entries.filter((e) => !e.skipped && !e.failed).length;
    const skipped = entries.filter((e) => e.skipped).length;
    const failed = entries.filter((e) => e.failed).length;
    const totalEvidence = entries.reduce((sum, e) => sum + e.evidenceCount, 0);

    return Object.freeze({
      analyzers: Object.freeze(entries),
      totalAnalyzers: entries.length,
      matchedAnalyzers: matched,
      skippedAnalyzers: skipped,
      failedAnalyzers: failed,
      totalEvidence,
      totalRuntimeMs: this._totalRuntimeMs,
      stageRuntimes: Object.freeze(Object.fromEntries(this._stageRuntimes)),
    });
  }

  /** Reset all diagnostics. */
  reset(): void {
    this._analyzers.clear();
    this._stageRuntimes.clear();
    this._totalRuntimeMs = 0;
  }

  /** Get a specific analyzer's diagnostics. */
  getAnalyzer(analyzerId: string): AnalyzerDiagnosticEntry | undefined {
    return this._analyzers.get(analyzerId);
  }
}
