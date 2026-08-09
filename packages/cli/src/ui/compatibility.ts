/**
 * CLI compatibility flags.
 *
 * Handles global flags:
 * - --no-color: Disable all ANSI color output
 * - --no-unicode: Use ASCII-only symbols
 * - --no-animation: Disable animated spinners and progress
 *
 * These flags set environment variables that are read by the
 * terminal detection system.
 *
 * @module @veris/cli/ui
 */

import { resetSymbolSet } from './renderer/index.js';
import { resetTerminalCache } from './terminal/index.js';
import { resetAnsiWriter } from './theme/index.js';

/** Compatibility flag definitions. */
export const COMPATIBILITY_FLAGS = Object.freeze([
  '--no-color',
  '--no-unicode',
  '--no-animation',
] as const);

/** Parsed compatibility flags. */
export interface CompatibilityOptions {
  readonly noColor: boolean;
  readonly noUnicode: boolean;
  readonly noAnimation: boolean;
}

/**
 * Parse compatibility flags from an argument list.
 * These flags are consumed here and not passed to commands.
 *
 * @param args - The argument list to parse (mutated in place, consumed flags removed).
 * @returns Parsed compatibility options.
 */
export function parseCompatibilityFlags(args: string[]): CompatibilityOptions {
  let noColor = false;
  let noUnicode = false;
  let noAnimation = false;

  const remaining: string[] = [];

  for (const arg of args) {
    switch (arg) {
      case '--no-color':
        noColor = true;
        break;
      case '--no-unicode':
        noUnicode = true;
        break;
      case '--no-animation':
        noAnimation = true;
        break;
      default:
        remaining.push(arg);
    }
  }

  // Update args array to remove consumed flags
  args.length = 0;
  args.push(...remaining);

  // Set environment variables for downstream detection
  if (noColor) {
    process.env.VERIS_COLOR = '0';
    process.env.NO_COLOR = '1';
  }
  if (noUnicode) {
    process.env.VERIS_UNICODE = '0';
  }
  if (noAnimation) {
    process.env.VERIS_NO_ANIMATION = '1';
  }

  // Invalidate caches so detection picks up the new environment
  if (noColor || noUnicode || noAnimation) {
    resetTerminalCache();
    resetSymbolSet();
    resetAnsiWriter();
  }

  return { noColor, noUnicode, noAnimation };
}

/**
 * Apply compatibility options to the current environment.
 */
export function applyCompatibilityOptions(options: CompatibilityOptions): void {
  if (options.noColor) {
    process.env.VERIS_COLOR = '0';
    process.env.NO_COLOR = '1';
  }
  if (options.noUnicode) {
    process.env.VERIS_UNICODE = '0';
  }
  if (options.noAnimation) {
    process.env.VERIS_NO_ANIMATION = '1';
  }

  resetTerminalCache();
  resetSymbolSet();
  resetAnsiWriter();
}
