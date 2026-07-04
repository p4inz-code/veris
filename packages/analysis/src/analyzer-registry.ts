/**
 * AnalyzerRegistry — manages analyzer registration, matching, and execution.
 *
 * Supports:
 * - register() / unregister() for plugin lifecycle
 * - Priority-based ordering (lower priority number = executes first)
 * - Artifact type matching via canAnalyze()
 * - Parallel execution of independent analyzers
 * - Cancellation via CancellationToken
 * - Per-analyzer timeouts
 * - Comprehensive diagnostics collection
 *
 * @module @veris/analysis/analyzer-registry
 */

import { CancellationToken, CancellationTokenSource } from '@veris/shared';

import { DefaultDiagnosticsCollector } from './diagnostics.js';
import type {
  Analyzer,
  AnalysisContext,
  AnalysisOptions,
  AnalysisResult,
  AnalyzerRunDiagnostics,
  RegistryAnalysisDiagnostics,
} from './types.js';
import { AnalysisError, createSkippedDiagnostics } from './types.js';

/**
 * Registry for managing and executing artifact analyzers.
 */
export class AnalyzerRegistry {
  private readonly _analyzers: Map<string, Analyzer> = new Map();

  /**
   * Register an analyzer.
   * Throws if an analyzer with the same ID is already registered.
   */
  register(analyzer: Analyzer): void {
    if (this._analyzers.has(analyzer.id)) {
      throw new AnalysisError(
        `Analyzer "${analyzer.id}" is already registered`,
        'DUPLICATE_ANALYZER',
        analyzer.id,
      );
    }
    this._analyzers.set(analyzer.id, analyzer);
  }

  /**
   * Register multiple analyzers at once.
   */
  registerAll(analyzers: readonly Analyzer[]): void {
    for (const analyzer of analyzers) {
      this.register(analyzer);
    }
  }

  /**
   * Unregister an analyzer by ID.
   * Returns true if the analyzer was removed, false if not found.
   */
  unregister(id: string): boolean {
    return this._analyzers.delete(id);
  }

  /**
   * Get a registered analyzer by ID.
   */
  getAnalyzer(id: string): Analyzer | undefined {
    return this._analyzers.get(id);
  }

  /**
   * Get all registered analyzers, sorted by priority.
   */
  getAnalyzers(): readonly Analyzer[] {
    return this._getSortedAnalyzers();
  }

  /**
   * Get the number of registered analyzers.
   */
  get size(): number {
    return this._analyzers.size;
  }

