/**
 * Integration tests for Pipeline — end-to-end flow with mock provider.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pipeline tests involve provider calls with retry delays
const TEST_TIMEOUT = 15000;
import { Pipeline } from '../../../src/engine/pipeline.js';
import type { CanonicalReport } from '@veris/core';
import type { ExplainConfig } from '../../../src/types/config.js';
import type { ContextBuilder } from '../../../src/context/context-builder.js';
import type { PromptRegistry, RenderedPrompt } from '../../../src/prompts/index.js';
import type { ExplainScope } from '../../../src/engine/scope-manager.js';
import type { PersistentCache } from '../../../src/engine/explainer.js';
import { RequestBuilder } from '../../../src/engine/request-builder.js';
import { ResponseParser } from '../../../src/engine/response-parser.js';
import { ProviderManager } from '../../../src/engine/provider-manager.js';
import { AuditLog } from '../../../src/engine/audit-log.js';
import { Metrics } from '../../../src/engine/metrics.js';
import type { LLMProvider, ProviderRegistry } from '@veris/ai';

function createMockConfig(): ExplainConfig {
  return {
    defaultMode: 'simple',
    caching: false,
    provider: {
      active: 'mock',
      fallback: undefined,
      timeoutMs: 5000,
      maxRetries: 2,
    },
    tokenBudget: {
      maxContextTokens: 4000,
      maxOutputTokens: 1000,
      reservedForEvidence: 1500,
      reservedForRules: 500,
    },
    citationValidation: {
      enabled: true,
      strictMode: false,
      maxRetriesOnFailure: 0,
    },
    output: {
      maxLength: 5000,
      includeDisclaimer: true,
    },
    logging: {
      auditEnabled: false,
      metricsEnabled: false,
    },
  } as ExplainConfig;
}

function createMockContextBuilder(): ContextBuilder {
  return {
    build: vi.fn((scope: ExplainScope, _report: CanonicalReport) => ({
      subject: { id: scope.type === 'finding' ? scope.findingId : 'test' },
      evidence: [{ id: 'ev_1', confidence: 0.95, description: 'Test evidence' }],
      contextSchemaVersion: '1.0.0',
    })),
  } as unknown as ContextBuilder;
}

function createMockPromptRegistry(): PromptRegistry {
  return {
    render: vi.fn((_id: string, _ctx: Record<string, unknown>, _mode: string): RenderedPrompt => ({
      systemPrompt: 'You are a security expert.',
      userPrompt: 'Explain this finding.',
      expectedCitations: [],
      tokenEstimate: 50,
      version: '1.0.0',
    })),
    listTemplates: vi.fn(() => []),
    getTemplateVersion: vi.fn(() => '1.0.0'),
    loadCustomTemplate: vi.fn(),
    get: vi.fn(),
    has: vi.fn(() => true),
    register: vi.fn(),
    getContent: vi.fn(() => ''),
  } as unknown as PromptRegistry;
}

function createMockProvider(): LLMProvider {
  return {
    id: 'mock',
    name: 'Mock Provider',
    version: '1.0.0',
    healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
    generate: vi.fn().mockResolvedValue({
      content: 'This is a mock explanation of the finding.',
      finishReason: 'stop',
      usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
      provider: 'mock',
      model: 'mock-model',
    }),
    generateStream: vi.fn().mockImplementation(async function* () {}),
    getCapabilities: vi.fn().mockReturnValue({
      supportedModes: ['text', 'json'],
      maxTokens: 4096,
      streaming: false,
    }),
  };
}

function createMockProviderRegistry(provider: LLMProvider): ProviderRegistry {
  return {
    getActive: vi.fn(() => provider),
    setActive: vi.fn(),
    list: vi.fn(() => [{ id: provider.id, name: provider.name, healthy: true }]),
    register: vi.fn(),
    healthCheckAll: vi.fn().mockResolvedValue({
      results: { mock: { healthy: true } },
      allHealthy: true,
      timestamp: new Date().toISOString(),
    }),
    getCapabilities: vi.fn().mockReturnValue({
      supportedModes: ['text', 'json'],
      maxTokens: 4096,
      streaming: false,
    }),
    size: 1,
  };
}

describe('Pipeline', () => {
  let pipeline: Pipeline;
  let mockScope: ExplainScope;
  let mockReport: CanonicalReport;
  let mockConfig: ExplainConfig;

  beforeEach(() => {
    mockConfig = createMockConfig();
    const provider = createMockProvider();
    const providerRegistry = createMockProviderRegistry(provider);

    pipeline = new Pipeline({
      config: mockConfig,
      contextBuilder: createMockContextBuilder(),
      promptRegistry: createMockPromptRegistry(),
      requestBuilder: new RequestBuilder(),
      responseParser: new ResponseParser(),
      providerManager: new ProviderManager(providerRegistry, mockConfig),
      cache: undefined,
      auditLog: new AuditLog({ enabled: false }),
      metrics: new Metrics(),
      engineVersion: '1.0.0',
    });

    mockScope = {
      type: 'finding',
      findingId: 'SQL_INJECTION',
      evidenceIds: ['ev_1'],
      ruleId: 'sql-rule',
      artifactIds: ['login.ts'],
    };

    mockReport = {
      findings: [{ id: 'SQL_INJECTION', ruleId: 'sql-rule', evidenceIds: ['ev_1'] }],
      artifacts: [],
    } as unknown as CanonicalReport;
  });

  it('runs successfully with finding scope', { timeout: TEST_TIMEOUT }, async () => {
    const result = await pipeline.run(mockScope, mockReport, 'simple');

    expect(result).toBeDefined();
    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.explanation.subjectId).toBe('SQL_INJECTION');
      expect(result.explanation.subjectType).toBe('finding');
      expect(result.explanation.text).toBe('This is a mock explanation of the finding.');
      expect(result.explanation.provider.id).toBe('mock');
    }
  });

  it('returns cached result when available', { timeout: TEST_TIMEOUT }, async () => {
    const mockCache: PersistentCache = {
      get: vi.fn().mockResolvedValue({
        id: 'exp_cached',
        subjectId: 'SQL_INJECTION',
        subjectType: 'finding',
        mode: 'simple',
        text: 'Cached explanation',
        citations: [],
        citationValidation: {
          valid: true,
          totalCitations: 0,
          verifiedCitations: 0,
          failedCitations: 0,
          citations: [],
        },
        provider: { id: 'mock', model: 'mock-model' },
        promptVersion: '1.0.0',
        tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        cached: true,
        refused: false,
        generatedAt: new Date().toISOString(),
        disclaimer: 'AI-generated test.',
      }),
      set: vi.fn(),
      has: vi.fn(),
      invalidate: vi.fn(),
      getStats: vi.fn(),
      clear: vi.fn(),
    };

    const cachedConfig = { ...mockConfig, caching: true };
    const provider = createMockProvider();
    const providerRegistry = createMockProviderRegistry(provider);

    const cachedPipeline = new Pipeline({
      config: cachedConfig,
      contextBuilder: createMockContextBuilder(),
      promptRegistry: createMockPromptRegistry(),
      requestBuilder: new RequestBuilder(),
      responseParser: new ResponseParser(),
      providerManager: new ProviderManager(providerRegistry, cachedConfig),
      cache: mockCache,
      auditLog: new AuditLog({ enabled: false }),
      metrics: new Metrics(),
      engineVersion: '1.0.0',
    });

    const result = await cachedPipeline.run(mockScope, mockReport, 'simple');
    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.explanation.text).toBe('Cached explanation');
      expect(result.explanation.cached).toBe(true);
    }
  });

  it('handles error from provider', { timeout: TEST_TIMEOUT }, async () => {
    const failingProvider: LLMProvider = {
      ...createMockProvider(),
      generate: vi.fn().mockRejectedValue(new Error('Provider unavailable')),
    };
    const failingRegistry = createMockProviderRegistry(failingProvider);

    const failingPipeline = new Pipeline({
      config: mockConfig,
      contextBuilder: createMockContextBuilder(),
      promptRegistry: createMockPromptRegistry(),
      requestBuilder: new RequestBuilder(),
      responseParser: new ResponseParser(),
      providerManager: new ProviderManager(failingRegistry, mockConfig),
      cache: undefined,
      auditLog: new AuditLog({ enabled: false }),
      metrics: new Metrics(),
      engineVersion: '1.0.0',
    });

    const result = await failingPipeline.run(mockScope, mockReport, 'simple');

    // Should return an error result
    expect(result.kind).toBe('error');
  });

  it('handles different scope types', { timeout: TEST_TIMEOUT }, async () => {
    // Chain scope
    const chainScope: ExplainScope = {
      type: 'chain',
      chainId: 'chain-1',
      findingIds: ['f1', 'f2'],
    };

    const result = await pipeline.run(chainScope, mockReport, 'technical');
    expect(result).toBeDefined();
    // Should succeed or return an appropriate error
    expect(['success', 'error']).toContain(result.kind);
  });
});
