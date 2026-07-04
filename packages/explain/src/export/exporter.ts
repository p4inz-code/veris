/**
 * Exporter — orchestrates the explanation export pipeline.
 *
 * M10A: Single-explanation export (markdown, JSON, file I/O)
 * M10B: Batch exports, manifest generation, summary, validation
 *
 * All operations are PURELY DETERMINISTIC and offline-first.
 *
 * @module @veris/explain/export/exporter
 */

import type { Explanation } from '../types/explanation.js';

import { BatchExporter } from './batch-export.js';
import {
  buildDocument,
  type ExplanationDocument,
  type ExportMetadata,
} from './explanation-document.js';
import {
  ManifestBuilder,
  type ExportManifest,
  type ManifestEntry,
  type ManifestEntryInput,
} from './export-manifest.js';
import {
  DEFAULT_EXPORT_OPTIONS,
  validateExportOptions,
  type ExportOptions,
} from './export-options.js';
import {
  ExportSummaryBuilder,
  type ExportSummary,
  type SingleExportSummary,
} from './export-summary.js';
import type { BatchOptions, BatchEntry, BatchResult, BatchItemResult } from './export-types.js';
import {
  ExportValidator,
  type ValidationResult,
  type ValidationIssue,
} from './export-validator.js';
import { JsonExporter } from './json-exporter.js';
import { MarkdownExporter } from './markdown-exporter.js';
import { OutputWriter, type WriteResult } from './output-writer.js';
import { ReportBuilder, type ExplanationReport, type ReportEntry } from './report-builder.js';

// ── Export Result ──

/** Result of a single export operation. */
export interface ExportResult {
  readonly success: boolean;
  readonly format: string;
  readonly content: string;
  readonly writeResult?: WriteResult;
  readonly error?: string;
  readonly document?: ExplanationDocument;
}

/** Combined result of exporting to multiple formats. */
export interface BatchExportResult {
  readonly results: readonly ExportResult[];
  readonly allSuccessful: boolean;
}

// ── Export Report ──

/** Summary of an export operation. */
export interface ExportReport {
  readonly success: boolean;
  readonly format: string;
  readonly contentLength: number;
  readonly lineCount: number;
  readonly schemaVersion: string;
  readonly exportedAt: string;
}

// ── Full Export Result (M10B) ──

/** Complete result of a full export pipeline run. */
export interface FullExportResult {
  readonly exportResults: readonly ExportResult[];
  readonly batchResult?: BatchResult;
  readonly report?: ExplanationReport;
  readonly summary?: ExportSummary;
  readonly manifest?: ExportManifest;
  readonly validation?: ValidationResult;
  readonly allSuccessful: boolean;
}

// ── Exporter ──

/**
 * Orchestrates the export pipeline for explanations.
 *
 * M10A:
 * - `exportToString()` — format as string without I/O
 * - `exportToFile()` — write single explanation to file
 * - `exportToFiles()` — write to multiple formats
 * - `generateReport()` — lightweight export report
 *
 * M10B:
 * - `exportBatch()` — batch export with progress
 * - `buildReport()` — build aggregated ExplanationReport
 * - `buildSummary()` — build human-readable summary
 * - `buildManifest()` — build manifest.json
 * - `validateDocument()` — validate exported document
 * - `exportFull()` — complete pipeline (export + report + summary + manifest + validate)
 */
export class Exporter {
  private readonly options: ExportOptions;
  private readonly writer: OutputWriter;
  private readonly markdown: MarkdownExporter;
  private readonly json: JsonExporter;
  private readonly reportBuilder: ReportBuilder;
  private readonly summaryBuilder: ExportSummaryBuilder;
  private readonly validator: ExportValidator;
  private readonly manifestBuilder: ManifestBuilder;

  constructor(options?: Partial<ExportOptions>) {
    this.options = { ...DEFAULT_EXPORT_OPTIONS, ...options };

    // Validate options at construction
    const validation = validateExportOptions(this.options);
    if (!validation.valid) {
      const errors = validation.issues.filter((i) => i.severity === 'error').map((i) => i.message);
      if (errors.length > 0) {
        throw new Error(`Invalid export options:\n${errors.join('\n')}`);
      }
    }

    this.writer = new OutputWriter(this.options.encoding);
    this.markdown = new MarkdownExporter(this.options);
    this.json = new JsonExporter(this.options);
    this.reportBuilder = new ReportBuilder(this.options.clock, this.options.schemaVersion, '1.0.0');
    this.summaryBuilder = new ExportSummaryBuilder(this.options.clock, this.options);
    this.validator = new ExportValidator();
    this.manifestBuilder = new ManifestBuilder(this.options.clock, this.options.schemaVersion);
  }

