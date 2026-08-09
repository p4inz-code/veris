/**
 * @veris/cli/scan/progress — Scan progress rendering system.
 *
 * Provides multiple renderers for scan progress visualization:
 * - DashboardRenderer: Full interactive TTY dashboard
 * - JsonProgressRenderer: Structured JSON for CI/automation
 * - SilentRenderer: Only errors and final summary
 *
 * All renderers implement the {@link ProgressRenderer} interface.
 *
 * @module @veris/cli/scan/progress
 */

export {
  type ProgressRenderer,
  type ProgressUpdate,
  type StageUpdate,
  type ErrorInfo,
} from './renderer.js';

export { DashboardRenderer } from './dashboard-renderer.js';
export { JsonProgressRenderer } from './json-renderer.js';
export { SilentRenderer } from './silent-renderer.js';

export { renderStartupScreen, type StartupScreenOptions } from './startup-screen.js';
export { renderFinalSummary, type FinalSummaryOptions } from './final-summary.js';
export {
  renderCancellationSummary,
  formatCancellationLine,
  type CancellationResult,
} from './cancellation.js';
export { renderPipelineVisualization, type PipelineVizOptions } from './pipeline-viz.js';
export { renderCurrentFilePanel, type FilePanelOptions } from './file-panel.js';
export { renderStatisticsPanel, type StatisticsPanelOptions } from './statistics-panel.js';
export { renderHealthPanel, createHealthIssue, type HealthPanelOptions } from './health-panel.js';
export { renderPerformancePanel, type PerformancePanelOptions } from './performance-panel.js';
export {
  formatError,
  formatErrorLine,
  errorFromException,
  formatHealthIssue,
  getErrorDefinition,
} from './error-presentation.js';
