/**
 * @veris/risk/diagnostics — Deterministic diagnostics for RiskEngine evaluation.
 *
 * ## Ownership Boundaries
 *
 * This module provides diagnostics for debugging, profiling, and validation
 * purposes only. Diagnostics are fully isolated from the engine's core logic:
 *
 * - They NEVER affect scoring, verdicts, confidence, or explainability.
 * - They NEVER modify the RiskAssessment.
 * - They are purely observational — they observe and record, never influence.
 * - The collector is optional; when disabled, overhead is negligible.
 *
 * ## Lifecycle
 *
 * 1. **Creation** — `RiskDiagnosticsCollector.createDiagnostics()` creates a new
 *    collector and records the creation timestamp.
 * 2. **Recording** — During evaluation, `recordStage()` records stage timings.
 *    Counters are set via dedicated setter methods.
 * 3. **Finalization** — `finalizeDiagnostics()` freezes the diagnostics data
 *    and returns an immutable `RiskEngineDiagnostics` object.
 * 4. **Consumption** — The finalized diagnostics are safe for serialization,
 *    inspection, and debugging. They are never part of the RiskAssessment.
 *
 * ## Why Diagnostics Never Influence Results
 *
 * - The collector is passed into the engine explicitly via `RiskEngineOptions`.
 * - If no collector is provided, the engine performs no diagnostic work.
 * - All collector methods are void-returning and cannot affect the pipeline.
 * - The collector stores data in private fields; the engine cannot read them.
 * - Finalization happens outside the engine's `evaluate()` method.
 * - No engine code path branches on diagnostic values.
 *
 * @module @veris/risk/diagnostics
 */

import { ENGINE_VERSION, SCHEMA_VERSION } from './constants.js';
import { round2 } from './scoring.js';
import type { RiskDiagnosticsWriter } from './types.js';

// ── Types ──

/**
 * A single stage timing record.
 *
 * Each stage is recorded with its name and the wall-clock duration since
 * the previous stage (or since collector creation for the first stage).
 */
export interface StageTiming {
  /** Stage name (e.g., "validate", "build-contributions"). */
  readonly name: string;
  /** Duration in milliseconds, rounded to 2 decimal places. */
  readonly durationMs: number;
}

/**
 * Information about contribution truncation during evaluation.
 *
 * Present when truncation was configured and evaluated.
 */
export interface TruncationInfo {
  /** Whether contributions were actually truncated. */
  readonly truncated: boolean;
  /** Number of contributions before truncation. */
  readonly originalCount: number;
  /** Number of contributions after truncation. */
  readonly finalCount: number;
}

/**
 * Immutable diagnostics for a single RiskEngine evaluation.
 *
 * ## Fields
 *
 * - `evaluationDurationMs` — Total wall-clock time of the evaluate() call.
 * - `contributionCount` — Number of contributions built from input.
 * - `dimensionCount` — Number of populated dimensions (0-3).
 * - `evidenceCount` — Number of unique evidence IDs referenced.
 * - `skippedContributions` — Contributions skipped during building.
 * - `validationFailures` — Input validation failures encountered.
 * - `stageTimings` — Ordered array of stage timing records.
 * - `truncationInfo` — Details about contribution truncation, if any.
 * - `engineVersion` — Version of @veris/risk that produced the evaluation.
 * - `schemaVersion` — Version of the diagnostics data model.
 *
 * ## Invariants
 *
 * - All fields are readonly and the object is frozen.
 * - Deterministic (except `evaluationDurationMs` which depends on wall clock).
 * - Never part of the RiskAssessment — exclusively for debugging.
 */
export interface RiskEngineDiagnostics {
  /** Total evaluation duration in milliseconds (non-deterministic). */
  readonly evaluationDurationMs: number;
  /** Number of contributions built from the input. */
  readonly contributionCount: number;
  /** Number of populated dimensions (0-3). */
  readonly dimensionCount: number;
  /** Number of unique evidence IDs referenced by contributions. */
  readonly evidenceCount: number;
  /** Number of contributions skipped during building. */
  readonly skippedContributions: number;
  /** Number of input validation failures encountered. */
  readonly validationFailures: number;
  /** Ordered stage timings in evaluation order. */
  readonly stageTimings: readonly StageTiming[];
  /** Truncation information, or null if no truncation occurred. */
  readonly truncationInfo: TruncationInfo | null;
  /** Version of @veris/risk that produced this evaluation. */
  readonly engineVersion: string;
  /** Version of the diagnostics data model. */
  readonly schemaVersion: string;
}

// ── No-Op Writer ──

/**
 * A frozen, no-op writer used when diagnostics are disabled.
 *
 * All methods are empty — the overhead is a single function call
 * per invocation, with no closures or allocations.
 */
const NOOP_WRITER: RiskDiagnosticsWriter = Object.freeze({
  recordStage: () => {},
  setContributionCount: () => {},
  setDimensionCount: () => {},
  setEvidenceCount: () => {},
  setSkippedContributions: () => {},
  addValidationFailure: () => {},
  setTruncationInfo: () => {},
});

// ── RiskDiagnosticsCollector ──

