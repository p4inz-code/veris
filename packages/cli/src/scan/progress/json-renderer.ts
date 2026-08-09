/**
 * JSON Progress Renderer.
 *
 * Emits every progress update as structured JSON, one object per line.
 * Suitable for CI, automation, GitHub Actions, and programmatic consumers.
 *
 * Usage: veris scan --progress json
 *
 * Output format:
 *   {"type":"start","session":{...}}
 *   {"type":"progress","stage":"...","filesProcessed":42,...}
 *   {"type":"stage","id":"...","status":"completed","durationMs":1234}
 *   {"type":"file","filename":"...","status":"start"}
 *   {"type":"file","filename":"...","status":"complete","durationMs":50}
 *   {"type":"error","code":"...","message":"..."}
 *   {"type":"health","code":"...","severity":"warning","message":"..."}
 *   {"type":"complete","summary":{...}}
 *   {"type":"cancel","session":{...}}
 *
 * @module @veris/cli/scan/progress
 */

import type { ProfilerSnapshot } from '../profiler.js';
import type {
  ScanSession,
  ScanConfig,
  CurrentFile,
  HealthIssue,
  ScanSummary,
} from '../scan-session.js';
import type { StageStatus } from '../scan-session.js';

import type {
  ProgressRenderer,
  ProgressUpdate,
  ErrorInfo,
  StageUpdate,
  StartContext,
} from './renderer.js';

/** JSON output mode — each event is a single JSON line. */
export class JsonProgressRenderer implements ProgressRenderer {
  readonly supportsAnimation = false;

  onStart(session: ScanSession, _context?: StartContext): void {
    this.emit('start', {
      session: this.serializeSession(session),
    });
  }

  onProgress(update: ProgressUpdate): void {
    this.emit('progress', {
      stage: update.stage,
      stageUpdates: update.stageUpdates,
      currentFile: update.currentFile,
      filesProcessed: update.filesProcessed,
      totalFiles: update.totalFiles,
      queueSize: update.queueSize,
      workerUtilization: update.workerUtilization,
    });
  }

  onStageChange(stage: string, status: StageStatus, timing?: StageUpdate): void {
    this.emit('stage', {
      id: stage,
      status,
      ...(timing
        ? {
            durationMs: timing.durationMs,
            itemsProcessed: timing.itemsProcessed,
            itemsFailed: timing.itemsFailed,
          }
        : {}),
    });
  }

  onFileStart(file: CurrentFile): void {
    this.emit('file', {
      filename: file.filename,
      relativePath: file.relativePath,
      size: file.size,
      fileType: file.fileType,
      language: file.language,
      artifactType: file.artifactType,
      status: 'start',
    });
  }

  onFileComplete(file: CurrentFile, durationMs: number, success: boolean): void {
    this.emit('file', {
      filename: file.filename,
      status: success ? 'complete' : 'failed',
      durationMs,
    });
  }

  onHealthIssue(issue: HealthIssue): void {
    this.emit('health', {
      code: issue.code,
      severity: issue.severity,
      message: issue.message,
      artifactPath: issue.artifactPath,
    });
  }

  onError(error: ErrorInfo): void {
    this.emit('error', {
      code: error.code,
      message: error.message,
      reason: error.reason,
      action: error.action,
      artifactPath: error.artifactPath,
    });
  }

  onComplete(_session: ScanSession, summary: ScanSummary): void {
    this.emit('complete', { summary });
  }

  onCancel(session: ScanSession): void {
    this.emit('cancel', {
      session: {
        id: session.id,
        filesProcessed: session.filesProcessed,
        totalFiles: session.totalFiles,
        elapsedMs: session.elapsedMs,
        diagnostics: session.diagnostics,
      },
    });
  }

  onProfilerSnapshot(_snapshot: ProfilerSnapshot): void {
    // Profiler data is included in the final session summary via onComplete
  }

  getFinalSummary(): string {
    // JSON renderer doesn't produce a final text summary
    return '';
  }

  dispose(): void {
    // No resources to clean up
  }

  // ── Private ──

  private emit(type: string, data: Record<string, unknown>): void {
    process.stdout.write(`${JSON.stringify({ type, ...data })}\n`);
  }

  private serializeSession(session: ScanSession): Record<string, unknown> {
    return {
      id: session.id,
      startedAt: session.startedAt,
      config: session.config,
      totalFiles: session.totalFiles,
    };
  }
}
