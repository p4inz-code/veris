/**
 * Export summary — human readable summary of an export operation.
 *
 * Provides:
 * - Explanation counts and mode breakdown
 * - Token usage statistics
 * - Cache hit/miss stats
 * - File sizes and output paths
 * - Duration tracking
 * - Deterministic formatting
 *
 * @module @veris/explain/export/export-summary
 */

import type { ExplanationDocument } from './explanation-document.js';
import type { ExportOptions, Clock } from './export-options.js';

// ── Summary Data ──

/** Summary of a single export operation. */
export interface SingleExportSummary {
  readonly subjectId: string;
  readonly mode: string;
  readonly format: string;
  readonly filePath: string;
  readonly fileSize: number;
  readonly tokenCount: number;
  readonly cached: boolean;
  readonly success: boolean;
  readonly error?: string;
}

/** Cache statistics for the export. */
export interface CacheStats {
  readonly total: number;
  readonly hits: number;
  readonly misses: number;
  readonly hitRate: number;
}

/** Complete export summary. */
export interface ExportSummary {
  readonly exportedAt: string;
  readonly durationMs: number;
  readonly totalExplanations: number;
  readonly totalFiles: number;
  readonly totalBytes: number;
  readonly totalTokens: number;
  readonly successful: number;
  readonly failed: number;
  readonly modeBreakdown: Record<string, number>;
  readonly cacheStats: CacheStats;
  readonly summaries: readonly SingleExportSummary[];
}

// ── Export Summary Builder ──

/**
 * Builds deterministic human-readable export summaries.
 *
 * No Date.now() — clock is injected.
 * Stable ordering by subjectId.
 */
export class ExportSummaryBuilder {
  private readonly clock: Clock;
  private readonly options: ExportOptions;

  constructor(clock: Clock, options: ExportOptions) {
    this.clock = clock;
    this.options = options;
  }

  /**
   * Build a summary for a single exported document.
   *
   * @param document - The exported document.
   * @param filePath - The output file path.
   * @param fileSize - The file size in bytes.
   * @param success - Whether the export was successful.
   * @param error - Optional error message.
   * @returns A single export summary.
   */
  buildSingle(
    document: ExplanationDocument,
    filePath: string,
    fileSize: number,
    success: boolean,
    error?: string,
  ): SingleExportSummary {
    return {
      subjectId: document.explanation.subjectId,
      mode: document.explanation.mode,
      format: this.options.format,
      filePath,
      fileSize,
      tokenCount: document.tokenUsage.totalTokens,
      cached: document.cached,
      success,
      error,
    };
  }

  /**
   * Build a complete summary from multiple export summaries.
   *
   * @param summaries - Individual export summaries.
   * @param durationMs - The total duration of the export operation.
   * @returns A complete ExportSummary.
   */
  buildComplete(summaries: readonly SingleExportSummary[], durationMs: number): ExportSummary {
    const sorted = [...summaries].sort((a, b) => a.subjectId.localeCompare(b.subjectId));

    const modeBreakdown: Record<string, number> = {};
    let totalBytes = 0;
    let totalTokens = 0;
    let successful = 0;
    let failed = 0;
    let cacheHits = 0;
    let cacheMisses = 0;

    for (const s of sorted) {
      totalBytes += s.fileSize;
      totalTokens += s.tokenCount;

      if (s.success) successful++;
      else failed++;

      if (s.cached) cacheHits++;
      else cacheMisses++;

      modeBreakdown[s.mode] = (modeBreakdown[s.mode] ?? 0) + 1;
    }

    const total = cacheHits + cacheMisses;

    return {
      exportedAt: this.clock.now().toISOString(),
      durationMs,
      totalExplanations: sorted.length,
      totalFiles: sorted.length,
      totalBytes,
      totalTokens,
      successful,
      failed,
      modeBreakdown,
      cacheStats: {
        total,
        hits: cacheHits,
        misses: cacheMisses,
        hitRate: total > 0 ? cacheHits / total : 0,
      },
      summaries: sorted,
    };
  }

  /**
   * Format the summary as a Markdown string.
   *
   * @param summary - The summary to format.
   * @returns A human-readable Markdown string.
   */
  formatMarkdown(summary: ExportSummary): string {
    const parts: string[] = [];

    parts.push('# Export Summary\n');
    parts.push(`> **Exported:** ${summary.exportedAt}`);
    parts.push(`> **Duration:** ${summary.durationMs}ms`);
    parts.push(`> **Total files:** ${summary.totalFiles}`);
    parts.push(`> **Total bytes:** ${this.formatBytes(summary.totalBytes)}`);
    parts.push(`> **Total tokens:** ${summary.totalTokens.toLocaleString()}`);
    parts.push('');

    // Results
    const successRate =
      summary.totalExplanations > 0
        ? ((summary.successful / summary.totalExplanations) * 100).toFixed(1)
        : '0.0';
    parts.push('## Results\n');
    parts.push(`- **Successful:** ${summary.successful} (${successRate}%)`);
    parts.push(`- **Failed:** ${summary.failed}`);
    parts.push(`- **Total:** ${summary.totalExplanations}`);
    parts.push('');

    // Mode breakdown
    parts.push('## Mode Breakdown\n');
    const sortedModes = Object.keys(summary.modeBreakdown).sort();
    for (const mode of sortedModes) {
      parts.push(`- **${mode}:** ${summary.modeBreakdown[mode]}`);
    }
    parts.push('');

    // Cache stats
    parts.push('## Cache\n');
    parts.push(`- **Hits:** ${summary.cacheStats.hits}`);
    parts.push(`- **Misses:** ${summary.cacheStats.misses}`);
    parts.push(`- **Hit rate:** ${(summary.cacheStats.hitRate * 100).toFixed(1)}%`);
    parts.push('');

    // File listing
    if (summary.summaries.length > 0) {
      parts.push('## Files\n');
      for (const s of summary.summaries) {
        const status = s.success ? '✓' : '✗';
        const cacheBadge = s.cached ? ' (cached)' : '';
        parts.push(
          `- ${status} **${s.subjectId}** (${s.mode}) — ` +
            `${this.formatBytes(s.fileSize)}, ${s.tokenCount} tokens${cacheBadge}`,
        );
        if (s.error) {
          parts.push(`  - ⚠️ ${s.error}`);
        }
      }
    }

    return parts.join('\n');
  }

  /**
   * Format the summary as a plain text string (no Markdown).
   *
   * @param summary - The summary to format.
   * @returns A plain text string.
   */
  formatPlain(summary: ExportSummary): string {
    const lines: string[] = [];

    lines.push('Export Summary');
    lines.push('='.repeat(40));
    lines.push(`Exported: ${summary.exportedAt}`);
    lines.push(`Duration: ${summary.durationMs}ms`);
    lines.push(`Total files: ${summary.totalFiles}`);
    lines.push(`Total bytes: ${this.formatBytes(summary.totalBytes)}`);
    lines.push(`Total tokens: ${summary.totalTokens.toLocaleString()}`);
    lines.push(`Successful: ${summary.successful}`);
    lines.push(`Failed: ${summary.failed}`);
    lines.push(`Cache hit rate: ${(summary.cacheStats.hitRate * 100).toFixed(1)}%`);
    lines.push('');

    for (const s of summary.summaries) {
      const status = s.success ? 'OK' : 'FAIL';
      lines.push(`  [${status}] ${s.subjectId} (${s.mode}) — ${this.formatBytes(s.fileSize)}`);
    }

    return lines.join('\n');
  }

  // ── Private ──

  /**
   * Format byte count to human-readable string.
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }
}
