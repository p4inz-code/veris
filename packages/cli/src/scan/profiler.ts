/**
 * Profiler infrastructure for VERIS scan sessions.
 *
 * Records timing and performance data for every pipeline stage.
 * Supports future benchmarking and is fully deterministic.
 *
 * @module @veris/cli/scan
 */

import { deterministicId } from '@veris/shared';

// ── Types ──

/** Pipeline stage identifiers. */
export type ProfilerStage =
  | 'discovery'
  | 'classification'
  | 'extraction'
  | 'knowledge'
  | 'analysis'
  | 'rules'
  | 'correlation'
  | 'risk'
  | 'reporting'
  | 'export'
  | 'total';

/** A single timing record for a profiler stage. */
export interface StageTiming {
  /** Stage identifier. */
  readonly stage: ProfilerStage;
  /** Start timestamp (epoch ms). */
  readonly startMs: number;
  /** End timestamp (epoch ms). */
  readonly endMs: number;
  /** Duration in milliseconds. */
  readonly durationMs: number;
  /** Items processed in this stage. */
  readonly itemsProcessed: number;
  /** Items that failed in this stage. */
  readonly itemsFailed: number;
}

/** Aggregated statistics for a stage across multiple runs. */
export interface StageStats {
  /** Stage identifier. */
  readonly stage: ProfilerStage;
  /** Total duration across all calls. */
  readonly totalDurationMs: number;
  /** Number of times this stage was executed. */
  readonly callCount: number;
  /** Average duration per call. */
  readonly avgDurationMs: number;
  /** Minimum duration across calls. */
  readonly minDurationMs: number;
  /** Maximum duration across calls. */
  readonly maxDurationMs: number;
  /** Total items processed. */
  readonly totalItemsProcessed: number;
  /** Total items failed. */
  readonly totalItemsFailed: number;
}

/** Complete profiler snapshot. */
export interface ProfilerSnapshot {
  /** Unique profiler session ID. */
  readonly id: string;
  /** All stage timings recorded. */
  readonly stages: readonly StageTiming[];
  /** Aggregated stats per stage. */
  readonly stats: readonly StageStats[];
  /** Total elapsed time across all stages. */
  readonly totalDurationMs: number;
  /** Start timestamp (epoch ms). */
  readonly startedAt: number;
  /** End timestamp (epoch ms). */
  readonly endedAt: number;
  /** Whether the profiler is complete. */
  readonly completed: boolean;
}

/** Per-file timing record. */
export interface FileTiming {
  /** File path. */
  readonly path: string;
  /** Processing duration in ms. */
  readonly durationMs: number;
  /** Stage that processed this file. */
  readonly stage: ProfilerStage;
  /** Whether processing succeeded. */
  readonly success: boolean;
}

// ── Profiler ──

/**
 * Reusable profiler that records timing data for pipeline stages.
 *
 * Thread-safe (no shared mutable state), fully deterministic.
 *
 * Usage:
 *   const profiler = new Profiler();
 *   profiler.start('discovery');
 *   // ... do work ...
 *   profiler.finish('discovery', { processed: 100 });
 *   const snapshot = profiler.snapshot();
 */
export class Profiler {
  private readonly id: string;
  private readonly startedAt: number;
  private completed: boolean = false;
  private readonly stageTimings: Map<ProfilerStage, StageTiming> = new Map();
  private readonly stageDurations: Map<ProfilerStage, number[]> = new Map();
  private readonly stageItems: Map<ProfilerStage, { processed: number; failed: number }[]> =
    new Map();
  private readonly fileTimings: FileTiming[] = [];
  private activeStage: ProfilerStage | null = null;
  private activeStart: number = 0;

  constructor(timestamp?: string) {
    this.id = deterministicId('profiler', timestamp ?? new Date().toISOString());
    this.startedAt = timestamp ? new Date(timestamp).getTime() : Date.now();
  }

  /** Profiler ID. */
  get profilerId(): string {
    return this.id;
  }

  /** Start timestamp (epoch ms). */
  get startTime(): number {
    return this.startedAt;
  }

  /** Whether the profiler has been marked as complete. */
  get isComplete(): boolean {
    return this.completed;
  }

  /**
   * Start timing a stage.
   * If another stage is currently active, it is automatically finished.
   */
  start(stage: ProfilerStage): void {
    // Auto-finish the current active stage if any
    if (this.activeStage !== null) {
      this.finish(this.activeStage, { processed: 0 });
    }

    this.activeStage = stage;
    this.activeStart = Date.now();
  }

