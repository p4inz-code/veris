/**
 * @veris/exporters — VERIS report serialization to multiple formats.
 *
 * Supported formats:
 * - JSON — Full structured report
 * - SARIF — Static Analysis Results Interchange Format
 * - HTML — Human-readable report
 * - Markdown — Developer-friendly report
 * - CSV — Tabular findings export
 * - JUnit — CI integration format
 *
 * ## Invariants
 * - Exporters never modify the report
 * - Exporters are deterministic (same report → same output)
 * - Every exporter is independently testable
 *
 * @module @veris/exporters
 */

import type { CanonicalReport, Finding } from '@veris/core';

// ── Exporter Interface ──

/** Options common to all exporters. */
export interface ExportOptions {
  readonly pretty?: boolean;
  readonly includeMetadata?: boolean;
  readonly maxFindings?: number;
}

/** Result of an export operation. */
export interface ExportResult {
  readonly format: string;
  readonly content: string;
  readonly reportId: string;
  readonly exportedAt: string;
}

/** Exporter interface — all exporters implement this. */
export interface Exporter {
  readonly format: string;
  export(report: CanonicalReport, options?: ExportOptions): ExportResult;
}

// ═══════════════════════════════════════════════════════════════════════════
// JSON Exporter
// ═══════════════════════════════════════════════════════════════════════════

class JsonExporterImpl implements Exporter {
  readonly format = 'json';

