/**
 * Tests for M2 — Custom/OpenAI-compatible adapter.
 *
 * Tests adapter contract: request format, response parsing, error handling.
 * Uses mock fetch to avoid real network calls.
 *
 * @module @veris/ai/__tests__/providers/adapters/custom.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CustomAdapter } from '../../../src/providers/adapters/custom.js';
import { ProviderError } from '../../../src/providers/errors.js';

describe('CustomAdapter', () => {
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
      const adapter = new CustomAdapter({
        endpoint: 'http://localhost:8080/v1',
        model: 'custom-model',
        apiKey: 'optional-key',
      });
      expect(adapter.id).toBe('custom');
      expect(adapter.name).toBe('OpenAI-Compatible');
    });

    it('uses defaults when not specified', () => {
      const adapter = new CustomAdapter();
      expect(adapter).toBeDefined();
    });
  });

  describe('healthCheck', () => {
    it('returns healthy when endpoint responds', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

      const adapter = new CustomAdapter();
      const health = await adapter.healthCheck();

      expect(health.healthy).toBe(true);
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/models'), expect.any(Object));
    });

    it('returns unhealthy on network error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const adapter = new CustomAdapter();
      const health = await adapter.healthCheck();

      expect(health.healthy).toBe(false);
    });
  });

  describe('generate', () => {
    it('sends correct request format without auth', async () => {
      let capturedBody: unknown = null;
      let capturedHeaders: Record<string, string> = {};
      globalThis.fetch = vi.fn().mockImplementation(async (_url: string, opts: RequestInit) => {
        capturedBody = JSON.parse(opts.body as string);
        capturedHeaders = opts.headers as Record<string, string>;
        return new Response(
          JSON.stringify({
            id: 'cmpl-123',
            object: 'chat.completion',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Response from local model!' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            model: 'local-model',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      const adapter = new CustomAdapter({
        endpoint: 'http://localhost:1234/v1',
        model: 'local-model',
      });
      const result = await adapter.generate({
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        maxTokens: 2000,
      });

      // Verify no auth header
      expect(capturedHeaders['Authorization']).toBeUndefined();

      // Verify request format
      const body = capturedBody as Record<string, unknown>;
      expect(body).toBeDefined();
      expect((body as { model: string }).model).toBe('local-model');
      expect((body as { messages: unknown[] }).messages).toHaveLength(1);
      expect((body as { temperature: number }).temperature).toBe(0.7);

      // Verify response parsing
      expect(result.content).toBe('Response from local model!');
      expect(result.finishReason).toBe('stop');
      expect(result.usage.totalTokens).toBe(15);
      expect(result.provider).toBe('custom');
    });

    it('sends auth header when configured', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (_url: string, opts: RequestInit) => {
        return new Response(
          JSON.stringify({
            id: 'cmpl-123',
            object: 'chat.completion',
            choices: [
              { index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' },
            ],
            model: 'model',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      const adapter = new CustomAdapter({
        endpoint: 'http://localhost:8080/v1',
        apiKey: 'my-key',
      });

      await adapter.generate({ messages: [{ role: 'user', content: 'Hi' }] });

      const callArgs = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = callArgs[1].headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer my-key');
    });

    it('handles API errors', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 }));

      const adapter = new CustomAdapter({ endpoint: 'http://localhost:1234/v1' });

      await expect(
        adapter.generate({ messages: [{ role: 'user', content: 'Hi' }] }),
      ).rejects.toThrow(ProviderError);
    });

    it('handles network errors', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const adapter = new CustomAdapter();

      await expect(
        adapter.generate({ messages: [{ role: 'user', content: 'Hi' }] }),
      ).rejects.toThrow(ProviderError);
    });
  });

  describe('capabilities', () => {
    it('reports OpenAI-compatible capabilities', () => {
      const adapter = new CustomAdapter({ model: 'my-model' });
      const caps = adapter.getCapabilities();

      expect(caps.models).toContain('my-model');
      expect(caps.requiresNetwork).toBe(false);
      expect(caps.supportsJsonMode).toBe(true);
      expect(caps.supportsStreaming).toBe(true);
    });
  });
});
