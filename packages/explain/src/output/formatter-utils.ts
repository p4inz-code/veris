/**
 * Formatter utilities — deterministic formatting functions for the output formatter.
 *
 * Provides pure, deterministic utility functions for:
 * - Citation formatting (numbered, bracketed, inline)
 * - Markdown formatting (headings, lists, tables, code blocks)
 * - JSON formatting
 * - Whitespace normalization
 * - Paragraph wrapping
 * - Heading generation
 * - Stable deterministic ordering
 *
 * ALL functions are PURELY DETERMINISTIC — no LLM provider is ever called.
 *
 * @module @veris/explain/output/formatter-utils
 */

import type { Citation, CitationSourceType, ExplanationMode } from '../types/explanation.js';

import type { CitationStyle, CitationSectionStyle } from './formatter-options.js';

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

/** Regex pattern for extracting [src:type:id] citation markers. */
const SRC_CITATION_PATTERN = /\[src:([a-z-]+):([a-zA-Z0-9_:./\\-]+)\]/g;

/** Citation source type labels for human-readable display. */
const SOURCE_TYPE_LABELS: Record<CitationSourceType, string> = {
  finding: 'Finding',
  evidence: 'Evidence',
  rule: 'Rule',
  behavior: 'Behavior',
  artifact: 'Artifact',
  chain: 'Behavior Chain',
  'risk-dimension': 'Risk Dimension',
  recommendation: 'Recommendation',
  'rule-prop': 'Rule Property',
  'report-meta': 'Report Metadata',
};

/** Markdown heading prefix by level. */
const HEADING_PREFIX: Record<number, string> = {
  1: '# ',
  2: '## ',
  3: '### ',
  4: '#### ',
  5: '##### ',
  6: '###### ',
};

// ═══════════════════════════════════════════════════════════════════════════
// Citation Formatting
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format inline citation markers.
 *
 * @param sourceType - The citation source type.
 * @param sourceId - The source object ID.
 * @param style - The citation style to use.
 * @param index - Optional sequential index for numbered style.
 * @returns The formatted citation string.
 */
export function formatInlineCitation(
  sourceType: string,
  sourceId: string,
  style: CitationStyle,
  index?: number,
): string {
  switch (style) {
    case 'numbered':
      return `[${index ?? 1}]`;
    case 'bracketed':
      return `[${sourceType}:${sourceId}]`;
    case 'inline':
      return `${SOURCE_TYPE_LABELS[sourceType as CitationSourceType] ?? 'Reference'}: ${sourceId}`;
  }
}

/**
 * Extract all [src:type:id] citations from text, preserving their order.
 *
 * @param text - The text containing citation markers.
 * @returns Array of extracted citation references with type, id, and position.
 */
export function extractCitations(text: string): Array<{
  sourceType: string;
  sourceId: string;
  index: number;
}> {
  const citations: Array<{ sourceType: string; sourceId: string; index: number }> = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  let idx = 0;

  const regex = new RegExp(SRC_CITATION_PATTERN.source, 'g');
  while ((match = regex.exec(text)) !== null) {
    const key = `${match[1]}:${match[2]}`;
    if (!seen.has(key)) {
      seen.add(key);
      idx++;
      citations.push({
        sourceType: match[1],
        sourceId: match[2],
        index: idx,
      });
    }
  }

  return citations;
}

/**
 * Replace raw [src:type:id] markers with formatted inline citations.
 *
 * @param text - The text containing [src:...] markers.
 * @param style - The citation style to use.
 * @returns Text with citations replaced by the formatted style.
 */
export function replaceCitationMarkers(text: string, style: CitationStyle): string {
  const citations = extractCitations(text);
  if (citations.length === 0) return text;

  let result = text;
  const markerMap = new Map<string, string>();

  for (const c of citations) {
    const marker = `[src:${c.sourceType}:${c.sourceId}]`;
    if (!markerMap.has(marker)) {
      markerMap.set(marker, formatInlineCitation(c.sourceType, c.sourceId, style, c.index));
    }
  }

  for (const [marker, replacement] of markerMap) {
    result = result.split(marker).join(replacement);
  }

  return result;
}

/**
 * Format the citations section at the end of an explanation.
 *
 * @param citations - The citations to include in the section.
 * @param style - The section style (list, table, or compact).
 * @param showSourceIds - Whether to show source IDs.
 * @param showVerificationStatus - Whether to show verification status.
 * @param sectionHeading - Heading text for the section (empty = no heading).
 * @returns The formatted citations section as a string.
 */
