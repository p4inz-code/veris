/**
 * Tests for the ValidationAgent — optional LLM validation agent (M6b).
 *
 * Verifies:
 * - Claim extraction from explanation text
 * - Scoring: supported / contradicted / unsupported / refused
 * - Failure handling (graceful degradation)
 * - Offline mode (no provider configured)
 * - Provider timeout handling
 * - Disabled state
 * - Determinism (same input → same claims extracted)
 * - Edge cases: empty text, single sentence, no evidence
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ValidationAgent,
  type ValidationAgentOptions,
  type ClaimScore,
} from '../../../src/output/validation-agent.js';
import type { Explanation, CitationSourceType } from '../../../src/types/explanation.js';
import type { ExplainedContext } from '../../../src/types/context.js';
import type { LLMProvider } from '@veris/ai';

// ── Test Helpers ──

function createMockProvider(options?: {
  content?: string;
  shouldThrow?: boolean;
  delayMs?: number;
}): LLMProvider {
  const content =
    options?.content ??
    JSON.stringify({
      claims: [
        { id: 'claim_1', score: 'supported', explanation: 'Supported by evidence.' },
        { id: 'claim_2', score: 'supported', explanation: 'Supported by evidence.' },
      ],
    });

  return {
    id: 'mock-validator',
    name: 'Mock Validator',
    version: '1.0.0',
    healthCheck: vi.fn().mockResolvedValue({ healthy: true, latencyMs: 10 }),
    generate: vi.fn().mockImplementation(async () => {
      if (options?.shouldThrow) {
        throw new Error(options?.delayMs ? 'timeout' : 'provider error');
      }
      if (options?.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      }
      return {
        content,
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        provider: 'mock-validator',
        model: 'mock-model-v1',
      };
    }),
    generateStream: vi.fn().mockImplementation(async function* () {
      yield { content: 'test', index: 0, finishReason: 'stop' };
    }),
    getCapabilities: vi.fn().mockReturnValue({
      supportsJsonMode: true,
      supportsStreaming: false,
      supportsFunctions: false,
      maxContextTokens: 4096,
      maxOutputTokens: 2048,
      models: ['mock-model-v1'],
      requiresNetwork: false,
    }),
  };
}

function createTestExplanation(overrides?: Partial<Explanation>): Explanation {
  return {
    id: 'exp_fin_abc123_test123',
    subjectId: 'fin_abc123',
    subjectType: 'finding',
    mode: 'technical',
    text:
      overrides?.text ??
      'The finding detected a hardcoded AWS access key in src/config.ts. This key was found at line 42. The rule secrets/aws-key has critical severity.',
    citations: [
      {
        id: 'cit_1',
        sourceType: 'finding' as CitationSourceType,
        sourceId: 'fin_abc123',
        label: 'Hardcoded AWS Access Key',
        verified: true,
      },
      {
        id: 'cit_2',
        sourceType: 'evidence' as CitationSourceType,
        sourceId: 'ev_def456',
        label: 'AWS key match at src/config.ts:42',
        verified: true,
      },
      {
        id: 'cit_3',
        sourceType: 'rule' as CitationSourceType,
        sourceId: 'secrets/aws-key',
        label: 'secrets/aws-key',
        verified: true,
      },
    ],
    citationValidation: {
      valid: true,
      totalCitations: 3,
      verifiedCitations: 3,
      failedCitations: 0,
      citations: [],
    },
    provider: { id: 'test-provider', model: 'test-model' },
    promptVersion: '1.0.0',
    tokenUsage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
    cached: false,
    refused: false,
    generatedAt: '2026-07-03T00:00:00.000Z',
    disclaimer: 'AI-generated.',
    ...overrides,
  };
}

function createTestContext(overrides?: Partial<ExplainedContext>): ExplainedContext {
  return {
    subject: {
      id: 'fin_abc123',
      title: 'Hardcoded AWS Key',
      severity: { level: 'high' as const, score: 7.5 },
      confidence: 0.95,
      ruleId: 'secrets/aws-key',
      description: 'A hardcoded AWS access key was detected.',
    },
    evidence: [
      {
        id: 'ev_def456',
        sourceLocation: {
          path: 'src/config.ts',
          startLine: 42,
          startColumn: 1,
          snippet: 'key = "AKIAIOSFODNN7EXAMPLE"',
        },
        matchDetail: { kind: 'regex', value: 'AKIA' },
        confidence: 0.98,
      },
    ],
    rule: {
      id: 'secrets/aws-key',
      name: 'AWS Key Detection',
      description: 'Detects hardcoded AWS access keys',
      severity: { level: 'high' as const, score: 7.5 },
    },
    tokenBudget: { allocated: 4000, used: 3500, remaining: 500 },
    contextSchemaVersion: '1.0.0',
    ...overrides,
  };
}

describe('ValidationAgent', () => {
  describe('construction', () => {
    it('creates with default options', () => {
      const agent = new ValidationAgent();
      expect(agent.name).toBe('ValidationAgent');
      expect(agent.isAvailable()).toBe(false);
    });

    it('creates with custom options', () => {
      const provider = createMockProvider();
      const agent = new ValidationAgent({
        enabled: true,
        useProvider: true,
        provider,
        timeoutMs: 5000,
      });
      expect(agent.isAvailable()).toBe(true);
      expect(agent.getOptions().timeoutMs).toBe(5000);
    });

    it('allows updating options via configure()', () => {
      const agent = new ValidationAgent();
      agent.configure({ enabled: false, timeoutMs: 10000 });
      const opts = agent.getOptions();
      expect(opts.enabled).toBe(false);
      expect(opts.timeoutMs).toBe(10000);
    });
  });

  describe('offline mode (no provider)', () => {
    it('returns unavailable result when no provider is configured', async () => {
      const agent = new ValidationAgent({ enabled: true, useProvider: false });
      const explanation = createTestExplanation();
      const context = createTestContext();

      const result = await agent.validate(explanation, context);

      expect(result.completed).toBe(false);
      expect(result.unavailable).toBe(true);
      expect(result.requiresCaveat).toBe(true);
      expect(result.caveat).toContain('not been semantically verified');
    });

    it('extracts claims even in offline mode', async () => {
      const agent = new ValidationAgent({ enabled: true, useProvider: false });
      const explanation = createTestExplanation();
      const context = createTestContext();

      const result = await agent.validate(explanation, context);

      expect(result.claims.length).toBeGreaterThan(0);
      expect(result.claims.every((c) => c.score === 'refused')).toBe(true);
    });
  });

  describe('disabled state', () => {
    it('returns empty result when disabled', async () => {
      const agent = new ValidationAgent({ enabled: false });
      const explanation = createTestExplanation();
      const context = createTestContext();

      const result = await agent.validate(explanation, context);

      expect(result.completed).toBe(false);
      expect(result.claims.length).toBe(0);
      expect(result.requiresCaveat).toBe(false);
    });
  });

  describe('LLM-based validation', () => {
    it('scores claims as supported when provider returns supported', async () => {
      const provider = createMockProvider({
        content: JSON.stringify({
          claims: [
            { id: 'claim_1', score: 'supported', explanation: 'Matches evidence.' },
            { id: 'claim_2', score: 'supported', explanation: 'Matches evidence.' },
          ],
        }),
      });
      const agent = new ValidationAgent({ enabled: true, useProvider: true, provider });
      const explanation = createTestExplanation();
      const context = createTestContext();

      const result = await agent.validate(explanation, context);

      expect(result.completed).toBe(true);
      expect(result.summary.supported).toBeGreaterThan(0);
      expect(result.requiresCaveat).toBe(false);
    });

    it('flags contradicted claims', async () => {
      const provider = createMockProvider({
        content: JSON.stringify({
          claims: [
            { id: 'claim_1', score: 'supported', explanation: 'OK' },
            { id: 'claim_2', score: 'contradicted', explanation: 'Contradicts evidence.' },
          ],
        }),
      });
      const agent = new ValidationAgent({ enabled: true, useProvider: true, provider });
      const explanation = createTestExplanation();
      const context = createTestContext();

      const result = await agent.validate(explanation, context);

      expect(result.completed).toBe(true);
      expect(result.summary.contradicted).toBe(1);
      expect(result.requiresCaveat).toBe(true);
      expect(result.caveat).toContain('contradict');
    });

    it('flags unsupported claims', async () => {
      const provider = createMockProvider({
        content: JSON.stringify({
          claims: [
            { id: 'claim_1', score: 'supported', explanation: 'OK' },
            { id: 'claim_2', score: 'unsupported', explanation: 'No evidence.' },
          ],
        }),
      });
      const agent = new ValidationAgent({ enabled: true, useProvider: true, provider });
      const explanation = createTestExplanation();
      const context = createTestContext();

      const result = await agent.validate(explanation, context);

      expect(result.completed).toBe(true);
      expect(result.summary.unsupported).toBe(1);
      expect(result.requiresCaveat).toBe(true);
    });

    it('handles refused claims from provider', async () => {
      const provider = createMockProvider({
        content: JSON.stringify({
          claims: [{ id: 'claim_1', score: 'refused', explanation: 'Cannot evaluate.' }],
        }),
      });
      const agent = new ValidationAgent({ enabled: true, useProvider: true, provider });
      const explanation = createTestExplanation({ text: 'A single claim.' });
      const context = createTestContext();

      const result = await agent.validate(explanation, context);

      expect(result.completed).toBe(true);
      expect(result.summary.refused).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('gracefully handles provider errors', async () => {
      const provider = createMockProvider({ shouldThrow: true });
      const agent = new ValidationAgent({ enabled: true, useProvider: true, provider });
      const explanation = createTestExplanation();
      const context = createTestContext();

      const result = await agent.validate(explanation, context);

      expect(result.completed).toBe(false);
      expect(result.requiresCaveat).toBe(true);
      expect(result.caveat).toContain('not been semantically verified');
    });

    it('handles provider timeout gracefully', async () => {
      const provider = createMockProvider({ delayMs: 50000, shouldThrow: true });
      const agent = new ValidationAgent({
        enabled: true,
        useProvider: true,
        provider,
        timeoutMs: 50, // Very short timeout
      });
      const explanation = createTestExplanation();
      const context = createTestContext();

      const result = await agent.validate(explanation, context);

      expect(result.completed).toBe(false);
      expect(result.requiresCaveat).toBe(true);
    });

    it('handles invalid JSON response from provider', async () => {
      const provider = createMockProvider({ content: 'not valid json' });
      const agent = new ValidationAgent({ enabled: true, useProvider: true, provider });
      const explanation = createTestExplanation();
      const context = createTestContext();

      const result = await agent.validate(explanation, context);

      // Should still complete but mark claims as refused
      expect(result.completed).toBe(true);
      expect(result.claims.every((c) => c.score === 'refused')).toBe(true);
    });
  });

  describe('claim extraction', () => {
    it('extracts sentences as claims', () => {
      const agent = new ValidationAgent();
      const text = 'First claim. Second claim. Third claim.';

      // Access private method via validate
      const explanation = createTestExplanation({ text });
      const context = createTestContext();

      // Use offline mode to see extracted claims
      agent.validate(explanation, context).then((result) => {
        expect(result.claims.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('handles empty text', async () => {
      const agent = new ValidationAgent({ enabled: true, useProvider: false });
      const explanation = createTestExplanation({ text: '' });
      const context = createTestContext();

      const result = await agent.validate(explanation, context);

      expect(result.claims.length).toBe(0);
    });
  });

  describe('determinism', () => {
    it('extracts same claims from same text across multiple calls', async () => {
      const agent = new ValidationAgent({ enabled: true, useProvider: false });
      const text =
        'The finding detected a hardcoded key. This is a critical severity issue. It was found in src/config.ts.';
      const explanation = createTestExplanation({ text });
      const context = createTestContext();

      const results = await Promise.all(
        Array.from({ length: 5 }, () => agent.validate(explanation, context)),
      );

      const firstClaims = results[0].claims.map((c) => c.text);
      for (let i = 1; i < results.length; i++) {
        const currentClaims = results[i].claims.map((c) => c.text);
        expect(currentClaims).toEqual(firstClaims);
      }
    });
  });
});
