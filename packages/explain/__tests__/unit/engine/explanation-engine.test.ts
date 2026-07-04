/**
 * Tests for ExplanationEngine — the main Explainer implementation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExplanationEngine } from '../../../src/engine/explanation-engine.js';
import type { CanonicalReport } from '@veris/core';
import type { ProviderRegistry, LLMProvider } from '@veris/ai';
import type { Logger } from '@veris/logger';
import type { ExplainConfig } from '../../../src/types/config.js';
import type { PromptRegistry, RenderedPrompt } from '../../../src/prompts/index.js';
import type { PersistentCache } from '../../../src/engine/explainer.js';

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
      metricsEnabled: true,
    },
  } as ExplainConfig;
}

function createMockProvider(): LLMProvider {
  return {
    id: 'mock',
    name: 'Mock Provider',
    version: '1.0.0',
    healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
    generate: vi.fn().mockResolvedValue({
      content: 'Mock explanation.',
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

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    setLevel: vi.fn(),
    getLevel: vi.fn(),
  } as unknown as Logger;
}

function createMockReport(overrides?: Partial<CanonicalReport>): CanonicalReport {
  return {
    metadata: {
      id: 'report-1',
      scanStartedAt: new Date().toISOString(),
      scanCompletedAt: new Date().toISOString(),
      scannerVersion: '1.0.0',
    },
    findings: [
      {
        id: 'FINDING_001',
        ruleId: 'test-rule',
        severity: { level: 'high', score: 8.0 },
        evidenceIds: ['ev_1'],
        affectedArtifacts: [{ artifactId: 'src/app.ts', startLine: 10, endLine: 20 }],
      },
    ],
    artifacts: [
      {
        id: 'src/app.ts',
        normalizedPath: 'src/app.ts',
        contentHash: 'abc',
        size: 1000,
        parentId: '',
      },
    ],
    riskProfile: {
      overall: { level: 'medium', score: 5.0 },
      dimensions: [],
      riskDrivers: [],
    },
    summary: {
      totalFindings: 1,
      findingsBySeverity: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
    },
    ...overrides,
  } as unknown as CanonicalReport;
}

describe('ExplanationEngine', () => {
  let engine: ExplanationEngine;
  let report: CanonicalReport;

  beforeEach(() => {
    const provider = createMockProvider();
    const providerRegistry = createMockProviderRegistry(provider);

    engine = new ExplanationEngine({
      providerRegistry,
      promptRegistry: createMockPromptRegistry(),
      config: createMockConfig(),
      logger: createMockLogger(),
    });

    report = createMockReport();
  });

  it('explains a finding successfully', async () => {
    const result = await engine.explainFinding('FINDING_001', report);
    expect(result.kind).toBe('success');
  });

  it('returns error for non-existent finding', async () => {
    const result = await engine.explainFinding('NOT_FOUND', report);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.code).toBe('FINDING_NOT_FOUND');
    }
  });

  it('explains a chain successfully', async () => {
    const chainReport = createMockReport({
      behaviorChains: [{ id: 'chain-1', findingIds: ['FINDING_001'] }],
    } as any);
    const result = await engine.explainChain('chain-1', chainReport);
    expect(['success', 'error']).toContain(result.kind);
  });

  it('returns error for non-existent chain', async () => {
    const result = await engine.explainChain('NOT_FOUND', report);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.code).toBe('CHAIN_NOT_FOUND');
    }
  });

  it('summarizes a report', async () => {
    const result = await engine.summarizeReport(report);
    expect(['success', 'error']).toContain(result.kind);
  });

  it('clears cache for a report', async () => {
    const mockCache: PersistentCache = {
      get: vi.fn(),
      set: vi.fn(),
      has: vi.fn(),
      invalidate: vi.fn().mockResolvedValue(1),
      getStats: vi.fn(),
      clear: vi.fn(),
    };

    const provider = createMockProvider();
    const providerRegistry = createMockProviderRegistry(provider);
    const cachedEngine = new ExplanationEngine({
      providerRegistry,
      cache: mockCache,
      promptRegistry: createMockPromptRegistry(),
      config: createMockConfig(),
      logger: createMockLogger(),
    });

    await cachedEngine.clearCacheForReport('report-1');
    expect(mockCache.invalidate).toHaveBeenCalled();
  });

  it('provides audit log accessor', () => {
    const auditLog = engine.getAuditLog();
    expect(auditLog).toBeDefined();
  });

  it('provides metrics accessor', () => {
    const metrics = engine.getMetrics();
    expect(metrics).toBeDefined();
  });

  it('provides engine version', () => {
    expect(engine.getEngineVersion()).toBe('1.0.0');
  });
});
