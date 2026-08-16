/**
 * Progress Renderer Interface.
 *
 * All progress output implementations (dashboard, JSON, silent)
 * implement this interface. The scan pipeline calls these methods
 * at appropriate points; the renderer decides how to display them.
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
  StageStatus,
} from '../scan-session.js';

/** Stage update information. */
export interface StageUpdate {
  readonly id: string;
  readonly status: StageStatus;
  readonly durationMs?: number;
  readonly itemsProcessed?: number;
  readonly itemsFailed?: number;
}

/** A scan progress update event. */
export interface ProgressUpdate {
  readonly stage: string;
  readonly stageUpdates?: readonly StageUpdate[];
  readonly currentFile?: CurrentFile | null;
  readonly filesProcessed?: number;
  readonly totalFiles?: number;
  readonly queueSize?: number;
  readonly workerUtilization?: number;
}

/** Error information for presentation. */
export interface ErrorInfo {
  readonly code: string;
  readonly message: string;
  readonly reason?: string;
  readonly action?: string;
  readonly artifactPath?: string;
  readonly stackTrace?: string;
}

/** Context provided to renderers at scan start. */
export interface StartContext {
  /** Number of knowledge packs loaded before the scan began. */
  readonly knowledgePackCount?: number;
}

/**
 * Interface that all progress renderers must implement.
 */
export interface ProgressRenderer {
  /** Called once at scan start with the initial session and start context. */
  onStart(session: ScanSession, context?: StartContext): void;

  /** Called on every progress update. */
  onProgress(update: ProgressUpdate): void;

  /** Called when a pipeline stage changes state. */
  onStageChange(stage: string, status: StageStatus, timing?: StageUpdate): void;

  /** Called when a file starts processing. */
  onFileStart(file: CurrentFile): void;

  /** Called when a file completes processing. */
  onFileComplete(file: CurrentFile, durationMs: number, success: boolean): void;

  /** Called when a health issue occurs. */
  onHealthIssue(issue: HealthIssue): void;

  /** Called when an error needs to be displayed. */
  onError(error: ErrorInfo): void;

  /** Called when the scan is complete. */
  onComplete(session: ScanSession, summary: ScanSummary): void;

  /** Called when the scan is cancelled. */
  onCancel(session: ScanSession): void;

  /** Called with profiler snapshot for summary generation. */
  onProfilerSnapshot(snapshot: ProfilerSnapshot): void;

  /** Whether this renderer supports animation (e.g., dashboard). */
  readonly supportsAnimation: boolean;

  /** Get the final rendered summary string (for after scan ends). */
  getFinalSummary(): string;

  /**
   * Cleanup any resources.
   *
   * May be asynchronous: the dashboard renderer uses dispose() to finish a
   * deferred final transition (startup presentation window). Callers should
   * await the result before the process exits.
   */
  dispose(): void | Promise<void>;
}