export function formatCitationsSection(
  citations: readonly Citation[],
  style: CitationSectionStyle,
  showSourceIds: boolean,
  showVerificationStatus: boolean,
  sectionHeading: string,
): string {
  if (citations.length === 0) return '';

  const parts: string[] = [];

  // Add section heading
  if (sectionHeading) {
    parts.push(`\n---\n**${sectionHeading}:**\n`);
  } else {
    parts.push('\n---\n');
  }

  switch (style) {
    case 'list':
      parts.push(formatCitationsAsList(citations, showSourceIds, showVerificationStatus));
      break;
    case 'table':
      parts.push(formatCitationsAsTable(citations, showSourceIds, showVerificationStatus));
      break;
    case 'compact':
      parts.push(formatCitationsCompact(citations, showSourceIds));
      break;
  }

  return parts.join('');
}

/**
 * Format citations as a Markdown list.
 */
function formatCitationsAsList(
  citations: readonly Citation[],
  showSourceIds: boolean,
  showVerificationStatus: boolean,
): string {
  const lines: string[] = [];
  const sorted = stableSortCitations(citations);

  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    const label = SOURCE_TYPE_LABELS[c.sourceType as CitationSourceType] ?? 'Reference';
    const sourceId = showSourceIds ? ` (${c.sourceId})` : '';
    const status = showVerificationStatus
      ? c.verified
        ? ' ✓'
        : ` ✗${c.verificationError ? ` — ${c.verificationError}` : ''}`
      : '';

    lines.push(`[${i + 1}] **${label}:** ${c.label}${sourceId}${status}`);
  }

  return lines.join('\n');
}

/**
 * Format citations as a Markdown table.
 */
function formatCitationsAsTable(
  citations: readonly Citation[],
  showSourceIds: boolean,
  showVerificationStatus: boolean,
): string {
  const sorted = stableSortCitations(citations);
  const headers = [
    '#',
    'Type',
    'Label',
    ...(showSourceIds ? ['Source ID'] : []),
    ...(showVerificationStatus ? ['Status'] : []),
  ];
  const rows: string[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    const label = SOURCE_TYPE_LABELS[c.sourceType as CitationSourceType] ?? 'Reference';
    const row = [
      String(i + 1),
      label,
      c.label.length > 40 ? c.label.slice(0, 37) + '...' : c.label,
      ...(showSourceIds
        ? [c.sourceId.length > 30 ? c.sourceId.slice(0, 27) + '...' : c.sourceId]
        : []),
      ...(showVerificationStatus ? [c.verified ? '✓ Verified' : '✗ Failed'] : []),
    ];
    rows.push(`| ${row.join(' | ')} |`);
  }

  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  return `| ${headers.join(' | ')} |\n${separator}\n${rows.join('\n')}`;
}

/**
 * Format citations in compact form (no extra formatting).
 */
function formatCitationsCompact(citations: readonly Citation[], showSourceIds: boolean): string {
  const sorted = stableSortCitations(citations);
  const lines: string[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    const label = SOURCE_TYPE_LABELS[c.sourceType as CitationSourceType] ?? 'Reference';
    const sourceId = showSourceIds ? ` (${c.sourceId})` : '';
    lines.push(`[${i + 1}] ${label}: ${c.label}${sourceId}`);
  }

  return lines.join('\n');
}

/**
 * Strip all citation markers from text, returning clean text.
 *
 * @param text - Text containing citation markers.
 * @returns Text with all [src:...] markers removed.
 */
export function stripCitationMarkers(text: string): string {
  return text.replace(SRC_CITATION_PATTERN, '').trim();
}

/**
 * Get a sorted list of unique citation source types from citations.
 */
export function getCitationSourceTypes(citations: readonly Citation[]): CitationSourceType[] {
  const types = new Set<CitationSourceType>();
  for (const c of citations) {
    types.add(c.sourceType);
  }
  const result: CitationSourceType[] = [...types];
  return result.sort((a, b) => a.localeCompare(b));
}

// ═══════════════════════════════════════════════════════════════════════════
// Markdown Formatting
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a Markdown heading.
 *
 * @param text - The heading text.
 * @param level - The heading level (1-6).
 * @param style - The heading style (atx or setext).
 * @returns The formatted heading string.
 */
export function generateHeading(
  text: string,
  level: number,
  style: 'atx' | 'setext' | 'none' = 'atx',
): string {
  if (style === 'none' || !text) return text;
  const clampedLevel = Math.max(1, Math.min(6, level));

  if (style === 'setext' && clampedLevel <= 2) {
    const underline = clampedLevel === 1 ? '===' : '---';
    return `${text}\n${underline}`;
  }

  return `${HEADING_PREFIX[clampedLevel] ?? '# '}${text}`;
}

