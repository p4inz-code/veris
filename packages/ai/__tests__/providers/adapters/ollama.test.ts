/**
 * Tests for M2 — Ollama adapter.
 *
 * Tests adapter contract: request format, response parsing, error handling.
 * Uses mock fetch to avoid real network calls.
 *
 * @module @veris/ai/__tests__/providers/adapters/ollama.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaAdapter } from '../../../src/providers/adapters/ollama.js';
import { ProviderError } from '../../../src/providers/errors.js';

describe('OllamaAdapter', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('creates adapter with custom config', () => {
      const adapter = new OllamaAdapter({
        model: 'llama3.1:70b',
        endpoint: 'http://custom:11434',
        keepAlive: '10m',
      });
      expect(adapter.id).toBe('ollama');
      expect(adapter.name).toBe('Ollama');
    });

    it('uses defaults when not specified', () => {
      const adapter = new OllamaAdapter();
      expect(adapter).toBeDefined();
    });
  });

  describe('healthCheck', () => {
    it('returns healthy when Ollama is running', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

      const adapter = new OllamaAdapter();
      const health = await adapter.healthCheck();

      expect(health.healthy).toBe(true);
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/tags'), expect.any(Object));
    });

    it('returns unhealthy on connection error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const adapter = new OllamaAdapter();
      const health = await adapter.healthCheck();

      expect(health.healthy).toBe(false);
    });
  });

  describe('generate', () => {
    it('sends correct request format', async () => {
      let capturedBody: unknown = null;
      globalThis.fetch = vi.fn().mockImplementation(async (_url: string, opts: RequestInit) => {
        capturedBody = JSON.parse(opts.body as string);
        return new Response(
          JSON.stringify({
            model: 'llama3.1:8b',
            created_at: '2024-01-01T00:00:00Z',
            message: { role: 'assistant', content: 'Hello from Ollama!' },
            done_reason: 'stop',
            done: true,
            prompt_eval_count: 10,
            eval_count: 5,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      const adapter = new OllamaAdapter({ model: 'llama3.1:8b' });
      const result = await adapter.generate({
        messages: [
          { role: 'system', content: 'Be helpful.' },
          { role: 'user', content: 'Hello' },
        ],
        temperature: 0.7,
        maxTokens: 2000,
        responseFormat: 'json',
      });

      // Verify request format
      const body = capturedBody as Record<string, unknown>;
      expect(body).toBeDefined();
      expect((body as { model: string }).model).toBe('llama3.1:8b');
      expect((body as { messages: unknown[] }).messages).toHaveLength(2);
      expect((body as { format: string }).format).toBe('json');
      expect((body as { keep_alive: string }).keep_alive).toBe('5m');

      // Verify response parsing
      expect(result.content).toBe('Hello from Ollama!');
      expect(result.finishReason).toBe('stop');
      expect(result.usage.promptTokens).toBe(10);
      expect(result.usage.completionTokens).toBe(5);
      expect(result.provider).toBe('ollama');
    });

    it('handles API errors', async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(new Response('Model not found', { status: 404 }));

      const adapter = new OllamaAdapter();

      await expect(
        adapter.generate({ messages: [{ role: 'user', content: 'Hi' }] }),
      ).rejects.toThrow(ProviderError);
    });

    it('handles network errors', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const adapter = new OllamaAdapter();

      await expect(
        adapter.generate({ messages: [{ role: 'user', content: 'Hi' }] }),
      ).rejects.toThrow(ProviderError);
    });
  });

  describe('capabilities', () => {
    it('includes the configured model', () => {
      const adapter = new OllamaAdapter({ model: 'mistral' });
      const caps = adapter.getCapabilities();

      expect(caps.models).toContain('mistral');
      expect(caps.requiresNetwork).toBe(false);
      expect(caps.supportsFunctions).toBe(false);
    });
  });
});
