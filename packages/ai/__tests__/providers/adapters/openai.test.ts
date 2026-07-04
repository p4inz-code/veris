/**
 * Tests for M2 — OpenAI adapter.
 *
 * Tests adapter contract: request format, response parsing, error handling.
 * Uses mock fetch to avoid real network calls.
 *
 * @module @veris/ai/__tests__/providers/adapters/openai.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIAdapter } from '../../../src/providers/adapters/openai.js';
import { ProviderError } from '../../../src/providers/errors.js';

describe('OpenAIAdapter', () => {
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
      const adapter = new OpenAIAdapter({
        apiKey: 'sk-test',
        model: 'gpt-4o-mini',
        endpoint: 'https://custom.openai.com/v1',
        organization: 'org-123',
      });
      expect(adapter.id).toBe('openai');
      expect(adapter.name).toBe('OpenAI');
    });

    it('uses default values when not specified', () => {
      const adapter = new OpenAIAdapter({ apiKey: 'sk-test' });
      expect(adapter).toBeDefined();
    });
  });

  describe('healthCheck', () => {
    it('returns healthy when API responds', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

      const adapter = new OpenAIAdapter({ apiKey: 'sk-test' });
      const health = await adapter.healthCheck();

      expect(health.healthy).toBe(true);
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/models'), expect.any(Object));
    });

    it('returns unhealthy on network error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const adapter = new OpenAIAdapter({ apiKey: 'sk-test' });
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
            id: 'chatcmpl-123',
            object: 'chat.completion',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Hello!' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            model: 'gpt-4o',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      const adapter = new OpenAIAdapter({ apiKey: 'sk-test', model: 'gpt-4o' });
      const result = await adapter.generate({
        messages: [
          { role: 'system', content: 'Be helpful.' },
          { role: 'user', content: 'Hello' },
        ],
        temperature: 0.5,
        maxTokens: 100,
        responseFormat: 'json',
      });

      // Verify request format
      const body = capturedBody as Record<string, unknown>;
      expect(body).toBeDefined();
      expect((body as { model: string }).model).toBe('gpt-4o');
      expect((body as { messages: unknown[] }).messages).toHaveLength(2);
      expect((body as { temperature: number }).temperature).toBe(0.5);
      expect((body as { max_tokens: number }).max_tokens).toBe(100);
      expect((body as { response_format: { type: string } }).response_format?.type).toBe(
        'json_object',
      );

      // Verify response parsing
      expect(result.content).toBe('Hello!');
      expect(result.finishReason).toBe('stop');
      expect(result.usage.totalTokens).toBe(15);
      expect(result.provider).toBe('openai');
    });

    it('handles API errors', async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(
          new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }),
        );

      const adapter = new OpenAIAdapter({ apiKey: 'sk-bad' });

      await expect(
        adapter.generate({ messages: [{ role: 'user', content: 'Hi' }] }),
      ).rejects.toThrow(ProviderError);
    });

    it('handles network errors', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('fetch failed'));

      const adapter = new OpenAIAdapter({ apiKey: 'sk-test' });

      await expect(
        adapter.generate({ messages: [{ role: 'user', content: 'Hi' }] }),
      ).rejects.toThrow(ProviderError);
    });

    it('handles empty response choices', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'chatcmpl-123',
            object: 'chat.completion',
            choices: [],
            model: 'gpt-4o',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const adapter = new OpenAIAdapter({ apiKey: 'sk-test' });

      await expect(
        adapter.generate({ messages: [{ role: 'user', content: 'Hi' }] }),
      ).rejects.toThrow(ProviderError);
    });
  });

  describe('capabilities', () => {
    it('includes the configured model', () => {
      const adapter = new OpenAIAdapter({ apiKey: 'sk-test', model: 'gpt-4o-mini' });
      const caps = adapter.getCapabilities();

      expect(caps.models).toContain('gpt-4o-mini');
    });
  });
});
