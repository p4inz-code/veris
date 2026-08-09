/**
 * Badge component for VERIS CLI.
 *
 * Renders consistent badges for:
 * - Severity levels (CRITICAL, HIGH, MEDIUM, LOW, INFO)
 * - Status indicators (SUCCESS, FAILED, WARNING, PENDING)
 * - Custom tags with configurable colors
 *
 * All badges use color + text + (optionally) symbol, never color alone.
 *
 * @module @veris/cli/ui/components
 */

import { getSymbolSet } from '../renderer/index.js';
import { detectTerminal } from '../terminal/index.js';
import { getResolvedTheme, type SeverityLevel } from '../theme/index.js';

// ── Types ──

/** Badge visual variants. */
export type BadgeVariant = 'severity' | 'status' | 'tag';

/** Badge size. */
export type BadgeSize = 'sm' | 'md' | 'lg';

/** Options for rendering a badge. */
export interface BadgeOptions {
  /** Badge label text. */
  readonly label: string;
  /** Visual variant. */
  readonly variant?: BadgeVariant;
  /** Severity level (for severity variant). */
  readonly severity?: SeverityLevel;
  /** Status (for status variant). */
  readonly status?: 'success' | 'warning' | 'error' | 'pending' | 'info';
  /** Custom color (for tag variant). */
  readonly color?: string;
  /** Badge size. */
  readonly size?: BadgeSize;
  /** Whether to include a symbol icon. */
  readonly showSymbol?: boolean;
}

// ── Badge Renderer ──

/**
 * Render a badge as a formatted string.
 */
export function renderBadge(options: BadgeOptions): string {
  const theme = getResolvedTheme();
  const symbols = getSymbolSet();
  const size = options.size ?? 'md';

  // Determine color and symbol
  let color: string;
  let symbol: string;

  if (options.variant === 'severity' && options.severity) {
    color = theme.severity[options.severity];
    symbol = symbols[options.severity];
  } else if (options.variant === 'status' && options.status) {
    switch (options.status) {
      case 'success':
        color = theme.status.success;
        symbol = symbols.success;
        break;
      case 'warning':
        color = theme.status.warning;
        symbol = symbols.warning;
        break;
      case 'error':
        color = theme.status.error;
        symbol = symbols.error;
        break;
      case 'pending':
        color = theme.status.pending;
        symbol = symbols.pending;
        break;
      case 'info':
        color = theme.ui.text;
        symbol = symbols.info;
        break;
      default:
        color = theme.ui.text;
        symbol = '';
        break;
    }
  } else {
    // Tag or fallback
    color = options.color ?? theme.ui.text;
    symbol = '';
  }

  // Build label
  let label = options.label;
  if (options.showSymbol !== false && symbol) {
    label = `${symbol} ${label}`;
  }

  // Apply size padding
  switch (size) {
    case 'sm':
      break; // No extra padding
    case 'lg':
      label = ` ${label} `;
      break;
    case 'md':
    default:
      label = ` ${label} `;
      break;
  }

  // Apply color
  return `${color}${label}\x1b[0m`;
}

/**
 * Render severity badges for common use cases.
 */

/** Render a CRITICAL badge. */
export function criticalBadge(): string {
  return renderBadge({ label: 'CRITICAL', variant: 'severity', severity: 'critical' });
}

/** Render a HIGH badge. */
export function highBadge(): string {
  return renderBadge({ label: 'HIGH', variant: 'severity', severity: 'high' });
}

/** Render a MEDIUM badge. */
export function mediumBadge(): string {
  return renderBadge({ label: 'MEDIUM', variant: 'severity', severity: 'medium' });
}

/** Render a LOW badge. */
export function lowBadge(): string {
  return renderBadge({ label: 'LOW', variant: 'severity', severity: 'low', showSymbol: false });
}

/** Render an INFO badge. */
export function infoBadge(): string {
  return renderBadge({ label: 'INFO', variant: 'status', status: 'info' });
}

/** Render a SUCCESS badge. */
export function successBadge(): string {
  return renderBadge({ label: 'SUCCESS', variant: 'status', status: 'success' });
}

/** Render a FAILED badge. */
export function failedBadge(): string {
  return renderBadge({ label: 'FAILED', variant: 'status', status: 'error' });
}

/** Render a WARNING badge. */
export function warningBadge(): string {
  return renderBadge({ label: 'WARNING', variant: 'status', status: 'warning' });
}
