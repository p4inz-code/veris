/**
 * Scan Session Model — immutable scan state container.
 *
 * Captures every aspect of a running or completed scan:
 * configuration, timestamps, statistics, performance, warnings,
 * errors, and final summary.
 *
 * Every update method returns a new immutable snapshot.
 * The session is the single source of truth for all renderers.
 *
 * @module @veris/cli/scan
 */

import { deterministicId } from '@veris/shared';

import {
  type ProfilerStage,
  type ProfilerSnapshot,
  type FileTiming,
  type StageTiming,
} from './profiler.js';

// ── Pipeline Stage Identifiers ──

export { type ProfilerStage as PipelineStageId } from './profiler.js';

/** Human-readable labels for pipeline stages. */
export const PIPELINE_STAGE_LABELS: Record<string, string> = Object.freeze({
  discovery: 'Discovery',
  classification: 'Classification',
  extraction: 'Extraction',
  knowledge: 'Knowledge',
  analysis: 'Analysis',
  rules: 'Rules',
  correlation: 'Correlation',
  risk: 'Risk Assessment',
  reporting: 'Reporting',
  export: 'Export',
  total: 'Total',
});

// ── Stage Status ──

/** Per-stage status during a scan. */
export type StageStatus = 'waiting' | 'running' | 'completed' | 'failed';

/** A single pipeline stage's state. */
export interface StageState {
  readonly id: string;
  readonly status: StageStatus;
  readonly startedAt: number | null;
  readonly completedAt: number | null;
  readonly durationMs: number;
  readonly itemsProcessed: number;
  readonly itemsFailed: number;
}

// ── Health ──

/** A scan health issue. */
export interface HealthIssue {
  readonly code: string;
  readonly message: string;
  readonly severity: 'warning' | 'error' | 'fatal';
  readonly recoverable: boolean;
  readonly artifactPath?: string;
  readonly timestamp: number;
}

/** Scan health summary. */
export interface HealthSummary {
  readonly warnings: number;
  readonly errors: number;
  readonly fatalErrors: number;
  readonly permissionDenied: number;
  readonly unsupportedFiles: number;
  readonly timeouts: number;
  readonly issues: readonly HealthIssue[];
}

// ── Performance ──

/** Performance metrics. */
export interface PerformanceMetrics {
  readonly filesPerSecond: number;
  readonly averageFileDurationMs: number;
  readonly slowestFile: FileTiming | undefined;
  readonly fastestFile: FileTiming | undefined;
  readonly memoryPeakMB: number;
  readonly memoryCurrentMB: number;
  readonly pipelineTimings: Record<string, number>;
}

// ── Statistics ──

/** Live scan statistics. */
export interface ScanStatistics {
  readonly filesScanned: number;
  readonly directories: number;
  readonly archives: number;
  readonly rulesEvaluated: number;
  readonly evidenceCollected: number;
  readonly findings: number;
  readonly warnings: number;
  readonly errors: number;
  readonly skippedFiles: number;
  readonly memoryUsageMB: number;
  readonly cpuTimeMs: number;
  readonly filesPerSecond: number;
  readonly averageFileDurationMs: number;
}

// ── Scan Configuration ──

/** The configuration snapshot for a scan session. */
export interface ScanConfig {
  readonly target: string;
  readonly preset: string;
  readonly enabledAnalyzers: readonly string[];
  readonly enabledFormats: readonly string[];
  readonly workerCount: number;
  readonly maxFindings: number;
  readonly maxFiles: number;
  readonly maxDepth: number;
  readonly includeHidden: boolean;
}

// ── Scan Summary ──

/** Final summary produced at end of scan. */
export interface ScanSummary {
  readonly durationMs: number;
  readonly filesScanned: number;
  readonly artifacts: number;
  readonly rulesExecuted: number;
  readonly evidenceCollected: number;
  readonly findingsBySeverity: Record<string, number>;
  readonly riskScore: number;
  readonly confidence: number;
  readonly outputFiles: readonly string[];
  readonly warnings: number;
  readonly errors: number;
  readonly skippedFiles: number;
  readonly cancelled: boolean;
  /** Number of knowledge packs loaded before the scan (when reported). */
  readonly knowledgePacksLoaded?: number;
  /** Number of knowledge enrichments applied to evidence (when reported). */
  readonly knowledgeEnrichments?: number;
}

