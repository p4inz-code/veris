/**
 * @veris/cli/ui/theme — Theme system.
 *
 * Provides color tokens, theme resolution, severity helpers, and ANSI utilities.
 * All UI components use the theme system — never hardcode colors.
 *
 * @module @veris/cli/ui/theme
 */

export { DEFAULT_THEME } from './default-theme.js';

export {
  getResolvedTheme,
  getSeverityColor,
  getStatusColor,
  severityFromScore,
  type SeverityLevel,
  SEVERITY_ORDER,
  SEVERITY_THRESHOLDS,
} from './severity-theme.js';

export { AnsiWriter, getAnsiWriter, resetAnsiWriter } from './ansi.js';

export {
  type AdaptiveColor,
  type ThemeDefinition,
  type ResolvedTheme,
  resolveColor,
  resolveTheme,
} from './types.js';
