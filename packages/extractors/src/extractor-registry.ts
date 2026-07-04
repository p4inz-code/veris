/**
 * ExtractorRegistry — manages extractor registration, matching, and execution.
 *
 * Supports:
 * - register() / unregister() for plugin lifecycle
 * - Priority-based ordering (lower priority number = executes first)
 * - Artifact type matching via canExtract()
 * - Parallel execution of independent extractors
 * - Cancellation via CancellationToken
 * - Per-extractor timeouts
 * - Comprehensive diagnostics collection
 *
 * @module @veris/extractors/extractor-registry
 */

import type { ArtifactType } from '@veris/core';
import { CancellationToken, CancellationTokenSource, ok, err, type Result } from '@veris/shared';

import { DefaultDiagnosticsCollector } from './diagnostics.js';
import type {
  Extractor,
  ExtractionContext,
  ExtractionOptions,
  ExtractionResult,
  ExtractorRunDiagnostics,
  RegistryExtractionDiagnostics,
} from './types.js';
import { ExtractionError, createSkippedDiagnostics } from './types.js';

/**
 * Registry for managing and executing artifact extractors.
 *
 * @example
 * ```typescript
 * const registry = new ExtractorRegistry();
 * registry.register(new StringExtractor());
 * registry.register(new HashExtractor());
 *
 * const results = await registry.extract(context);
 * console.log(results.diagnostics.totalFeaturesEmitted);
 * ```
 */
export class ExtractorRegistry {
  /** Registered extractors, keyed by ID. */
  private readonly _extractors: Map<string, Extractor> = new Map();

  /**
   * Register an extractor.
   * Throws if an extractor with the same ID is already registered.
   */
  register(extractor: Extractor): void {
    if (this._extractors.has(extractor.id)) {
      throw new ExtractionError(
        `Extractor "${extractor.id}" is already registered`,
        'DUPLICATE_EXTRACTOR',
        extractor.id,
      );
    }
    this._extractors.set(extractor.id, extractor);
  }

  /**
   * Register multiple extractors at once.
   */
  registerAll(extractors: readonly Extractor[]): void {
    for (const extractor of extractors) {
      this.register(extractor);
    }
  }

  /**
   * Unregister an extractor by ID.
   * Returns true if the extractor was removed, false if not found.
   */
  unregister(id: string): boolean {
    return this._extractors.delete(id);
  }

  /**
   * Get a registered extractor by ID.
   * Returns undefined if not found.
   */
  getExtractor(id: string): Extractor | undefined {
    return this._extractors.get(id);
  }

  /**
   * Get all registered extractors, sorted by priority.
   */
  getExtractors(): readonly Extractor[] {
    return this._getSortedExtractors();
  }

  /**
   * Get all extractors that can process the given artifact type,
   * sorted by priority.
   */
  getExtractorsForArtifact(artifactType: ArtifactType): readonly Extractor[] {
    return this._getSortedExtractors().filter(
      (e) =>
        e.supportedArtifactTypes.length === 0 || e.supportedArtifactTypes.includes(artifactType),
    );
  }

  /**
   * Get the number of registered extractors.
   */
  get size(): number {
    return this._extractors.size;
  }

