/**
 * @veris/cli/dashboard/generator — Generates visual investigation dashboard HTML.
 *
 * Implements Section 2 & 3 of ADR-017:
 * - Safe canonical report ingestion with size ceiling (50MB)
 * - View model aggregation with risk, trust, and finding metrics
 * - Single-file standalone HTML artifact generation
 *
 * @module @veris/cli/dashboard/generator
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { CanonicalReport, Finding } from '@veris/core';

import { renderDashboardHtml } from './template.js';
import type { DashboardOptions, DashboardViewModel } from './types.js';

export const MAX_REPORT_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB limit

/**
 * Loads, verifies, and parses a CanonicalReport from disk with safety bounds.
 */
export function loadReportSafely(reportPath: string): CanonicalReport {
  const resolved = path.resolve(reportPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Report file not found: ${resolved}`);
  }

  const stats = fs.statSync(resolved);
  if (stats.size > MAX_REPORT_SIZE_BYTES) {
    throw new Error(
      `Report file size (${(stats.size / 1024 / 1024).toFixed(1)}MB) exceeds maximum limit of 50MB.`,
    );
  }

  const raw = fs.readFileSync(resolved, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse report JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const report = parsed as CanonicalReport;
  if (!report || typeof report !== 'object') {
    throw new Error('Invalid report: top-level JSON must be an object.');
  }

  if (!report.id || !Array.isArray(report.findings)) {
    throw new Error('Invalid canonical report: missing required "id" or "findings" array.');
  }

  return report;
}

/**
 * Computes presentation metrics from a CanonicalReport.
 */
export function buildDashboardViewModel(report: CanonicalReport): DashboardViewModel {
  const findings: readonly Finding[] = report.findings ?? [];
  const artifacts = report.artifacts ?? [];

  const counts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  let totalEvidence = 0;

  for (const finding of findings) {
    const findingRecord = finding as unknown as Record<string, unknown>;
    const sevRaw = findingRecord.severity;
    let sev = 'info';
    if (typeof sevRaw === 'string') {
      sev = sevRaw.toLowerCase();
    } else if (sevRaw && typeof sevRaw === 'object' && 'level' in sevRaw) {
      sev = String((sevRaw as { level: unknown }).level).toLowerCase();
    }

    switch (sev) {
      case 'critical':
        counts.critical++;
        break;
      case 'high':
        counts.high++;
        break;
      case 'medium':
        counts.medium++;
        break;
      case 'low':
        counts.low++;
        break;
      case 'info':
      default:
        counts.info++;
        break;
    }

    if (Array.isArray(findingRecord.evidence)) {
      totalEvidence += findingRecord.evidence.length;
    } else if (Array.isArray(findingRecord.evidenceIds)) {
      totalEvidence += (findingRecord.evidenceIds as readonly unknown[]).length;
    }
  }

  const reportRecord = report as unknown as Record<string, unknown>;
  const summaryRecord = (report.summary as unknown as Record<string, unknown>) ?? {};
  const sessionRecord = (reportRecord.session as unknown as Record<string, unknown>) ?? {};

  const durationMs =
    (typeof summaryRecord.scanDurationMs === 'number' ? summaryRecord.scanDurationMs : undefined) ??
    (typeof summaryRecord.durationMs === 'number' ? summaryRecord.durationMs : undefined) ??
    (typeof sessionRecord.durationMs === 'number' ? sessionRecord.durationMs : undefined);

  let durationFormatted = 'N/A';
  if (typeof durationMs === 'number' && durationMs >= 0) {
    durationFormatted =
      durationMs >= 1000 ? `${(durationMs / 1000).toFixed(2)}s` : `${durationMs}ms`;
  }

  const targetPath =
    (typeof sessionRecord.targetPath === 'string' ? sessionRecord.targetPath : undefined) ??
    (typeof summaryRecord.targetPath === 'string' ? summaryRecord.targetPath : undefined) ??
    (typeof reportRecord.target === 'string' ? reportRecord.target : undefined) ??
    'Target Workspace';

  const riskProfile = reportRecord.riskProfile as Record<string, unknown> | undefined;
  const riskObj = reportRecord.risk as Record<string, unknown> | undefined;

  const riskScore =
    (typeof riskObj?.score === 'number' ? riskObj.score : undefined) ??
    (typeof riskProfile?.riskScore === 'number' ? riskProfile.riskScore : undefined) ??
    (typeof summaryRecord.riskScore === 'number' ? summaryRecord.riskScore : undefined) ??
    0;

  const riskLevel =
    (typeof riskObj?.level === 'string' ? riskObj.level : undefined) ??
    (typeof riskProfile?.riskLevel === 'string'
      ? riskProfile.riskLevel.toUpperCase()
      : undefined) ??
    'UNKNOWN';

  const confidenceScore =
    (typeof riskObj?.confidence === 'number' ? riskObj.confidence : undefined) ?? 1.0;

  const trustObj = reportRecord.trust as Record<string, unknown> | undefined;
  const trustProfile = reportRecord.trustProfile as Record<string, unknown> | undefined;

  const trustScore =
    (typeof trustObj?.score === 'number' ? trustObj.score : undefined) ??
    (typeof trustProfile?.trustScore === 'number'
      ? Math.round(trustProfile.trustScore * 100)
      : undefined) ??
    (typeof summaryRecord.trustScore === 'number'
      ? Math.round(summaryRecord.trustScore * 100)
      : 100);

  return {
    report,
    generatedAt: new Date().toISOString(),
    severityCounts: counts,
    totalFindings: findings.length,
    riskScore,
    riskLevel,
    confidenceScore,
    trustScore,
    artifactCount: artifacts.length,
    evidenceCount: totalEvidence,
    targetPath,
    durationFormatted,
  };
}

/**
 * Generates the dashboard HTML, optionally writing it to disk.
 */
export async function generateDashboard(
  options: DashboardOptions,
): Promise<{ html: string; outputPath?: string; viewModel: DashboardViewModel }> {
  const report = loadReportSafely(options.reportPath);
  const viewModel = buildDashboardViewModel(report);
  const html = renderDashboardHtml(viewModel);

  let outputPath: string | undefined;

  if (options.output) {
    outputPath = path.resolve(options.output);
    const parentDir = path.dirname(outputPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, html, 'utf-8');
  }

  return { html, outputPath, viewModel };
}
