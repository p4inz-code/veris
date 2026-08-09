/**
 * Default VERIS theme — professional dark theme.
 *
 * Uses a teal/purple brand palette with semantic severity colors.
 * All colors are defined as AdaptiveColor for cross-terminal support.
 *
 * @module @veris/cli/ui/theme
 */

import type { AdaptiveColor, ThemeDefinition } from './types.js';

/** Helper to create an AdaptiveColor. */
function color(
  truecolor: string,
  ansi256: number,
  ansi: string,
  decoration?: 'bold' | 'dim' | 'underline',
): AdaptiveColor {
  return Object.freeze({ truecolor, ansi256, ansi, decoration });
}

/**
 * The default VERIS dark theme.
 *
 * Colors chosen for:
 * - Maximum readability on dark terminals
 * - WCAG AA contrast compliance
 * - Color-blind safety (severity uses color + symbol)
 * - Professional, non-gaming aesthetic
 */
export const DEFAULT_THEME: ThemeDefinition = Object.freeze({
  name: 'veris-dark',
  version: '1.0.0',

  // ── Severity colors (semantic, contrast-optimized) ──
  severity: Object.freeze({
    critical: color('#ef4444', 196, '\x1b[31m', 'bold'), // Red
    high: color('#f97316', 208, '\x1b[33m', 'bold'), // Orange
    medium: color('#eab308', 220, '\x1b[33m'), // Yellow
    low: color('#22c55e', 82, '\x1b[32m'), // Green
    info: color('#06b6d4', 45, '\x1b[36m'), // Cyan
  }),

  // ── Status colors ──
  status: Object.freeze({
    success: color('#22c55e', 82, '\x1b[32m'),
    warning: color('#eab308', 220, '\x1b[33m'),
    error: color('#ef4444', 196, '\x1b[31m', 'bold'),
    pending: color('#6b7280', 244, '\x1b[2m'), // Dim
    muted: color('#6b7280', 244, '\x1b[2m'), // Dim
  }),

  // ── UI element colors ──
  ui: Object.freeze({
    brand: color('#00d4aa', 79, '\x1b[36m'), // Teal
    accent: color('#7c3aed', 99, '\x1b[35m'), // Purple
    text: color('#e5e7eb', 255, '\x1b[37m'), // Bright white
    textDim: color('#9ca3af', 250, '\x1b[37m'), // Dim white
    border: color('#374151', 237, '\x1b[90m'), // Gray
    surface: color('#374151', 237, '\x1b[90m'), // Gray
    background: color('#111827', 234, '\x1b[40m'), // Near black
    highlight: color('#3b82f6', 75, '\x1b[34m'), // Blue
    link: color('#3b82f6', 75, '\x1b[34m', 'underline'),
  }),
});
