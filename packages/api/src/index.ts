/**
 * @veris/api — VERIS programmatic API.
 *
 * Primary client for integrating VERIS into applications.
 * Provides high-level functions that wrap the analysis pipeline,
 * report builder, and exporters.
 *
 * ## Functions
 * - scan() — Run a complete scan (discovery → analysis → report)
 * - analyze() — Run the deterministic analysis pipeline
 * - buildReport() — Convert PipelineResult to CanonicalReport
 * - exportReport() — Serialize a report to a specific format
 * - validate() — Validate configuration
 *
 * ## Invariants
 * - API is the public contract for programmatic use
 * - API never contains analysis logic — delegates to domain packages
 * - All outputs are frozen (immutable)
 * - Deterministic — same inputs produce same outputs
 *
 * @module @veris/api
 */

import { createAnalyzer, type PipelineConfig } from '@veris/analyzer';
import type { CanonicalReport } from '@veris/core';
import {
  exportReport,
  exportToAllFormats,
  isFormatSupported,
  type ExportResult,
  type ExportOptions,
} from '@veris/exporters';
import type { PipelineResult, PipelineInput } from '@veris/pipeline';
import { buildReport, type ReportBuilderOptions } from '@veris/report';

// ── Re-exported Types ──

export type { CanonicalReport } from '@veris/core';
export type { PipelineResult, PipelineInput, PipelineConfig } from '@veris/pipeline';
export type { ExportResult, ExportOptions } from '@veris/exporters';

// ═══════════════════════════════════════════════════════════════════════════
// scan
// ═══════════════════════════════════════════════════════════════════════════

/** Options for the scan function. */
export interface ScanApiOptions {
  /** Pipeline configuration. */
  readonly pipelineConfig?: PipelineConfig;
  /** Report builder options. */
  readonly reportOptions?: ReportBuilderOptions;
  /** Export format (default: "json"). */
  readonly format?: string;
  /** Export options. */
  readonly exportOptions?: ExportOptions;
}

/** Result of a scan operation. */
export interface ScanResult {
  /** The pipeline result (internal analysis output). */
  readonly pipelineResult: PipelineResult;
  /** The canonical report. */
  readonly report: CanonicalReport;
  /** The exported content. */
  readonly exportResult: ExportResult;
}

/**
 * Run a complete VERIS scan.
 *
 * Executes the full pipeline: Evidence → Rules → Correlation → Risk → Decision,
 * builds a CanonicalReport, and exports it to the specified format.
 *
 * @param input - The pipeline input (artifacts, evidence, features, sessionId).
 * @param options - Optional configuration overrides.
 * @returns A frozen ScanResult containing the pipeline result, report, and export.
 */
export async function scan(input: PipelineInput, options?: ScanApiOptions): Promise<ScanResult> {
  const pipeline = createAnalyzer({
    ...(options?.pipelineConfig ?? {}),
    riskEvaluator: {
      ...(options?.pipelineConfig?.riskEvaluator ?? {}),
      computedAt: options?.pipelineConfig?.riskEvaluator?.computedAt ?? new Date().toISOString(),
    },
  });

  const pipelineResult = await pipeline.run(input);
  const report = buildReport(pipelineResult, input, options?.reportOptions);

  const format = options?.format ?? 'json';
  const exportResult = exportReport(report, format, options?.exportOptions);

  return Object.freeze({
    pipelineResult: Object.freeze(pipelineResult),
    report: Object.freeze(report),
    exportResult: Object.freeze(exportResult),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// analyze
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run the deterministic analysis pipeline without building a report.
 *
 * Useful when you need raw pipeline output for custom processing.
 *
 * @param input - The pipeline input.
 * @param config - Optional pipeline configuration.
 * @returns The pipeline result with rule matches, correlations, and risk assessment.
 */
export async function analyze(
  input: PipelineInput,
  config?: PipelineConfig,
): Promise<PipelineResult> {
  const pipeline = createAnalyzer({
    ...(config ?? {}),
    riskEvaluator: {
      ...(config?.riskEvaluator ?? {}),
      computedAt: config?.riskEvaluator?.computedAt ?? new Date().toISOString(),
    },
  });

  return await pipeline.run(input);
}

// ═══════════════════════════════════════════════════════════════════════════
// buildReport
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a CanonicalReport from pipeline results.
 *
 * @param pipelineResult - The output of the analysis pipeline.
 * @param input - The original pipeline input.
 * @param options - Optional report builder options.
 * @returns A frozen CanonicalReport.
 */
export function buildApiReport(
  pipelineResult: PipelineResult,
  input?: PipelineInput,
  options?: ReportBuilderOptions,
): CanonicalReport {
  return buildReport(pipelineResult, input, options);
}

// ═══════════════════════════════════════════════════════════════════════════
// exportReport
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Export a CanonicalReport to a specified format.
 *
 * @param report - The canonical report to export.
 * @param format - Target format: "json", "markdown", "html", "sarif", "csv", "junit".
 * @param options - Optional export options.
 * @returns The export result.
 */
export function exportApiReport(
  report: CanonicalReport,
  format?: string,
  options?: ExportOptions,
): ExportResult {
  return exportReport(report, format ?? 'json', options);
}

/**
 * Export a CanonicalReport to all supported formats.
 *
 * @param report - The canonical report to export.
 * @param options - Optional export options.
 * @returns A record mapping format names to export results.
 */
export function exportToAllApiFormats(
  report: CanonicalReport,
  options?: ExportOptions,
): Record<string, ExportResult> {
  return exportToAllFormats(report, options);
}

/**
 * Check if an export format is supported.
 */
export { isFormatSupported };

// ═══════════════════════════════════════════════════════════════════════════
// validate
// ═══════════════════════════════════════════════════════════════════════════

/** Validation result. */
export interface ValidateResult {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

/**
 * Validate a VERIS configuration object.
 *
 * Checks for required fields, correct types, and valid ranges.
 *
 * @param config - The configuration object to validate.
 * @returns A validation result with issues if any.
 */
export function validate(config: Record<string, unknown>): ValidateResult {
  const issues: string[] = [];

  // Check required top-level fields
  if (config.version === undefined) {
    issues.push("Missing required field: 'version'");
  }

  // Check scan config
  if (config.scan && typeof config.scan === 'object') {
    const scan = config.scan as Record<string, unknown>;
    if (scan.target !== undefined && typeof scan.target !== 'string') {
      issues.push("'scan.target' must be a string");
    }
    if (
      scan.maxFindings !== undefined &&
      (typeof scan.maxFindings !== 'number' || scan.maxFindings < 0)
    ) {
      issues.push("'scan.maxFindings' must be a positive number");
    }
  }

  // Check output config
  if (config.output && typeof config.output === 'object') {
    const output = config.output as Record<string, unknown>;
    if (output.formats !== undefined) {
      if (!Array.isArray(output.formats)) {
        issues.push("'output.formats' must be an array");
      }
    }
  }

  // Check limits
  if (config.limits && typeof config.limits === 'object') {
    const limits = config.limits as Record<string, unknown>;
    if (limits.maxFileSize !== undefined && typeof limits.maxFileSize !== 'number') {
      issues.push("'limits.maxFileSize' must be a number");
    }
    if (limits.maxFilesPerScan !== undefined && typeof limits.maxFilesPerScan !== 'number') {
      issues.push("'limits.maxFilesPerScan' must be a number");
    }
  }

  return Object.freeze({
    valid: issues.length === 0,
    issues: Object.freeze(issues),
  });
}
