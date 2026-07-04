/**
 * Report builder — builds final ExplanationReport from exported explanations.
 *
 * Aggregates multiple ExplanationDocuments into a single report with:
 * - Stable ordering by subjectId
 * - Aggregated statistics
 * - Export metadata
 * - Deterministic output
 *
 * @module @veris/explain/export/report-builder
 */

import type { ExplanationDocument } from './explanation-document.js';
import type { Clock } from './export-options.js';

// ── Report Statistics ──

/** Aggregated statistics for a batch of exported explanations. */
export interface ReportStatistics {
  readonly totalExplanations: number;
  readonly totalTokens: number;
  readonly totalCitations: number;
  readonly totalCached: number;
  readonly totalRefused: number;
  readonly totalBytes: number;
  readonly modeBreakdown: Record<string, number>;
}

// ── Explanation Report ──

/** A single entry in the explanation report. */
export interface ReportEntry {
  readonly subjectId: string;
  readonly subjectType: string;
  readonly mode: string;
  readonly format: string;
  readonly filePath: string;
  readonly fileSize: number;
  readonly tokenCount: number;
  readonly cached: boolean;
  readonly refused: boolean;
  readonly citationCount: number;
}

/** Complete aggregated export report. */
export interface ExplanationReport {
  readonly exportedAt: string;
  readonly schemaVersion: string;
  readonly engineVersion: string;
  readonly totalExplanations: number;
  readonly statistics: ReportStatistics;
  readonly entries: readonly ReportEntry[];
}

// ── Report Builder ──

/**
 * Builds ExplanationReport from exported ExplanationDocuments.
 *
 * All ordering is deterministic (stable by subjectId).
 * No Date.now() — clock is injected.
 */
export class ReportBuilder {
  private readonly clock: Clock;
  private readonly schemaVersion: string;
  private readonly engineVersion: string;

  constructor(clock: Clock, schemaVersion: string, engineVersion: string) {
    this.clock = clock;
    this.schemaVersion = schemaVersion;
    this.engineVersion = engineVersion;
  }

  /**
   * Build a report from a list of explanation documents.
   *
   * @param documents - The exported documents to aggregate.
   * @param filePaths - Map of document ID to file path.
   * @param fileSizes - Map of document ID to file size in bytes.
   * @returns A complete ExplanationReport.
   */
  build(
    documents: readonly ExplanationDocument[],
    filePaths: ReadonlyMap<string, string>,
    fileSizes: ReadonlyMap<string, number>,
  ): ExplanationReport {
    const entries: ReportEntry[] = documents.map((doc) => {
      const tokens = doc.tokenUsage.totalTokens;
      const key = `${doc.explanation.subjectId}::${doc.explanation.mode}`;

      return {
        subjectId: doc.explanation.subjectId,
        subjectType: doc.explanation.subjectType,
        mode: doc.explanation.mode,
        format: 'markdown',
        filePath: filePaths.get(key) ?? '',
        fileSize: fileSizes.get(key) ?? 0,
        tokenCount: tokens,
        cached: doc.cached,
        refused: doc.refused,
        citationCount: doc.citations.length,
      };
    });

    const sortedEntries = this.sortEntries(entries);

    const statistics = this.computeStatistics(sortedEntries);

    return {
      exportedAt: this.clock.now().toISOString(),
      schemaVersion: this.schemaVersion,
      engineVersion: this.engineVersion,
      totalExplanations: sortedEntries.length,
      statistics,
      entries: sortedEntries,
    };
  }

  /**
   * Build an empty report (no explanations).
   *
   * @returns An empty ExplanationReport.
   */
  buildEmpty(): ExplanationReport {
    return {
      exportedAt: this.clock.now().toISOString(),
      schemaVersion: this.schemaVersion,
      engineVersion: this.engineVersion,
      totalExplanations: 0,
      statistics: this.computeStatistics([]),
      entries: [],
    };
  }

  // ── Private ──

  /**
   * Sort entries deterministically by subjectId, then mode.
   */
  private sortEntries(entries: readonly ReportEntry[]): readonly ReportEntry[] {
    return [...entries].sort((a, b) => {
      const byId = a.subjectId.localeCompare(b.subjectId);
      if (byId !== 0) return byId;
      return a.mode.localeCompare(b.mode);
    });
  }

  /**
   * Compute aggregate statistics from entries.
   */
  private computeStatistics(entries: readonly ReportEntry[]): ReportStatistics {
    const modeBreakdown: Record<string, number> = {};
    let totalTokens = 0;
    let totalCitations = 0;
    let totalCached = 0;
    let totalRefused = 0;
    let totalBytes = 0;

    for (const entry of entries) {
      totalTokens += entry.tokenCount;
      totalCitations += entry.citationCount;
      totalBytes += entry.fileSize;

      if (entry.cached) totalCached++;
      if (entry.refused) totalRefused++;

      modeBreakdown[entry.mode] = (modeBreakdown[entry.mode] ?? 0) + 1;
    }

    return {
      totalExplanations: entries.length,
      totalTokens,
      totalCitations,
      totalCached,
      totalRefused,
      totalBytes,
      modeBreakdown,
    };
  }
}
