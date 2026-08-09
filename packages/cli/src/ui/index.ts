/**
 * @veris/cli/ui — VERIS CLI User Interface Framework.
 *
 * Provides a complete professional UI framework for the VERIS CLI:
 * - Terminal capability detection
 * - Theme system with ANSI color abstraction
 * - Unicode/ASCII symbol fallback
 * - Reusable UI components (progress bar, spinner, table, badge, etc.)
 * - Layout utilities (box/panel)
 * - Display utilities (truncation, wrapping, alignment)
 * - Professional help rendering
 *
 * ## Design Principles
 * - NEVER hardcode colors — use the theme system
 * - NEVER hardcode symbols — use the renderer/symbol system
 * - ALL components work without color (--no-color)
 * - ALL components work without Unicode (--no-unicode)
 * - ALL components work without animation (--no-animation)
 * - ALL components auto-detect terminal capabilities
 *
 * @module @veris/cli/ui
 */

// Terminal detection
export {
  detectTerminal,
  isInteractive,
  resetTerminalCache,
  hasCapability,
  contentWidth,
  contentHeight,
  type ColorDepth,
  type TerminalEmulator,
  type CiEnvironment,
  type TerminalCapabilities,
} from './terminal/index.js';

// Theme system
export {
  DEFAULT_THEME,
  getResolvedTheme,
  getSeverityColor,
  getStatusColor,
  severityFromScore,
  AnsiWriter,
  getAnsiWriter,
  resetAnsiWriter,
  resolveColor,
  resolveTheme,
  type AdaptiveColor,
  type ThemeDefinition,
  type ResolvedTheme,
  type SeverityLevel,
} from './theme/index.js';

// Renderer / Symbols
export {
  getSymbolSet,
  setSymbolSet,
  resetSymbolSet,
  symbol,
  type SymbolSet,
} from './renderer/index.js';

// Components
export {
  renderProgressBar,
  clearProgressLines,
  Spinner,
  createSpinner,
  renderTable,
  renderBadge,
  criticalBadge,
  highBadge,
  mediumBadge,
  lowBadge,
  infoBadge,
  successBadge,
  failedBadge,
  warningBadge,
  renderStatusBar,
  renderFullStatusBar,
  renderHorizontalBarChart,
  renderSeverityDistribution,
  renderRiskHistogram,
  type ProgressBarOptions,
  type ProgressBarStyle,
  type ProgressState,
  type SpinnerOptions,
  type SpinnerStyle,
  type TableOptions,
  type TableColumn,
  type TableRow,
  type ColumnAlignment,
  type BadgeOptions,
  type BadgeVariant,
  type BadgeSize,
  type StatusBarData,
  type StatusBarOptions,
  type PipelineStage,
  type ChartOptions,
  type ChartDataPoint,
} from './components/index.js';

// Layout
export { renderBox, type BoxOptions } from './layout/index.js';

// Styles
export { getBorderChars, horizontalDivider, type BorderChars } from './styles/index.js';

// Utilities
export {
  truncate,
  truncateStart,
  truncateMiddle,
  wrapText,
  wrapParagraphs,
  alignText,
  padLeft,
  padRight,
  padCenter,
  type Alignment,
} from './utilities/index.js';

// Help Renderer
export {
  renderHelpPage,
  renderUsageHint,
  helpToJson,
  type HelpPage,
  type HelpSection,
  type HelpArgument,
  type HelpOption,
  type HelpExample,
  type HelpExitCode,
} from './help-renderer.js';

// Global Help
export { renderGlobalHelp } from './global-help.js';

// Error UX
export { formatCliError, type CliErrorContext } from './error-ux.js';

// Compatibility Flags
export {
  parseCompatibilityFlags,
  applyCompatibilityOptions,
  COMPATIBILITY_FLAGS,
  type CompatibilityOptions,
} from './compatibility.js';
