/**
 * Tests for ReportBuilder — aggregated ExplanationReport.
 */

import { describe, it, expect } from 'vitest';
import { ReportBuilder } from '../../../src/export/report-builder.js';
import { buildDocument, type ExportMetadata } from '../../../src/export/explanation-document.js';
import type { Explanation } from '../../../src/types/explanation.js';

const FIXED_CLOCK = { now: () => new Date('2026-07-04T00:00:00.000Z') };

const TEST_EXPLANATION: Explanation = {
  id: 'exp_fin_001_a1b2c3',
  subjectId: 'fin_001',
  subjectType: 'finding',
  mode: 'technical',
  text: 'Test explanation content.',
  citations: [
    {
      id: 'cit_1',
      sourceType: 'finding',
      sourceId: 'fin_001',
      label: 'Test citation',
      verified: true,
    },
  ],
  citationValidation: {
    valid: true,
    totalCitations: 1,
    verifiedCitations: 1,
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

describe('ReportBuilder', () => {
  const builder = new ReportBuilder(FIXED_CLOCK, '1.0.0', '1.0.0');

  it('builds a report from documents', () => {
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const filePaths = new Map([['fin_001::technical', '/tmp/output.md']]);
    const fileSizes = new Map([['fin_001::technical', 1024]]);

    const report = builder.build([doc], filePaths, fileSizes);

    expect(report.totalExplanations).toBe(1);
    expect(report.entries).toHaveLength(1);
    expect(report.entries[0].subjectId).toBe('fin_001');
    expect(report.statistics.totalTokens).toBe(150);
  });

  it('builds empty report', () => {
    const report = builder.buildEmpty();
    expect(report.totalExplanations).toBe(0);
    expect(report.entries).toHaveLength(0);
  });

  it('computes correct statistics', () => {
    const doc1 = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const doc2 = buildDocument(
      { ...TEST_EXPLANATION, id: 'exp_fin_002', subjectId: 'fin_002', mode: 'simple' },
      TEST_METADATA,
    );
    const docs = [doc1, doc2];
    const filePaths = new Map([
      ['fin_001::technical', '/tmp/fin_001.md'],
      ['fin_002::simple', '/tmp/fin_002.md'],
    ]);
    const fileSizes = new Map([
      ['fin_001::technical', 512],
      ['fin_002::simple', 256],
    ]);

    const report = builder.build(docs, filePaths, fileSizes);

    expect(report.totalExplanations).toBe(2);
    expect(report.statistics.totalTokens).toBe(300);
    expect(report.statistics.totalCitations).toBe(2);
    expect(report.statistics.totalBytes).toBe(768);
    expect(report.statistics.modeBreakdown.technical).toBe(1);
    expect(report.statistics.modeBreakdown.simple).toBe(1);
  });

  it('sorts entries deterministically by subjectId', () => {
    const docB = buildDocument(
      { ...TEST_EXPLANATION, id: 'exp_fin_002', subjectId: 'fin_B' },
      TEST_METADATA,
    );
    const docA = buildDocument(
      { ...TEST_EXPLANATION, id: 'exp_fin_001', subjectId: 'fin_A' },
      TEST_METADATA,
    );
    const docs = [docB, docA];
    const filePaths = new Map([
      ['fin_A::technical', '/tmp/a.md'],
      ['fin_B::technical', '/tmp/b.md'],
    ]);
    const fileSizes = new Map([
      ['fin_A::technical', 100],
      ['fin_B::technical', 100],
    ]);

    const report = builder.build(docs, filePaths, fileSizes);

    expect(report.entries[0].subjectId).toBe('fin_A');
    expect(report.entries[1].subjectId).toBe('fin_B');
  });

  it('tracks cached and refused counts', () => {
    const doc1 = buildDocument({ ...TEST_EXPLANATION, cached: true }, TEST_METADATA);
    const doc2 = buildDocument(
      {
        ...TEST_EXPLANATION,
        id: 'exp_002',
        subjectId: 'fin_002',
        refused: true,
        refusalReason: 'No evidence.',
      },
      TEST_METADATA,
    );
    const docs = [doc1, doc2];
    const filePaths = new Map([
      ['fin_001::technical', '/tmp/1.md'],
      ['fin_002::technical', '/tmp/2.md'],
    ]);
    const fileSizes = new Map([
      ['fin_001::technical', 100],
      ['fin_002::technical', 100],
    ]);

    const report = builder.build(docs, filePaths, fileSizes);
    expect(report.statistics.totalCached).toBe(1);
    expect(report.statistics.totalRefused).toBe(1);
  });

  it('is deterministic across 100 runs', () => {
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const filePaths = new Map([['fin_001::technical', '/tmp/out.md']]);
    const fileSizes = new Map([['fin_001::technical', 1024]]);

    const first = builder.build([doc], filePaths, fileSizes);
    for (let i = 0; i < 100; i++) {
      const report = builder.build([doc], filePaths, fileSizes);
      expect(report.entries).toEqual(first.entries);
      expect(report.statistics).toEqual(first.statistics);
    }
  });
});