  /**
   * Run all applicable extractors against the given extraction context.
   *
   * Extractors that return false from canExtract() are skipped.
   * Remaining extractors are executed in parallel (default) or sequentially.
   *
   * @returns A RegistryExtractionResult with all extraction results and aggregate diagnostics.
   */
  async extract(
    context: ExtractionContext,
    options?: ExtractionOptions,
  ): Promise<RegistryExtractionResult> {
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

    // Get all extractors sorted by priority
    const allExtractors = this._getSortedExtractors();

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

    // Phase 1: Filter applicable extractors via canExtract()
    const applicable: Extractor[] = [];
    const skipped: { id: string; reason: string }[] = [];

    for (const extractor of allExtractors) {
      diagnostics.recordStart(extractor.id, Date.now());
      try {
        if (extractor.canExtract(context)) {
          applicable.push(extractor);
        } else {
          diagnostics.recordSkipped(extractor.id, 'canExtract returned false');
          skipped.push({ id: extractor.id, reason: 'canExtract returned false' });
        }
      } catch (error) {
        diagnostics.recordSkipped(
          extractor.id,
          `canExtract threw: ${error instanceof Error ? error.message : String(error)}`,
        );
        skipped.push({
          id: extractor.id,
          reason: `canExtract threw: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    // Phase 2: Execute applicable extractors
    let results: ExtractionResult[];

    if (options?.sequential || applicable.length <= 1) {
      // Sequential execution
      results = await this._executeSequential(
        applicable,
        context,
        diagnostics,
        cancellationToken,
        options,
      );
    } else {
      // Parallel execution
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

  /**
   * Execute extractors sequentially.
   */
  private async _executeSequential(
    extractors: readonly Extractor[],
    context: ExtractionContext,
    diagnostics: DefaultDiagnosticsCollector,
    cancellationToken: CancellationToken,
    options?: ExtractionOptions,
  ): Promise<ExtractionResult[]> {
    const results: ExtractionResult[] = [];

    for (const extractor of extractors) {
      if (cancellationToken.isCancelled) break;

      const result = await this._runSingle(extractor, context, diagnostics, options);
      results.push(result);
    }

    return results;
  }

  /**
   * Execute extractors in parallel with concurrency control.
   */
  private async _executeParallel(
    extractors: readonly Extractor[],
    context: ExtractionContext,
    diagnostics: DefaultDiagnosticsCollector,
    cancellationToken: CancellationToken,
    options?: ExtractionOptions,
  ): Promise<ExtractionResult[]> {
    const maxConcurrency = options?.maxConcurrency ?? 8;
    const results: ExtractionResult[] = [];
    const running: Promise<void>[] = [];
    const queue = [...extractors];

    async function worker(
      self: ExtractorRegistry,
      ctx: ExtractionContext,
      diag: DefaultDiagnosticsCollector,
      ct: CancellationToken,
      opts: ExtractionOptions | undefined,
    ): Promise<void> {
      while (queue.length > 0 && !ct.isCancelled) {
        const extractor = queue.shift()!;
        const result = await self._runSingle(extractor, ctx, diag, opts);
        results.push(result);
      }
    }

    const workerCount = Math.min(maxConcurrency, extractors.length);
    for (let i = 0; i < workerCount; i++) {
      running.push(worker(this, context, diagnostics, cancellationToken, options));
    }

    await Promise.all(running);
    return results;
  }

  /**
   * Run a single extractor with timeout and error handling.
   */
  private async _runSingle(
    extractor: Extractor,
    context: ExtractionContext,
    diagnostics: DefaultDiagnosticsCollector,
    options?: ExtractionOptions,
  ): Promise<ExtractionResult> {
    const startTime = Date.now();
    diagnostics.recordStart(extractor.id, startTime);

    const timeoutMs = options?.timeoutMs ?? context.config?.timeoutMs ?? 5000;

    try {
      // Execute with timeout
      const result = await this._withTimeout(extractor.extract(context), timeoutMs, extractor.id);

      const endTime = Date.now();
      diagnostics.recordEnd(extractor.id, endTime);

      // Update diagnostics from the extractor's own report
      diagnostics.recordBytesProcessed(extractor.id, result.diagnostics.bytesProcessed);
      diagnostics.recordFeaturesEmitted(extractor.id, result.diagnostics.featuresEmitted);

      // Collect issues from extractor diagnostics
      for (const issue of result.diagnostics.issues) {
        diagnostics.recordIssue(extractor.id, issue.code, issue.message, issue.isError);
      }

      return result;
    } catch (error) {
      const endTime = Date.now();
      diagnostics.recordEnd(extractor.id, endTime);

      let code = 'EXTRACTION_ERROR';
      let message = 'Extraction failed';

      if (error instanceof ExtractionError) {
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

      diagnostics.recordIssue(extractor.id, code, message, true);

      return Object.freeze({
        features: Object.freeze([]),
        diagnostics: Object.freeze({
          extractorId: extractor.id,
          skipped: false,
          startTime,
          endTime,
          durationMs: endTime - startTime,
          bytesProcessed: 0,
          featuresEmitted: 0,
          issues: Object.freeze([
            Object.freeze({ extractorId: extractor.id, code, message, isError: true }),
          ]),
        }),
      });
    }
  }

  /**
   * Execute a promise with a timeout.
   */
  private async _withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    extractorId: string,
  ): Promise<T> {
    if (timeoutMs <= 0) return promise;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new ExtractionError(
            `Extractor "${extractorId}" timed out after ${timeoutMs}ms`,
            'TIMEOUT',
            extractorId,
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

  /**
   * Build the final RegistryExtractionResult.
   */
  private _buildResult(
    results: ExtractionResult[],
    diagnostics: DefaultDiagnosticsCollector,
    startTime: number,
    endTime: number,
    cancelReason?: string,
  ): RegistryExtractionResult {
    const allFeatures: ExtractionResult[] = results;

    // Merge all features into a flat list
    const features = allFeatures.flatMap((r) => r.features);

    const registryDiagnostics = diagnostics.buildRegistryDiagnostics();

    return Object.freeze({
      features: Object.freeze(features),
      results: Object.freeze(allFeatures.map((r) => r.diagnostics)),
      diagnostics: registryDiagnostics,
      startTime,
      endTime,
      durationMs: endTime - startTime,
      cancelled: cancelReason ? true : false,
      cancelReason,
    });
  }

  /**
   * Get extractors sorted by priority (ascending).
   */
  private _getSortedExtractors(): readonly Extractor[] {
    return Object.freeze([...this._extractors.values()].sort((a, b) => a.priority - b.priority));
  }
}

/** Result of an extraction run through the registry. */
export interface RegistryExtractionResult {
  /** All features extracted across all extractors. */
  readonly features: readonly import('./types.js').RawFeature[];
  /** Per-extractor run diagnostics. */
  readonly results: readonly ExtractorRunDiagnostics[];
  /** Aggregate registry diagnostics. */
  readonly diagnostics: RegistryExtractionDiagnostics;
  /** Unix timestamp when extraction started (ms). */
  readonly startTime: number;
  /** Unix timestamp when extraction ended (ms). */
  readonly endTime: number;
  /** Total duration in milliseconds. */
  readonly durationMs: number;
  /** Whether the extraction was cancelled. */
  readonly cancelled: boolean;
  /** Reason for cancellation, if applicable. */
  readonly cancelReason?: string;
}