  // ── M10A: Single Export ──

  /**
   * Export an explanation as a formatted string.
   */
  exportToString(explanation: Explanation): string {
    const document = this.buildDocument(explanation);

    switch (this.options.format) {
      case 'markdown':
        return this.markdown.export(document);
      case 'json':
        return this.json.export(document);
    }
  }

  /**
   * Export an explanation to a file.
   */
  exportToFile(explanation: Explanation, filePath: string): ExportResult {
    const document = this.buildDocument(explanation);
    const content = this.formatDocument(document);
    const writeResult = this.writer.write(filePath, content, this.options.overwrite);

    return {
      success: writeResult.success,
      format: this.options.format,
      content,
      writeResult,
      error: writeResult.error,
      document,
    };
  }

  /**
   * Export an explanation to multiple files in different formats.
   */
  exportToFiles(
    explanation: Explanation,
    filePaths: Partial<Record<string, string>>,
  ): BatchExportResult {
    const results: ExportResult[] = [];
    const formats = Object.keys(filePaths) as string[];

    for (const format of formats) {
      const path = filePaths[format]!;
      const subExporter = new Exporter({ ...this.options, format: format as 'markdown' | 'json' });
      const result = subExporter.exportToFile(explanation, path);
      results.push(result);
    }

    return {
      results,
      allSuccessful: results.every((r) => r.success),
    };
  }

  /**
   * Generate an export report for an explanation.
   */
  generateReport(explanation: Explanation): ExportReport {
    const content = this.exportToString(explanation);
    const timestamp = this.options.clock.now().toISOString();

    return {
      success: true,
      format: this.options.format,
      contentLength: Buffer.byteLength(content, this.options.encoding),
      lineCount: content.split('\n').length,
      schemaVersion: this.options.schemaVersion,
      exportedAt: timestamp,
    };
  }

  // ── M10B: Batch Export ──

  /**
   * Export multiple explanations to files with optional progress reporting.
   *
   * @param entries - The entries to export (explanation + file path).
   * @param batchOptions - Batch options (continueOnError, onProgress).
   * @returns Batch export result.
   */
  exportBatch(entries: readonly BatchEntry[], batchOptions?: Partial<BatchOptions>): BatchResult {
    const batch = new BatchExporter(this, batchOptions, this.options.clock);
    return batch.exportAll(entries);
  }

  /**
   * Build an aggregated ExplanationReport from exported documents.
   *
   * @param documents - The exported documents.
   * @param filePaths - Map of document key to file path.
   * @param fileSizes - Map of document key to file size.
   * @returns An ExplanationReport.
   */
  buildReport(
    documents: readonly ExplanationDocument[],
    filePaths: ReadonlyMap<string, string>,
    fileSizes: ReadonlyMap<string, number>,
  ): ExplanationReport {
    return this.reportBuilder.build(documents, filePaths, fileSizes);
  }

  /**
   * Build an empty ExplanationReport.
   *
   * @returns An empty ExplanationReport.
   */
  buildEmptyReport(): ExplanationReport {
    return this.reportBuilder.buildEmpty();
  }

  // ── M10B: Summary ──

  /**
   * Build an export summary from individual export results.
   *
   * @param summaries - Individual single-export summaries.
   * @param durationMs - Duration of the export operation.
   * @returns An ExportSummary.
   */
  buildSummary(summaries: readonly SingleExportSummary[], durationMs: number): ExportSummary {
    return this.summaryBuilder.buildComplete(summaries, durationMs);
  }

  /**
   * Build a single-export summary.
   *
   * @param document - The exported document.
   * @param filePath - The output file path.
   * @param fileSize - The file size in bytes.
   * @param success - Whether the export was successful.
   * @param error - Optional error message.
   * @returns A SingleExportSummary.
   */
  buildSingleSummary(
    document: ExplanationDocument,
    filePath: string,
    fileSize: number,
    success: boolean,
    error?: string,
  ): SingleExportSummary {
    return this.summaryBuilder.buildSingle(document, filePath, fileSize, success, error);
  }

  /**
   * Format an export summary as Markdown.
   *
   * @param summary - The summary to format.
   * @returns A human-readable Markdown string.
   */
  formatSummaryMarkdown(summary: ExportSummary): string {
    return this.summaryBuilder.formatMarkdown(summary);
  }

  /**
   * Format an export summary as plain text.
   *
   * @param summary - The summary to format.
   * @returns A plain text string.
   */
  formatSummaryPlain(summary: ExportSummary): string {
    return this.summaryBuilder.formatPlain(summary);
  }

  // ── M10B: Manifest ──

