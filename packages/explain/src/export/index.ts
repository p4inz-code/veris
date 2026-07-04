/**
 * Export module — deterministic explanation export pipeline.
 *
 * M10A:
 * - {@link Exporter} — Orchestrator for all export formats
 * - {@link MarkdownExporter} — Premium Markdown with TOC and citations
 * - {@link JsonExporter} — Canonical JSON with stable key ordering
 * - {@link OutputWriter} — Atomic file writes with overwrite protection
 * - {@link ExplanationDocument} — Unified export document model
 * - {@link ExportOptions} — Export configuration and validation
 *
 * M10B:
 * - {@link ReportBuilder} / {@link ExplanationReport} — Aggregated export reports
 * - {@link BatchExporter} — Multi-explanation batch export
 * - {@link ExportSummaryBuilder} / {@link ExportSummary} — Human-readable summaries
 * - {@link ExportValidator} — Document and content validation
 * - {@link ManifestBuilder} / {@link ExportManifest} — File manifest generation
 *
 * All operations are PURELY DETERMINISTIC and offline-first.
 * No Date.now() — clock is injected via ExportOptions.
 *
 * @module @veris/explain/export
 */

// ── Export Options ──

export { DEFAULT_EXPORT_OPTIONS, validateExportOptions, SYSTEM_CLOCK } from './export-options.js';
export type {
  ExportFormat,
  JsonMode,
  Clock,
  ExportOptions,
  OptionSeverity,
  OptionIssue,
  OptionsValidationResult,
} from './export-options.js';

// ── Explanation Document ──

export {
  buildDocument,
  buildCitationEntries,
  buildSections,
  citationToEntry,
} from './explanation-document.js';
export type {
  DocumentSection,
  CitationEntry,
  ExportMetadata,
  ExplanationDocument,
} from './explanation-document.js';

// ── Output Writer ──

export { OutputWriter } from './output-writer.js';
export type { WriteResult } from './output-writer.js';

// ── Markdown Exporter ──

export { MarkdownExporter } from './markdown-exporter.js';

// ── JSON Exporter ──

export { JsonExporter } from './json-exporter.js';

// ── Exporter Orchestrator ──

export { Exporter } from './exporter.js';
export type {
  ExportResult,
  BatchExportResult,
  ExportReport,
  FullExportResult,
} from './exporter.js';

// ── M10B: Report Builder ──

export { ReportBuilder } from './report-builder.js';
export type { ReportStatistics, ReportEntry, ExplanationReport } from './report-builder.js';

// ── M10B: Batch Export ──

export { BatchExporter, DEFAULT_BATCH_OPTIONS } from './batch-export.js';
export type {
  BatchPhase,
  BatchProgress,
  ProgressCallback,
  BatchOptions,
  BatchEntry,
  BatchItemResult,
  BatchResult,
} from './batch-export.js';

// ── M10B: Export Summary ──

export { ExportSummaryBuilder } from './export-summary.js';
export type { SingleExportSummary, CacheStats, ExportSummary } from './export-summary.js';

// ── M10B: Export Validator ──

export { ExportValidator, isDocumentValid } from './export-validator.js';
export type {
  ValidationSeverity as ExportValidationSeverity,
  ValidationIssue as ExportValidationIssue,
  ValidationResult as ExportValidationResult,
} from './export-validator.js';

// ── M10B: Export Manifest ──

export { ManifestBuilder } from './export-manifest.js';
export type { ManifestEntry, ExportManifest, ManifestEntryInput } from './export-manifest.js';
