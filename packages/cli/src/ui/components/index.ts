/**
 * @veris/cli/ui/components — Reusable UI components.
 *
 * @module @veris/cli/ui/components
 */

export {
  renderProgressBar,
  clearProgressLines,
  type ProgressBarOptions,
  type ProgressBarStyle,
  type ProgressState,
} from './progress-bar.js';

export {
  Spinner,
  createSpinner,
  type SpinnerOptions,
  type SpinnerStyle,
  type SpinnerDefinition,
} from './spinner.js';

export {
  renderTable,
  type TableOptions,
  type TableColumn,
  type TableRow,
  type ColumnAlignment,
} from './table.js';

export {
  renderBadge,
  criticalBadge,
  highBadge,
  mediumBadge,
  lowBadge,
  infoBadge,
  successBadge,
  failedBadge,
  warningBadge,
  type BadgeOptions,
  type BadgeVariant,
  type BadgeSize,
} from './badge.js';

export {
  renderStatusBar,
  renderFullStatusBar,
  type StatusBarData,
  type StatusBarOptions,
  type PipelineStage,
  STAGE_LABELS,
} from './status-bar.js';

export {
  renderHorizontalBarChart,
  renderSeverityDistribution,
  renderRiskHistogram,
  type ChartOptions,
  type ChartDataPoint,
} from './mini-chart.js';
