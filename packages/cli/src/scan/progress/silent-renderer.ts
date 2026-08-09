/**
 * Silent Progress Renderer.
 *
 * Only outputs:
 * - Critical/fatal errors
 * - Final summary
 *
 * No animations, no dashboard, no progress updates.
 * Also used when output is piped / non-TTY.
 *
 * Usage: veris scan --silent
 *
 * @module @veris/cli/scan/progress
 */

import { getSymbolSet } from '../../ui/renderer/index.js';
import { getResolvedTheme } from '../../ui/theme/index.js';
import type { ProfilerSnapshot } from '../profiler.js';
import type { ScanSession, CurrentFile, HealthIssue, ScanSummary } from '../scan-session.js';
import type { StageStatus } from '../scan-session.js';

import { formatError } from './error-presentation.js';
import type {
  ProgressRenderer,
  ProgressUpdate,
  ErrorInfo,
  StageUpdate,
  StartContext,
} from './renderer.js';

/** Silent mode — only errors and final summary. */
export class SilentRenderer implements ProgressRenderer {
  readonly supportsAnimation = false;
  private readonly errors: ErrorInfo[] = [];
  private readonly fatalErrors: ErrorInfo[] = [];
  private warnings: number = 0;
  private finalSummary: string = '';

  onStart(_session: ScanSession, _context?: StartContext): void {
    // Silent — no startup output
  }

  onProgress(_update: ProgressUpdate): void {
    // Silent — no progress updates
  }

  onStageChange(_stage: string, _status: StageStatus, _timing?: StageUpdate): void {
    // Silent — no stage output
  }

  onFileStart(_file: CurrentFile): void {
    // Silent — no file output
  }

  onFileComplete(_file: CurrentFile, _durationMs: number, _success: boolean): void {
    // Silent — no file output
  }

  onHealthIssue(issue: HealthIssue): void {
    if (issue.severity === 'fatal') {
      const theme = getResolvedTheme();
      const symbols = getSymbolSet();
      process.stderr.write(`${theme.status.error}${symbols.error}\x1b[0m ${issue.message}\n`);
    }
    if (issue.severity === 'warning') {
      this.warnings++;
    }
  }

  onError(error: ErrorInfo): void {
    const def = this.getErrorDef(error.code);
    if (def === 'fatal') {
      this.fatalErrors.push(error);
      process.stderr.write(formatError(error) + '\n');
    } else {
      this.errors.push(error);
    }
  }

  onComplete(session: ScanSession, summary: ScanSummary): void {
    this.finalSummary = this.buildSummary(session, summary);
    process.stdout.write(this.finalSummary);
  }

  onCancel(session: ScanSession): void {
    const theme = getResolvedTheme();
    const symbols = getSymbolSet();
    const lines: string[] = [
      '',
      `${theme.status.warning}${symbols.warning}\x1b[0m Scan cancelled.`,
    ];
    if (session.filesProcessed > 0) {
      lines.push(`  Files processed: ${session.filesProcessed}`);
    }
    if (session.elapsedMs > 0) {
      lines.push(`  Elapsed: ${formatDuration(session.elapsedMs)}`);
    }
    if (session.diagnostics.length > 0) {
      lines.push(`  Diagnostics: ${session.diagnostics.length}`);
    }
    lines.push('');
    const output = lines.join('\n');
    this.finalSummary = output;
    process.stdout.write(output);
  }

  onProfilerSnapshot(_snapshot: ProfilerSnapshot): void {
    // Silent mode doesn't display profiler data
  }

  getFinalSummary(): string {
    return this.finalSummary;
  }

  dispose(): void {
    // No resources to clean up
  }

  // ── Private ──

  private getErrorDef(code: string): 'warning' | 'error' | 'fatal' {
    const map: Record<string, 'warning' | 'error' | 'fatal'> = {
      FILE_READ_ERROR: 'warning',
      EXTRACTION_FAILED: 'warning',
      KNOWLEDGE_FAILED: 'warning',
      ANALYSIS_FAILED: 'warning',
      PERMISSION_DENIED: 'error',
      UNSUPPORTED_FILE: 'warning',
      TIMEOUT: 'warning',
      DISCOVERY_ERROR: 'error',
      CLASSIFICATION_ERROR: 'warning',
      PIPELINE_ERROR: 'fatal',
      EXPORT_ERROR: 'error',
      UNKNOWN_ERROR: 'error',
    };
    return map[code] ?? 'error';
  }

  /**
   * Compact status-aware summary for non-TTY / --silent output.
   * Mirrors the structure of the interactive final screen.
   */
  private buildSummary(session: ScanSession, summary: ScanSummary): string {
    const theme = getResolvedTheme();
    const symbols = getSymbolSet();

    const lines: string[] = [''];

    // Result header (status-aware)
    if (summary.cancelled) {
      lines.push(`${theme.status.warning}${symbols.warning}\x1b[0m Scan Cancelled\x1b[0m`);
    } else if (summary.errors > 0) {
      lines.push(`${theme.status.error}${symbols.error}\x1b[0m Scan Failed\x1b[0m`);
    } else {
      lines.push(`${theme.status.success}${symbols.success}\x1b[0m Scan Complete\x1b[0m`);
    }
    lines.push('');

    // Key metrics (aligned, existing data only)
    const findings = Object.values(summary.findingsBySeverity).reduce(
      (sum, n) => sum + (n || 0),
      0,
    );
    const rows: Array<{ label: string; value: string; color?: string }> = [
      { label: 'Files scanned', value: String(summary.filesScanned) },
      { label: 'Evidence', value: String(summary.evidenceCollected) },
      { label: 'Findings', value: String(findings) },
    ];
    if (summary.riskScore !== undefined) {
      rows.push({ label: 'Risk Score', value: `${summary.riskScore.toFixed(1)} / 10.0` });
      rows.push({ label: 'Confidence', value: `${(summary.confidence * 100).toFixed(1)}%` });
    }
    rows.push({ label: 'Duration', value: formatDuration(summary.durationMs) });
    if (session.throughput > 0) {
      rows.push({ label: 'Throughput', value: `${session.throughput.toFixed(1)} files/s` });
    }
    if (summary.warnings > 0) {
      rows.push({
        label: 'Warnings',
        value: String(summary.warnings),
        color: theme.status.warning,
      });
    }
    if (summary.errors > 0) {
      rows.push({ label: 'Errors', value: String(summary.errors), color: theme.status.error });
    }
    if (summary.skippedFiles > 0) {
      rows.push({ label: 'Skipped', value: String(summary.skippedFiles), color: theme.ui.textDim });
    }

    const labelWidth = Math.max(...rows.map((r) => r.label.length));
    for (const row of rows) {
      lines.push(
        `  ${theme.ui.textDim}${row.label.padEnd(labelWidth)}\x1b[0m  ${row.color ?? theme.ui.text}${row.value}\x1b[0m`,
      );
    }

    // Output files
    const outputFiles = summary.outputFiles ?? [];
    if (outputFiles.length > 0) {
      lines.push('');
      lines.push('  Output:');
      for (const file of outputFiles) {
        lines.push(`    ${file}`);
      }
    }

    lines.push('');
    return lines.join('\n');
  }
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export { formatDuration };
