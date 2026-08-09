/**
 * String truncation utilities for VERIS CLI.
 *
 * @module @veris/cli/ui/utilities
 */

/**
 * Truncate a string to a maximum width, adding ellipsis if truncated.
 */
export function truncate(text: string, maxWidth: number, ellipsis: string = '…'): string {
  if (text.length <= maxWidth) return text;
  return text.slice(0, maxWidth - ellipsis.length) + ellipsis;
}

/**
 * Truncate a string at the start (useful for file paths).
 *
 * Example: "/very/long/path/to/file.txt" with maxWidth=25
 * becomes: ".../path/to/file.txt"
 */
export function truncateStart(text: string, maxWidth: number, ellipsis: string = '…'): string {
  if (text.length <= maxWidth) return text;
  return ellipsis + text.slice(text.length - maxWidth + ellipsis.length);
}

/**
 * Truncate a string in the middle (useful for long identifiers).
 *
 * Example: "abcdefghijklmnopqrstuvwxyz" with maxWidth=20
 * becomes: "abcdefghi…qrstuvwxyz"
 */
export function truncateMiddle(text: string, maxWidth: number, ellipsis: string = '…'): string {
  if (text.length <= maxWidth) return text;
  const ellipsisLen = ellipsis.length;
  const half = Math.floor((maxWidth - ellipsisLen) / 2);
  const rightCount = maxWidth - ellipsisLen - half;
  return text.slice(0, half) + ellipsis + text.slice(text.length - rightCount);
}
