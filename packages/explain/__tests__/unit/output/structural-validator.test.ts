/**
 * Tests for StructuralValidator.
 *
 * Covers:
 * - Required fields check
 * - Empty explanation detection
 * - Length validation (too short, too long)
 * - Markdown structure validation
 * - Citation presence
 * - Invalid character detection
 * - Duplicate citation detection
 * - Determinism (100 runs)
 */

import { describe, it, expect } from 'vitest';
import { StructuralValidator } from '../../../src/output/structural-validator.js';

describe('StructuralValidator', () => {
  const validator = new StructuralValidator();

  describe('name', () => {
    it('has the correct name', () => {
      expect(validator.name).toBe('StructuralValidator');
    });
  });

  describe('required fields', () => {
    it('accepts valid explanation JSON with all required fields', () => {
      const input = JSON.stringify({
        id: 'exp_abc123',
        subjectId: 'fin_abc123',
        subjectType: 'finding',
        mode: 'technical',
        text: 'This is a valid explanation with [src:finding:fin_abc123] evidence.',
        citations: [],
        provider: { id: 'test', model: 'test-model' },
        promptVersion: '1.0.0',
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        generatedAt: '2026-07-03T00:00:00.000Z',
        disclaimer: 'AI-generated explanation.',
      });
      const result = validator.validate(input);
      expect(result.valid).toBe(true);
    });

    it('rejects JSON missing required fields', () => {
      const input = JSON.stringify({
        id: 'exp_abc123',
        text: 'Missing subjectId and other fields.',
      });
      const result = validator.validate(input);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'MISSING_REQUIRED_FIELD')).toBe(true);
    });

    it('marks missing subjectId field', () => {
      const input = JSON.stringify({
        id: 'exp_abc123',
        text: 'Some explanation text.',
      });
      const result = validator.validate(input);
      expect(result.fieldPresence['subjectId']).toBe(false);
      expect(result.fieldPresence['id']).toBe(true);
    });

    it('handles null field values', () => {
      const input = JSON.stringify({
        id: 'exp_abc123',
        subjectId: null,
        subjectType: 'finding',
        mode: 'technical',
        text: 'Some explanation text.',
        citations: [],
        provider: { id: 'test', model: 'test-model' },
        promptVersion: '1.0.0',
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        generatedAt: '2026-07-03T00:00:00.000Z',
        disclaimer: 'AI-generated explanation.',
      });
      const result = validator.validate(input);
      expect(result.fieldPresence['subjectId']).toBe(false);
      expect(result.valid).toBe(false);
    });
  });

  describe('empty explanation detection', () => {
    it('rejects empty text', () => {
      const input = JSON.stringify({
        id: 'exp_abc',
        subjectId: 'fin_abc',
        subjectType: 'finding',
        mode: 'technical',
        text: '',
        citations: [],
        provider: { id: 'test', model: 'test' },
        promptVersion: '1.0.0',
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        generatedAt: '2026-07-03T00:00:00.000Z',
        disclaimer: 'Test.',
      });
      const result = validator.validate(input);
      expect(result.issues.some((i) => i.code === 'EMPTY_EXPLANATION')).toBe(true);
    });

    it('rejects whitespace-only text', () => {
      const input = JSON.stringify({
        id: 'exp_abc',
        subjectId: 'fin_abc',
        subjectType: 'finding',
        mode: 'technical',
        text: '   \n  \t  ',
        citations: [],
        provider: { id: 'test', model: 'test' },
        promptVersion: '1.0.0',
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        generatedAt: '2026-07-03T00:00:00.000Z',
        disclaimer: 'Test.',
      });
      const result = validator.validate(input);
      expect(result.issues.some((i) => i.code === 'EMPTY_EXPLANATION')).toBe(true);
    });
  });

  describe('length validation', () => {
    it('warns on too-short explanation', () => {
      const input = JSON.stringify({
        id: 'exp_abc',
        subjectId: 'fin_abc',
        subjectType: 'finding',
        mode: 'technical',
        text: 'Short.',
        citations: [],
        provider: { id: 'test', model: 'test' },
        promptVersion: '1.0.0',
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        generatedAt: '2026-07-03T00:00:00.000Z',
        disclaimer: 'Test.',
      });
      const result = validator.validate(input);
      expect(result.issues.some((i) => i.code === 'EXPLANATION_TOO_SHORT')).toBe(true);
    });

    it('rejects extremely long explanation', () => {
      const longText = 'A'.repeat(60 * 1024);
      const input = JSON.stringify({
        id: 'exp_abc',
        subjectId: 'fin_abc',
        subjectType: 'finding',
        mode: 'technical',
        text: longText,
        citations: [],
        provider: { id: 'test', model: 'test' },
        promptVersion: '1.0.0',
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        generatedAt: '2026-07-03T00:00:00.000Z',
        disclaimer: 'Test.',
      });
      const result = validator.validate(input);
      expect(result.issues.some((i) => i.code === 'EXPLANATION_TOO_LONG')).toBe(true);
    });
  });

  describe('markdown validation', () => {
    it('accepts valid markdown with headings', () => {
      const input = JSON.stringify({
        id: 'exp_abc',
        subjectId: 'fin_abc',
        subjectType: 'finding',
        mode: 'technical',
        text: '# Finding\n\nThis finding [src:finding:fin_abc] was detected.\n\n## Details\nMore info here.',
        citations: [],
        provider: { id: 'test', model: 'test' },
        promptVersion: '1.0.0',
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        generatedAt: '2026-07-03T00:00:00.000Z',
        disclaimer: 'Test.',
      });
      const result = validator.validate(input);
      expect(result.valid).toBe(true);
    });

    it('warns on unclosed code blocks', () => {
      const input = JSON.stringify({
        id: 'exp_abc',
        subjectId: 'fin_abc',
        subjectType: 'finding',
        mode: 'technical',
        text: 'Here is some code:\n```\nlet x = 1;\nNo closing backticks.',
        citations: [],
        provider: { id: 'test', model: 'test' },
        promptVersion: '1.0.0',
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        generatedAt: '2026-07-03T00:00:00.000Z',
        disclaimer: 'Test.',
      });
      const result = validator.validate(input);
      expect(result.issues.some((i) => i.code === 'UNCLOSED_CODE_BLOCK')).toBe(true);
    });

    it('accepts properly closed code blocks', () => {
      const text = 'Here is some code:\n```\nlet x = 1;\n```\nEnd of code.';
      const input = JSON.stringify({
        id: 'exp_abc',
        subjectId: 'fin_abc',
        subjectType: 'finding',
        mode: 'technical',
        text,
        citations: [],
        provider: { id: 'test', model: 'test' },
        promptVersion: '1.0.0',
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        generatedAt: '2026-07-03T00:00:00.000Z',
        disclaimer: 'Test.',
      });
      const result = validator.validate(input);
      expect(result.issues.some((i) => i.code === 'UNCLOSED_CODE_BLOCK')).toBe(false);
    });
  });

  describe('citation presence', () => {
    it('detects citations in [src:type:id] format', () => {
      const text = 'The finding [src:finding:fin_abc123] was detected.';
      const input = JSON.stringify({
        id: 'exp_abc',
        subjectId: 'fin_abc',
        subjectType: 'finding',
        mode: 'technical',
        text,
        citations: [],
        provider: { id: 'test', model: 'test' },
        promptVersion: '1.0.0',
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        generatedAt: '2026-07-03T00:00:00.000Z',
        disclaimer: 'Test.',
      });
      const result = validator.validate(input);
      expect(result.hasCitations).toBe(true);
    });

    it('detects citations in [ref:type:id] format', () => {
      const text = 'The evidence [ref:evidence:ev_def456] supports this.';
      const input = JSON.stringify({
        id: 'exp_abc',
        subjectId: 'fin_abc',
        subjectType: 'finding',
        mode: 'technical',
        text,
        citations: [],
        provider: { id: 'test', model: 'test' },
        promptVersion: '1.0.0',
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        generatedAt: '2026-07-03T00:00:00.000Z',
        disclaimer: 'Test.',
      });
      const result = validator.validate(input);
      expect(result.hasCitations).toBe(true);
    });

    it('reports no citations when none present', () => {
      const text = 'The finding was detected without any citation markers.';
      const input = JSON.stringify({
        id: 'exp_abc',
        subjectId: 'fin_abc',
        subjectType: 'finding',
        mode: 'technical',
        text,
        citations: [],
        provider: { id: 'test', model: 'test' },
        promptVersion: '1.0.0',
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        generatedAt: '2026-07-03T00:00:00.000Z',
        disclaimer: 'Test.',
      });
      const result = validator.validate(input);
      expect(result.hasCitations).toBe(false);
    });
  });

  describe('invalid character detection', () => {
    it('rejects control characters', () => {
      const text = 'Finding with\u0000null byte.';
      const input = JSON.stringify({
        id: 'exp_abc',
        subjectId: 'fin_abc',
        subjectType: 'finding',
        mode: 'technical',
        text,
        citations: [],
        provider: { id: 'test', model: 'test' },
        promptVersion: '1.0.0',
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        generatedAt: '2026-07-03T00:00:00.000Z',
        disclaimer: 'Test.',
      });
      const result = validator.validate(input);
      expect(result.issues.some((i) => i.code === 'INVALID_CHARACTERS')).toBe(true);
    });
  });

  describe('duplicate citation detection', () => {
    it('detects duplicate [src:type:id] citations', () => {
      const text =
        'First reference [src:finding:fin_abc123] and second reference [src:finding:fin_abc123].';
      const input = JSON.stringify({
        id: 'exp_abc',
        subjectId: 'fin_abc',
        subjectType: 'finding',
        mode: 'technical',
        text,
        citations: [],
        provider: { id: 'test', model: 'test' },
        promptVersion: '1.0.0',
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        generatedAt: '2026-07-03T00:00:00.000Z',
        disclaimer: 'Test.',
      });
      const result = validator.validate(input);
      expect(result.hasDuplicateCitations).toBe(true);
      expect(result.issues.some((i) => i.code === 'DUPLICATE_CITATION_REFERENCE')).toBe(true);
    });

    it('does not flag unique citations as duplicates', () => {
      const text = 'First [src:finding:fin_abc] and second [src:evidence:ev_def].';
      const input = JSON.stringify({
        id: 'exp_abc',
        subjectId: 'fin_abc',
        subjectType: 'finding',
        mode: 'technical',
        text,
        citations: [],
        provider: { id: 'test', model: 'test' },
        promptVersion: '1.0.0',
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        generatedAt: '2026-07-03T00:00:00.000Z',
        disclaimer: 'Test.',
      });
      const result = validator.validate(input);
      expect(result.hasDuplicateCitations).toBe(false);
    });
  });

  describe('determinism', () => {
    it('produces identical results across 100 runs', () => {
      const input = JSON.stringify({
        id: 'exp_abc123',
        subjectId: 'fin_abc123',
        subjectType: 'finding',
        mode: 'technical',
        text: 'This is a valid explanation with [src:finding:fin_abc123] evidence.',
        citations: [],
        provider: { id: 'test', model: 'test-model' },
        promptVersion: '1.0.0',
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        generatedAt: '2026-07-03T00:00:00.000Z',
        disclaimer: 'AI-generated explanation.',
      });
      const firstResult = validator.validate(input);
      for (let i = 0; i < 100; i++) {
        const result = validator.validate(input);
        expect(result.valid).toBe(firstResult.valid);
        expect(result.issues.length).toBe(firstResult.issues.length);
        expect(result.fieldPresence).toEqual(firstResult.fieldPresence);
      }
    });
  });
});
