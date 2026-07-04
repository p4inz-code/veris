/**
 * Tests for CitationVerifier.
 *
 * Covers:
 * - Verify existing citations against context
 * - Verify citation type matching
 * - Verify ID format validation
 * - Reject orphan citations
 * - Reject malformed citations
 * - Reject duplicate references
 * - Verify bidirectional traceability
 * - Empty content handling
 * - Determinism (100 runs)
 */

import { describe, it, expect } from 'vitest';
import { CitationVerifier } from '../../../src/output/citation-verifier.js';
import type { ExplainedContext } from '../../../src/types/context.js';

describe('CitationVerifier', () => {
  const verifier = new CitationVerifier();

  // Create a minimal test context
  function createTestContext(overrides?: Partial<ExplainedContext>): ExplainedContext {
    return {
      subject: {
        id: 'fin_abc123',
        title: 'Test Finding',
        severity: { level: 'high' as const, score: 7.5 },
        confidence: 0.95,
        ruleId: 'test/hardcoded-key',
        description: 'A test finding',
        evidenceIds: ['ev_def456'],
      },
      evidence: [
        {
          id: 'ev_def456',
          sourceLocation: {
            path: 'src/test.ts',
            startLine: 42,
            startColumn: 1,
            snippet: 'key = "secret"',
          },
          matchDetail: { kind: 'regex', value: 'AKIA' },
          confidence: 0.98,
        },
        {
          id: 'ev_ghi789',
          sourceLocation: {
            path: 'src/config.ts',
            startLine: 10,
            startColumn: 5,
            snippet: 'password',
          },
          matchDetail: { kind: 'keyword', value: 'password' },
          confidence: 0.85,
        },
      ],
      rule: {
        id: 'test/hardcoded-key',
        name: 'Hardcoded Key Detection',
        description: 'Detects hardcoded cryptographic keys',
        severity: { level: 'high' as const, score: 7.5 },
        packId: 'secrets',
        cweIds: ['CWE-798'],
        remediation: 'Use a secret manager',
      },
      artifact: {
        id: 'art_test_001',
        path: 'src/test.ts',
        type: 'script',
      },
      tokenBudget: { allocated: 4000, used: 3500, remaining: 500 },
      contextSchemaVersion: '1.0.0',
      ...overrides,
    };
  }

  describe('name', () => {
    it('has the correct name', () => {
      expect(verifier.name).toBe('CitationVerifier');
    });
  });

  describe('citation verification against context', () => {
    it('verifies existing finding citation', () => {
      const content = 'The finding [src:finding:fin_abc123] was detected.';
      const context = createTestContext();
      const result = verifier.verify(content, context);
      expect(result.valid).toBe(true);
      expect(result.verifiedCitations).toBe(1);
      expect(result.failedCitations).toBe(0);
    });

    it('verifies existing evidence citation', () => {
      const content = 'Evidence [src:evidence:ev_def456] supports this.';
      const context = createTestContext();
      const result = verifier.verify(content, context);
      expect(result.valid).toBe(true);
      expect(result.verifiedCitations).toBe(1);
    });

    it('verifies existing rule citation', () => {
      const content = 'This matches rule [src:rule:test/hardcoded-key].';
      const context = createTestContext();
      const result = verifier.verify(content, context);
      expect(result.valid).toBe(true);
      expect(result.verifiedCitations).toBe(1);
    });

    it('verifies existing artifact citation', () => {
      const content = 'Found in [src:artifact:art_test_001].';
      const context = createTestContext();
      const result = verifier.verify(content, context);
      expect(result.valid).toBe(true);
    });
  });

  describe('orphan citations', () => {
    it('rejects citation to non-existent finding', () => {
      const content = 'Referencing [src:finding:fin_nonexistent].';
      const context = createTestContext();
      const result = verifier.verify(content, context);
      expect(result.valid).toBe(false);
      expect(result.failedCitations).toBe(1);
      expect(result.orphanCitations.length).toBeGreaterThan(0);
    });

    it('rejects citation to non-existent evidence', () => {
      const content = 'Evidence [src:evidence:ev_fake123] not real.';
      const context = createTestContext();
      const result = verifier.verify(content, context);
      expect(result.valid).toBe(false);
      expect(result.orphanCitations.length).toBeGreaterThan(0);
    });

    it('rejects citation to non-existent rule', () => {
      const content = 'Rule [src:rule:fake/missing] does not exist.';
      const context = createTestContext();
      const result = verifier.verify(content, context);
      expect(result.valid).toBe(false);
      expect(result.orphanCitations.length).toBeGreaterThan(0);
    });
  });

  describe('ID format validation', () => {
    it('validates finding ID format (fin_ prefix)', () => {
      const content = 'Finding [src:finding:fin_valid].';
      const context = createTestContext({
        subject: {
          ...(createTestContext().subject as NonNullable<ExplainedContext['subject']>),
          id: 'fin_valid',
        },
      });
      const result = verifier.verify(content, context);
      expect(result.valid).toBe(true);
    });

    it("rejects malformed finding ID (doesn't match fin_ prefix)", () => {
      const content = 'Finding [src:finding:not_a_finding] detected.';
      const context = createTestContext({
        subject: {
          ...(createTestContext().subject as NonNullable<ExplainedContext['subject']>),
          id: 'not_a_finding',
        },
      });
      // The ID exists in context but doesn't match expected format (fin_ prefix)
      const result = verifier.verify(content, context);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'INVALID_CITATION_ID_FORMAT')).toBe(true);
    });

    it('validates evidence ID format (ev_ prefix)', () => {
      const content = 'Evidence [src:evidence:ev_valid].';
      const context = createTestContext({
        evidence: [
          {
            id: 'ev_valid',
            sourceLocation: { path: 'test.ts', startLine: 1, startColumn: 1 },
            matchDetail: { kind: 'regex', value: 'test' },
            confidence: 0.9,
          },
        ],
      });
      const result = verifier.verify(content, context);
      expect(result.valid).toBe(true);
    });

    it('validates rule ID format (pack/name)', () => {
      const content = 'Rule [src:rule:valid/test-name].';
      const context = createTestContext({
        rule: {
          id: 'valid/test-name',
          name: 'Test',
          description: 'Test',
          severity: { level: 'medium' as const, score: 5 },
        },
      });
      const result = verifier.verify(content, context);
      expect(result.valid).toBe(true);
    });

    it('validates risk-dimension ID format (D prefix)', () => {
      const content = 'Risk [src:risk-dimension:D500].';
      const context2 = createTestContext({
        risk: {
          overallScore: 5,
          overallLevel: 'medium' as const,
          dimensions: [{ id: 'D500', name: 'Test', score: 5, contribution: 0.5 }],
        },
      });
      const result = verifier.verify(content, context2);
      expect(result.valid).toBe(true);
    });
  });

  describe('duplicate references', () => {
    it('detects duplicate citation references', () => {
      const content = 'First [src:finding:fin_abc123] and second [src:finding:fin_abc123].';
      const context = createTestContext();
      const result = verifier.verify(content, context);
      expect(result.duplicateCitations.length).toBeGreaterThan(0);
      expect(result.issues.some((i) => i.code === 'DUPLICATE_CITATION')).toBe(true);
    });

    it('does not flag unique references as duplicates', () => {
      const content = 'Finding [src:finding:fin_abc123] and evidence [src:evidence:ev_def456].';
      const context = createTestContext();
      const result = verifier.verify(content, context);
      expect(result.duplicateCitations.length).toBe(0);
    });
  });

  describe('bidirectional traceability', () => {
    it('confirms traceability when all citations resolve', () => {
      const content = 'Finding [src:finding:fin_abc123] with evidence [src:evidence:ev_def456].';
      const context = createTestContext();
      const result = verifier.verify(content, context);
      expect(result.bidirectionalTraceability).toBe(true);
    });

    it("fails traceability when citations don't resolve", () => {
      const content = 'Missing [src:evidence:ev_missing123].';
      const context = createTestContext();
      const result = verifier.verify(content, context);
      expect(result.bidirectionalTraceability).toBe(false);
    });
  });

  describe('malformed citations', () => {
    it('handles empty content gracefully', () => {
      const result = verifier.verify('', createTestContext());
      expect(result.valid).toBe(true);
      expect(result.verifiedCitations).toBe(0);
    });

    it('handles content without citations gracefully', () => {
      const result = verifier.verify('This has no citations.', createTestContext());
      expect(result.valid).toBe(true);
      expect(result.verifiedCitations).toBe(0);
    });
  });

  describe('determinism', () => {
    it('produces identical results across 100 runs', () => {
      const content =
        'Finding [src:finding:fin_abc123] with evidence [src:evidence:ev_def456] under rule [src:rule:test/hardcoded-key].';
      const context = createTestContext();
      const firstResult = verifier.verify(content, context);
      for (let i = 0; i < 100; i++) {
        const result = verifier.verify(content, context);
        expect(result.valid).toBe(firstResult.valid);
        expect(result.verifiedCitations).toBe(firstResult.verifiedCitations);
        expect(result.failedCitations).toBe(firstResult.failedCitations);
        expect(result.orphanCitations).toEqual(firstResult.orphanCitations);
        expect(result.bidirectionalTraceability).toBe(firstResult.bidirectionalTraceability);
      }
    });
  });
});
