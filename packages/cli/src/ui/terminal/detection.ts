/**
 * Additional terminal detection helpers.
 *
 * @module @veris/cli/ui/terminal
 */

import { detectTerminal, type TerminalCapabilities } from './capabilities.js';

/**
 * Check if the terminal supports a given escape sequence or feature.
 */
export function hasCapability(
  caps: TerminalCapabilities,
  required: {
    readonly color?: boolean;
    readonly truecolor?: boolean;
    readonly unicode?: boolean;
    readonly interactive?: boolean;
  },
): boolean {
  if (required.color !== undefined && required.color) {
    if (caps.colorDepth === 'none') return false;
  }
  if (required.truecolor !== undefined && required.truecolor) {
    if (caps.colorDepth !== 'truecolor') return false;
  }
  if (required.unicode !== undefined && required.unicode) {
    if (!caps.unicode) return false;
  }
  if (required.interactive !== undefined && required.interactive) {
    if (!caps.isTty) return false;
  }
  return true;
}

/**
 * Returns the effective width available for content, subtracting margins/padding.
 */
export function contentWidth(caps?: TerminalCapabilities, padding: number = 2): number {
  const terminal = caps ?? detectTerminal();
  return Math.max(20, terminal.width - padding);
}

/**
 * Returns the effective height available for content.
 */
export function contentHeight(caps?: TerminalCapabilities, padding: number = 2): number {
  const terminal = caps ?? detectTerminal();
  return Math.max(5, terminal.height - padding);
}
