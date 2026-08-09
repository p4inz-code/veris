/**
 * Scan Health Panel — displays scan health info.
 *
 * Shows:
 * - Total warnings, errors, fatal errors
 * - Permission denied count
 * - Unsupported files count
 * - Timeouts
 * - Recent issues list
 *
 * @module @veris/cli/scan/progress
 */

import { renderBox } from '../../ui/layout/index.js';
import { getSymbolSet } from '../../ui/renderer/index.js';
import { getResolvedTheme } from '../../ui/theme/index.js';
import { truncateStart } from '../../ui/utilities/index.js';
import type { HealthSummary, HealthIssue } from '../scan-session.js';

/** Options for the health panel. */
export interface HealthPanelOptions {
  readonly width?: number;
  readonly title?: string;
  readonly maxIssues?: number;
}

/**
 * Render the scan health panel as an array of lines.
 */
export function renderHealthPanel(
  health: HealthSummary,
  options: HealthPanelOptions = {},
): readonly string[] {
  const theme = getResolvedTheme();
  const symbols = getSymbolSet();
  const width = options.width;
  const title = options.title ?? 'Scan Health';
  const maxIssues = options.maxIssues ?? 5;

  // If no issues at all, show a clean bill of health
  if (health.issues.length === 0 && health.warnings === 0 && health.errors === 0) {
    return renderBox([` ${theme.status.success}${symbols.success}\\x1b[0m No issues`], {
      title: `${symbols.warning} ${title}`,
      width,
      padding: 0,
      showBottomBorder: true,
    });
  }

  const contentLines: string[] = [];

  // Summary row
  const summaryParts: string[] = [];
  if (health.fatalErrors > 0) {
    summaryParts.push(`${theme.severity.critical}${health.fatalErrors} fatal\\x1b[0m`);
  }
  if (health.errors > 0) {
    summaryParts.push(`${theme.status.error}${health.errors} errors\\x1b[0m`);
  }
  if (health.warnings > 0) {
    summaryParts.push(`${theme.status.warning}${health.warnings} warnings\\x1b[0m`);
  }
  if (health.permissionDenied > 0) {
    summaryParts.push(`${theme.ui.textDim}${health.permissionDenied} denied\\x1b[0m`);
  }
  if (health.unsupportedFiles > 0) {
    summaryParts.push(`${theme.ui.textDim}${health.unsupportedFiles} unsupported\\x1b[0m`);
  }
  if (health.timeouts > 0) {
    summaryParts.push(`${theme.status.warning}${health.timeouts} timeouts\\x1b[0m`);
  }

  if (summaryParts.length > 0) {
    contentLines.push(` ${summaryParts.join('  ')}`);
    contentLines.push('');
  }

  // Recent issues
  const recentIssues = health.issues.slice(-maxIssues);
  for (const issue of recentIssues) {
    const severityColor =
      issue.severity === 'fatal'
        ? theme.severity.critical
        : issue.severity === 'error'
          ? theme.status.error
          : theme.status.warning;

    const path = issue.artifactPath
      ? ` ${truncateStart(issue.artifactPath, Math.max(10, (width ?? 80) - 30))}`
      : '';

    contentLines.push(` ${severityColor}${symbols.bullet}\\x1b[0m ${issue.message}${path}`);
  }

  if (health.issues.length > maxIssues) {
    contentLines.push(
      ` ${theme.ui.textDim}... and ${health.issues.length - maxIssues} more issues\\x1b[0m`,
    );
  }

  return renderBox(contentLines, {
    title: `${symbols.warning} ${title}`,
    width,
    padding: 0,
    showBottomBorder: true,
  });
}

/**
 * Create a health issue.
 */
export function createHealthIssue(
  code: string,
  message: string,
  severity: 'warning' | 'error' | 'fatal',
  artifactPath?: string,
): HealthIssue {
  return Object.freeze<HealthIssue>({
    code,
    message,
    severity,
    recoverable: severity !== 'fatal',
    artifactPath,
    timestamp: Date.now(),
  });
}
