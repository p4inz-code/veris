/**
 * Rule diagnostics — diagnostics collection for rule evaluation.
 *
 * @module @veris/rules/rule-diagnostics
 */

import type { RuleEngineDiagnostics, RuleDiagnosticsEntry } from './types.js';

/**
 * Collect and aggregate rule evaluation diagnostics.
 */
export class RuleDiagnosticsCollector {
  private readonly _entries: RuleDiagnosticsEntry[] = [];
  private _startTime: number = 0;

  /**
   * Start tracking diagnostics.
   */
  start(): void {
    this._startTime = Date.now();
  }

  /**
   * Record a single rule evaluation result.
   */
  record(entry: RuleDiagnosticsEntry): void {
    this._entries.push(
      Object.freeze({
        ruleId: entry.ruleId,
        matched: entry.matched,
        durationMs: entry.durationMs,
        error: entry.error,
      }),
    );
  }

  /**
   * Record multiple rule evaluation results.
   */
  recordBatch(entries: readonly RuleDiagnosticsEntry[]): void {
    for (const entry of entries) {
      this.record(entry);
    }
  }

  /**
   * Build the aggregate diagnostics.
   */
  build(): RuleEngineDiagnostics {
    const totalRules = this._entries.length;
    const matchedRules = this._entries.filter((e) => e.matched).length;
    const failedRules = this._entries.filter((e) => e.error !== undefined).length;
    const totalDurationMs = Date.now() - this._startTime;

    return Object.freeze({
      totalRules,
      matchedRules,
      failedRules,
      totalDurationMs,
      perRule: Object.freeze([...this._entries]),
    });
  }

  /**
   * Reset the collector.
   */
  clear(): void {
    this._entries.length = 0;
    this._startTime = 0;
  }

  /**
   * Get the current number of entries.
   */
  get size(): number {
    return this._entries.length;
  }
}
