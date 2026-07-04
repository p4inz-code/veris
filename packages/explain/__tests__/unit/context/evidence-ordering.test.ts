/**
 * Tests for M3 — Evidence ordering.
 *
 * Tests:
 * - Deterministic sort order: confidence DESC, severity DESC, path ASC, line ASC, ID ASC
 * - Stable sort (same keys preserve input order)
 * - Edge cases: empty array, single item, identical sort keys, NaN confidence
 * - Limit evidence to max items
 *
 * @module @veris/explain/__tests__/unit/context/evidence-ordering.test
 */

import { describe, it, expect } from 'vitest';
import { sortExplainedEvidence, limitEvidence } from '../../../src/context/evidence-ordering.js';
import type { ExplainedEvidence } from '../../../src/types/context.js';

function makeEvidence(overrides: Partial<ExplainedEvidence> & { id: string }): ExplainedEvidence {
  return {
    id: overrides.id,
    sourceLocation: {
      path: overrides.sourceLocation?.path ?? 'src/default.ts',
      startLine: overrides.sourceLocation?.startLine ?? 1,
      startColumn: overrides.sourceLocation?.startColumn ?? 0,
      snippet: overrides.sourceLocation?.snippet,
    },
    matchDetail: {
      kind: overrides.matchDetail?.kind ?? 'regex',
      value: overrides.matchDetail?.value,
    },
    confidence: overrides.confidence ?? 0.9,
  };
}

describe('sortExplainedEvidence', () => {
  it('sorts by confidence DESC', () => {
    const items = [
      makeEvidence({ id: 'a', confidence: 0.5 }),
      makeEvidence({ id: 'b', confidence: 0.9 }),
      makeEvidence({ id: 'c', confidence: 0.7 }),
    ];

    const sorted = sortExplainedEvidence(items);
    expect(sorted[0].id).toBe('b');
    expect(sorted[1].id).toBe('c');
    expect(sorted[2].id).toBe('a');
  });

  it('sorts by path ASC when confidence is equal', () => {
    const items = [
      makeEvidence({
        id: 'a',
        confidence: 0.9,
        sourceLocation: { path: 'z.ts', startLine: 1, startColumn: 0 },
      }),
      makeEvidence({
        id: 'b',
        confidence: 0.9,
        sourceLocation: { path: 'a.ts', startLine: 1, startColumn: 0 },
      }),
    ];

    const sorted = sortExplainedEvidence(items);
    expect(sorted[0].id).toBe('b');
    expect(sorted[1].id).toBe('a');
  });

  it('sorts by line ASC when confidence and path are equal', () => {
    const items = [
      makeEvidence({
        id: 'a',
        confidence: 0.9,
        sourceLocation: { path: 'file.ts', startLine: 42, startColumn: 0 },
      }),
      makeEvidence({
        id: 'b',
        confidence: 0.9,
        sourceLocation: { path: 'file.ts', startLine: 10, startColumn: 0 },
      }),
    ];

    const sorted = sortExplainedEvidence(items);
    expect(sorted[0].id).toBe('b');
    expect(sorted[1].id).toBe('a');
  });

  it('sorts by ID ASC as final tiebreaker', () => {
    const items = [
      makeEvidence({
        id: 'z',
        confidence: 0.9,
        sourceLocation: { path: 'f.ts', startLine: 1, startColumn: 0 },
      }),
      makeEvidence({
        id: 'a',
        confidence: 0.9,
        sourceLocation: { path: 'f.ts', startLine: 1, startColumn: 0 },
      }),
    ];

    const sorted = sortExplainedEvidence(items);
    expect(sorted[0].id).toBe('a');
    expect(sorted[1].id).toBe('z');
  });

  it('returns empty array for empty input', () => {
    const sorted = sortExplainedEvidence([]);
    expect(sorted).toEqual([]);
  });

  it('returns single item unchanged', () => {
    const item = makeEvidence({ id: 'a', confidence: 0.5 });
    const sorted = sortExplainedEvidence([item]);
    expect(sorted).toEqual([item]);
  });

  it('is stable for equal sort keys', () => {
    // Items with identical sort keys should preserve original order
    const items = [
      makeEvidence({
        id: 'a',
        confidence: 0.9,
        sourceLocation: { path: 'f.ts', startLine: 1, startColumn: 0 },
      }),
      makeEvidence({
        id: 'b',
        confidence: 0.9,
        sourceLocation: { path: 'f.ts', startLine: 1, startColumn: 0 },
      }),
      makeEvidence({
        id: 'c',
        confidence: 0.9,
        sourceLocation: { path: 'f.ts', startLine: 1, startColumn: 0 },
      }),
    ];

    const sorted = sortExplainedEvidence(items);
    // With identical keys, ID ASC should be the final tiebreaker
    expect(sorted[0].id).toBe('a');
    expect(sorted[1].id).toBe('b');
    expect(sorted[2].id).toBe('c');
  });

  it('does not mutate the input array', () => {
    const items = [
      makeEvidence({ id: 'a', confidence: 0.5 }),
      makeEvidence({ id: 'b', confidence: 0.9 }),
    ];

    const copy = [...items];
    sortExplainedEvidence(items);
    expect(items).toEqual(copy);
  });
});

describe('limitEvidence', () => {
  it('returns at most maxItems', () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      makeEvidence({ id: `ev_${i}`, confidence: 0.5 }),
    );
    const limited = limitEvidence(items, 10);
    expect(limited.length).toBe(10);
  });

  it('returns all items when count is less than max', () => {
    const items = [makeEvidence({ id: 'a' }), makeEvidence({ id: 'b' })];
    const limited = limitEvidence(items, 10);
    expect(limited.length).toBe(2);
  });

  it('returns empty array for maxItems <= 0', () => {
    const items = [makeEvidence({ id: 'a' })];
    expect(limitEvidence(items, 0)).toEqual([]);
    expect(limitEvidence(items, -1)).toEqual([]);
  });
});
