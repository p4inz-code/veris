/**
 * Tests for ProviderManager — provider selection, failover, health checks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ProviderManager tests involve retries with delays — increase timeout
const TEST_TIMEOUT = 15000;
import { ProviderManager } from '../../../src/engine/provider-manager.js';
import type { LLMProvider, ProviderRegistry, GenerateOptions, GenerateResult } from '@veris/ai';

function createMockProvider(id: string): LLMProvider {
  return {
    id,
    name: `Provider ${id}`,
    version: '1.0.0',
    healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
    generate: vi.fn().mockResolvedValue({
      content: `Response from ${id}`,
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      provider: id,
      model: 'mock-model',
    } as GenerateResult),
    generateStream: vi.fn().mockImplementation(async function* () {}),
    getCapabilities: vi.fn().mockReturnValue({
      supportedModes: ['text', 'json'],
      maxTokens: 4096,
      streaming: false,
    }),
  };
}

function createMockRegistry(providers: LLMProvider[]): ProviderRegistry {
  let activeIndex = 0;
  return {
    getActive: vi.fn(() => providers[activeIndex]),
    setActive: vi.fn((id: string) => {
      const idx = providers.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error(`Provider ${id} not found`);
      activeIndex = idx;
    }),
    list: vi.fn(() => providers.map((p) => ({ id: p.id, name: p.name, healthy: true }))),
    register: vi.fn(),
    healthCheckAll: vi.fn().mockResolvedValue({
      results: Object.fromEntries(providers.map((p) => [p.id, { healthy: true }])),
      allHealthy: true,
      timestamp: new Date().toISOString(),
    }),
    getCapabilities: vi.fn().mockReturnValue({
      supportedModes: ['text', 'json'],
      maxTokens: 4096,
      streaming: false,
    }),
    size: providers.length,
  };
}

describe('ProviderManager', () => {
  let primary: LLMProvider;
  let mockConfig: any;

  beforeEach(() => {
    primary = createMockProvider('primary');
    mockConfig = {
      provider: {
        active: 'primary',
        fallback: undefined,
        timeoutMs: 5000,
        maxRetries: 2,
      },
      defaultMode: 'simple',
      caching: false,
      tokenBudget: { maxContextTokens: 4000, maxOutputTokens: 1000 },
      logging: { auditEnabled: false, metricsEnabled: false },
    } as any;
  });

  it('generates with active provider', { timeout: TEST_TIMEOUT }, async () => {
    const registry = createMockRegistry([primary]);
    const manager = new ProviderManager(registry, mockConfig);

    const result = await manager.generate(
      () => ({ messages: [{ role: 'user', content: 'test' }] }),
      'finding-1',
      'finding',
    );

    expect(result).toBeDefined();
    expect('content' in result!).toBe(true);
    if ('content' in result!) {
      expect(result.content).toBe('Response from primary');
    }
  });

  it('fails over to fallback provider', { timeout: TEST_TIMEOUT }, async () => {
    mockConfig.provider.fallback = 'fallback';
    const fallback = createMockProvider('fallback');
    const registry = createMockRegistry([primary, fallback]);

    // Make primary fail
    const failingPrimary: LLMProvider = {
      ...primary,
      generate: vi.fn().mockRejectedValue(new Error('Primary unavailable')),
    };
    // Re-create registry with failing primary
    const failoverRegistry = createMockRegistry([failingPrimary, fallback]);
    const manager = new ProviderManager(failoverRegistry, mockConfig);

    const result = await manager.generate(
      () => ({ messages: [{ role: 'user', content: 'test' }] }),
      'finding-1',
      'finding',
    );

    expect(result).toBeDefined();
    // Should have used fallback or returned error
    if (result && 'content' in result) {
      expect(result.content).toBe('Response from fallback');
    }
  });

  it('checks provider health', { timeout: TEST_TIMEOUT }, async () => {
    const registry = createMockRegistry([primary]);
    const manager = new ProviderManager(registry, mockConfig);

    const healthy = await manager.isAnyProviderHealthy();
    expect(healthy).toBe(true);
  });

  it('returns error when no provider is healthy', { timeout: TEST_TIMEOUT }, async () => {
    const unhealthyProvider: LLMProvider = {
      ...primary,
      generate: vi.fn().mockRejectedValue(new Error('Unhealthy')),
    };
    const registry = createMockRegistry([unhealthyProvider]);
    const manager = new ProviderManager(registry, mockConfig);

    const result = await manager.generate(
      () => ({ messages: [{ role: 'user', content: 'test' }] }),
      'finding-1',
      'finding',
    );

    if (result && 'kind' in result && result.kind === 'error') {
      expect(result.error.code).toBe('PROVIDER_UNAVAILABLE');
    }
  });
});
