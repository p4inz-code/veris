/**
 * Theme type definitions for VERIS CLI.
 *
 * Defines the color token system, theme structure, and severity palette.
 * All color references go through this system — never hardcode colors.
 *
 * @module @veris/cli/ui/theme
 */

import type { ColorDepth } from '../terminal/index.js';

// ── Color Tokens ──

/** A color value that can adapt to different color depths. */
export interface AdaptiveColor {
  /** Truecolor hex (e.g., "#ef4444"). Used when colorDepth === 'truecolor'. */
  readonly truecolor: string;
  /** ANSI 256-color code (0-255). Used when colorDepth === 'ansi256'. */
  readonly ansi256: number;
  /** ANSI 16-color name. Used when colorDepth === 'ansi'. */
  readonly ansi: string;
  /** Whether this color uses bold/underline/etc in basic terminals. */
  readonly decoration?: 'bold' | 'dim' | 'underline';
}

/** Resolved color value at a given color depth. */
export type ResolvedColor = string;

// ── Severity Tokens ──

/** Severity levels mapped to colors. */
export interface SeverityColors {
  readonly critical: AdaptiveColor;
  readonly high: AdaptiveColor;
  readonly medium: AdaptiveColor;
  readonly low: AdaptiveColor;
  readonly info: AdaptiveColor;
}

/** Status levels mapped to colors. */
export interface StatusColors {
  readonly success: AdaptiveColor;
  readonly warning: AdaptiveColor;
  readonly error: AdaptiveColor;
  readonly pending: AdaptiveColor;
  readonly muted: AdaptiveColor;
}

// ── UI Tokens ──

/** UI element color tokens. */
export interface UiColors {
  /** Primary brand color. */
  readonly brand: AdaptiveColor;
  /** Accent/secondary color. */
  readonly accent: AdaptiveColor;
  /** Default text color. */
  readonly text: AdaptiveColor;
  /** Dimmed/muted text. */
  readonly textDim: AdaptiveColor;
  /** Border lines. */
  readonly border: AdaptiveColor;
  /** Background for cards/surfaces. */
  readonly surface: AdaptiveColor;
  /** Background for main content area (if applicable). */
  readonly background: AdaptiveColor;
  /** Highlight/focus color. */
  readonly highlight: AdaptiveColor;
  /** Link color. */
  readonly link: AdaptiveColor;
}

// ── Full Theme ──

/** Complete theme definition. */
export interface ThemeDefinition {
  /** Theme name. */
  readonly name: string;
  /** Theme version for cache-busting. */
  readonly version: string;
  /** Severity-based colors. */
  readonly severity: SeverityColors;
  /** Status-based colors. */
  readonly status: StatusColors;
  /** UI element colors. */
  readonly ui: UiColors;
}

// ── Resolved Theme ──

/** A theme with all colors resolved to strings for a specific ColorDepth. */
export interface ResolvedTheme {
  readonly name: string;
  readonly severity: {
    readonly critical: string;
    readonly high: string;
    readonly medium: string;
    readonly low: string;
    readonly info: string;
  };
  readonly status: {
    readonly success: string;
    readonly warning: string;
    readonly error: string;
    readonly pending: string;
    readonly muted: string;
  };
  readonly ui: {
    readonly brand: string;
    readonly accent: string;
    readonly text: string;
    readonly textDim: string;
    readonly border: string;
    readonly surface: string;
    readonly background: string;
    readonly highlight: string;
    readonly link: string;
  };
}

// ── Resolver ──

/**
 * Resolve an AdaptiveColor to a string based on the current color depth.
 *
 * `truecolor` resolves to a 24-bit ANSI foreground escape so the value can
 * be written directly to the terminal (hex strings are not printable).
 */
export function resolveColor(color: AdaptiveColor, depth: ColorDepth): string {
  switch (depth) {
    case 'truecolor':
      return hexToAnsi(color.truecolor);
    case 'ansi256':
      return `\x1b[38;5;${color.ansi256}m`;
    case 'ansi':
      return color.ansi;
    case 'none':
      return '';
  }
}

/** Convert a `#rrggbb` hex color to a 24-bit ANSI foreground escape. */
function hexToAnsi(hex: string): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

/**
 * Resolve a ThemeDefinition to a ResolvedTheme for a given color depth.
 */
export function resolveTheme(theme: ThemeDefinition, depth: ColorDepth): ResolvedTheme {
  const sv = theme.severity;
  const st = theme.status;
  const ui = theme.ui;

  return {
    name: theme.name,
    severity: {
      critical: resolveColor(sv.critical, depth),
      high: resolveColor(sv.high, depth),
      medium: resolveColor(sv.medium, depth),
      low: resolveColor(sv.low, depth),
      info: resolveColor(sv.info, depth),
    },
    status: {
      success: resolveColor(st.success, depth),
      warning: resolveColor(st.warning, depth),
      error: resolveColor(st.error, depth),
      pending: resolveColor(st.pending, depth),
      muted: resolveColor(st.muted, depth),
    },
    ui: {
      brand: resolveColor(ui.brand, depth),
      accent: resolveColor(ui.accent, depth),
      text: resolveColor(ui.text, depth),
      textDim: resolveColor(ui.textDim, depth),
      border: resolveColor(ui.border, depth),
      surface: resolveColor(ui.surface, depth),
      background: resolveColor(ui.background, depth),
      highlight: resolveColor(ui.highlight, depth),
      link: resolveColor(ui.link, depth),
    },
  };
}
