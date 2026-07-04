/**
 * Tests for M3 — Report context builder.
 *
 * Tests:
 * - ExplainedReportSummary construction
 * - Severity breakdown
 * - Severity percentages calculation
 *
 * @module @veris/explain/__tests__/unit/context/report-context.test
 */

import { describe, it, expect } from 'vitest';
import {
  buildExplainedReportSummary,
  calculateSeverityPercentages,
} from '../../../src/context/report-context.js';
import { simpleFindingReport } from '../../fixtures/reports/simple-finding.js';
import { multiFindingReport } from '../../fixtures/reports/multi-finding.js';
import { zeroEvidenceReport } from '../../fixtures/reports/edge-cases.js';

describe('buildExplainedReportSummary', () => {
  it('builds from simple report', () => {
    const summary = buildExplainedReportSummary(simpleFindingReport);
    expect(summary.totalFindings).toBe(1);
    expect(summary.totalArtifacts).toBe(1);
    expect(summary.findingsBySeverity.critical).toBe(1);
    expect(summary.scanDurationMs).toBe(5000);
  });

  it('builds from multi-finding report', () => {
    const summary = buildExplainedReportSummary(multiFindingReport);
    expect(summary.totalFindings).toBe(3);
    expect(summary.totalArtifacts).toBe(2);
    expect(summary.findingsBySeverity.critical).toBe(1);
    expect(summary.findingsBySeverity.high).toBe(1);
    expect(summary.findingsBySeverity.medium).toBe(1);
  });

  it('handles report with no findings', () => {
    const emptyReport = { ...zeroEvidenceReport, findings: [] };
    const reportWithEmpty = {
      ...emptyReport,
      summary: { ...emptyReport.summary, totalFindings: 0 },
    };
    const summary = buildExplainedReportSummary(reportWithEmpty as typeof zeroEvidenceReport);
    expect(summary.totalFindings).toBe(0);
    expect(summary.findingsBySeverity.critical).toBe(0);
    expect(summary.findingsBySeverity.high).toBe(0);
  });

  it('includes scan timestamp from session', () => {
    const summary = buildExplainedReportSummary(simpleFindingReport);
    expect(summary.scanTimestamp).toBeDefined();
    expect(summary.scanTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('calculateSeverityPercentages', () => {
  it('calculates percentages for single severity', () => {
    const pct = calculateSeverityPercentages(simpleFindingReport);
    expect(pct.critical).toBe(100);
  });

  it('calculates percentages for mixed severities', () => {
    const pct = calculateSeverityPercentages(multiFindingReport);
    expect(pct.critical).toBeCloseTo(33.3, 0);
    expect(pct.high).toBeCloseTo(33.3, 0);
    expect(pct.medium).toBeCloseTo(33.3, 0);
  });

  it('returns zeros for empty report', () => {
    const emptyReport = { ...zeroEvidenceReport, findings: [] };
    const pct = calculateSeverityPercentages(emptyReport as typeof zeroEvidenceReport);
    expect(pct.critical).toBe(0);
    expect(pct.high).toBe(0);
  });
});