// ── Scan Session ──

/** Current file being processed. */
export interface CurrentFile {
  readonly filename: string;
  readonly relativePath: string;
  readonly size: number;
  readonly fileType: string;
  readonly language: string;
  readonly artifactType: string;
  readonly currentAnalyzer: string;
}

/** Complete scan session state — immutable snapshot. */
export interface ScanSession {
  /** Unique scan session ID. */
  readonly id: string;
  /** Configuration snapshot. */
  readonly config: ScanConfig;
  /** When the scan started (epoch ms). */
  readonly startedAt: number;
  /** When the scan ended (epoch ms). */
  readonly endedAt: number | null;
  /** Current overall progress (0.0 – 1.0). */
  readonly progress: number;
  /** Current pipeline stage. */
  readonly currentStage: string;
  /** All pipeline stage states. */
  readonly stages: Record<string, StageState>;
  /** Current file being processed. */
  readonly currentFile: CurrentFile | null;
  /** Queue size. */
  readonly queueSize: number;
  /** Worker utilization (0.0 – 1.0). */
  readonly workerUtilization: number;
  /** Elapsed time in ms. */
  readonly elapsedMs: number;
  /** Estimated remaining time in ms. */
  readonly etaMs: number;
  /** Current throughput (files/sec). */
  readonly throughput: number;
  /** Files processed count. */
  readonly filesProcessed: number;
  /** Remaining files count. */
  readonly filesRemaining: number;
  /** Total files to process. */
  readonly totalFiles: number;
  /** Live statistics. */
  readonly statistics: ScanStatistics;
  /** Performance metrics. */
  readonly performance: PerformanceMetrics;
  /** Health summary. */
  readonly health: HealthSummary;
  /** Profiler snapshot. */
  readonly profilerSnapshot: ProfilerSnapshot | null;
  /** Summary (only set when scan is complete). */
  readonly summary: ScanSummary | null;
  /** Whether the scan is complete. */
  readonly completed: boolean;
  /** Whether the scan was cancelled. */
  readonly cancelled: boolean;
  /** Warning/error messages. */
  readonly diagnostics: readonly string[];
}

// ── Session Factory ──

/** Create a new initial scan session. */
export function createScanSession(config: ScanConfig, timestamp?: string): ScanSession {
  const now = timestamp ? new Date(timestamp).getTime() : Date.now();

  const initialStages: Record<string, StageState> = Object.fromEntries(
    [
      'discovery',
      'classification',
      'extraction',
      'knowledge',
      'analysis',
      'rules',
      'correlation',
      'risk',
      'reporting',
      'export',
    ].map((id) => [
      id,
      Object.freeze<StageState>({
        id,
        status: 'waiting',
        startedAt: null,
        completedAt: null,
        durationMs: 0,
        itemsProcessed: 0,
        itemsFailed: 0,
      }),
    ]),
  ) as Record<string, StageState>;

  return Object.freeze<ScanSession>({
    id: deterministicId('scan', timestamp ?? new Date().toISOString()),
    config,
    startedAt: now,
    endedAt: null,
    progress: 0,
    currentStage: 'discovery',
    stages: initialStages,
    currentFile: null,
    queueSize: 0,
    workerUtilization: 0,
    elapsedMs: 0,
    etaMs: 0,
    throughput: 0,
    filesProcessed: 0,
    filesRemaining: 0,
    totalFiles: 0,
    statistics: Object.freeze<ScanStatistics>({
      filesScanned: 0,
      directories: 0,
      archives: 0,
      rulesEvaluated: 0,
      evidenceCollected: 0,
      findings: 0,
      warnings: 0,
      errors: 0,
      skippedFiles: 0,
      memoryUsageMB: 0,
      cpuTimeMs: 0,
      filesPerSecond: 0,
      averageFileDurationMs: 0,
    }),
    performance: Object.freeze<PerformanceMetrics>({
      filesPerSecond: 0,
      averageFileDurationMs: 0,
      slowestFile: undefined,
      fastestFile: undefined,
      memoryPeakMB: 0,
      memoryCurrentMB: 0,
      pipelineTimings: {},
    }),
    health: Object.freeze<HealthSummary>({
      warnings: 0,
      errors: 0,
      fatalErrors: 0,
      permissionDenied: 0,
      unsupportedFiles: 0,
      timeouts: 0,
      issues: [],
    }),
    profilerSnapshot: null,
    summary: null,
    completed: false,
    cancelled: false,
    diagnostics: [],
  });
}

