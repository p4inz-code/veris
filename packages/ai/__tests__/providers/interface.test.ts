/**
 * Tests for M2 — Provider interfaces.
 *
 * Tests:
 * - Interface structural correctness
 * - ProviderRequest / ProviderResponse aliases
 * - Message type structure
 * - TokenUsage structure
 * - HealthResult structure
 *
 * @module @veris/ai/__tests__/providers/interface.test
 */

import { describe, it, expect } from 'vitest';
import type {
  LLMProvider,
  ProviderRequest,
  ProviderResponse,
  GenerateOptions,
  GenerateResult,
  GenerateChunk,
  Message,
  TokenUsage,
  HealthResult,
} from '../../src/providers/interface.js';
import type { ProviderCapabilities } from '../../src/providers/capabilities.js';

describe('Provider Interfaces', () => {
  describe('Message', () => {
    it('accepts valid role values', () => {
      const system: Message = { role: 'system', content: 'You are a helpful assistant.' };
      const user: Message = { role: 'user', content: 'Hello!' };
      const assistant: Message = { role: 'assistant', content: 'Hi there!' };

      expect(system.role).toBe('system');
      expect(user.role).toBe('user');
      expect(assistant.role).toBe('assistant');
    });

    it('has readonly properties', () => {
      const message: Message = { role: 'user', content: 'test' };
      expect(message.content).toBe('test');
    });
  });

  describe('GenerateOptions', () => {
    it('can be constructed with required fields only', () => {
      const options: GenerateOptions = {
        messages: [{ role: 'user', content: 'Hello' }],
      };
      expect(options.messages.length).toBe(1);
      expect(options.temperature).toBeUndefined();
      expect(options.maxTokens).toBeUndefined();
      expect(options.responseFormat).toBeUndefined();
      expect(options.abortSignal).toBeUndefined();
    });

    it('can be constructed with all fields', () => {
      const controller = new AbortController();
      const options: GenerateOptions = {
        messages: [
          { role: 'system', content: 'System prompt' },
          { role: 'user', content: 'User message' },
        ],
        temperature: 0.5,
        maxTokens: 4096,
        responseFormat: 'json',
        abortSignal: controller.signal,
      };
      expect(options.messages.length).toBe(2);
      expect(options.temperature).toBe(0.5);
      expect(options.maxTokens).toBe(4096);
      expect(options.responseFormat).toBe('json');
      expect(options.abortSignal).toBe(controller.signal);
    });

    it('supports text response format', () => {
      const options: GenerateOptions = {
        messages: [],
        responseFormat: 'text',
      };
      expect(options.responseFormat).toBe('text');
    });
  });

  describe('GenerateResult', () => {
    it('can be constructed with all fields', () => {
      const result: GenerateResult = {
        content: 'Generated text',
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        provider: 'mock',
        model: 'mock-model',
      };
      expect(result.content).toBe('Generated text');
      expect(result.finishReason).toBe('stop');
      expect(result.usage.totalTokens).toBe(150);
      expect(result.provider).toBe('mock');
      expect(result.model).toBe('mock-model');
    });
  });

  describe('GenerateChunk', () => {
    it('can represent intermediate chunks', () => {
      const chunk: GenerateChunk = { content: 'Hello', done: false };
      expect(chunk.content).toBe('Hello');
      expect(chunk.done).toBe(false);
    });

    it('can represent the final chunk', () => {
      const chunk: GenerateChunk = { content: '', done: true };
      expect(chunk.done).toBe(true);
    });
  });

  describe('LLMProvider interface', () => {
    it('defines all required methods', () => {
      const provider: LLMProvider = {
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        healthCheck: async () => ({ healthy: true }),
        generate: async () => ({
          content: '',
          finishReason: 'stop',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          provider: 'test',
          model: 'test',
        }),
        generateStream: async function* () {
          yield { content: '', done: true };
        },
        getCapabilities: () => ({
          supportsJsonMode: false,
          supportsStreaming: false,
          supportsFunctions: false,
          maxContextTokens: 4096,
          maxOutputTokens: 1024,
          models: ['test'],
          requiresNetwork: false,
        }),
      };

      expect(provider.id).toBe('test');
      expect(provider.name).toBe('Test');
      expect(provider.version).toBe('1.0.0');
    });
  });

  describe('ProviderRequest / ProviderResponse aliases', () => {
    it('ProviderRequest is an alias for GenerateOptions', () => {
      const request: ProviderRequest = { messages: [{ role: 'user', content: 'Hi' }] };
      const options: GenerateOptions = request;
      expect(options.messages[0].content).toBe('Hi');
    });

    it('ProviderResponse is an alias for GenerateResult', () => {
      const response: ProviderResponse = {
        content: 'Reply',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        provider: 'test',
        model: 'test',
      };
      const result: GenerateResult = response;
      expect(result.content).toBe('Reply');
    });
  });

  describe('HealthResult', () => {
    it('can represent a healthy state', () => {
      const health: HealthResult = { healthy: true };
      expect(health.healthy).toBe(true);
      expect(health.message).toBeUndefined();
    });

    it('can represent an unhealthy state with message', () => {
      const health: HealthResult = { healthy: false, message: 'Not responding' };
      expect(health.healthy).toBe(false);
      expect(health.message).toBe('Not responding');
    });
  });

  describe('TokenUsage', () => {
    it('tracks all three token counts', () => {
      const usage: TokenUsage = { promptTokens: 100, completionTokens: 50, totalTokens: 150 };
      expect(usage.promptTokens).toBe(100);
      expect(usage.completionTokens).toBe(50);
      expect(usage.totalTokens).toBe(150);
    });
  });
});
