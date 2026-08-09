/**
 * PipelineMetrics — comprehensive performance metrics for the analysis pipeline.
 *
 * Collects timing for:
 * - Parser time
 * - Analyzer time
 * - Enrichment time
 * - Aggregation time
 * - Report generation time
 * - Total pipeline runtime
 *
 * @module @veris/analysis/pipeline/metrics
 */

/** A single timing measurement. */
export interface TimingMeasurement {
  readonly label: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly durationMs: number;
}

/** Per-analyzer timing. */
export interface AnalyzerTiming {
  readonly analyzerId: string;
  readonly durationMs: number;
  readonly evidenceCount: number;
}

/** Complete pipeline metrics. */
export interface PipelineMetricsResult {
  /** Pipeline ID. */
  readonly pipelineId: string;
  /** Artifact ID. */
  readonly artifactId: string;
  /** Total pipeline runtime in milliseconds. */
  readonly totalRuntimeMs: number;
  /** Stage timings. */
  readonly stages: Readonly<Record<string, number>>;
  /** Per-analyzer timings. */
  readonly analyzers: readonly AnalyzerTiming[];
  /** All timing measurements (detailed). */
  readonly measurements: readonly TimingMeasurement[];
  /** Memory usage (if available). */
  readonly memoryUsageMB?: number;
  /** Whether the pipeline was cancelled. */
  readonly cancelled: boolean;
  /** Reason for cancellation (if applicable). */
  readonly cancelReason?: string;
}

/**
 * PipelineMetrics — collects performance metrics during pipeline execution.
 */
export class PipelineMetrics {
  private readonly _pipelineId: string;
  private readonly _artifactId: string;
  private readonly _measurements: TimingMeasurement[] = [];
  private readonly _stageTimings: Map<string, number> = new Map();
  private readonly _analyzerTimings: AnalyzerTiming[] = [];
  private _startTime: number = 0;
  private _cancelled: boolean = false;
  private _cancelReason?: string;

  constructor(pipelineId: string, artifactId: string) {
    this._pipelineId = pipelineId;
    this._artifactId = artifactId;
  }

  /** Start the pipeline timer. */
  start(): void {
    this._startTime = performance.now();
  }

  /** Mark a stage timing. */
  markStage(stageId: string): void {
    this._stageTimings.set(stageId, performance.now() - this._startTime);
  }

  /** Record a timing measurement. */
  recordMeasurement(label: string): void {
    const endTime = performance.now();
    this._measurements.push({
      label,
      startTime: this._startTime,
      endTime,
      durationMs: endTime - this._startTime,
    });
  }

  /** Record an analyzer timing. */
  recordAnalyzer(analyzerId: string, durationMs: number, evidenceCount: number): void {
    this._analyzerTimings.push({
      analyzerId,
      durationMs,
      evidenceCount,
    });
  }

  /** Get total runtime so far. */
  getElapsedMs(): number {
    return performance.now() - this._startTime;
  }

  /** Calculate a stage's duration. */
  getStageDuration(stageId: string): number {
    // Duration is time since previous stage or start
    const stageTime = this._stageTimings.get(stageId);
    if (!stageTime) return 0;

    // Find previous stage time
    let prevTime = 0;
    for (const [id, time] of this._stageTimings) {
      if (time < stageTime && time > prevTime) {
        prevTime = time;
      }
    }

    return stageTime - prevTime;
  }

  /** Mark the pipeline as cancelled. */
  cancel(reason?: string): void {
    this._cancelled = true;
    this._cancelReason = reason;
  }

  /** Build the final metrics result. */
  build(): PipelineMetricsResult {
    const totalDuration = performance.now() - this._startTime;

    // Compute per-stage durations
    const stageDurations: Record<string, number> = {};
    for (const [stageId] of this._stageTimings) {
      stageDurations[stageId] = this.getStageDuration(stageId);
    }

    return Object.freeze({
      pipelineId: this._pipelineId,
      artifactId: this._artifactId,
      totalRuntimeMs: totalDuration,
      stages: Object.freeze(stageDurations),
      analyzers: Object.freeze([...this._analyzerTimings]),
      measurements: Object.freeze([...this._measurements]),
      memoryUsageMB: this._getMemoryMB(),
      cancelled: this._cancelled,
      cancelReason: this._cancelReason,
    });
  }

  private _getMemoryMB(): number | undefined {
    try {
      const usage = process.memoryUsage();
      return Math.round(usage.heapUsed / 1024 / 1024);
    } catch {
      return undefined;
    }
  }
}
