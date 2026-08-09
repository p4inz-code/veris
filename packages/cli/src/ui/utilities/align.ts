/**
 * Text alignment utilities for VERIS CLI.
 *
 * @module @veris/cli/ui/utilities
 */

/** Text alignment options. */
export type Alignment = 'left' | 'right' | 'center';

/**
 * Pad a string to a specified width using the given alignment.
 */
export function alignText(text: string, width: number, align: Alignment = 'left'): string {
  if (text.length >= width) return text;

  const padding = width - text.length;
  switch (align) {
    case 'right':
      return ' '.repeat(padding) + text;
    case 'center':
      return ' '.repeat(Math.floor(padding / 2)) + text + ' '.repeat(Math.ceil(padding / 2));
    case 'left':
    default:
      return text + ' '.repeat(padding);
  }
}

/**
 * Left-align text with optional indent.
 */
export function padLeft(text: string, width: number): string {
  return alignText(text, width, 'left');
}

/**
 * Right-align text.
 */
export function padRight(text: string, width: number): string {
  return alignText(text, width, 'right');
}

/**
 * Center-align text.
 */
export function padCenter(text: string, width: number): string {
  return alignText(text, width, 'center');
}
