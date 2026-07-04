/**
 * Tests for ExportValidator — document and content validation.
 */

import { describe, it, expect } from 'vitest';
import { ExportValidator, isDocumentValid } from '../../../src/export/export-validator.js';
import { buildDocument, type ExportMetadata } from '../../../src/export/explanation-document.js';
import type { Explanation } from '../../../src/types/explanation.js';

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
  disclaimer: 'AI-generated explanation.',
};

const TEST_METADATA: ExportMetadata = {
  exportedAt: '2026-07-04T00:00:00.000Z',
  schemaVersion: '1.0.0',
  engineVersion: '1.0.0',
};

describe('ExportValidator', () => {
  const validator = new ExportValidator();

  describe('validateDocument', () => {
    it('validates a complete valid document', () => {
      const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
      const result = validator.validateDocument(doc);

      expect(result.valid).toBe(true);
      expect(result.errors).toBe(0);
    });

    it('detects missing explanation id', () => {
      const doc = buildDocument({ ...TEST_EXPLANATION, id: '' }, TEST_METADATA);
      const result = validator.validateDocument(doc);

      expect(result.errors).toBe(1);
      expect(result.issues.some((i) => i.code === 'MISSING_EXPLANATION_ID')).toBe(true);
    });

    it('detects missing subjectId', () => {
      const doc = buildDocument({ ...TEST_EXPLANATION, subjectId: '' }, TEST_METADATA);
      const result = validator.validateDocument(doc);

      expect(result.issues.some((i) => i.code === 'MISSING_SUBJECT_ID')).toBe(true);
    });

    it('detects missing exportedAt', () => {
      const doc = buildDocument(TEST_EXPLANATION, {
        ...TEST_METADATA,
        exportedAt: '',
      });
      const result = validator.validateDocument(doc);

      expect(result.issues.some((i) => i.code === 'MISSING_EXPORTED_AT')).toBe(true);
    });

    it('detects missing schemaVersion', () => {
      const doc = buildDocument(TEST_EXPLANATION, {
        ...TEST_METADATA,
        schemaVersion: '',
      });
      const result = validator.validateDocument(doc);

      expect(result.issues.some((i) => i.code === 'MISSING_SCHEMA_VERSION')).toBe(true);
    });

    it('detects missing provider id', () => {
      const doc = buildDocument(
        { ...TEST_EXPLANATION, provider: { id: '', model: 'test' } },
        TEST_METADATA,
      );
      const result = validator.validateDocument(doc);

      expect(result.issues.some((i) => i.code === 'MISSING_PROVIDER_ID')).toBe(true);
    });

    it('detects section ordering violations', () => {
      const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
      // Manually reorder sections to violate ordering
      const unorderedDoc = {
        ...doc,
        sections: [...doc.sections].reverse().map((s, i) => ({
          ...s,
          orderKey: String(100 - i * 10),
        })),
      };
      const result = validator.validateDocument(unorderedDoc);

      expect(result.issues.some((i) => i.code === 'SECTION_ORDER_VIOLATION')).toBe(true);
    });

    it('detects duplicate citation IDs', () => {
      const explanationWithDupes: Explanation = {
        ...TEST_EXPLANATION,
        citations: [
          {
            id: 'cit_1',
            sourceType: 'finding',
            sourceId: 'fin_001',
            label: 'First',
            verified: true,
          },
          {
            id: 'cit_1',
            sourceType: 'evidence',
            sourceId: 'ev_001',
            label: 'Second',
            verified: true,
          },
        ],
      };
      const doc = buildDocument(explanationWithDupes, TEST_METADATA);
      const result = validator.validateDocument(doc);

      expect(result.issues.some((i) => i.code === 'DUPLICATE_CITATION_ID')).toBe(true);
    });
  });

  describe('validateMarkdown', () => {
    it('validates valid markdown', () => {
      const issues = validator.validateMarkdown('# Title\n\n## Section\n\nContent');
      expect(issues).toHaveLength(0);
    });

    it('detects missing title heading', () => {
      const issues = validator.validateMarkdown('No heading here');
      expect(issues.some((i) => i.code === 'MARKDOWN_MISSING_TITLE')).toBe(true);
    });

    it('warns on few headings', () => {
      const issues = validator.validateMarkdown('# Only One Heading');
      expect(issues.some((i) => i.code === 'MARKDOWN_FEW_HEADINGS')).toBe(true);
    });
  });

  describe('validateJson', () => {
    it('validates valid JSON', () => {
      const json = JSON.stringify({
        metadata: { exportedAt: '2026-01-01' },
        explanation: { id: 'exp_1' },
        provider: { id: 'test' },
      });
      const issues = validator.validateJson(json);
      expect(issues).toHaveLength(0);
    });

    it('detects invalid JSON', () => {
      const issues = validator.validateJson('not json');
      expect(issues.some((i) => i.code === 'JSON_PARSE_ERROR')).toBe(true);
    });

    it('detects missing metadata field', () => {
      const issues = validator.validateJson(JSON.stringify({ explanation: {} }));
      expect(issues.some((i) => i.code === 'JSON_MISSING_METADATA')).toBe(true);
    });

    it('detects missing explanation field', () => {
      const issues = validator.validateJson(JSON.stringify({ metadata: {} }));
      expect(issues.some((i) => i.code === 'JSON_MISSING_EXPLANATION')).toBe(true);
    });
  });

  describe('isDocumentValid', () => {
    it('returns true for valid documents', () => {
      const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
      expect(isDocumentValid(doc)).toBe(true);
    });

    it('returns false for invalid documents', () => {
      const doc = buildDocument({ ...TEST_EXPLANATION, subjectId: '' }, TEST_METADATA);
      expect(isDocumentValid(doc)).toBe(false);
    });
  });

  describe('determinism', () => {
    it('produces identical results across 100 runs', () => {
      const doc = buildDocument(TEST_EXPLANATION, TEST_METADATA);
      const first = validator.validateDocument(doc);
      for (let i = 0; i < 100; i++) {
        const result = validator.validateDocument(doc);
        expect(result.valid).toBe(first.valid);
        expect(result.issues).toEqual(first.issues);
      }
    });
  });
});
