/**
 * Severity theme utilities — resolved severity colors and helpers.
 *
 * @module @veris/cli/ui/theme
 */

import { detectTerminal } from '../terminal/index.js';

import { DEFAULT_THEME } from './default-theme.js';
import { resolveTheme, type ResolvedTheme } from './types.js';

/** Severity level strings used throughout VERIS. */
export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** Ordered severity levels from highest to lowest. */
export const SEVERITY_ORDER: readonly SeverityLevel[] = Object.freeze([
  'critical',
  'high',
  'medium',
  'low',
  'info',
]);

/** Severity level score ranges. */
export const SEVERITY_THRESHOLDS: Record<
  SeverityLevel,
  { readonly min: number; readonly max: number }
> = Object.freeze({
  critical: { min: 9.0, max: 10.0 },
  high: { min: 7.0, max: 8.9 },
  medium: { min: 4.0, max: 6.9 },
  low: { min: 1.0, max: 3.9 },
  info: { min: 0.0, max: 0.9 },
});

/**
 * Get the severity level for a numeric score.
 */
export function severityFromScore(score: number): SeverityLevel {
  for (const level of SEVERITY_ORDER) {
    const t = SEVERITY_THRESHOLDS[level];
    if (score >= t.min && score <= t.max) return level;
  }
  return 'info';
}

/**
 * Get the ResolvedTheme, adapting to the current terminal capabilities.
 */
export function getResolvedTheme(): ResolvedTheme {
  const caps = detectTerminal();
  return resolveTheme(DEFAULT_THEME, caps.colorDepth);
}

/**
 * Helper to get a severity color directly.
 */
export function getSeverityColor(level: SeverityLevel): string {
  const theme = getResolvedTheme();
  return theme.severity[level];
}

/**
 * Helper to get a status color directly.
 */
export function getStatusColor(status: 'success' | 'warning' | 'error' | 'pending'): string {
  const theme = getResolvedTheme();
  return theme.status[status];
}
