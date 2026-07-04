/**
 * Tests for explanation document building.
 */

import { describe, it, expect } from 'vitest';
import {
  buildDocument,
  buildCitationEntries,
  buildSections,
  citationToEntry,
  type ExplanationDocument,
  type ExportMetadata,
} from '../../../src/export/explanation-document.js';
import type { Explanation } from '../../../src/types/explanation.js';

// ── Test Fixtures ──

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

describe('buildDocument', () => {
  it('builds a valid ExplanationDocument', () => {
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    expect(doc.explanation.id).toBe('exp_fin_abc123_a1b2c3');
    expect(doc.explanation.subjectId).toBe('fin_abc123');
    expect(doc.explanation.mode).toBe('technical');
    expect(doc.metadata.exportedAt).toBe('2026-07-04T00:00:00.000Z');
    expect(doc.metadata.schemaVersion).toBe('1.0.0');
  });

  it('includes provider info', () => {
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    expect(doc.provider.id).toBe('test-provider');
    expect(doc.provider.model).toBe('test-model');
  });

  it('includes token usage', () => {
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    expect(doc.tokenUsage.promptTokens).toBe(100);
    expect(doc.tokenUsage.completionTokens).toBe(50);
    expect(doc.tokenUsage.totalTokens).toBe(150);
  });

  it('includes cached flag', () => {
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    expect(doc.cached).toBe(false);
  });

  it('includes refused flag', () => {
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    expect(doc.refused).toBe(false);
  });

  it('includes citations sorted by ID', () => {
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    expect(doc.citations).toHaveLength(2);
    expect(doc.citations[0].id).toBe('cit_1');
    expect(doc.citations[1].id).toBe('cit_2');
  });

  it('includes sections with explanation text', () => {
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    expect(doc.sections.length).toBeGreaterThanOrEqual(1);
    const explainSection = doc.sections.find((s) => s.orderKey === '010_explanation');
    expect(explainSection).toBeDefined();
    expect(explainSection!.body).toContain('AWS access key');
  });

  it('has deterministically ordered sections', () => {
    const doc1 = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    const doc2 = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    expect(doc1.sections.map((s) => s.orderKey)).toEqual(doc2.sections.map((s) => s.orderKey));
  });

  it('includes disclaimer', () => {
    const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
    expect(doc.disclaimer).toBe('AI-generated explanation.');
  });

  it('handles refused explanations', () => {
    const refusedExplanation: Explanation = {
      ...TEST_EXPLANATION,
      refused: true,
      refusalReason: 'Insufficient evidence to explain this finding.',
    };
    const doc = buildDocument(refusedExplanation, TEST_METADATA);
    expect(doc.refused).toBe(true);
    expect(doc.refusalReason).toBe('Insufficient evidence to explain this finding.');
  });
});

describe('buildCitationEntries', () => {
  it('builds citation entries from explanation', () => {
    const entries = buildCitationEntries(TEST_EXPLANATION);
    expect(entries).toHaveLength(2);
  });

  it('sorts entries by ID', () => {
    const entries = buildCitationEntries(TEST_EXPLANATION);
    expect(entries[0].id).toBe('cit_1');
    expect(entries[1].id).toBe('cit_2');
  });

  it('includes verification status', () => {
    const entries = buildCitationEntries(TEST_EXPLANATION);
    expect(entries[0].verified).toBe(true);
  });

  it('is deterministic across calls', () => {
    const e1 = buildCitationEntries(TEST_EXPLANATION);
    const e2 = buildCitationEntries(TEST_EXPLANATION);
    expect(e1).toEqual(e2);
  });

  it('handles empty citations', () => {
    const empty = { ...TEST_EXPLANATION, citations: [] };
    const entries = buildCitationEntries(empty);
    expect(entries).toHaveLength(0);
  });
});

describe('buildSections', () => {
  it('builds sections from explanation', () => {
    const sections = buildSections(TEST_EXPLANATION);
    expect(sections.length).toBeGreaterThanOrEqual(3);
  });

  it('includes explanation text section', () => {
    const sections = buildSections(TEST_EXPLANATION);
    const explainSection = sections.find((s) => s.orderKey === '010_explanation');
    expect(explainSection).toBeDefined();
    expect(explainSection!.body).toBe(TEST_EXPLANATION.text);
  });

  it('includes provider section', () => {
    const sections = buildSections(TEST_EXPLANATION);
    const providerSection = sections.find((s) => s.orderKey === '020_provider');
    expect(providerSection).toBeDefined();
    expect(providerSection!.body).toContain('test-provider');
  });

  it('includes token usage section', () => {
    const sections = buildSections(TEST_EXPLANATION);
    const tokenSection = sections.find((s) => s.orderKey === '030_tokens');
    expect(tokenSection).toBeDefined();
    expect(tokenSection!.body).toContain('150');
  });

  it('has stable ordering by orderKey', () => {
    const sections = buildSections(TEST_EXPLANATION);
    for (let i = 1; i < sections.length; i++) {
      expect(sections[i - 1].orderKey.localeCompare(sections[i].orderKey)).toBeLessThanOrEqual(0);
    }
  });

  it('handles empty text', () => {
    const empty = { ...TEST_EXPLANATION, text: '' };
    const sections = buildSections(empty);
    expect(sections.find((s) => s.orderKey === '010_explanation')).toBeUndefined();
  });
});

describe('citationToEntry', () => {
  it('converts citation to entry', () => {
    const citation = TEST_EXPLANATION.citations[0];
    const entry = citationToEntry(citation);
    expect(entry.id).toBe('cit_1');
    expect(entry.label).toBe('Finding: Hardcoded AWS Key');
    expect(entry.sourceType).toBe('finding');
    expect(entry.sourceId).toBe('fin_abc123');
    expect(entry.verified).toBe(true);
  });
});

describe('determinism', () => {
  it('produces identical documents across 100 runs', () => {
    const results: string[] = [];
    for (let i = 0; i < 100; i++) {
      const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
      results.push(JSON.stringify(doc));
    }
    const first = results[0];
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBe(first);
    }
  });
});
