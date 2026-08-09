/**
 * Box/panel component for VERIS CLI.
 *
 * Renders framed boxes with optional titles for grouping related content.
 * Uses the Unicode/ASCII border system for automatic fallback.
 *
 * @module @veris/cli/ui/layout
 */

import { getBorderChars, type BorderChars } from '../styles/index.js';
import { type TerminalCapabilities, detectTerminal, contentWidth } from '../terminal/index.js';
import { getResolvedTheme } from '../theme/index.js';

// ── Types ──

/** Box options. */
export interface BoxOptions {
  /** Box title (displayed in top border). */
  readonly title?: string;
  /** Width of the box (default: terminal width - 4). */
  readonly width?: number;
  /** Padding inside the box. */
  readonly padding?: number;
  /** Terminal capabilities (auto-detected if not provided). */
  readonly caps?: TerminalCapabilities;
  /** Whether to show bottom border. */
  readonly showBottomBorder?: boolean;
}

// ── Box Renderer ──

/**
 * Render a box/panel around content.
 *
 * @param content - Array of content lines (without border).
 * @param options - Box rendering options.
 * @returns Array of lines with borders applied.
 */
export function renderBox(content: readonly string[], options: BoxOptions = {}): readonly string[] {
  const caps = options.caps ?? detectTerminal();
  const theme = getResolvedTheme();
  const border = getBorderChars();
  const padding = options.padding ?? 1;
  const boxWidth = options.width ?? Math.max(20, caps.width - 4);
  const innerWidth = boxWidth - 4; // Accounting for borders + padding

  const lines: string[] = [];

  // Top border with optional title
  const topTitle = options.title ? ` ${options.title} ` : '';
  const topBorderLength = boxWidth - 2;
  const topPadding = topTitle ? Math.max(0, topBorderLength - topTitle.length) : 0;
  const topLeftPadding = Math.floor(topPadding / 2);
  const topRightPadding = topPadding - topLeftPadding;

  const topBorder = options.title
    ? `${border.topLeft}${border.horizontal.repeat(topLeftPadding)}${topTitle}${border.horizontal.repeat(topRightPadding)}${border.topRight}`
    : `${border.topLeft}${border.horizontal.repeat(topBorderLength)}${border.topRight}`;
  lines.push(topBorder);

  // Top padding line
  if (padding > 0) {
    const padLine = `${border.vertical}${' '.repeat(boxWidth - 2)}${border.vertical}`;
    for (let i = 0; i < padding; i++) {
      lines.push(padLine);
    }
  }

  // Content lines
  for (const line of content) {
    const innerLine =
      line.length > innerWidth
        ? line.slice(0, innerWidth)
        : line + ' '.repeat(innerWidth - line.length);
    lines.push(`${border.vertical} ${innerLine} ${border.vertical}`);
  }

  // Bottom padding line
  if (padding > 0) {
    const padLine = `${border.vertical}${' '.repeat(boxWidth - 2)}${border.vertical}`;
    for (let i = 0; i < padding; i++) {
      lines.push(padLine);
    }
  }

  // Bottom border
  if (options.showBottomBorder !== false) {
    const bottomBorder = `${border.bottomLeft}${border.horizontal.repeat(boxWidth - 2)}${border.bottomRight}`;
    lines.push(bottomBorder);
  }

  return lines;
}
