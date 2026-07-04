/**
 * Tests for M2 — Provider registry.
 *
 * Tests:
 * - Provider registration
 * - Registry lookup
 * - Active provider switching
 * - Fallback behavior
 * - Health check aggregation
 * - Provider listing
 * - Empty registry handling
 *
 * @module @veris/ai/__tests__/providers/registry.test
 */

import { describe, it, expect, vi } from 'vitest';
import { createProviderRegistry } from '../../src/providers/registry.js';
import { MockAdapter } from '../../src/providers/adapters/mock.js';
import { ProviderError } from '../../src/providers/errors.js';

describe('ProviderRegistry', () => {
  describe('creation and registration', () => {
    it('creates an empty registry', () => {
      const registry = createProviderRegistry();
      expect(registry.size).toBe(0);
    });

    it('registers providers from constructor', () => {
      const mock1 = new MockAdapter({ response: 'response1' });
      const mock2 = new MockAdapter({ response: 'response2' });
      Object.defineProperty(mock2, 'id', { value: 'mock2' });
      const registry = createProviderRegistry([mock1, mock2]);

      expect(registry.size).toBe(2);
      expect(registry.list().length).toBe(2);
    });

    it('registers providers after creation', () => {
      const registry = createProviderRegistry();
      registry.register(new MockAdapter({ response: 'test' }));
      expect(registry.size).toBe(1);
    });

    it('sets first provider as active by default', () => {
      const mock1 = new MockAdapter({ response: 'r1' });
      const mock2 = new MockAdapter({ response: 'r2' });
      const registry = createProviderRegistry([mock1, mock2]);

      expect(registry.getActive().id).toBe('mock');
    });

    it('sets specified provider as active', () => {
      const mock1 = new MockAdapter({ response: 'r1', model: 'model1' });
      const mock2 = new MockAdapter({ response: 'r2', model: 'model2' });
      // Create a provider with a different id
      const customMock = new MockAdapter({ response: 'custom' });
      Object.defineProperty(customMock, 'id', { value: 'custom-mock' });

      const registry = createProviderRegistry([mock1, mock2, customMock], {
        activeProviderId: 'custom-mock',
      });

      expect(registry.getActive().id).toBe('custom-mock');
    });
  });

  describe('active provider switching', () => {
    it('switches active provider', () => {
      const mock1 = new MockAdapter({ response: 'r1' });
      const mock2 = new MockAdapter({ response: 'r2' });
      Object.defineProperty(mock2, 'id', { value: 'mock2' });

      const registry = createProviderRegistry([mock1, mock2]);
      registry.setActive('mock2');

      expect(registry.getActive().id).toBe('mock2');
    });

    it('throws when switching to unregistered provider', () => {
      const registry = createProviderRegistry([]);
      expect(() => registry.setActive('nonexistent')).toThrow(ProviderError);
    });

    it('throws when getting active from empty registry', () => {
      const registry = createProviderRegistry();
      expect(() => registry.getActive()).toThrow(ProviderError);
    });
  });

  describe('health checks', () => {
    it('returns all healthy when all providers are healthy', async () => {
      const mock1 = new MockAdapter();
      const mock2 = new MockAdapter();
      Object.defineProperty(mock2, 'id', { value: 'mock2' });

      const registry = createProviderRegistry([mock1, mock2]);
      const report = await registry.healthCheckAll();

      expect(report.allHealthy).toBe(true);
      expect(report.results['mock'].healthy).toBe(true);
      expect(report.results['mock2'].healthy).toBe(true);
      expect(report.timestamp).toBeDefined();
    });

    it('reports unhealthy providers correctly', async () => {
      const healthy = new MockAdapter();
      const unhealthy = new MockAdapter({ simulateUnhealthy: true });
      Object.defineProperty(unhealthy, 'id', { value: 'unhealthy' });

      const registry = createProviderRegistry([healthy, unhealthy]);
      const report = await registry.healthCheckAll();

      expect(report.allHealthy).toBe(false);
      expect(report.results['mock'].healthy).toBe(true);
      expect(report.results['unhealthy'].healthy).toBe(false);
    });

    it('handles health check exceptions gracefully', async () => {
      const throwingProvider = new MockAdapter();
      vi.spyOn(throwingProvider, 'healthCheck').mockRejectedValue(new Error('Connection refused'));

      const registry = createProviderRegistry([throwingProvider]);
      const report = await registry.healthCheckAll();

      expect(report.results['mock'].healthy).toBe(false);
      expect(report.results['mock'].message).toContain('Connection refused');
    });
  });

  describe('capabilities', () => {
    it('returns capabilities of active provider', () => {
      const mock = new MockAdapter();
      const registry = createProviderRegistry([mock]);

      const caps = registry.getCapabilities();
      expect(caps.supportsJsonMode).toBe(true);
      expect(caps.supportsStreaming).toBe(true);
      expect(caps.requiresNetwork).toBe(false);
    });
  });

  describe('listing providers', () => {
    it('lists all registered providers with status', () => {
      const mock1 = new MockAdapter();
      const mock2 = new MockAdapter();
      Object.defineProperty(mock2, 'id', { value: 'mock2' });

      const registry = createProviderRegistry([mock1, mock2]);
      const list = registry.list();

      expect(list.length).toBe(2);
      expect(list[0].id).toBe('mock');
      expect(list[0].name).toBe('Mock Provider');
      expect(list[0].healthy).toBe(true);
    });
  });
});