  /**
   * Build an export manifest.
   *
   * @param entries - Manifest entry inputs.
   * @param baseDir - Base directory for relative paths.
   * @returns An ExportManifest.
   */
  buildManifest(entries: ManifestEntryInput[], baseDir: string): ExportManifest {
    return this.manifestBuilder.build(entries, baseDir);
  }

  /**
   * Compute SHA-256 hash of content.
   *
   * @param content - The content to hash.
   * @returns Hex-encoded SHA-256 hash.
   */
  computeHash(content: string): string {
    return this.manifestBuilder.computeHash(content);
  }

  // ── M10B: Validation ──

  /**
   * Validate an exported document.
   *
   * @param document - The document to validate.
   * @returns Validation result.
   */
  validateDocument(document: ExplanationDocument): ValidationResult {
    return this.validator.validateDocument(document);
  }

  /**
   * Validate markdown content.
   *
   * @param markdown - The markdown content to validate.
   * @returns Any validation issues found.
   */
  validateMarkdown(markdown: string): readonly ValidationIssue[] {
    return this.validator.validateMarkdown(markdown);
  }

  /**
   * Validate JSON content.
   *
   * @param json - The JSON content to validate.
   * @returns Any validation issues found.
   */
  validateJson(json: string): readonly ValidationIssue[] {
    return this.validator.validateJson(json);
  }

  // ── M10B: Full Pipeline ──

  /**
   * Run the full export pipeline.
   *
   * For each explanation:
   * 1. Build ExplanationDocument
   * 2. Format (Markdown or JSON)
   * 3. Write to file
   * 4. Validate
   *
   * Then aggregate:
   * 5. Build report
   * 6. Build summary
   * 7. Build manifest
   *
   * @param entries - Batch entries to export.
   * @param batchOptions - Optional batch options.
   * @returns Full export result with all outputs.
   */
  exportFull(
    entries: readonly BatchEntry[],
    batchOptions?: Partial<BatchOptions>,
  ): FullExportResult {
    const batchResult = this.exportBatch(entries, batchOptions);
    const exportResults: ExportResult[] = [];

    const documents: ExplanationDocument[] = [];
    const filePaths = new Map<string, string>();
    const fileSizes = new Map<string, number>();
    const summaries: SingleExportSummary[] = [];
    const manifestEntries: ManifestEntryInput[] = [];

    for (const item of batchResult.items) {
      const entry = entries.find((e) => e.explanation.subjectId === item.subjectId);
      if (!entry) continue;

      const doc = this.buildDocument(entry.explanation);
      documents.push(doc);

      const key = `${entry.explanation.subjectId}::${entry.explanation.mode}`;
      filePaths.set(key, item.filePath);
      fileSizes.set(key, 0); // File size tracked separately in report

      const summary = this.summaryBuilder.buildSingle(
        doc,
        item.filePath,
        0,
        item.success,
        item.error,
      );
      summaries.push(summary);

      if (item.success) {
        const content = this.formatDocument(doc);
        const contentBytes = Buffer.byteLength(content, this.options.encoding);
        manifestEntries.push({
          absolutePath: item.filePath,
          hash: this.manifestBuilder.computeHash(content),
          size: contentBytes,
          format: this.options.format,
          subjectId: item.subjectId,
        });
      }

      // Build export result
      exportResults.push({
        success: item.success,
        format: this.options.format,
        content: '',
        error: item.error,
        document: doc,
      });
    }

    const report =
      documents.length > 0
        ? this.reportBuilder.build(documents, filePaths, fileSizes)
        : this.reportBuilder.buildEmpty();

    const summary = this.summaryBuilder.buildComplete(summaries, 0);

    // Validate first document if any
    let validation: ValidationResult | undefined;
    if (documents.length > 0) {
      validation = this.validator.validateDocument(documents[0]);
    }

    const manifest = this.manifestBuilder.build(manifestEntries, process.cwd());

    return {
      exportResults,
      batchResult,
      report,
      summary,
      manifest,
      validation,
      allSuccessful: batchResult.allSuccessful,
    };
  }

  // ── Private ──

  /**
   * Build the ExplanationDocument from an Explanation.
   */
  private buildDocument(explanation: Explanation): ExplanationDocument {
    const metadata: ExportMetadata = {
      exportedAt: this.options.clock.now().toISOString(),
      schemaVersion: this.options.schemaVersion,
      engineVersion: explanation.promptVersion,
    };

    return buildDocument(explanation, metadata);
  }

  /**
   * Format a document using the current format.
   */
  private formatDocument(document: ExplanationDocument): string {
    switch (this.options.format) {
      case 'markdown':
        return this.markdown.export(document);
      case 'json':
        return this.json.export(document);
    }
  }
}
