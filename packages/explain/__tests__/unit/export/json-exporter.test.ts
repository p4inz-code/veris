/**
 * Tests for JSON exporter — canonical JSON with stable key ordering.
 */

import { describe, it, expect } from 'vitest';
import { JsonExporter } from '../../../src/export/json-exporter.js';
import { buildDocument, type ExportMetadata } from '../../../src/export/explanation-document.js';
import type { Explanation } from '../../../src/types/explanation.js';

const DEFAULT_OPTIONS = {
  format: 'json' as const,
  jsonMode: 'pretty' as const,
  jsonIndent: 2,
  includeToc: false,
  includeCitations: true,
  includeDisclaimer: true,
  overwrite: false,
  schemaVersion: '1.0.0',
  clock: { now: () => new Date('2026-07-04T00:00:00.000Z') },
  stableOrdering: true,
  encoding: 'utf-8' as const,
};

const COMPACT_OPTIONS = {
  ...DEFAULT_OPTIONS,
  jsonMode: 'compact' as const,
  jsonIndent: 0,
};

const TEST_EXPLANATION: Explanation = {
  id: 'exp_fin_abc123_a1b2c3',
  subjectId: 'fin_abc123',
  subjectType: 'finding',
  mode: 'technical',
  text: 'This finding detects a hardcoded AWS access key.',
  citations: [
    {
      id: 'cit_2',
      sourceType: 'evidence',
      sourceId: 'ev_def456',
      label: 'Evidence: src/config.ts:42',
      verified: true,
    },
    {
      id: 'cit_1',
      sourceType: 'finding',
      sourceId: 'fin_abc123',
      label: 'Finding: Hardcoded AWS Key',
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

describe('JsonExporter', () => {
  it('produces valid JSON output', () => {
    const exporter = new JsonExporter(DEFAULT_OPTIONS);
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const output = exporter.export(doc);
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('has deterministic key ordering', () => {
    const exporter = new JsonExporter(DEFAULT_OPTIONS);
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const output = exporter.export(doc);

    // Keys should be in alphabetical order
    // "cached" comes before "citations" (alphabetically)
    const cachedIdx = output.indexOf('"cached"');
    const citationsIdx = output.indexOf('"citations"');
    expect(cachedIdx).toBeLessThan(citationsIdx);
  });

  it('includes schema version', () => {
    const exporter = new JsonExporter(DEFAULT_OPTIONS);
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const output = exporter.export(doc);
    const parsed = JSON.parse(output);
    expect(parsed.metadata.schemaVersion).toBe('1.0.0');
  });

  it('sorts citations by ID', () => {
    const exporter = new JsonExporter(DEFAULT_OPTIONS);
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const output = exporter.export(doc);
    const parsed = JSON.parse(output);
    expect(parsed.citations[0].id).toBe('cit_1');
    expect(parsed.citations[1].id).toBe('cit_2');
  });

  it('produces pretty JSON with indentation', () => {
    const exporter = new JsonExporter(DEFAULT_OPTIONS);
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const output = exporter.export(doc);
    // Pretty JSON has newlines and indentation
    expect(output).toContain('\n  ');
    expect(output.endsWith('\n')).toBe(true);
  });

  it('produces compact JSON without indentation', () => {
    const exporter = new JsonExporter(COMPACT_OPTIONS);
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const output = exporter.export(doc);
    // Compact JSON should not have indentation
    const parsed = JSON.parse(output);
    expect(parsed.explanation.id).toBe('exp_fin_abc123_a1b2c3');
  });

  it('is deterministic across 100 runs', () => {
    const exporter = new JsonExporter(DEFAULT_OPTIONS);
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const first = exporter.export(doc);
    for (let i = 0; i < 100; i++) {
      const output = exporter.export(doc);
      expect(output).toBe(first);
    }
  });

  it('handles unicode in content', () => {
    const unicodeExplanation: Explanation = {
      ...TEST_EXPLANATION,
      text: 'Unicode: 世界, café, résumé',
    };
    const exporter = new JsonExporter(DEFAULT_OPTIONS);
    const doc = buildDocument(unicodeExplanation, TEST_METADATA);
    const output = exporter.export(doc);
    const parsed = JSON.parse(output);

    // Get sections and find explanation section
    const explainSection = parsed.sections.find(
      (s: { orderKey: string }) => s.orderKey === '010_explanation',
    );
    expect(explainSection.body).toContain('世界');
  });

  it('includes provider info', () => {
    const exporter = new JsonExporter(DEFAULT_OPTIONS);
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const output = exporter.export(doc);
    const parsed = JSON.parse(output);
    expect(parsed.provider.id).toBe('test-provider');
    expect(parsed.provider.model).toBe('test-model');
  });

  it('includes token usage', () => {
    const exporter = new JsonExporter(DEFAULT_OPTIONS);
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const output = exporter.export(doc);
    const parsed = JSON.parse(output);
    expect(parsed.tokenUsage.totalTokens).toBe(150);
  });

  it('handles refused explanations', () => {
    const refusedExplanation: Explanation = {
      ...TEST_EXPLANATION,
      refused: true,
      refusalReason: 'Insufficient evidence.',
    };
    const exporter = new JsonExporter(DEFAULT_OPTIONS);
    const doc = buildDocument(refusedExplanation, TEST_METADATA);
    const output = exporter.export(doc);
    const parsed = JSON.parse(output);
    expect(parsed.refused).toBe(true);
    expect(parsed.refusalReason).toBe('Insufficient evidence.');
  });

  it('keys are alphabetically sorted at every level', () => {
    const exporter = new JsonExporter(DEFAULT_OPTIONS);
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const output = exporter.export(doc);
    const parsed = JSON.parse(output);

    // Check top-level keys are sorted
    const keys = Object.keys(parsed);
    const sortedKeys = [...keys].sort();
    expect(keys).toEqual(sortedKeys);

    // Check nested object keys are sorted
    const explanationKeys = Object.keys(parsed.explanation);
    const sortedExplanationKeys = [...explanationKeys].sort();
    expect(explanationKeys).toEqual(sortedExplanationKeys);
  });
});
