/**
 * Tests for Markdown exporter — deterministic output, TOC, citations.
 */

import { describe, it, expect } from 'vitest';
import { MarkdownExporter } from '../../../src/export/markdown-exporter.js';
import { buildDocument, type ExportMetadata } from '../../../src/export/explanation-document.js';
import type { Explanation } from '../../../src/types/explanation.js';

const DEFAULT_OPTIONS = {
  format: 'markdown' as const,
  jsonMode: 'pretty' as const,
  jsonIndent: 2,
  includeToc: true,
  includeCitations: true,
  includeDisclaimer: true,
  overwrite: false,
  schemaVersion: '1.0.0',
  clock: { now: () => new Date('2026-07-04T00:00:00.000Z') },
  stableOrdering: true,
  encoding: 'utf-8' as const,
};

const TEST_EXPLANATION: Explanation = {
  id: 'exp_fin_abc123_a1b2c3',
  subjectId: 'fin_abc123',
  subjectType: 'finding',
  mode: 'technical',
  text: 'This finding detects a hardcoded AWS access key in the source code.',
  citations: [
    {
      id: 'cit_1',
      sourceType: 'finding',
      sourceId: 'fin_abc123',
      label: 'Finding: Hardcoded AWS Key',
      verified: true,
    },
    {
      id: 'cit_2',
      sourceType: 'evidence',
      sourceId: 'ev_def456',
      label: 'Evidence: src/config.ts:42',
      verified: true,
    },
  ],
  citationValidation: {
    valid: true,
    totalCitations: 2,
    verifiedCitations: 2,
    failedCitations: 0,
    citations: [],
  },
  provider: { id: 'test-provider', model: 'test-model' },
  promptVersion: '1.0.0',
  tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
  cached: false,
  refused: false,
  generatedAt: '2026-07-04T00:00:00.000Z',
  disclaimer: 'AI-generated explanation.',
};

const TEST_METADATA: ExportMetadata = {
  exportedAt: '2026-07-04T00:00:00.000Z',
  schemaVersion: '1.0.0',
  engineVersion: '1.0.0',
};

describe('MarkdownExporter', () => {
  it('produces markdown output', () => {
    const exporter = new MarkdownExporter(DEFAULT_OPTIONS);
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const output = exporter.export(doc);
    expect(output).toContain('# Technical Explanation: fin_abc123');
    expect(output).toContain('This finding detects');
    expect(output).toContain('AI-generated explanation');
  });

  it('includes table of contents when enabled', () => {
    const exporter = new MarkdownExporter(DEFAULT_OPTIONS);
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const output = exporter.export(doc);
    expect(output).toContain('## Table of Contents');
    expect(output).toContain('[Explanation](#explanation)');
  });

  it('omits table of contents when disabled', () => {
    const exporter = new MarkdownExporter({
      ...DEFAULT_OPTIONS,
      includeToc: false,
    });
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const output = exporter.export(doc);
    expect(output).not.toContain('## Table of Contents');
  });

  it('includes citations section when enabled', () => {
    const exporter = new MarkdownExporter(DEFAULT_OPTIONS);
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const output = exporter.export(doc);
    expect(output).toContain('## Citations');
    expect(output).toContain('[cit_1]');
    expect(output).toContain('[cit_2]');
  });

  it('omits citations section when disabled', () => {
    const exporter = new MarkdownExporter({
      ...DEFAULT_OPTIONS,
      includeCitations: false,
    });
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const output = exporter.export(doc);
    expect(output).not.toContain('## Citations');
  });

  it('includes disclaimer when enabled', () => {
    const exporter = new MarkdownExporter(DEFAULT_OPTIONS);
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const output = exporter.export(doc);
    expect(output).toContain('AI-generated explanation');
  });

  it('omits disclaimer when disabled', () => {
    const exporter = new MarkdownExporter({
      ...DEFAULT_OPTIONS,
      includeDisclaimer: false,
    });
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const output = exporter.export(doc);
    expect(output).not.toContain('AI-generated explanation');
  });

  it('includes provider metadata', () => {
    const exporter = new MarkdownExporter(DEFAULT_OPTIONS);
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const output = exporter.export(doc);
    expect(output).toContain('test-provider/test-model');
  });

  it('produces deterministic output across 100 runs', () => {
    const exporter = new MarkdownExporter(DEFAULT_OPTIONS);
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const first = exporter.export(doc);
    for (let i = 0; i < 100; i++) {
      const output = exporter.export(doc);
      expect(output).toBe(first);
    }
  });

  it('sorts sections by orderKey', () => {
    const exporter = new MarkdownExporter(DEFAULT_OPTIONS);
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const output = exporter.export(doc);

    // Sections should appear in orderKey order
    const explanationIdx = output.indexOf('## Explanation');
    const providerIdx = output.indexOf('## Provider');

    expect(explanationIdx).toBeLessThan(providerIdx);
  });

  it('handles unicode in content', () => {
    const unicodeExplanation: Explanation = {
      ...TEST_EXPLANATION,
      text: 'Unicode content: 世界, café, résumé, 日本語',
    };
    const exporter = new MarkdownExporter(DEFAULT_OPTIONS);
    const doc = buildDocument(unicodeExplanation, TEST_METADATA);
    const output = exporter.export(doc);
    expect(output).toContain('世界');
    expect(output).toContain('café');
    expect(output).toContain('日本語');
  });

  it('handles empty citations', () => {
    const emptyExplanation: Explanation = {
      ...TEST_EXPLANATION,
      citations: [],
    };
    const exporter = new MarkdownExporter(DEFAULT_OPTIONS);
    const doc = buildDocument(emptyExplanation, TEST_METADATA);
    const output = exporter.export(doc);
    expect(output).toContain('# Technical Explanation: fin_abc123');
  });

  it('produces valid markdown structure', () => {
    const exporter = new MarkdownExporter(DEFAULT_OPTIONS);
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const output = exporter.export(doc);

    // Should start with a heading
    expect(output).toMatch(/^# .+/);
    // Should have at least two headings
    const headingMatches = output.match(/^#+/gm);
    expect(headingMatches!.length).toBeGreaterThanOrEqual(2);
  });
});
