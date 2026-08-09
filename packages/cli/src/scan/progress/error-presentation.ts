/**
 * Error Presentation — actionable error messages for scan issues.
 *
 * Structured errors with:
 * - Problem: What went wrong
 * - Reason: Why it happened
 * - Action: What the user can do about it
 *
 * Stack traces are never shown unless --verbose is enabled.
 *
 * @module @veris/cli/scan/progress
 */

import { getSymbolSet } from '../../ui/renderer/index.js';
import { getResolvedTheme, ansiReset } from '../../ui/theme/index.js';
import type { HealthIssue } from '../scan-session.js';

import type { ErrorInfo } from './renderer.js';

// ── Error Code Registry ──

interface ErrorDefinition {
  readonly problem: string;
  readonly reason: string;
  readonly action: string;
  readonly severity: 'warning' | 'error' | 'fatal';
}

const ERROR_REGISTRY: Record<string, ErrorDefinition> = Object.freeze({
  FILE_READ_ERROR: {
    problem: 'Cannot read file',
    reason: 'The file may be locked, missing, or inaccessible.',
    action: 'Check file permissions and ensure the file is not in use by another process.',
    severity: 'warning',
  },
  EXTRACTION_FAILED: {
    problem: 'Feature extraction failed',
    reason: 'An unexpected error occurred while extracting features from the file.',
    action: 'This file will be skipped. If the issue persists, verify the file is not corrupted.',
    severity: 'warning',
  },
  KNOWLEDGE_FAILED: {
    problem: 'Knowledge processing failed',
    reason: 'The knowledge engine encountered an error normalizing extracted features.',
    action: 'This file will be skipped. Try running with --verbose for more details.',
    severity: 'warning',
  },
  ANALYSIS_FAILED: {
    problem: 'Analysis failed',
    reason: 'An analyzer encountered an unexpected error.',
    action: 'This file will be skipped. If the issue persists, report it to the VERIS team.',
    severity: 'warning',
  },
  PERMISSION_DENIED: {
    problem: 'Permission denied',
    reason: 'VERIS does not have permission to read this file or directory.',
    action: 'Ensure the file is readable by the current user. Use sudo if necessary.',
    severity: 'error',
  },
  UNSUPPORTED_FILE: {
    problem: 'Unsupported file type',
    reason: 'This file type is not supported by any registered analyzer.',
    action: 'No action needed — unsupported files are skipped automatically.',
    severity: 'warning',
  },
  TIMEOUT: {
    problem: 'Processing timed out',
    reason: 'The file took too long to process.',
    action: 'Larger files may take longer. Increase the timeout in configuration if needed.',
    severity: 'warning',
  },
  DISCOVERY_ERROR: {
    problem: 'Discovery error',
    reason: 'An error occurred while discovering files.',
    action: 'Check the target path exists and is readable.',
    severity: 'error',
  },
  CLASSIFICATION_ERROR: {
    problem: 'Classification error',
    reason: 'File classification encountered an error.',
    action: 'This file will be skipped. Run with --verbose for details.',
    severity: 'warning',
  },
  PIPELINE_ERROR: {
    problem: 'Pipeline error',
    reason: 'The analysis pipeline encountered an unexpected error.',
    action: 'Run with --verbose for detailed error information.',
    severity: 'fatal',
  },
  EXPORT_ERROR: {
    problem: 'Export failed',
    reason: 'An error occurred while writing output files.',
    action: 'Check the output directory is writable and has sufficient disk space.',
    severity: 'error',
  },
  UNKNOWN_ERROR: {
    problem: 'Unknown error',
    reason: 'An unexpected error occurred.',
    action: 'Run with --verbose for detailed error information and report the issue.',
    severity: 'error',
  },
});

/**
 * Look up an error definition by code.
 */
export function getErrorDefinition(code: string): ErrorDefinition {
  return ERROR_REGISTRY[code] ?? ERROR_REGISTRY.UNKNOWN_ERROR;
}

/**
 * Format an error for user display.
 * Never includes stack traces — use --verbose for that.
 */
export function formatError(error: ErrorInfo, verbose?: boolean): string {
  const theme = getResolvedTheme();
  const R = ansiReset();
  const def = getErrorDefinition(error.code);

  const lines: string[] = [];

  // Severity badge
  const severityColor =
    def.severity === 'fatal'
      ? theme.severity.critical
      : def.severity === 'error'
        ? theme.status.error
        : theme.status.warning;
  const severityLabel = def.severity.toUpperCase();
  lines.push(`  ${severityColor}${severityLabel}${R} ${def.problem}`);

  // Reason
  lines.push(`    ${theme.ui.textDim}Reason: ${error.reason ?? def.reason}${R}`);

  // Action
  lines.push(`    ${theme.ui.textDim}Action: ${error.action ?? def.action}${R}`);

  // File path if available
  if (error.artifactPath) {
    lines.push(`    ${theme.ui.textDim}File: ${error.artifactPath}${R}`);
  }

  // Stack trace only in verbose mode
  if (verbose && error.stackTrace) {
    lines.push('');
    lines.push(`    ${theme.ui.textDim}Stack:${R}`);
    for (const stackLine of error.stackTrace.split('\n')) {
      lines.push(`      ${stackLine}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format a health issue for display.
 */
export function formatHealthIssue(issue: HealthIssue, verbose?: boolean): string {
  return formatError(
    {
      code: issue.code,
      message: issue.message,
      reason: undefined,
      action: undefined,
      artifactPath: issue.artifactPath,
      stackTrace: verbose ? undefined : undefined,
    },
    verbose,
  );
}

/**
 * Format a one-line error message for non-verbose mode.
 */
export function formatErrorLine(error: ErrorInfo): string {
  const theme = getResolvedTheme();
  const symbols = getSymbolSet();
  const R = ansiReset();
  const def = getErrorDefinition(error.code);

  const color =
    def.severity === 'fatal'
      ? theme.severity.critical
      : def.severity === 'error'
        ? theme.status.error
        : theme.status.warning;

  const path = error.artifactPath ? ` (${error.artifactPath})` : '';
  return `${color}${symbols.error}${R} ${def.problem}${path}`;
}

/**
 * Create an ErrorInfo from a generic Error object.
 */
export function errorFromException(
  error: unknown,
  code?: string,
  artifactPath?: string,
): ErrorInfo {
  const message = error instanceof Error ? error.message : String(error);
  const stackTrace = error instanceof Error ? error.stack : undefined;
  return {
    code: code ?? 'UNKNOWN_ERROR',
    message,
    reason: undefined,
    action: undefined,
    artifactPath,
    stackTrace,
  };
}

/**
 * Convert a HealthIssue to ErrorInfo.
 */
export function healthIssueToErrorInfo(issue: HealthIssue): ErrorInfo {
  return {
    code: issue.code,
    message: issue.message,
    artifactPath: issue.artifactPath,
    reason: undefined,
    action: undefined,
  };
}
