/**
 * Tests for M2 — Anthropic adapter.
 *
 * Tests adapter contract: request format, response parsing, error handling.
 * Uses mock fetch to avoid real network calls.
 *
 * @module @veris/ai/__tests__/providers/adapters/anthropic.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicAdapter } from '../../../src/providers/adapters/anthropic.js';
import { ProviderError } from '../../../src/providers/errors.js';

describe('AnthropicAdapter', () => {
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
      const adapter = new AnthropicAdapter({
        apiKey: 'sk-ant-test',
        model: 'claude-sonnet-4-20250514',
        endpoint: 'https://custom.anthropic.com',
      });
      expect(adapter.id).toBe('anthropic');
      expect(adapter.name).toBe('Anthropic');
    });
  });

  describe('healthCheck', () => {
    it('returns healthy when API responds', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

      const adapter = new AnthropicAdapter({ apiKey: 'sk-ant-test' });
      const health = await adapter.healthCheck();

      expect(health.healthy).toBe(true);
    });

    it('returns unhealthy on network error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const adapter = new AnthropicAdapter({ apiKey: 'sk-ant-test' });
      const health = await adapter.healthCheck();

      expect(health.healthy).toBe(false);
    });
  });

  describe('generate', () => {
    it('sends correct request format with system prompt', async () => {
      let capturedBody: unknown = null;
      globalThis.fetch = vi.fn().mockImplementation(async (_url: string, opts: RequestInit) => {
        capturedBody = JSON.parse(opts.body as string);
        return new Response(
          JSON.stringify({
            id: 'msg_123',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello from Claude!' }],
            model: 'claude-sonnet-4-20250514',
            stop_reason: 'end_turn',
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      const adapter = new AnthropicAdapter({
        apiKey: 'sk-ant-test',
        model: 'claude-sonnet-4-20250514',
      });
      const result = await adapter.generate({
        messages: [
          { role: 'system', content: 'You are Claude.' },
          { role: 'user', content: 'Hello' },
        ],
        temperature: 0.3,
        maxTokens: 500,
      });

      // Verify request format
      const body = capturedBody as Record<string, unknown>;
      expect(body).toBeDefined();
      expect((body as { model: string }).model).toBe('claude-sonnet-4-20250514');
      expect((body as { system: string }).system).toBe('You are Claude.');
      expect((body as { messages: unknown[] }).messages).toHaveLength(1);
      expect((body as { max_tokens: number }).max_tokens).toBe(500);

      // Verify response parsing
      expect(result.content).toBe('Hello from Claude!');
      expect(result.finishReason).toBe('end_turn');
      expect(result.usage.promptTokens).toBe(10);
      expect(result.provider).toBe('anthropic');
    });

    it('sends request without system prompt', async () => {
      let capturedBody: unknown = null;
      globalThis.fetch = vi.fn().mockImplementation(async (_url: string, opts: RequestInit) => {
        capturedBody = JSON.parse(opts.body as string);
        return new Response(
          JSON.stringify({
            id: 'msg_123',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Response' }],
            model: 'claude-sonnet-4-20250514',
            stop_reason: 'end_turn',
            usage: { input_tokens: 5, output_tokens: 3 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      const adapter = new AnthropicAdapter({ apiKey: 'sk-ant-test' });
      const result = await adapter.generate({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      const body = capturedBody as { system?: string };
      expect(body.system).toBeUndefined();
      expect(result.content).toBe('Response');
    });

    it('handles API errors', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 }));

      const adapter = new AnthropicAdapter({ apiKey: 'sk-bad' });

      await expect(
        adapter.generate({ messages: [{ role: 'user', content: 'Hi' }] }),
      ).rejects.toThrow(ProviderError);
    });

    it('handles network errors', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('fetch failed'));

      const adapter = new AnthropicAdapter({ apiKey: 'sk-test' });

      await expect(
        adapter.generate({ messages: [{ role: 'user', content: 'Hi' }] }),
      ).rejects.toThrow(ProviderError);
    });
  });

  describe('capabilities', () => {
    it('includes the configured model', () => {
      const adapter = new AnthropicAdapter({
        apiKey: 'sk-test',
        model: 'claude-haiku-3-5',
      });
      const caps = adapter.getCapabilities();

      expect(caps.models).toContain('claude-haiku-3-5');
      expect(caps.supportsJsonMode).toBe(true);
      expect(caps.maxContextTokens).toBe(200_000);
    });
  });
});
