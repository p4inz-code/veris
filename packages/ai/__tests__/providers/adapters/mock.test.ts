/**
 * Tests for M2 — Mock adapter.
 *
 * Tests:
 * - Basic response generation
 * - Deterministic behavior (same input → same output)
 * - Error simulation
 * - Health check simulation
 * - Stream simulation
 * - Latency simulation
 * - Response mapping
 * - Call counting
 *
 * @module @veris/ai/__tests__/providers/adapters/mock.test
 */

import { describe, it, expect } from 'vitest';
import { MockAdapter } from '../../../src/providers/adapters/mock.js';
import { ProviderError } from '../../../src/providers/errors.js';

describe('MockAdapter', () => {
  describe('basic response generation', () => {
    it('returns configured response', async () => {
      const mock = new MockAdapter({ response: 'Hello, World!' });
      const result = await mock.generate({
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(result.content).toBe('Hello, World!');
      expect(result.finishReason).toBe('stop');
      expect(result.provider).toBe('mock');
      expect(result.model).toBe('mock-model');
    });

    it('returns default response when not configured', async () => {
      const mock = new MockAdapter();
      const result = await mock.generate({
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(result.content).toBe('Mock response');
    });

    it('returns token usage', async () => {
      const mock = new MockAdapter({
        tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      });
      const result = await mock.generate({
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(result.usage.promptTokens).toBe(10);
      expect(result.usage.completionTokens).toBe(20);
      expect(result.usage.totalTokens).toBe(30);
    });
  });

  describe('deterministic behavior', () => {
    it('returns same output for same input', async () => {
      const mock = new MockAdapter({ response: 'Fixed response' });

      const result1 = await mock.generate({
        messages: [{ role: 'user', content: 'Hello' }],
      });
      const result2 = await mock.generate({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result1.content).toBe(result2.content);
    });

    it('uses deterministic routing via content-based matching', async () => {
      // Build a response map using the same simpleHash function from MockAdapter
      // The hash is computed from the concatenated message contents
      function simpleHash(input: string): string {
        let hash = 0;
        for (let i = 0; i < input.length; i++) {
          const char = input.charCodeAt(i);
          hash = (hash << 5) - hash + char;
          hash = hash & hash;
        }
        return hash.toString(36);
      }

      const helloHash = simpleHash('Hello');
      const byeHash = simpleHash('Goodbye');

      const mock = new MockAdapter({
        responseMap: {
          [helloHash]: 'Hello response',
          [byeHash]: 'Goodbye response',
        },
        response: 'Default response',
      });

      // Should match the hello entry in the response map
      const result1 = await mock.generate({
        messages: [{ role: 'user', content: 'Hello' }],
      });
      expect(result1.content).toBe('Hello response');

      // Should match the bye entry
      const result2 = await mock.generate({
        messages: [{ role: 'user', content: 'Goodbye' }],
      });
      expect(result2.content).toBe('Goodbye response');

      // Should fall through to default for unmapped content
      const result3 = await mock.generate({
        messages: [{ role: 'user', content: 'Unmapped content here' }],
      });
      expect(result3.content).toBe('Default response');
    });

    it('is idempotent across 100 calls', async () => {
      const mock = new MockAdapter({ response: 'Idempotent' });

      const results = await Promise.all(
        Array.from({ length: 100 }, () =>
          mock.generate({ messages: [{ role: 'user', content: 'test' }] }),
        ),
      );

      for (const result of results) {
        expect(result.content).toBe('Idempotent');
      }
    });
  });

  describe('error simulation', () => {
    it('simulates provider errors', async () => {
      const mock = new MockAdapter({
        simulateError: true,
        simulateErrorCode: 'PROVIDER_UNAVAILABLE',
      });

      await expect(mock.generate({ messages: [{ role: 'user', content: 'Hi' }] })).rejects.toThrow(
        ProviderError,
      );
    });

    it('simulates specific error codes', async () => {
      const mock = new MockAdapter({
        simulateError: true,
        simulateErrorCode: 'RATE_LIMITED',
      });

      try {
        await mock.generate({ messages: [{ role: 'user', content: 'Hi' }] });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).code).toBe('RATE_LIMITED');
      }
    });
  });

  describe('health check simulation', () => {
    it('returns healthy by default', async () => {
      const mock = new MockAdapter();
      const health = await mock.healthCheck();
      expect(health.healthy).toBe(true);
    });

    it('simulates unhealthy state', async () => {
      const mock = new MockAdapter({ simulateUnhealthy: true });
      const health = await mock.healthCheck();
      expect(health.healthy).toBe(false);
      expect(health.message).toContain('unhealthy');
    });
  });

  describe('streaming', () => {
    it('yields content in chunks', async () => {
      const mock = new MockAdapter({ response: 'Hello World' });
      const chunks: string[] = [];

      for await (const chunk of mock.generateStream({
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        chunks.push(chunk.content);
      }

      // Should have content chunks plus a final done chunk
      expect(chunks.length).toBeGreaterThan(1);
      // All content combined should equal the full response
      expect(chunks.join('')).toBe('Hello World');
    });

    it('yields a final done chunk', async () => {
      const mock = new MockAdapter({ response: 'x' });
      let sawDone = false;

      for await (const chunk of mock.generateStream({
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        if (chunk.done) sawDone = true;
      }

      expect(sawDone).toBe(true);
    });
  });

  describe('call counting', () => {
    it('tracks invocation count', async () => {
      const mock = new MockAdapter({ response: 'test' });

      expect(mock.invocationCount).toBe(0);

      await mock.generate({ messages: [{ role: 'user', content: '1' }] });
      expect(mock.invocationCount).toBe(1);

      await mock.generate({ messages: [{ role: 'user', content: '2' }] });
      expect(mock.invocationCount).toBe(2);
    });

    it('resets invocation count', async () => {
      const mock = new MockAdapter({ response: 'test' });
      await mock.generate({ messages: [{ role: 'user', content: '1' }] });
      expect(mock.invocationCount).toBe(1);

      mock.resetCount();
      expect(mock.invocationCount).toBe(0);
    });
  });

  describe('withConfig', () => {
    it('creates a new adapter with merged config', () => {
      const mock = new MockAdapter({ response: 'base' });
      const derived = mock.withConfig({ response: 'overridden' });

      expect(derived).toBeInstanceOf(MockAdapter);
      expect(derived).not.toBe(mock); // Different instance
    });
  });

  describe('capabilities', () => {
    it('returns mock capabilities', () => {
      const mock = new MockAdapter();
      const caps = mock.getCapabilities();

      expect(caps.supportsJsonMode).toBe(true);
      expect(caps.supportsStreaming).toBe(true);
      expect(caps.supportsFunctions).toBe(true);
      expect(caps.requiresNetwork).toBe(false);
    });
  });
});