  /**
   * Finish timing the current stage.
   *
   * @param stage - Stage identifier (must match the active stage).
   * @param options - Completion statistics.
   */
  finish(stage: ProfilerStage, options: { processed?: number; failed?: number } = {}): void {
    const now = Date.now();
    const duration = now - this.activeStart;

    // Create timing record
    const timing: StageTiming = Object.freeze({
      stage,
      startMs: this.activeStart,
      endMs: now,
      durationMs: duration,
      itemsProcessed: options.processed ?? 0,
      itemsFailed: options.failed ?? 0,
    });

    this.stageTimings.set(stage, timing);

    // Track per-call durations for stats
    const durations = this.stageDurations.get(stage) ?? [];
    durations.push(duration);
    this.stageDurations.set(stage, durations);

    const items = this.stageItems.get(stage) ?? [];
    items.push({ processed: options.processed ?? 0, failed: options.failed ?? 0 });
    this.stageItems.set(stage, items);

    this.activeStage = null;
    this.activeStart = 0;
  }

  /**
   * Record timing for a single file.
   */
  recordFile(path: string, stage: ProfilerStage, durationMs: number, success: boolean): void {
    this.fileTimings.push(
      Object.freeze({
        path,
        durationMs,
        stage,
        success,
      }),
    );
  }

  /**
   * Mark the profiler as complete.
   */
  complete(): void {
    if (this.activeStage !== null) {
      this.finish(this.activeStage, { processed: 0 });
    }
    this.completed = true;
  }

  /**
   * Get the stage timing for a specific stage.
   */
  getStageTiming(stage: ProfilerStage): StageTiming | undefined {
    return this.stageTimings.get(stage);
  }

  /**
   * Get aggregated statistics for a stage.
   */
  getStageStats(stage: ProfilerStage): StageStats {
    const durations = this.stageDurations.get(stage) ?? [];
    const items = this.stageItems.get(stage) ?? [];
    const totalDuration = durations.reduce((sum, d) => sum + d, 0);
    const totalProcessed = items.reduce((sum, i) => sum + i.processed, 0);
    const totalFailed = items.reduce((sum, i) => sum + i.failed, 0);

    return Object.freeze({
      stage,
      totalDurationMs: totalDuration,
      callCount: durations.length,
      avgDurationMs: durations.length > 0 ? totalDuration / durations.length : 0,
      minDurationMs: durations.length > 0 ? Math.min(...durations) : 0,
      maxDurationMs: durations.length > 0 ? Math.max(...durations) : 0,
      totalItemsProcessed: totalProcessed,
      totalItemsFailed: totalFailed,
    });
  }

  /**
   * Get the current profiler snapshot.
   */
  snapshot(): ProfilerSnapshot {
    const stages = Array.from(this.stageTimings.values());
    const stats = Array.from(this.stageDurations.keys()).map((stage) => this.getStageStats(stage));
    const totalDuration =
      stages.length > 0 ? Math.max(...stages.map((s) => s.endMs)) - this.startedAt : 0;
    const endedAt = this.completed ? Date.now() : 0;

    return Object.freeze({
      id: this.id,
      stages,
      stats,
      totalDurationMs: totalDuration,
      startedAt: this.startedAt,
      endedAt,
      completed: this.completed,
    });
  }

  /**
   * Get file timings for performance analysis.
   */
  getFileTimings(): readonly FileTiming[] {
    return Object.freeze([...this.fileTimings]);
  }

  /**
   * Get the slowest file processed.
   */
  getSlowestFile(): FileTiming | undefined {
    if (this.fileTimings.length === 0) return undefined;
    return this.fileTimings.reduce((slowest, current) =>
      current.durationMs > slowest.durationMs ? current : slowest,
    );
  }

  /**
   * Get the fastest file processed.
   */
  getFastestFile(): FileTiming | undefined {
    if (this.fileTimings.length === 0) return undefined;
    return this.fileTimings.reduce((fastest, current) =>
      current.durationMs < fastest.durationMs ? current : fastest,
    );
  }

  /** Reset all timing data (for reuse). */
  reset(): void {
    this.stageTimings.clear();
    this.stageDurations.clear();
    this.stageItems.clear();
    this.fileTimings.length = 0;
    this.activeStage = null;
    this.activeStart = 0;
    this.completed = false;
  }
}

/**
 * Create a formatted timing line for a stage.
 */
export function formatStageTiming(
  timing: StageTiming,
  totalMs: number,
  profilerStage?: ProfilerStage,
): string {
  const pct = totalMs > 0 ? ((timing.durationMs / totalMs) * 100).toFixed(1) : '0.0';
  return `${String(timing.stage).padEnd(16)} ${String(timing.durationMs).padStart(8)} ms  ${pct.padStart(5)}%  (${timing.itemsProcessed} items, ${timing.itemsFailed} failed)`;
}
