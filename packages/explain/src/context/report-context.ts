/**
 * Report context builder — transforms a canonical report summary into Explained types.
 *
 * Builds:
 * - ExplainedReportSummary (scan metadata, findings count by severity)
 *
 * @module @veris/explain/context/report-context
 */

import type { CanonicalReport } from '@veris/core';
import type { SeverityLevel } from '@veris/core';

import type { ExplainedReportSummary } from '../types/context.js';

/**
 * Build ExplainedReportSummary from a canonical CanonicalReport.
 *
 * Extracts:
 * - Total findings and artifacts
 * - Findings by severity
 * - Scan duration
 * - Scan timestamp
 *
 * @param report - The canonical report to summarize.
 * @returns ExplainedReportSummary with readonly fields.
 */
export function buildExplainedReportSummary(report: CanonicalReport): ExplainedReportSummary {
  const summary = report.summary;
  const session = report.session;

  return {
    totalFindings: summary.totalFindings,
    totalArtifacts: summary.totalArtifacts,
    findingsBySeverity: buildSeverityMap(report),
    scanDurationMs: summary.scanDurationMs,
    scanTimestamp: session.completedAt,
  };
}

/**
 * Build a severity map from the findings in the report.
 *
 * Counts findings by severity level. This is more accurate than
 * the summary's findingsBySeverity (which may use string keys).
 *
 * @param report - The canonical report.
 * @returns A record mapping severity levels to counts.
 */
function buildSeverityMap(report: CanonicalReport): Record<SeverityLevel, number> {
  const map: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  for (const finding of report.findings) {
    const level = finding.severity.level;
    map[level] = (map[level] ?? 0) + 1;
  }

  return Object.freeze(map) as Record<SeverityLevel, number>;
}

/**
 * Calculate the percentage of findings by severity.
 *
 * @param report - The canonical report.
 * @returns A record of severity percentages.
 */
export function calculateSeverityPercentages(report: CanonicalReport): Record<string, number> {
  const severityMap = buildSeverityMap(report);
  const total = report.findings.length;

  if (total === 0) {
    return { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  }

  const percentages: Record<string, number> = {};
  for (const [level, count] of Object.entries(severityMap)) {
    percentages[level] = Math.round((count / total) * 1000) / 10;
  }

  return percentages;
}
