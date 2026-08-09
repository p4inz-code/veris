/**
 * ANSI escape sequence builder for VERIS CLI.
 *
 * Provides low-level ANSI escape code generation.
 * Higher-level components should use the Theme system instead.
 *
 * @module @veris/cli/ui/theme
 */

import { detectTerminal, type ColorDepth } from '../terminal/index.js';

// ── ANSI Constants ──

const ESC = '\x1b[';
const RESET = `${ESC}0m`;

// ── Style Codes ──

const STYLES: Record<string, string> = Object.freeze({
  bold: '1',
  dim: '2',
  italic: '3',
  underline: '4',
  blink: '5',
  reverse: '7',
  hidden: '8',
  strikethrough: '9',
});

// ── Color Codes (16-color) ──

const FG_COLORS: Record<string, string> = Object.freeze({
  black: '30',
  red: '31',
  green: '32',
  yellow: '33',
  blue: '34',
  magenta: '35',
  cyan: '36',
  white: '37',
});

const BG_COLORS: Record<string, string> = Object.freeze({
  black: '40',
  red: '41',
  green: '42',
  yellow: '43',
  blue: '44',
  magenta: '45',
  cyan: '46',
  white: '47',
});

// ── ANSI Writer ──

/**
 * An ANSI-aware output writer that tracks whether styles are open.
 */
export class AnsiWriter {
  private readonly depth: ColorDepth;
  private open: boolean = false;

  constructor(depth?: ColorDepth) {
    this.depth = depth ?? detectTerminal().colorDepth;
  }

  /**
   * Get the current color depth.
   */
  get colorDepth(): ColorDepth {
    return this.depth;
  }

  /**
   * Whether ANSI codes are supported.
   */
  get supported(): boolean {
    return this.depth !== 'none';
  }

  /**
   * Wrap text in an ANSI style code.
   */
  style(text: string, ...codes: string[]): string {
    if (!this.supported || codes.length === 0) return text;
    return `${ESC}${codes.join(';')}m${text}${RESET}`;
  }

  /**
   * Apply bold formatting.
   */
  bold(text: string): string {
    return this.style(text, STYLES.bold);
  }

  /**
   * Apply dim formatting.
   */
  dim(text: string): string {
    return this.style(text, STYLES.dim);
  }

  /**
   * Apply underline formatting.
   */
  underline(text: string): string {
    return this.style(text, STYLES.underline);
  }

  /**
   * Apply italic formatting.
   */
  italic(text: string): string {
    return this.style(text, STYLES.italic);
  }

  /**
   * Apply a foreground color (16-color palette).
   */
  fg(text: string, color: string): string {
    const code = FG_COLORS[color];
    if (!code || !this.supported) return text;
    return this.style(text, code);
  }

  /**
   * Apply a background color (16-color palette).
   */
  bg(text: string, color: string): string {
    const code = BG_COLORS[color];
    if (!code || !this.supported) return text;
    return this.style(text, code);
  }

  /**
   * Apply an ANSI 256-color foreground.
   */
  fg256(text: string, colorIndex: number): string {
    if (!this.supported || this.depth === 'ansi') return text;
    if (this.depth === 'ansi256' || this.depth === 'truecolor') {
      return `${ESC}38;5;${colorIndex}m${text}${RESET}`;
    }
    return text;
  }

  /**
   * Apply a truecolor foreground (24-bit).
   */
  fgTruecolor(text: string, r: number, g: number, b: number): string {
    if (this.depth !== 'truecolor') return text;
    return `${ESC}38;2;${r};${g};${b}m${text}${RESET}`;
  }

  /**
   * Reset all styling.
   */
  reset(): string {
    return RESET;
  }

  /**
   * Create a padded ANSI styling (style applied, but also return reset for closing).
   * Useful for multi-line styled blocks.
   */
  openStyle(...codes: string[]): string {
    if (!this.supported || codes.length === 0) return '';
    this.open = true;
    return `${ESC}${codes.join(';')}m`;
  }

  /**
   * Close an open style.
   */
  closeStyle(): string {
    if (!this.open) return '';
    this.open = false;
    return RESET;
  }
}

/** Singleton ANSI writer instance (lazily created on first use). */
let defaultWriter: AnsiWriter | undefined;

/**
 * Get or create the default ANSI writer.
 */
export function getAnsiWriter(): AnsiWriter {
  if (defaultWriter === undefined) {
    defaultWriter = new AnsiWriter();
  }
  return defaultWriter;
}

/**
 * Reset the default ANSI writer (for testing).
 */
export function resetAnsiWriter(): void {
  defaultWriter = undefined;
}
