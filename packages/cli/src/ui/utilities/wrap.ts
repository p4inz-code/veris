/**
 * String wrapping utilities for VERIS CLI.
 *
 * @module @veris/cli/ui/utilities
 */

/**
 * Wrap text to a specified width, breaking at word boundaries.
 *
 * @param text - The text to wrap.
 * @param width - Maximum line width.
 * @param indent - Optional indent string for each wrapped line.
 * @returns Array of wrapped lines.
 */
export function wrapText(text: string, width: number, indent: string = ''): readonly string[] {
  if (text.length === 0) return [indent];

  const lines: string[] = [];
  const effectiveWidth = width - indent.length;

  if (effectiveWidth <= 0) {
    // Can't wrap at this width, just return the text
    return [indent + text];
  }

  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= effectiveWidth) {
      lines.push(indent + remaining);
      break;
    }

    // Try to find a word boundary
    let breakIndex = remaining.lastIndexOf(' ', effectiveWidth);
    if (breakIndex <= 0) {
      // No space found, hard break at width
      breakIndex = effectiveWidth;
    }

    lines.push(indent + remaining.slice(0, breakIndex));
    remaining = remaining.slice(breakIndex).trimStart();
  }

  return lines;
}

/**
 * Wrap text at word boundaries, preserving paragraph breaks.
 *
 * @param text - The text to wrap.
 * @param width - Maximum line width.
 * @param indent - Optional indent for wrapped lines.
 * @returns Array of wrapped lines with empty lines between paragraphs.
 */
export function wrapParagraphs(
  text: string,
  width: number,
  indent: string = '',
): readonly string[] {
  const paragraphs = text.split('\n\n');
  const lines: string[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    if (i > 0) lines.push('');

    const paragraph = paragraphs[i].replace(/\n/g, ' ').trim();
    const wrapped = wrapText(paragraph, width, indent);
    lines.push(...wrapped);
  }

  return lines;
}
