/**
 * DiagnosticsCollector implementation for @veris/analysis.
 *
 * @module @veris/analysis/diagnostics
 */

import type {
  DiagnosticsCollector,
  AnalyzerRunDiagnostics,
  RegistryAnalysisDiagnostics,
  AnalysisIssue,
} from './types.js';

/** Internal state for a single analyzer's diagnostics. */
interface AnalyzerState {
  skipped: boolean;
  skipReason: string | undefined;
  startTime: number | undefined;
  endTime: number | undefined;
  evidenceEmitted: number;
  issues: AnalysisIssue[];
}

/**
 * Default implementation of DiagnosticsCollector.
 *
 * **Concurrency:** This implementation uses a plain `Map` and is
 * **single-thread only**. It relies on JavaScript's event-loop
 * model for safety (no shared-state concurrent access).
 * If worker-thread support is added in the future, access to
 * `_states` must be synchronized (e.g., via a `Mutex` or message
 * passing).
 */
export class DefaultDiagnosticsCollector implements DiagnosticsCollector {
  private readonly _states: Map<string, AnalyzerState> = new Map();

  private _state(analyzerId: string): AnalyzerState {
    let state = this._states.get(analyzerId);
    if (!state) {
      state = {
        skipped: false,
        skipReason: undefined,
        startTime: undefined,
        endTime: undefined,
        evidenceEmitted: 0,
        issues: [],
      };
      this._states.set(analyzerId, state);
    }
    return state;
  }

  recordStart(analyzerId: string, time: number): void {
    this._state(analyzerId).startTime = time;
  }

  recordEnd(analyzerId: string, time: number): void {
    this._state(analyzerId).endTime = time;
  }

  recordEvidenceEmitted(analyzerId: string, count: number): void {
    this._state(analyzerId).evidenceEmitted += count;
  }

  recordIssue(analyzerId: string, code: string, message: string, isError: boolean): void {
    this._state(analyzerId).issues.push(Object.freeze({ analyzerId, code, message, isError }));
  }

  recordSkipped(analyzerId: string, reason: string): void {
    const state = this._state(analyzerId);
    state.skipped = true;
    state.skipReason = reason;
  }

  getAnalyzerDiagnostics(analyzerId: string): AnalyzerRunDiagnostics | undefined {
    const state = this._states.get(analyzerId);
    if (!state) return undefined;

    const now = state.endTime ?? state.startTime ?? Date.now();
    return Object.freeze({
      analyzerId,
      skipped: state.skipped,
      skipReason: state.skipReason,
      startTime: state.startTime ?? now,
      endTime: state.endTime ?? now,
      durationMs: (state.endTime ?? now) - (state.startTime ?? now),
      evidenceEmitted: state.evidenceEmitted,
      issues: Object.freeze([...state.issues]),
    });
  }

  getAllDiagnostics(): readonly AnalyzerRunDiagnostics[] {
    const result: AnalyzerRunDiagnostics[] = [];
    for (const id of this._states.keys()) {
      const diag = this.getAnalyzerDiagnostics(id);
      if (diag) result.push(diag);
    }
    return Object.freeze(result);
  }

  buildRegistryDiagnostics(): RegistryAnalysisDiagnostics {
    const allDiags = this.getAllDiagnostics();
    const allErrors: AnalysisIssue[] = [];
    const allWarnings: AnalysisIssue[] = [];
    const skippedAnalyzers: { id: string; reason: string }[] = [];
    let totalDurationMs = 0;
    let totalEvidence = 0;

    for (const diag of allDiags) {
      if (diag.skipped && diag.skipReason) {
        skippedAnalyzers.push({ id: diag.analyzerId, reason: diag.skipReason });
      }
      for (const issue of diag.issues) {
        if (issue.isError) {
          allErrors.push(issue);
        } else {
          allWarnings.push(issue);
        }
      }
      totalDurationMs += diag.durationMs;
      totalEvidence += diag.evidenceEmitted;
    }

    const matchedAnalyzers = allDiags.filter((d) => !d.skipped).length;

    return Object.freeze({
      totalAnalyzers: this._states.size,
      matchedAnalyzers,
      skippedAnalyzers: Object.freeze(skippedAnalyzers),
      errors: Object.freeze(allErrors),
      warnings: Object.freeze(allWarnings),
      totalDurationMs,
      totalEvidenceEmitted: totalEvidence,
    });
  }

  reset(): void {
    this._states.clear();
  }
}
