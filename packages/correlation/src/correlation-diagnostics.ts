/**
 * Correlation diagnostics — diagnostics collection for correlation evaluation.
 *
 * @module @veris/correlation/correlation-diagnostics
 */

import type { CorrelationEngineDiagnostics, CorrelationDiagnosticsEntry } from './types.js';

/**
 * Collect and aggregate correlation evaluation diagnostics.
 */
export class CorrelationDiagnosticsCollector {
  private readonly _entries: CorrelationDiagnosticsEntry[] = [];
  private _startTime: number = 0;

  start(): void {
    this._startTime = Date.now();
  }

  record(entry: CorrelationDiagnosticsEntry): void {
    this._entries.push(
      Object.freeze({
        patternId: entry.patternId,
        matched: entry.matched,
        durationMs: entry.durationMs,
        error: entry.error,
      }),
    );
  }

  recordBatch(entries: readonly CorrelationDiagnosticsEntry[]): void {
    for (const entry of entries) {
      this.record(entry);
    }
  }

  build(): CorrelationEngineDiagnostics {
    const totalPatterns = this._entries.length;
    const matchedPatterns = this._entries.filter((e) => e.matched).length;
    const failedPatterns = this._entries.filter((e) => e.error !== undefined).length;
    const totalDurationMs = Date.now() - this._startTime;

    return Object.freeze({
      totalPatterns,
      matchedPatterns,
      failedPatterns,
      totalDurationMs,
      perPattern: Object.freeze([...this._entries]),
    });
  }

  clear(): void {
    this._entries.length = 0;
    this._startTime = 0;
  }

  get size(): number {
    return this._entries.length;
  }
}