// ── Session Update Helpers ──

/** Update options for creating a new session snapshot. */
export interface SessionUpdate {
  readonly config?: ScanConfig;
  readonly progress?: number;
  readonly currentStage?: string;
  readonly stages?: Record<string, StageState>;
  readonly currentFile?: CurrentFile | null;
  readonly queueSize?: number;
  readonly workerUtilization?: number;
  readonly filesProcessed?: number;
  readonly filesRemaining?: number;
  readonly totalFiles?: number;
  readonly statistics?: Partial<ScanStatistics>;
  readonly performance?: Partial<PerformanceMetrics>;
  readonly health?: Partial<HealthSummary>;
  readonly profilerSnapshot?: ProfilerSnapshot | null;
  readonly summary?: ScanSummary | null;
  readonly completed?: boolean;
  readonly cancelled?: boolean;
  readonly diagnostic?: string;
  readonly diagnostics?: readonly string[];
}

/**
 * Create a new session snapshot with updated values.
 * Immutable — returns a new frozen object.
 */
export function updateSession(session: ScanSession, update: SessionUpdate): ScanSession {
  const now = Date.now();
  const elapsedMs = now - session.startedAt;
  const throughput =
    elapsedMs > 0 ? (update.filesProcessed ?? session.filesProcessed) / (elapsedMs / 1000) : 0;
  const pct = update.progress ?? session.progress;
  const etaMs = pct > 0 ? elapsedMs / pct - elapsedMs : 0;

  return Object.freeze<ScanSession>({
    ...session,
    ...(update.config !== undefined ? { config: update.config } : {}),
    ...(update.progress !== undefined ? { progress: update.progress } : {}),
    ...(update.currentStage !== undefined ? { currentStage: update.currentStage } : {}),
    ...(update.stages !== undefined ? { stages: update.stages } : {}),
    ...(update.currentFile !== undefined ? { currentFile: update.currentFile } : {}),
    ...(update.queueSize !== undefined ? { queueSize: update.queueSize } : {}),
    ...(update.workerUtilization !== undefined
      ? { workerUtilization: update.workerUtilization }
      : {}),
    ...(update.filesProcessed !== undefined ? { filesProcessed: update.filesProcessed } : {}),
    ...(update.filesRemaining !== undefined ? { filesRemaining: update.filesRemaining } : {}),
    ...(update.totalFiles !== undefined ? { totalFiles: update.totalFiles } : {}),
    statistics: {
      ...session.statistics,
      ...(update.statistics ?? {}),
      filesPerSecond: throughput,
      averageFileDurationMs:
        (update.filesProcessed ?? session.filesProcessed) > 0
          ? elapsedMs / (update.filesProcessed ?? session.filesProcessed)
          : 0,
    },
    performance: {
      ...session.performance,
      ...(update.performance ?? {}),
      filesPerSecond: throughput,
    },
    health: update.health ? { ...session.health, ...update.health } : session.health,
    ...(update.profilerSnapshot !== undefined ? { profilerSnapshot: update.profilerSnapshot } : {}),
    ...(update.summary !== undefined ? { summary: update.summary } : {}),
    ...(update.completed !== undefined ? { completed: update.completed } : {}),
    ...(update.cancelled !== undefined ? { cancelled: update.cancelled } : {}),
    elapsedMs,
    etaMs,
    throughput,
    diagnostics:
      update.diagnostics ??
      (update.diagnostic ? [...session.diagnostics, update.diagnostic] : session.diagnostics),
    ...(update.completed ? { endedAt: now } : {}),
    ...(update.completed ? { endedAt: now } : {}),
  });
}
