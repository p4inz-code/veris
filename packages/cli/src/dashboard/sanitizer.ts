/**
 * @veris/cli/dashboard/sanitizer — Strict HTML and URL sanitization for untrusted report data.
 *
 * Implements Section 2.3 of ADR-017:
 * - Entity encoding for all dynamic strings
 * - Protocol allowlisting (http/https only)
 * - Safe attribute identifier escaping
 *
 * @module @veris/cli/dashboard/sanitizer
 */

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Strictly escapes an unknown value for safe insertion into HTML text or attributes.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = typeof value === 'string' ? value : String(value);
  return str.replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char] || char);
}

/**
 * Validates and sanitizes a URL, disallowing dangerous schemes like `javascript:`, `data:`, `vbscript:`.
 * Returns safe URL or empty string / `#` if invalid or dangerous.
 */
export function sanitizeUrl(url: unknown): string {
  if (typeof url !== 'string') {
    return '#';
  }

  const trimmed = url.trim();

  // Explicitly disallow dangerous protocols
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:')
  ) {
    return '#';
  }

  // Only allow standard web protocols
  if (lower.startsWith('https://') || lower.startsWith('http://')) {
    return escapeHtml(trimmed);
  }

  return '#';
}

/**
 * Sanitizes a string for use as an HTML ID or class name (letters, numbers, hyphens, underscores only).
 */
export function sanitizeIdentifier(value: unknown): string {
  if (typeof value !== 'string') {
    return 'elem_' + Math.random().toString(36).slice(2, 8);
  }

  return value
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/[-_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