/**
 * Collects deterministic diagnostics during RiskEngine evaluation.
 *
 * ## Usage
 *
 * ```typescript
 * const collector = RiskDiagnosticsCollector.createDiagnostics();
 * const assessment = engine.evaluate(input, { diagnostics: collector });
 * const diagnostics = collector.finalizeDiagnostics();
 *
 * console.log(diagnostics.evaluationDurationMs);
 * console.log(diagnostics.stageTimings);
 * ```
 *
 * ## Thread Safety
 *
 * The collector is **not** thread-safe. A single collector should be used
 * for a single evaluation. After `finalizeDiagnostics()` is called, all
 * recording methods become no-ops.
 *
 * ## Allocation-Conscious Design
 *
 * - Stage records are stored in a plain array (minimal overhead).
 * - Counters are simple number fields (no boxing overhead).
 * - The copy on `finalizeDiagnostics()` is the only allocation during finalization.
 */
export class RiskDiagnosticsCollector implements RiskDiagnosticsWriter {
  // ── Private Fields ──

  /** Timestamp when the collector was created (from performance.now()). */
  private readonly _startTime: number;

  /** Timestamp of the last recordStage() call. */
  private _lastTimestamp: number;

  /** Collected stage timings. */
  private readonly _stages: StageTiming[];

  /** Whether finalizeDiagnostics() has been called. */
  private _finalized: boolean;

  // ── Counters ──

  private _contributionCount = 0;
  private _dimensionCount = 0;
  private _evidenceCount = 0;
  private _skippedContributions = 0;
  private _validationFailures = 0;
  private _truncationInfo: TruncationInfo | null = null;

  // ── Construction ──

  /**
   * Creates a new diagnostics collector.
   *
   * Use this static factory method to create a collector.
   *
   * @returns A new RiskDiagnosticsCollector ready for recording.
   */
  static createDiagnostics(): RiskDiagnosticsCollector {
    return new RiskDiagnosticsCollector();
  }

  private constructor() {
    this._startTime = performance.now();
    this._lastTimestamp = this._startTime;
    this._stages = [];
    this._finalized = false;
  }

  // ── Stage Recording ──

  /**
   * Records the duration of the current stage.
   *
   * The duration is computed as the wall-clock time elapsed since the
   * previous `recordStage()` call (or since collector creation for the
   * first call).
   *
   * ## Complexity
   * O(1) — pushes one StageTiming object to the internal array.
   *
   * ## Determinism
   * Stage timing is inherently non-deterministic (depends on wall clock).
   * All other diagnostic fields are fully deterministic.
   *
   * ## Post-Finalization Behavior
   * After `finalizeDiagnostics()` is called, this method is a no-op.
   *
   * @param name - The stage name (e.g., "validate", "build-contributions").
   */
  recordStage(name: string): void {
    if (this._finalized) return;

    const now = performance.now();
    const durationMs = round2(now - this._lastTimestamp);
    this._stages.push({ name, durationMs });
    this._lastTimestamp = now;
  }

  // ── Setter Methods ──

  /** @inheritdoc */
  setContributionCount(count: number): void {
    if (this._finalized) return;
    this._contributionCount = count;
  }

  /** @inheritdoc */
  setDimensionCount(count: number): void {
    if (this._finalized) return;
    this._dimensionCount = count;
  }

  /** @inheritdoc */
  setEvidenceCount(count: number): void {
    if (this._finalized) return;
    this._evidenceCount = count;
  }

  /** @inheritdoc */
  setSkippedContributions(count: number): void {
    if (this._finalized) return;
    this._skippedContributions = count;
  }

  /** @inheritdoc */
  addValidationFailure(): void {
    if (this._finalized) return;
    this._validationFailures++;
  }

  /** @inheritdoc */
  setTruncationInfo(info: TruncationInfo | null): void {
    if (this._finalized) return;
    this._truncationInfo = info;
  }

  // ── Finalization ──

  /**
   * Finalizes the diagnostics and returns an immutable snapshot.
   *
   * After this method is called:
   * - The returned `RiskEngineDiagnostics` is frozen and immutable.
   * - All recording methods become no-ops.
   * - Calling `finalizeDiagnostics()` again throws an error.
   *
   * ## Evaluation Order
   * 1. Check not already finalized (throw if so).
   * 2. Mark as finalized.
   * 3. Compute total evaluation duration.
   * 4. Freeze the stage timings array (copy to ensure isolation).
   * 5. Build and freeze the diagnostics object.
   *
   * @returns A frozen, immutable RiskEngineDiagnostics.
   * @throws {Error} If finalizeDiagnostics() has already been called.
   */
  finalizeDiagnostics(): RiskEngineDiagnostics {
    if (this._finalized) {
      throw new Error('RiskDiagnosticsCollector has already been finalized');
    }

    this._finalized = true;

    const now = performance.now();
    const evaluationDurationMs = round2(now - this._startTime);

    return Object.freeze<RiskEngineDiagnostics>({
      evaluationDurationMs,
      contributionCount: this._contributionCount,
      dimensionCount: this._dimensionCount,
      evidenceCount: this._evidenceCount,
      skippedContributions: this._skippedContributions,
      validationFailures: this._validationFailures,
      stageTimings: Object.freeze([...this._stages]),
      truncationInfo: this._truncationInfo,
      engineVersion: ENGINE_VERSION,
      schemaVersion: SCHEMA_VERSION,
    });
  }
}

// ── Utility ──

/**
 * Creates a no-op diagnostics writer.
 *
 * Use this when diagnostics are disabled to avoid null checks.
 *
 * @returns A frozen, no-op DiagnosticsWriter.
 */
export function createNoopDiagnosticsWriter(): RiskDiagnosticsWriter {
  return NOOP_WRITER;
}
