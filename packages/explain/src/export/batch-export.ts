/**
 * Batch export — export multiple explanations with progress reporting.
 *
 * Features:
 * - Deterministic ordering by subjectId
 * - Progress callbacks for each step
 * - Continue-on-error option
 * - Aggregate results
 *
 * @module @veris/explain/export/batch-export
 */

import type { Explanation } from '../types/explanation.js';

import type {
  BatchOptions,
  BatchEntry,
  BatchResult,
  BatchItemResult,
  BatchPhase,
  BatchProgress,
  ProgressCallback,
  ExportToFile,
} from './export-types.js';
import { DEFAULT_BATCH_OPTIONS } from './export-types.js';

// Re-export for backward compatibility
export type {
  BatchPhase,
  BatchProgress,
  ProgressCallback,
  BatchOptions,
  BatchEntry,
  BatchItemResult,
  BatchResult,
};
export { DEFAULT_BATCH_OPTIONS };

// ── Batch Exporter ──

/**
 * Exports multiple explanations with progress reporting.
 *
 * Entries are processed in deterministic order (sorted by subjectId).
 * Supports continue-on-error mode for resilient batch exports.
 */
export class BatchExporter {
  private readonly exporter: ExportToFile;
  private readonly options: BatchOptions;
  private readonly clock: { readonly now: () => Date };

  constructor(
    exporter: ExportToFile,
    options?: Partial<BatchOptions>,
    clock?: { readonly now: () => Date },
  ) {
    this.exporter = exporter;
    this.options = { ...DEFAULT_BATCH_OPTIONS, ...options };
    this.clock = clock ?? { now: () => new Date() };
  }

  /**
   * Export multiple explanations to files.
   *
   * @param entries - The entries to export.
   * @returns Combined batch result.
   */
  exportAll(entries: readonly BatchEntry[]): BatchResult {
    const sortedEntries = this.sortEntries(entries);
    const results: BatchItemResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < sortedEntries.length; i++) {
      const entry = sortedEntries[i];
      this.fireProgress('exporting', i, sortedEntries.length, entry.explanation.subjectId);

      try {
        const result = this.exporter.exportToFile(entry.explanation, entry.filePath);

        if (result.success) {
          successCount++;
          results.push({
            subjectId: entry.explanation.subjectId,
            format: result.format,
            success: true,
            filePath: entry.filePath,
          });
        } else {
          failureCount++;
          results.push({
            subjectId: entry.explanation.subjectId,
            format: result.format,
            success: false,
            filePath: entry.filePath,
            error: result.error ?? 'Unknown error',
          });

          if (!this.options.continueOnError) {
            this.fireProgress('error', i, sortedEntries.length, entry.explanation.subjectId);
            break;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failureCount++;
        results.push({
          subjectId: entry.explanation.subjectId,
          format: 'unknown',
          success: false,
          filePath: entry.filePath,
          error: message,
        });

        if (!this.options.continueOnError) {
          break;
        }
      }
    }

    this.fireProgress('complete', sortedEntries.length, sortedEntries.length, '');

    return {
      items: results,
      totalCount: sortedEntries.length,
      successCount,
      failureCount,
      allSuccessful: failureCount === 0,
      exportedAt: this.clock.now().toISOString(),
    };
  }

  /**
   * Export a single explanation (convenience wrapper).
   *
   * @param explanation - The explanation to export.
   * @param filePath - The target file path.
   * @returns The individual batch item result.
   */
  exportOne(explanation: Explanation, filePath: string): BatchItemResult {
    const result = this.exporter.exportToFile(explanation, filePath);

    return {
      subjectId: explanation.subjectId,
      format: result.format,
      success: result.success,
      filePath: filePath,
      error: result.error,
    };
  }

  // ── Private ──

  /**
   * Sort entries deterministically by subjectId.
   */
  private sortEntries(entries: readonly BatchEntry[]): readonly BatchEntry[] {
    return [...entries].sort((a, b) =>
      a.explanation.subjectId.localeCompare(b.explanation.subjectId),
    );
  }

  /**
   * Fire a progress event if callback is registered.
   */
  private fireProgress(
    phase: BatchPhase,
    current: number,
    total: number,
    subjectId: string,
    message?: string,
  ): void {
    if (this.options.onProgress) {
      this.options.onProgress({
        phase,
        current,
        total,
        subjectId,
        format: 'markdown',
        message,
      });
    }
  }
}
