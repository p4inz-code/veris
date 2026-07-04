/**
 * DiagnosticsCollector implementation for @veris/extractors.
 *
 * Collects per-extractor diagnostics during an extraction run and
 * produces aggregate RegistryExtractionDiagnostics.
 *
 * @module @veris/extractors/diagnostics
 */

import type {
  DiagnosticsCollector,
  ExtractorRunDiagnostics,
  RegistryExtractionDiagnostics,
  ExtractionIssue,
} from './types.js';

/** Internal state for a single extractor's diagnostics. */
interface ExtractorState {
  skipped: boolean;
  skipReason: string | undefined;
  startTime: number | undefined;
  endTime: number | undefined;
  bytesProcessed: number;
  featuresEmitted: number;
  issues: ExtractionIssue[];
}

/**
 * Default implementation of DiagnosticsCollector.
 *
 * Created per extraction run. Collects diagnostic data from all
 * extractors and produces aggregate statistics.
 *
 * **Concurrency:** This implementation uses a plain `Map` and is
 * **single-thread only**. It relies on JavaScript's event-loop
 * model for safety (no shared-state concurrent access).
 * If worker-thread support is added in the future, access to
 * `_states` must be synchronized (e.g., via a `Mutex` or message
 * passing).
 */
export class DefaultDiagnosticsCollector implements DiagnosticsCollector {
  private readonly _states: Map<string, ExtractorState> = new Map();

  /** Get or create state for an extractor. */
  private _state(extractorId: string): ExtractorState {
    let state = this._states.get(extractorId);
    if (!state) {
      state = {
        skipped: false,
        skipReason: undefined,
        startTime: undefined,
        endTime: undefined,
        bytesProcessed: 0,
        featuresEmitted: 0,
        issues: [],
      };
      this._states.set(extractorId, state);
    }
    return state;
  }

  recordStart(extractorId: string, time: number): void {
    this._state(extractorId).startTime = time;
  }

  recordEnd(extractorId: string, time: number): void {
    this._state(extractorId).endTime = time;
  }

  recordBytesProcessed(extractorId: string, bytes: number): void {
    this._state(extractorId).bytesProcessed += bytes;
  }

  recordFeaturesEmitted(extractorId: string, count: number): void {
    this._state(extractorId).featuresEmitted += count;
  }

  recordIssue(extractorId: string, code: string, message: string, isError: boolean): void {
    this._state(extractorId).issues.push(Object.freeze({ extractorId, code, message, isError }));
  }

  recordSkipped(extractorId: string, reason: string): void {
    const state = this._state(extractorId);
    state.skipped = true;
    state.skipReason = reason;
  }

  getExtractorDiagnostics(extractorId: string): ExtractorRunDiagnostics | undefined {
    const state = this._states.get(extractorId);
    if (!state) return undefined;

    const now = state.endTime ?? state.startTime ?? Date.now();
    return Object.freeze({
      extractorId,
      skipped: state.skipped,
      skipReason: state.skipReason,
      startTime: state.startTime ?? now,
      endTime: state.endTime ?? now,
      durationMs: (state.endTime ?? now) - (state.startTime ?? now),
      bytesProcessed: state.bytesProcessed,
      featuresEmitted: state.featuresEmitted,
      issues: Object.freeze([...state.issues]),
    });
  }

  getAllDiagnostics(): readonly ExtractorRunDiagnostics[] {
    const result: ExtractorRunDiagnostics[] = [];
    for (const id of this._states.keys()) {
      const diag = this.getExtractorDiagnostics(id);
      if (diag) result.push(diag);
    }
    return Object.freeze(result);
  }

  buildRegistryDiagnostics(): RegistryExtractionDiagnostics {
    const allDiags = this.getAllDiagnostics();
    const allErrors: ExtractionIssue[] = [];
    const allWarnings: ExtractionIssue[] = [];
    const skippedExtractors: { id: string; reason: string }[] = [];
    let totalDurationMs = 0;
    let totalFeatures = 0;
    let totalBytes = 0;

    for (const diag of allDiags) {
      if (diag.skipped && diag.skipReason) {
        skippedExtractors.push({ id: diag.extractorId, reason: diag.skipReason });
      }
      for (const issue of diag.issues) {
        if (issue.isError) {
          allErrors.push(issue);
        } else {
          allWarnings.push(issue);
        }
      }
      totalDurationMs += diag.durationMs;
      totalFeatures += diag.featuresEmitted;
      totalBytes += diag.bytesProcessed;
    }

    const matchedExtractors = allDiags.filter((d) => !d.skipped).length;

    return Object.freeze({
      totalExtractors: this._states.size,
      matchedExtractors,
      skippedExtractors: Object.freeze(skippedExtractors),
      errors: Object.freeze(allErrors),
      warnings: Object.freeze(allWarnings),
      totalDurationMs,
      totalFeaturesEmitted: totalFeatures,
      totalBytesProcessed: totalBytes,
    });
  }

  /** Reset all collected diagnostics. */
  reset(): void {
    this._states.clear();
  }
}