  export(report: CanonicalReport, options?: ExportOptions): ExportResult {
    const content = options?.pretty ? JSON.stringify(report, null, 2) : JSON.stringify(report);
    return {
      format: 'json',
      content,
      reportId: report.id,
      exportedAt: report.generatedAt,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Markdown Exporter
// ═══════════════════════════════════════════════════════════════════════════

class MarkdownExporterImpl implements Exporter {
  readonly format = 'markdown';

  export(report: CanonicalReport, options?: ExportOptions): ExportResult {
    const lines: string[] = [];
    const s = report.summary;

    lines.push(`# VERIS Scan Report: ${report.id}`);
    lines.push('');
    lines.push(`**Generated:** ${report.generatedAt}`);
    lines.push(`**Engine:** ${report.session.engineVersion}`);
    lines.push(`**Status:** ${report.session.status}`);
    lines.push('');

    // Summary section
    lines.push('## Summary');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Total Artifacts | ${s.totalArtifacts} |`);
    lines.push(`| Total Findings | ${s.totalFindings} |`);
    lines.push(`| Risk Score | ${s.riskScore.toFixed(2)} |`);
    lines.push(`| Trust Score | ${(s.trustScore * 100).toFixed(1)}% |`);
    lines.push(`| Behaviors Detected | ${s.behaviorsDetected} |`);
    lines.push('');

    // Findings by severity
    if (Object.keys(s.findingsBySeverity).length > 0) {
      lines.push('### Findings by Severity');
      lines.push('');
      lines.push('| Severity | Count |');
      lines.push('|----------|-------|');
      for (const [sev, count] of Object.entries(s.findingsBySeverity)) {
        lines.push(`| ${sev} | ${count} |`);
      }
      lines.push('');
    }

    // Findings section
    if (report.findings.length > 0) {
      const maxFindings = options?.maxFindings ?? report.findings.length;
      const findings = report.findings.slice(0, maxFindings);

      lines.push('## Findings');
      lines.push('');

      for (const finding of findings) {
        lines.push(`### ${finding.title}`);
        lines.push('');
        lines.push(`- **ID:** \`${finding.id}\``);
        lines.push(
          `- **Severity:** ${finding.severity.level} (${finding.severity.score.toFixed(1)})`,
        );
        lines.push(`- **Confidence:** ${(finding.confidence * 100).toFixed(1)}%`);
        lines.push(`- **Rule:** \`${finding.ruleId}\``);
        if (finding.description) {
          lines.push(`- **Description:** ${finding.description}`);
        }
        lines.push('');
      }
    }

    // Risk profile
    lines.push('## Risk Assessment');
    lines.push('');
    lines.push(`| Dimension | Value |`);
    lines.push(`|-----------|-------|`);
    lines.push(`| Risk Score | ${report.riskProfile.riskScore.toFixed(2)} / 10.0 |`);
    lines.push(`| Risk Level | ${report.riskProfile.riskLevel} |`);
    lines.push(
      `| Max Severity | ${report.riskProfile.maxSeverity.level} (${report.riskProfile.maxSeverity.score.toFixed(1)}) |`,
    );
    lines.push('');

    // Trust profile
    lines.push('## Trust Assessment');
    lines.push('');
    lines.push(`| Dimension | Value |`);
    lines.push(`|-----------|-------|`);
    lines.push(`| Trust Score | ${(report.trustProfile.trustScore * 100).toFixed(1)}% |`);
    lines.push(`| Finding Density | ${report.trustProfile.findingDensity.toFixed(4)} |`);
    lines.push('');

    const content = lines.join('\n');

    return {
      format: 'markdown',
      content,
      reportId: report.id,
      exportedAt: report.generatedAt,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HTML Exporter
// ═══════════════════════════════════════════════════════════════════════════

class HtmlExporterImpl implements Exporter {
  readonly format = 'html';

  export(report: CanonicalReport, options?: ExportOptions): ExportResult {
    const s = report.summary;
    const severityColors: Record<string, string> = {
      critical: '#dc3545',
      high: '#fd7e14',
      medium: '#ffc107',
      low: '#28a745',
      info: '#17a2b8',
    };

    const findingsRows = report.findings
      .slice(0, options?.maxFindings)
      .map((f) => {
        const color = severityColors[f.severity.level] ?? '#6c757d';
        return `<tr>
        <td><code>${escapeHtml(f.id)}</code></td>
        <td>${escapeHtml(f.title)}</td>
        <td><span style="color:${color};font-weight:bold">${f.severity.level}</span></td>
        <td>${(f.confidence * 100).toFixed(1)}%</td>
        <td><code>${escapeHtml(f.ruleId)}</code></td>
      </tr>`;
      })
      .join('\n          ');

    const severityRows = Object.entries(s.findingsBySeverity)
      .map(([sev, count]) => {
        const color = severityColors[sev] ?? '#6c757d';
        return `<tr><td style="color:${color}">${sev}</td><td>${count}</td></tr>`;
      })
      .join('\n          ');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VERIS Scan Report: ${escapeHtml(report.id)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 960px; margin: 0 auto; padding: 20px; }
    h1 { color: #1a1a2e; border-bottom: 2px solid #e9ecef; padding-bottom: 10px; }
    h2 { color: #16213e; margin-top: 30px; }
    table { border-collapse: collapse; width: 100%; margin: 15px 0; }
    th, td { border: 1px solid #dee2e6; padding: 8px 12px; text-align: left; }
    th { background-color: #f8f9fa; font-weight: 600; }
    tr:nth-child(even) { background-color: #f8f9fa; }
    code { background-color: #e9ecef; padding: 2px 4px; border-radius: 3px; font-size: 0.9em; }
    .meta { color: #6c757d; font-size: 0.9em; }
    .summary-card { background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 6px; padding: 20px; margin: 20px 0; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #dee2e6; font-size: 0.85em; color: #6c757d; }
  </style>
</head>
<body>
  <h1>VERIS Scan Report</h1>
  <p class="meta">Report ID: <code>${escapeHtml(report.id)}</code><br>
  Generated: ${report.generatedAt}<br>
  Engine: ${report.session.engineVersion}</p>

  <h2>Summary</h2>
  <div class="summary-card">
    <table>
      <tr><th>Metric</th><th>Value</th></tr>
      <tr><td>Total Artifacts</td><td>${s.totalArtifacts}</td></tr>
      <tr><td>Total Findings</td><td>${s.totalFindings}</td></tr>
      <tr><td>Risk Score</td><td>${s.riskScore.toFixed(2)} / 10.0</td></tr>
      <tr><td>Trust Score</td><td>${(s.trustScore * 100).toFixed(1)}%</td></tr>
      <tr><td>Behaviors Detected</td><td>${s.behaviorsDetected}</td></tr>
    </table>
  </div>

  <h2>Findings by Severity</h2>
  <table>
    <tr><th>Severity</th><th>Count</th></tr>
    ${severityRows}
  </table>

  <h2>Findings</h2>
  <table>
    <tr><th>ID</th><th>Title</th><th>Severity</th><th>Confidence</th><th>Rule</th></tr>
    ${findingsRows}
  </table>

  <h2>Risk Assessment</h2>
  <table>
    <tr><td>Risk Score</td><td>${report.riskProfile.riskScore.toFixed(2)} / 10.0</td></tr>
    <tr><td>Risk Level</td><td>${report.riskProfile.riskLevel}</td></tr>
    <tr><td>Max Severity</td><td>${report.riskProfile.maxSeverity.level} (${report.riskProfile.maxSeverity.score.toFixed(1)})</td></tr>
  </table>

  <h2>Trust Assessment</h2>
  <table>
    <tr><td>Trust Score</td><td>${(report.trustProfile.trustScore * 100).toFixed(1)}%</td></tr>
    <tr><td>Finding Density</td><td>${report.trustProfile.findingDensity.toFixed(4)}</td></tr>
  </table>

  <div class="footer">
    <p>Generated by VERIS ${report.session.engineVersion} | Schema ${report.session.schemaVersion}</p>
  </div>
</body>
</html>`;

    return {
      format: 'html',
      content: html,
      reportId: report.id,
      exportedAt: report.generatedAt,
    };
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ═══════════════════════════════════════════════════════════════════════════
// SARIF Exporter
// ═══════════════════════════════════════════════════════════════════════════

class SarifExporterImpl implements Exporter {
  readonly format = 'sarif';

  export(report: CanonicalReport, options?: ExportOptions): ExportResult {
    const sarifLog = {
      $schema:
        'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'VERIS',
              version: report.session.engineVersion,
              informationUri: 'https://github.com/veris/veris',
            },
          },
          results: report.findings.slice(0, options?.maxFindings).map((f) => ({
            ruleId: f.ruleId,
            level:
              f.severity.level === 'critical' || f.severity.level === 'high'
                ? 'error'
                : f.severity.level === 'medium'
                  ? 'warning'
                  : 'note',
            message: {
              text: f.title,
              ...(f.description ? { markdown: f.description } : {}),
            },
            properties: {
              findingId: f.id,
              confidence: f.confidence,
              severity: f.severity.level,
              severityScore: f.severity.score,
            },
          })),
          invocations: [
            {
              executionSuccessful: report.session.status === 'completed',
              startTimeUtc: report.session.startedAt,
              endTimeUtc: report.session.completedAt,
            },
          ],
          properties: {
            riskScore: report.riskProfile.riskScore,
            riskLevel: report.riskProfile.riskLevel,
            trustScore: report.trustProfile.trustScore,
          },
        },
      ],
    };

    const content = JSON.stringify(sarifLog, null, options?.pretty ? 2 : undefined);
    return {
      format: 'sarif',
      content,
      reportId: report.id,
      exportedAt: report.generatedAt,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CSV Exporter
// ═══════════════════════════════════════════════════════════════════════════

class CsvExporterImpl implements Exporter {
  readonly format = 'csv';

  export(report: CanonicalReport, options?: ExportOptions): ExportResult {
    const headers = [
      'ID',
      'Title',
      'Severity',
      'SeverityScore',
      'Confidence',
      'RuleID',
      'Description',
    ];
    const rows = report.findings
      .slice(0, options?.maxFindings)
      .map((f) => [
        csvEscape(f.id),
        csvEscape(f.title),
        csvEscape(f.severity.level),
        f.severity.score.toFixed(2),
        f.confidence.toFixed(4),
        csvEscape(f.ruleId),
        csvEscape(f.description),
      ]);

    const content = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    return {
      format: 'csv',
      content,
      reportId: report.id,
      exportedAt: report.generatedAt,
    };
  }
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ═══════════════════════════════════════════════════════════════════════════
// JUnit Exporter
// ═══════════════════════════════════════════════════════════════════════════

class JUnitExporterImpl implements Exporter {
  readonly format = 'junit';

  export(report: CanonicalReport, options?: ExportOptions): ExportResult {
    const findings = report.findings.slice(0, options?.maxFindings);

    const testCases = findings
      .map((f) => {
        const className = f.ruleId.replace(/[^a-zA-Z0-9_]/g, '_');
        const name = f.id;

        if (f.severity.level === 'critical' || f.severity.level === 'high') {
          return `    <testcase classname="${escapeXml(className)}" name="${escapeXml(name)}">
      <failure message="${escapeXml(f.title)}" type="${escapeXml(f.severity.level)}">
        ${escapeXml(f.description || 'No description')}
      </failure>
    </testcase>`;
        }

        return `    <testcase classname="${escapeXml(className)}" name="${escapeXml(name)}">
      <skipped message="${escapeXml(f.title)}"/>
    </testcase>`;
      })
      .join('\n');

    const failures = findings.filter(
      (f) => f.severity.level === 'critical' || f.severity.level === 'high',
    ).length;
    const skipped = findings.length - failures;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="veris.scan" tests="${findings.length}" failures="${failures}" skipped="${skipped}" errors="0" time="0">
  <properties>
    <property name="report.id" value="${escapeXml(report.id)}"/>
    <property name="risk.score" value="${report.riskProfile.riskScore}"/>
    <property name="risk.level" value="${report.riskProfile.riskLevel}"/>
    <property name="engine.version" value="${report.session.engineVersion}"/>
  </properties>
${testCases}
</testsuite>`;

    return {
      format: 'junit',
      content: xml,
      reportId: report.id,
      exportedAt: report.generatedAt,
    };
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/** Shared exporter instances (singletons). */
export const exporters: Record<string, Exporter> = {
  json: new JsonExporterImpl(),
  markdown: new MarkdownExporterImpl(),
  html: new HtmlExporterImpl(),
  sarif: new SarifExporterImpl(),
  csv: new CsvExporterImpl(),
  junit: new JUnitExporterImpl(),
};

/** Supported export format names. */
export const SUPPORTED_FORMATS = Object.freeze([
  'json',
  'markdown',
  'html',
  'sarif',
  'csv',
  'junit',
]);

/**
 * Export a report to a specific format.
 *
 * @param report - The canonical report to export.
 * @param format - Target format: "json", "markdown", "html", "sarif", "csv", or "junit".
 * @param options - Optional export options.
 * @returns The export result with content string.
 * @throws If the format is not supported.
 */
export function exportReport(
  report: CanonicalReport,
  format: string,
  options?: ExportOptions,
): ExportResult {
  const exporter = exporters[format.toLowerCase()];
  if (!exporter) {
    throw new Error(
      `Unsupported export format: "${format}". Supported: ${SUPPORTED_FORMATS.join(', ')}`,
    );
  }
  return exporter.export(report, options);
}

/**
 * Export a report to all supported formats.
 *
 * @param report - The canonical report to export.
 * @param options - Optional export options.
 * @returns A record mapping format names to export results.
 */
export function exportToAllFormats(
  report: CanonicalReport,
  options?: ExportOptions,
): Record<string, ExportResult> {
  const results: Record<string, ExportResult> = {};
  for (const format of Object.keys(exporters)) {
    results[format] = exporters[format].export(report, options);
  }
  return results;
}

/**
 * Check if a format is supported.
 */
export function isFormatSupported(format: string): boolean {
  return format.toLowerCase() in exporters;
}
