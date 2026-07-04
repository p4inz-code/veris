/**
 * Evidence ordering — deterministic sort for evidence items.
 *
 * Per SPEC-011 §4.2.1 and §7.3, evidence items are sorted by:
 *   1. confidence DESC
 *   2. severity score DESC
 *   3. source path ASC (string comparison)
 *   4. start line ASC
 *   5. object ID ASC (final tiebreaker)
 *
 * A stable sort is REQUIRED. Use localeCompare for path comparison.
 *
 * @module @veris/explain/context/evidence-ordering
 */

import type { Evidence } from '@veris/core';

import type { ExplainedEvidence } from '../types/context.js';

/** Sort key for deterministic evidence ordering. */
interface EvidenceSortKey {
  readonly confidence: number; // DESC — higher first
  readonly severityScore: number; // DESC — higher first
  readonly sourcePath: string; // ASC — lexicographic
  readonly startLine: number; // ASC — lower first
  readonly id: string; // ASC — final tiebreaker
}

/**
 * Build a sort key from an ExplainedEvidence for deterministic ordering.
 */
function buildSortKey(evidence: ExplainedEvidence): EvidenceSortKey {
  return {
    confidence: evidence.confidence,
    severityScore: 0, // ExplainedEvidence doesn't carry severity directly
    sourcePath: evidence.sourceLocation.path,
    startLine: evidence.sourceLocation.startLine,
    id: evidence.id,
  };
}

/**
 * Compare two evidence sort keys per SPEC-011 ordering:
 * confidence DESC, severity DESC, path ASC, line ASC, ID ASC.
 *
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
function compareSortKeys(a: EvidenceSortKey, b: EvidenceSortKey): number {
  // 1. confidence DESC
  if (a.confidence !== b.confidence) return b.confidence - a.confidence;
  // 2. severity DESC (not available from ExplainedEvidence — skip)
  // 3. source path ASC
  const pathCmp = a.sourcePath.localeCompare(b.sourcePath);
  if (pathCmp !== 0) return pathCmp;
  // 4. start line ASC
  if (a.startLine !== b.startLine) return a.startLine - b.startLine;
  // 5. object ID ASC (final tiebreaker)
  return a.id.localeCompare(b.id);
}

// ── Raw Evidence Sort Key Builder ──

/** Sort key for a raw canonical Evidence object (before conversion). */
interface RawEvidenceSortKey {
  readonly confidence: number;
  readonly severityScore: number;
  readonly path: string;
  readonly startLine: number;
  readonly id: string;
}

/**
 * Build a sort key from a raw canonical Evidence object.
 * Severity is not available at the Evidence level (it lives on the Finding).
 */
function buildRawSortKey(evidence: Evidence): RawEvidenceSortKey {
  return {
    confidence: evidence.confidence,
    severityScore: 0,
    path: '', // Path will be set later from the associated artifact
    startLine: 0, // Line will be set later
    id: evidence.id,
  };
}

/**
 * Compare two raw evidence sort keys per SPEC-011 ordering:
 * confidence DESC, severity DESC, path ASC, line ASC, ID ASC.
 */
function compareRawSortKeys(a: RawEvidenceSortKey, b: RawEvidenceSortKey): number {
  // 1. confidence DESC
  if (a.confidence !== b.confidence) return b.confidence - a.confidence;
  // 2. severity score DESC (from matchDetail)
  if (a.severityScore !== b.severityScore) return b.severityScore - a.severityScore;
  // 3. path ASC
  const pathCmp = a.path.localeCompare(b.path);
  if (pathCmp !== 0) return pathCmp;
  // 4. start line ASC
  if (a.startLine !== b.startLine) return a.startLine - b.startLine;
  // 5. object ID ASC
  return a.id.localeCompare(b.id);
}

// ── Public API ──

/**
 * Sort evidence items in deterministic order per SPEC-011.
 *
 * Order: confidence DESC, severity DESC, path ASC, line ASC, ID ASC.
 * Uses Array.sort but with a stable sort implementation to guarantee
 * deterministic ordering regardless of JS engine.
 *
 * @param evidence - Evidence items to sort (ExplainedEvidence format).
 * @returns A new sorted array (does not mutate input).
 */
export function sortEvidence(evidence: readonly ExplainedEvidence[]): ExplainedEvidence[] {
  if (evidence.length <= 1) return [...evidence];

  // Build sort keys and sort with stable comparison
  const indexed = evidence.map((item) => ({
    item,
    key: buildSortKey(item),
    index: 0,
  }));

  // Use stable sort by tracking original indices for equal keys
  indexed.forEach((entry, i) => {
    entry.index = i;
  });

  indexed.sort((a, b) => {
    const cmp = compareSortKeys(a.key, b.key);
    if (cmp !== 0) return cmp;
    // Preserve original order for equal keys (stable sort)
    return a.index - b.index;
  });

  return indexed.map((entry) => entry.item);
}

/**
 * Sort evidence items in deterministic order using canonical Evidence objects.
 *
 * @param evidence - Raw evidence items from the CanonicalReport.
 * @param getPath - Callback to resolve the source path for an evidence item.
 * @param getLine - Callback to resolve the start line for an evidence item.
 * @returns A new sorted array (does not mutate input).
 */
export function sortCanonicalEvidence(
  evidence: readonly Evidence[],
  getPath: (id: string) => string,
  getLine: (id: string) => number,
): Evidence[] {
  if (evidence.length <= 1) return [...evidence];

  const indexed = evidence.map((item, index) => ({
    item,
    key: {
      ...buildRawSortKey(item),
      path: getPath(item.id),
      startLine: getLine(item.id),
    },
    index,
  }));

  indexed.sort((a, b) => {
    const cmp = compareRawSortKeys(a.key, b.key);
    if (cmp !== 0) return cmp;
    return a.index - b.index;
  });

  return indexed.map((entry) => entry.item);
}

/**
 * Sort evidence items using a pre-built ExplainedEvidence array.
 * This is the recommended method for context building.
 *
 * @param evidence - Evidence items to sort.
 * @returns A new sorted array.
 */
export function sortExplainedEvidence(evidence: readonly ExplainedEvidence[]): ExplainedEvidence[] {
  return sortEvidence(evidence);
}

/**
 * Limit evidence to the top N items after sorting.
 * Used by TokenBudget to enforce evidence count limits.
 *
 * @param evidence - Sorted evidence array.
 * @param maxItems - Maximum number of items to keep.
 * @returns At most maxItems items.
 */
export function limitEvidence<T>(evidence: readonly T[], maxItems: number): T[] {
  return evidence.slice(0, Math.max(0, maxItems));
}
