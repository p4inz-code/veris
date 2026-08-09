/**
 * Border style definitions for VERIS CLI.
 *
 * Provides reusable border configurations for boxes, panels, sections, etc.
 * All borders use the Unicode/ASCII symbol system for automatic fallback.
 *
 * @module @veris/cli/ui/styles
 */

import { getSymbolSet } from '../renderer/index.js';

/** Border characters for a single border style. */
export interface BorderChars {
  readonly topLeft: string;
  readonly topRight: string;
  readonly bottomLeft: string;
  readonly bottomRight: string;
  readonly horizontal: string;
  readonly vertical: string;
  readonly topJoin: string;
  readonly bottomJoin: string;
  readonly leftJoin: string;
  readonly rightJoin: string;
  readonly cross: string;
}

/**
 * Build border characters from the current symbol set.
 */
export function getBorderChars(): BorderChars {
  const s = getSymbolSet();

  return {
    topLeft: s.tlCorner,
    topRight: s.trCorner,
    bottomLeft: s.blCorner,
    bottomRight: s.brCorner,
    horizontal: s.hLine,
    vertical: s.vLine,
    topJoin: s.tPiece,
    bottomJoin: s.bPiece,
    leftJoin: s.lPiece,
    rightJoin: s.rPiece,
    cross: s.crossPiece,
  };
}

/**
 * Create a horizontal divider line of a given width.
 */
export function horizontalDivider(width: number, char?: string): string {
  const symbols = getSymbolSet();
  return (char ?? symbols.hLine).repeat(width);
}
