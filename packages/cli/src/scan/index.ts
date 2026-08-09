/**
 * @veris/cli/scan — Scan module for VERIS CLI.
 *
 * Provides scan execution, profiling, session management,
 * and progress rendering.
 *
 * @module @veris/cli/scan
 */

// Profiler
export {
  Profiler,
  formatStageTiming,
  type ProfilerStage,
  type StageTiming,
  type StageStats,
  type ProfilerSnapshot,
  type FileTiming,
} from './profiler.js';

// Scan Session Model
export {
  createScanSession,
  updateSession,
  PIPELINE_STAGE_LABELS,
  type ScanSession,
  type ScanConfig,
  type ScanSummary,
  type ScanStatistics,
  type PerformanceMetrics,
  type HealthSummary,
  type HealthIssue,
  type StageState,
  type StageStatus,
  type CurrentFile,
  type SessionUpdate,
} from './scan-session.js';

// Progress Rendering
export {
  // Renderer interface
  type ProgressRenderer,
  type ProgressUpdate,
  type StageUpdate,
  type ErrorInfo,

  // Renderers
  DashboardRenderer,
  JsonProgressRenderer,
  SilentRenderer,

  // Panel components
  renderStartupScreen,
  renderFinalSummary,
  renderCancellationSummary,
  formatCancellationLine,
  renderPipelineVisualization,
  renderCurrentFilePanel,
  renderStatisticsPanel,
  renderHealthPanel,
  renderPerformancePanel,
  createHealthIssue,

  // Error presentation
  formatError,
  formatErrorLine,
  errorFromException,
  formatHealthIssue,
  getErrorDefinition,

  // Option types
  type StartupScreenOptions,
  type FinalSummaryOptions,
  type CancellationResult,
  type PipelineVizOptions,
  type FilePanelOptions,
  type StatisticsPanelOptions,
  type HealthPanelOptions,
  type PerformancePanelOptions,
} from './progress/index.js';

/** Error definition type (from error-presentation). */
export interface ErrorDefinition {
  readonly problem: string;
  readonly reason: string;
  readonly action: string;
  readonly severity: 'warning' | 'error' | 'fatal';
}