/**
 * Format a Markdown unordered list.
 *
 * @param items - The list items.
 * @param marker - The list marker character.
 * @returns The formatted list string.
 */
export function formatUnorderedList(items: readonly string[], marker: string = '-'): string {
  if (items.length === 0) return '';
  return items.map((item) => `${marker} ${item}`).join('\n');
}

/**
 * Format a Markdown ordered list.
 *
 * @param items - The list items.
 * @returns The formatted list string.
 */
export function formatOrderedList(items: readonly string[]): string {
  if (items.length === 0) return '';
  return items.map((item, i) => `${i + 1}. ${item}`).join('\n');
}

/**
 * Format a Markdown table.
 *
 * @param headers - The column headers.
 * @param rows - The data rows (array of arrays).
 * @returns The formatted table string.
 */
export function formatTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  if (headers.length === 0) return '';

  const headerRow = `| ${headers.join(' | ')} |`;
  const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`;
  const dataRows = rows.map(
    (row) =>
      `| ${row.map((cell) => (cell.length > 60 ? cell.slice(0, 57) + '...' : cell)).join(' | ')} |`,
  );

  return [headerRow, separatorRow, ...dataRows].join('\n');
}

/**
 * Format inline code.
 *
 * @param code - The code text.
 * @returns The formatted inline code.
 */
export function formatInlineCode(code: string): string {
  const escaped = code.replace(/`/g, '\\`');
  return `\`${escaped}\``;
}

/**
 * Format a code block.
 *
 * @param code - The code content.
 * @param language - Optional language identifier.
 * @returns The formatted code block.
 */
export function formatCodeBlock(code: string, language?: string): string {
  const lang = language ?? '';
  return `\`\`\`${lang}\n${code}\n\`\`\``;
}

// ═══════════════════════════════════════════════════════════════════════════
// JSON Formatting
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format an object as JSON with deterministic key ordering.
 *
 * Keys are sorted alphabetically for stable output. This ensures that
 * the same data always produces the same JSON string, which is critical
 * for cache key generation and deterministic tests.
 *
 * @param data - The data to serialize.
 * @param indent - The JSON indentation level (0 = compact).
 * @returns The formatted JSON string.
 */
export function formatJSON(data: Record<string, unknown>, indent: number = 2): string {
  if (indent > 0) {
    return JSON.stringify(data, stableReplacer(), indent);
  }
  return JSON.stringify(data, stableReplacer());
}

/**
 * Create a JSON replacer function that sorts keys alphabetically.
 */
