/**
 * Tests for NullEvidenceRefusal.
 *
 * Covers:
 * - Refuse explanations with zero supporting evidence
 * - Refuse hallucinated citations
 * - Deterministic refusal object
 * - Refusal reason codes
 * - Edge cases (partial failure, AI refusal detection)
 * - Determinism (100 runs)
 */

import { describe, it, expect } from 'vitest';
import { NullEvidenceRefusal, RefusalCodes } from '../../../src/output/null-evidence-refusal.js';
import type { CitationVerificationResult } from '../../../src/output/validation-result.js';

describe('NullEvidenceRefusal', () => {
  const refusal = new NullEvidenceRefusal();

  function createCitationResult(
    overrides?: Partial<CitationVerificationResult>,
  ): CitationVerificationResult {
    return {
      valid: true,
      issues: [],
      verifiedCitations: 3,
      failedCitations: 0,
      orphanCitations: [],
      duplicateCitations: [],
      bidirectionalTraceability: true,
      ...overrides,
    };
  }

  describe('name', () => {
    it('has the correct name', () => {
      expect(refusal.name).toBe('NullEvidenceRefusal');
    });
  });

  describe('zero evidence in context', () => {
    it('refuses when context has zero evidence', () => {
      const citationResult = createCitationResult();
      const context = { evidence: [] };
      const result = refusal.evaluate(citationResult, context);

      expect(result.refused).toBe(true);
      expect(result.reasonCode).toBe(RefusalCodes.ZERO_EVIDENCE);
      expect(result.reason).toBeTruthy();
    });

    it('refuses when evidence field is missing', () => {
      const citationResult = createCitationResult();
      const context = {};
      const result = refusal.evaluate(citationResult, context);

      expect(result.refused).toBe(true);
      expect(result.reasonCode).toBe(RefusalCodes.ZERO_EVIDENCE);
    });

    it('provides deterministic refusal message for zero evidence', () => {
      const citationResult = createCitationResult();
      const context = { evidence: [] };
      const result1 = refusal.evaluate(citationResult, context);
      const result2 = refusal.evaluate(citationResult, context);

      expect(result1.reason).toBe(result2.reason);
      expect(result1.reasonCode).toBe(RefusalCodes.ZERO_EVIDENCE);
    });
  });

  describe('no citations in explanation', () => {
    it('refuses when explanation has zero citations and evidence exists', () => {
      const citationResult = createCitationResult({ totalCitations: 0, verifiedCitations: 0 });
      const context = { evidence: [{ id: 'ev_abc' }] };
      const result = refusal.evaluate(citationResult, context);

      expect(result.refused).toBe(true);
      expect(result.reasonCode).toBe(RefusalCodes.NO_CITATIONS_PROVIDED);
    });
  });

  describe('all citations failed verification', () => {
    it('refuses when all citations failed', () => {
      const citationResult = createCitationResult({
        valid: false,
        verifiedCitations: 0,
        failedCitations: 3,
        totalCitations: 3,
      });
      const context = { evidence: [{ id: 'ev_abc' }] };
      const result = refusal.evaluate(citationResult, context);

      expect(result.refused).toBe(true);
      expect(result.reasonCode).toBe(RefusalCodes.ALL_CITATIONS_FAILED);
    });
  });

  describe('hallucinated citations', () => {
    it('refuses when orphan citations exist', () => {
      const citationResult = createCitationResult({
        orphanCitations: ['src:evidence:ev_fake123'],
        failedCitations: 1,
        verifiedCitations: 2,
      });
      const context = { evidence: [{ id: 'ev_abc' }] };
      const result = refusal.evaluate(citationResult, context);

      expect(result.refused).toBe(true);
      expect(result.reasonCode).toBe(RefusalCodes.HALLUCINATED_CITATION);
    });
  });

  describe('AI refusal pattern detection', () => {
    it("detects 'I cannot explain' refusal", () => {
      const citationResult = createCitationResult();
      const context = { evidence: [{ id: 'ev_abc' }] };
      const result = refusal.evaluate(
        citationResult,
        context,
        'I cannot explain this finding because the necessary evidence is not available.',
      );

      expect(result.refused).toBe(true);
      expect(result.reasonCode).toBe(RefusalCodes.AI_REFUSAL_DETECTED);
    });

    it("detects 'insufficient evidence' refusal", () => {
      const citationResult = createCitationResult();
      const context = { evidence: [{ id: 'ev_abc' }] };
      const result = refusal.evaluate(
        citationResult,
        context,
        'Insufficient evidence to provide an explanation.',
      );

      expect(result.refused).toBe(true);
      expect(result.reasonCode).toBe(RefusalCodes.AI_REFUSAL_DETECTED);
    });

    it('does not falsely detect refusal in normal content', () => {
      const citationResult = createCitationResult();
      const context = { evidence: [{ id: 'ev_abc' }] };
      const result = refusal.evaluate(
        citationResult,
        context,
        'The finding was detected because the application contains a hardcoded API key.',
      );

      expect(result.refused).toBe(false);
    });
  });

  describe('non-refusal scenarios', () => {
    it('does not refuse when citations are valid and evidence exists', () => {
      const citationResult = createCitationResult();
      const context = { evidence: [{ id: 'ev_abc' }, { id: 'ev_def' }] };
      const result = refusal.evaluate(citationResult, context);

      expect(result.refused).toBe(false);
      expect(result.issues.length).toBe(0);
    });

    it('does not refuse when some citations pass and evidence exists', () => {
      const citationResult = createCitationResult({
        valid: false,
        verifiedCitations: 2,
        failedCitations: 1,
        totalCitations: 3,
        orphanCitations: [],
      });
      const context = { evidence: [{ id: 'ev_abc' }] };
      const result = refusal.evaluate(citationResult, context);

      // Should not refuse — partial success is handled by downstream
      expect(result.refused).toBe(false);
    });
  });

  describe('determinism', () => {
    it('produces identical results across 100 runs (zero evidence)', () => {
      const citationResult = createCitationResult();
      const context = { evidence: [] };

      const firstResult = refusal.evaluate(citationResult, context);
      for (let i = 0; i < 100; i++) {
        const result = refusal.evaluate(citationResult, context);
        expect(result.refused).toBe(firstResult.refused);
        expect(result.reasonCode).toBe(firstResult.reasonCode);
        expect(result.reason).toBe(firstResult.reason);
      }
    });

    it('produces identical results across 100 runs (valid evidence)', () => {
      const citationResult = createCitationResult();
      const context = { evidence: [{ id: 'ev_abc' }] };

      const firstResult = refusal.evaluate(citationResult, context);
      for (let i = 0; i < 100; i++) {
        const result = refusal.evaluate(citationResult, context);
        expect(result.refused).toBe(firstResult.refused);
        expect(result.issues.length).toBe(firstResult.issues.length);
      }
    });
  });
});
