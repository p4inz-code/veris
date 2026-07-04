/**
 * Shared types for the export module.
 *
 * Extracted to break the circular dependency:
 *   batch-export.ts → exporter.ts → batch-export.ts
 *
 * @module @veris/explain/export/export-types
 */

import type { Explanation } from '../types/explanation.js';

// ── Batch Types ──

/** Phase of a batch export operation. */
export type BatchPhase =
  'building' | 'exporting' | 'writing' | 'validating' | 'manifest' | 'complete' | 'error';

/** Progress event emitted during batch export. */
export interface BatchProgress {
  readonly phase: BatchPhase;
  readonly current: number;
  readonly total: number;
  readonly subjectId: string;
  readonly format: string;
  readonly message?: string;
}

/** Progress callback type. */
export type ProgressCallback = (progress: BatchProgress) => void;

/** Options for batch export operations. */
export interface BatchOptions {
  /** Whether to continue exporting even if individual items fail. */
  readonly continueOnError: boolean;
  /** Progress callback invoked for each step. */
  readonly onProgress?: ProgressCallback;
}

/** A single entry in a batch export operation. */
export interface BatchEntry {
  readonly explanation: Explanation;
  readonly filePath: string;
}

/** Result of an individual batch export. */
export interface BatchItemResult {
  readonly subjectId: string;
  readonly format: string;
  readonly success: boolean;
  readonly filePath: string;
  readonly error?: string;
}

/** Complete batch export result. */
export interface BatchResult {
  readonly items: readonly BatchItemResult[];
  readonly totalCount: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly allSuccessful: boolean;
  readonly exportedAt: string;
}

/** Default batch options. */
export const DEFAULT_BATCH_OPTIONS: BatchOptions = {
  continueOnError: false,
};

// ── Minimal Export Interface ──

/**
 * Minimal interface for single-explanation export.
 *
 * Defined here to break the circular dependency:
 *   batch-export.ts → exporter.ts → batch-export.ts
 *
 * BatchExporter only needs the exportToFile method from Exporter.
 * The return type is the subset of ExportResult that BatchExporter
 * actually uses.
 */
export interface ExportToFile {
  exportToFile(
    explanation: Explanation,
    filePath: string,
  ): {
    readonly success: boolean;
    readonly format: string;
    readonly error?: string;
  };
}