  /**
   * Run all applicable analyzers against the given analysis context.
   *
   * Analyzers that return false from canAnalyze() are skipped.
   * Remaining analyzers are executed in parallel (default) or sequentially.
   */
  async analyze(
    context: AnalysisContext,
    options?: AnalysisOptions,
  ): Promise<RegistryAnalysisResult> {
    const diagnostics = new DefaultDiagnosticsCollector();
    const startTime = Date.now();

    // Create cancellation token from options
    const cts = new CancellationTokenSource();
    const cancellationToken = context.cancellationToken ?? cts.token;

    // Wire up AbortSignal if provided
    if (options?.signal) {
      if (options.signal.aborted) {
        cts.cancel('Operation aborted by signal');
      } else {
        options.signal.addEventListener(
          'abort',
          () => {
            cts.cancel(options.signal?.reason?.toString() ?? 'Operation aborted by signal');
          },
          { once: true },
        );
      }
    }

    // Get all analyzers sorted by priority
    const allAnalyzers = this._getSortedAnalyzers();

    // Check cancellation before starting
    if (cancellationToken.isCancelled) {
      return this._buildResult(
        [],
        diagnostics,
        startTime,
        Date.now(),
        cancellationToken.reason?.message ?? 'Cancelled',
      );
    }

    // Phase 1: Filter applicable analyzers via canAnalyze()
    const applicable: Analyzer[] = [];
    const skipped: { id: string; reason: string }[] = [];

    for (const analyzer of allAnalyzers) {
      diagnostics.recordStart(analyzer.id, Date.now());
      try {
        if (analyzer.canAnalyze(context)) {
          applicable.push(analyzer);
        } else {
          diagnostics.recordSkipped(analyzer.id, 'canAnalyze returned false');
          skipped.push({ id: analyzer.id, reason: 'canAnalyze returned false' });
        }
      } catch (error) {
        diagnostics.recordSkipped(
          analyzer.id,
          `canAnalyze threw: ${error instanceof Error ? error.message : String(error)}`,
        );
        skipped.push({
          id: analyzer.id,
          reason: `canAnalyze threw: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    // Phase 2: Execute applicable analyzers
    let results: AnalysisResult[];

    if (options?.sequential || applicable.length <= 1) {
      results = await this._executeSequential(
        applicable,
        context,
        diagnostics,
        cancellationToken,
        options,
      );
    } else {
      results = await this._executeParallel(
        applicable,
        context,
        diagnostics,
        cancellationToken,
        options,
      );
    }

    const endTime = Date.now();
    return this._buildResult(results, diagnostics, startTime, endTime);
  }

  private async _executeSequential(
    analyzers: readonly Analyzer[],
    context: AnalysisContext,
    diagnostics: DefaultDiagnosticsCollector,
    cancellationToken: CancellationToken,
    options?: AnalysisOptions,
  ): Promise<AnalysisResult[]> {
    const results: AnalysisResult[] = [];

    for (const analyzer of analyzers) {
      if (cancellationToken.isCancelled) break;

      const result = await this._runSingle(analyzer, context, diagnostics, options);
      results.push(result);
    }

    return results;
  }

  private async _executeParallel(
    analyzers: readonly Analyzer[],
    context: AnalysisContext,
    diagnostics: DefaultDiagnosticsCollector,
    cancellationToken: CancellationToken,
    options?: AnalysisOptions,
  ): Promise<AnalysisResult[]> {
    const maxConcurrency = options?.maxConcurrency ?? 8;
    const results: AnalysisResult[] = [];
    const running: Promise<void>[] = [];
    const queue = [...analyzers];

    async function worker(
      self: AnalyzerRegistry,
      ctx: AnalysisContext,
      diag: DefaultDiagnosticsCollector,
      ct: CancellationToken,
      opts: AnalysisOptions | undefined,
    ): Promise<void> {
      while (queue.length > 0 && !ct.isCancelled) {
        const analyzer = queue.shift()!;
        const result = await self._runSingle(analyzer, ctx, diag, opts);
        results.push(result);
      }
    }

    const workerCount = Math.min(maxConcurrency, analyzers.length);
    for (let i = 0; i < workerCount; i++) {
      running.push(worker(this, context, diagnostics, cancellationToken, options));
    }

    await Promise.all(running);
    return results;
  }

  private async _runSingle(
    analyzer: Analyzer,
    context: AnalysisContext,
    diagnostics: DefaultDiagnosticsCollector,
    options?: AnalysisOptions,
  ): Promise<AnalysisResult> {
    const startTime = Date.now();
    diagnostics.recordStart(analyzer.id, startTime);

    const timeoutMs = options?.timeoutMs ?? 10000;

    try {
      const result = await this._withTimeout(analyzer.analyze(context), timeoutMs, analyzer.id);

      const endTime = Date.now();
      diagnostics.recordEnd(analyzer.id, endTime);
      diagnostics.recordEvidenceEmitted(analyzer.id, result.diagnostics.evidenceEmitted);

      // Collect issues from analyzer diagnostics
      for (const issue of result.diagnostics.issues) {
        diagnostics.recordIssue(analyzer.id, issue.code, issue.message, issue.isError);
      }

      return result;
    } catch (error) {
      const endTime = Date.now();
      diagnostics.recordEnd(analyzer.id, endTime);

      let code = 'ANALYSIS_ERROR';
      let message = 'Analysis failed';

      if (error instanceof AnalysisError) {
        code = error.code;
        message = error.message;
      } else if (error instanceof Error) {
        if (error.name === 'TimeoutError') {
          code = 'TIMEOUT';
          message = error.message;
        } else {
          message = error.message;
        }
      } else {
        message = String(error);
      }

      diagnostics.recordIssue(analyzer.id, code, message, true);

      return Object.freeze({
        evidence: Object.freeze([]),
        diagnostics: Object.freeze({
          analyzerId: analyzer.id,
          skipped: false,
          startTime,
          endTime,
          durationMs: endTime - startTime,
          evidenceEmitted: 0,
          issues: Object.freeze([
            Object.freeze({ analyzerId: analyzer.id, code, message, isError: true }),
          ]),
        }),
      });
    }
  }

  private async _withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    analyzerId: string,
  ): Promise<T> {
    if (timeoutMs <= 0) return promise;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new AnalysisError(
            `Analyzer "${analyzerId}" timed out after ${timeoutMs}ms`,
            'TIMEOUT',
            analyzerId,
          ),
        );
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeout]);
      return result;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private _buildResult(
    results: AnalysisResult[],
    diagnostics: DefaultDiagnosticsCollector,
    startTime: number,
    endTime: number,
    cancelReason?: string,
  ): RegistryAnalysisResult {
    const allEvidence = results.flatMap((r) => r.evidence);
    const registryDiagnostics = diagnostics.buildRegistryDiagnostics();

    return Object.freeze({
      evidence: Object.freeze(allEvidence),
      results: Object.freeze(results.map((r) => r.diagnostics)),
      diagnostics: registryDiagnostics,
      startTime,
      endTime,
      durationMs: endTime - startTime,
      cancelled: cancelReason ? true : false,
      cancelReason,
    });
  }

  private _getSortedAnalyzers(): readonly Analyzer[] {
    return Object.freeze([...this._analyzers.values()].sort((a, b) => a.priority - b.priority));
  }
}

/** Result of an analysis run through the registry. */
export interface RegistryAnalysisResult {
  /** All evidence produced across all analyzers. */
  readonly evidence: readonly import('./types.js').Evidence[];
  /** Per-analyzer run diagnostics. */
  readonly results: readonly AnalyzerRunDiagnostics[];
  /** Aggregate registry diagnostics. */
  readonly diagnostics: RegistryAnalysisDiagnostics;
  /** Unix timestamp when analysis started (ms). */
  readonly startTime: number;
  /** Unix timestamp when analysis ended (ms). */
  readonly endTime: number;
  /** Total duration in milliseconds. */
  readonly durationMs: number;
  /** Whether the analysis was cancelled. */
  readonly cancelled: boolean;
  /** Reason for cancellation, if applicable. */
  readonly cancelReason?: string;
}