function stableReplacer(): (this: unknown, key: string, value: unknown) => unknown {
  return function (_key: string, value: unknown): unknown {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {};
      const keys = Object.keys(value as Record<string, unknown>).sort();
      for (const k of keys) {
        sorted[k] = (value as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return value;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Whitespace Normalization
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize whitespace in text.
 *
 * - Collapses multiple spaces into one
 * - Collapses multiple newlines into paragraph separators
 * - Removes trailing whitespace from each line
 * - Removes leading/trailing whitespace from the entire text
 *
 * @param text - The text to normalize.
 * @param paragraphSeparator - The paragraph separator (default: "\n\n").
 * @returns The normalized text.
 */
export function normalizeWhitespace(text: string, paragraphSeparator: string = '\n\n'): string {
  if (!text) return text;

  let result = text;

  // Replace \r\n with \n
  result = result.replace(/\r\n/g, '\n');

  // Collapse multiple newlines (3+) into paragraph separators
  result = result.replace(/\n{3,}/g, paragraphSeparator);

  // Collapse multiple spaces (but preserve double newlines)
  result = result.replace(/[ \t]+/g, ' ');

  // Remove trailing whitespace from each line
  result = result.replace(/[ \t]+$/gm, '');

  // Remove leading/trailing whitespace
  result = result.trim();

  return result;
}

/**
 * Wrap a paragraph to a maximum line width.
 *
 * This is a simple greedy word-wrap algorithm that preserves existing
 * paragraph boundaries. It produces deterministic output.
 *
 * @param text - The paragraph text to wrap.
 * @param maxWidth - Maximum line width (0 = no wrapping).
 * @returns The wrapped text.
 */
export function wrapParagraph(text: string, maxWidth: number): string {
  if (maxWidth <= 0 || !text) return text;

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = word;
    } else if (currentLine.length === 0) {
      currentLine = word;
    } else {
      currentLine += ' ' + word;
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// Stable Ordering
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stable sort citations by their sequential index.
 *
 * @param citations - The citations to sort.
 * @returns A new sorted array.
 */
export function stableSortCitations(citations: readonly Citation[]): Citation[] {
  return [...citations].sort((a, b) => {
    // Sort by sourceType first, then by sourceId
    const typeCompare = a.sourceType.localeCompare(b.sourceType);
    if (typeCompare !== 0) return typeCompare;
    return a.sourceId.localeCompare(b.sourceId);
  });
}

/**
 * Stable sort an array of strings.
 *
 * @param arr - The array to sort.
 * @returns A new sorted array.
 */
export function stableSortArray(arr: string[]): string[] {
  return [...arr].sort((a, b) => a.localeCompare(b));
}

/**
 * Create a deterministic string representation of any value.
 *
 * This is useful for cache key generation and debug logging.
 * Objects are serialized with sorted keys for deterministic output.
 *
 * @param value - The value to stringify.
 * @returns The deterministic string representation.
 */
export function deterministicStringify(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return `[${value.map(deterministicStringify).join(',')}]`;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `"${k}":${deterministicStringify(obj[k])}`).join(',')}}`;
  }
  return String(value);
}

// ═══════════════════════════════════════════════════════════════════════════
// Text Analysis Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Count the number of sentences in text.
 *
 * Uses a simple heuristic: split on sentence-ending punctuation
 * followed by whitespace or end of string.
 *
 * @param text - The text to analyze.
 * @returns The number of sentences.
 */
export function countSentences(text: string): number {
  if (!text.trim()) return 0;
  const sentences = text.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim().length > 0);
  return sentences.length;
}

/**
 * Count the number of paragraphs in text.
 *
 * Paragraphs are separated by one or more blank lines.
 *
 * @param text - The text to analyze.
 * @returns The number of paragraphs.
 */
export function countParagraphs(text: string): number {
  if (!text.trim()) return 0;
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  return paragraphs.length;
}

/**
 * Truncate text to a maximum number of sentences.
 *
 * @param text - The text to truncate.
 * @param maxSentences - Maximum number of sentences (0 = no limit).
 * @returns The truncated text.
 */
export function truncateToSentences(text: string, maxSentences: number): string {
  if (maxSentences <= 0) return text;

  const sentences = text.match(/[^.!?]*[.!?]+/g);
  if (!sentences) return text;

  if (sentences.length <= maxSentences) return text;

  return sentences.slice(0, maxSentences).join(' ').trim();
}

/**
 * Truncate text to a maximum number of paragraphs.
 *
 * @param text - The text to truncate.
 * @param maxParagraphs - Maximum number of paragraphs (0 = no limit).
 * @returns The truncated text.
 */
export function truncateToParagraphs(text: string, maxParagraphs: number): string {
  if (maxParagraphs <= 0) return text;

  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  if (paragraphs.length <= maxParagraphs) return text;

  return paragraphs.slice(0, maxParagraphs).join('\n\n').trim();
}

/**
 * Format a severity label (e.g., "high" → "🔴 High").
 *
 * @param level - The severity level string.
 * @returns The formatted severity label.
 */
export function formatSeverityLabel(level: string): string {
  const symbols: Record<string, string> = {
    critical: '🔴 Critical',
    high: '🟠 High',
    medium: '🟡 Medium',
    low: '🟢 Low',
    negligible: '⚪ Negligible',
  };
  return symbols[level.toLowerCase()] ?? level;
}

/**
 * Format a confidence score as a percentage string.
 *
 * @param confidence - The confidence score (0-1).
 * @returns The formatted confidence string.
 */
export function formatConfidence(confidence: number): string {
  const percentage = Math.round(confidence * 100);
  return `${percentage}%`;
}

/**
 * Format a source location string from path, line, and column.
 *
 * @param path - The file path.
 * @param line - The line number.
 * @param column - Optional column number.
 * @returns The formatted source location.
 */
export function formatSourceLocation(path: string, line: number, column?: number): string {
  const col = column !== undefined ? `:${column}` : '';
  return `${path}:${line}${col}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Mode-Specific Formatting
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get mode-specific formatting rules as a description string.
 *
 * @param mode - The explanation mode.
 * @returns A description of the mode's formatting rules.
 */
export function getModeDescription(mode: ExplanationMode): string {
  switch (mode) {
    case 'simple':
      return 'Simple mode: one paragraph, essential citations only, no technical jargon.';
    case 'technical':
      return 'Technical mode: detailed paragraphs with evidence and risk context.';
    case 'expert':
      return 'Expert mode: full traceability chain with all evidence and source locations.';
  }
}
