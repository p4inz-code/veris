/**
 * Tests for ExportSummaryBuilder — human-readable export summaries.
 */

import { describe, it, expect } from 'vitest';
import { ExportSummaryBuilder } from '../../../src/export/export-summary.js';
import { buildDocument, type ExportMetadata } from '../../../src/export/explanation-document.js';
import type { Explanation } from '../../../src/types/explanation.js';

const FIXED_CLOCK = { now: () => new Date('2026-07-04T00:00:00.000Z') };

const BASE_OPTIONS = {
  format: 'markdown' as const,
  jsonMode: 'pretty' as const,
  jsonIndent: 2,
  includeToc: true,
  includeCitations: true,
  includeDisclaimer: true,
  overwrite: false,
  schemaVersion: '1.0.0',
  clock: FIXED_CLOCK,
  stableOrdering: true,
  encoding: 'utf-8' as const,
};

const TEST_EXPLANATION: Explanation = {
  id: 'exp_fin_001_a1b2c3',
  subjectId: 'fin_001',
  subjectType: 'finding',
  mode: 'technical',
  text: 'Test explanation content.',
  citations: [],
  citationValidation: {
    valid: true,
    totalCitations: 0,
    verifiedCitations: 0,
    failedCitations: 0,
    citations: [],
  },
  provider: { id: 'test-provider', model: 'test-model' },
  promptVersion: '1.0.0',
  tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
  cached: false,
  refused: false,
  generatedAt: '2026-07-04T00:00:00.000Z',
  disclaimer: 'AI-generated.',
};

const TEST_METADATA: ExportMetadata = {
  exportedAt: '2026-07-04T00:00:00.000Z',
  schemaVersion: '1.0.0',
  engineVersion: '1.0.0',
};

describe('ExportSummaryBuilder', () => {
  const builder = new ExportSummaryBuilder(FIXED_CLOCK, BASE_OPTIONS);

  it('builds a single summary', () => {
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const summary = builder.buildSingle(doc, '/tmp/output.md', 1024, true);

    expect(summary.subjectId).toBe('fin_001');
    expect(summary.mode).toBe('technical');
    expect(summary.fileSize).toBe(1024);
    expect(summary.success).toBe(true);
  });

  it('builds complete summary from multiple summaries', () => {
    const doc1 = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const doc2 = buildDocument(
      { ...TEST_EXPLANATION, id: 'exp_002', subjectId: 'fin_002', mode: 'simple' },
      TEST_METADATA,
    );

    const s1 = builder.buildSingle(doc1, '/tmp/1.md', 512, true);
    const s2 = builder.buildSingle(doc2, '/tmp/2.md', 256, true);

    const summary = builder.buildComplete([s1, s2], 150);

    expect(summary.totalExplanations).toBe(2);
    expect(summary.totalFiles).toBe(2);
    expect(summary.totalBytes).toBe(768);
    expect(summary.totalTokens).toBe(300);
    expect(summary.durationMs).toBe(150);
    expect(summary.successful).toBe(2);
    expect(summary.failed).toBe(0);
  });

  it('tracks cache hits and misses', () => {
    const doc1 = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const doc2 = buildDocument(
      { ...TEST_EXPLANATION, id: 'exp_002', subjectId: 'fin_002', cached: true },
      TEST_METADATA,
    );
    const doc3 = buildDocument(
      { ...TEST_EXPLANATION, id: 'exp_003', subjectId: 'fin_003', cached: true },
      TEST_METADATA,
    );

    const s1 = builder.buildSingle(doc1, '/tmp/1.md', 100, true);
    const s2 = builder.buildSingle(doc2, '/tmp/2.md', 100, true);
    const s3 = builder.buildSingle(doc3, '/tmp/3.md', 100, true);

    const summary = builder.buildComplete([s1, s2, s3], 200);

    expect(summary.cacheStats.total).toBe(3);
    expect(summary.cacheStats.hits).toBe(2);
    expect(summary.cacheStats.misses).toBe(1);
    expect(summary.cacheStats.hitRate).toBeCloseTo(0.667, 2);
  });

  it('tracks failures', () => {
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const s1 = builder.buildSingle(doc, '/tmp/1.md', 100, true);
    const s2 = builder.buildSingle(doc, '/tmp/2.md', 0, false, 'File exists');

    const summary = builder.buildComplete([s1, s2], 100);

    expect(summary.successful).toBe(1);
    expect(summary.failed).toBe(1);
  });

  it('computes mode breakdown', () => {
    const doc1 = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const doc2 = buildDocument(
      { ...TEST_EXPLANATION, id: 'exp_002', subjectId: 'fin_002', mode: 'simple' },
      TEST_METADATA,
    );
    const doc3 = buildDocument(
      { ...TEST_EXPLANATION, id: 'exp_003', subjectId: 'fin_003', mode: 'simple' },
      TEST_METADATA,
    );

    const s1 = builder.buildSingle(doc1, '/tmp/1.md', 100, true);
    const s2 = builder.buildSingle(doc2, '/tmp/2.md', 100, true);
    const s3 = builder.buildSingle(doc3, '/tmp/3.md', 100, true);

    const summary = builder.buildComplete([s1, s2, s3], 100);

    expect(summary.modeBreakdown.technical).toBe(1);
    expect(summary.modeBreakdown.simple).toBe(2);
  });

  it('sorts summaries by subjectId', () => {
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const sB = builder.buildSingle(doc, '/tmp/b.md', 100, true);
    const sA = builder.buildSingle(doc, '/tmp/a.md', 100, true);

    const summary = builder.buildComplete([sB, sA], 0);

    expect(summary.summaries[0].subjectId).toBe('fin_001');
  });

  it('formats summary as Markdown', () => {
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const s = builder.buildSingle(doc, '/tmp/out.md', 512, true);
    const summary = builder.buildComplete([s], 100);

    const md = builder.formatMarkdown(summary);

    expect(md).toContain('# Export Summary');
    expect(md).toContain('fin_001');
    expect(md).toContain('512 B');
  });

  it('formats summary as plain text', () => {
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const s = builder.buildSingle(doc, '/tmp/out.md', 512, true);
    const summary = builder.buildComplete([s], 100);

    const plain = builder.formatPlain(summary);

    expect(plain).toContain('Export Summary');
    expect(plain).toContain('fin_001');
  });

  it('handles empty result set', () => {
    const summary = builder.buildComplete([], 0);

    expect(summary.totalExplanations).toBe(0);
    expect(summary.totalBytes).toBe(0);
    expect(summary.successful).toBe(0);
    expect(summary.cacheStats.hitRate).toBe(0);
  });

  it('is deterministic across 100 runs', () => {
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const s = builder.buildSingle(doc, '/tmp/out.md', 512, true);

    const first = builder.buildComplete([s], 100);
    for (let i = 0; i < 100; i++) {
      const summary = builder.buildComplete([s], 100);
      expect(summary.summaries).toEqual(first.summaries);
    }
  });
});
