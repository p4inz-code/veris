/**
 * Tests for M2 — Provider factory.
 *
 * Tests:
 * - Factory creation of all adapter types
 * - Unsupported type handling
 * - Configuration passing
 * - Supported types listing
 *
 * @module @veris/ai/__tests__/providers/factory.test
 */

import { describe, it, expect } from 'vitest';
import { createProviderFactory, defaultProviderFactory } from '../../src/providers/factory.js';
import { OpenAIAdapter } from '../../src/providers/adapters/openai.js';
import { AnthropicAdapter } from '../../src/providers/adapters/anthropic.js';
import { OllamaAdapter } from '../../src/providers/adapters/ollama.js';
import { CustomAdapter } from '../../src/providers/adapters/custom.js';
import { MockAdapter } from '../../src/providers/adapters/mock.js';

describe('ProviderFactory', () => {
  describe('createProvider', () => {
    it('creates an OpenAI adapter', () => {
      const factory = createProviderFactory();
      const provider = factory.createProvider({
        type: 'openai',
        apiKey: 'sk-test',
        model: 'gpt-4o',
      });
      expect(provider).toBeInstanceOf(OpenAIAdapter);
      expect(provider.id).toBe('openai');
    });

    it('creates an Anthropic adapter', () => {
      const factory = createProviderFactory();
      const provider = factory.createProvider({
        type: 'anthropic',
        apiKey: 'sk-ant-test',
        model: 'claude-sonnet-4-20250514',
      });
      expect(provider).toBeInstanceOf(AnthropicAdapter);
      expect(provider.id).toBe('anthropic');
    });

    it('creates an Ollama adapter', () => {
      const factory = createProviderFactory();
      const provider = factory.createProvider({
        type: 'ollama',
        model: 'llama3.1:8b',
        endpoint: 'http://localhost:11434',
      });
      expect(provider).toBeInstanceOf(OllamaAdapter);
      expect(provider.id).toBe('ollama');
    });

    it('creates an OpenAI-compatible adapter', () => {
      const factory = createProviderFactory();
      const provider = factory.createProvider({
        type: 'openai-compatible',
        endpoint: 'http://localhost:1234/v1',
        model: 'local-model',
      });
      expect(provider).toBeInstanceOf(CustomAdapter);
      expect(provider.id).toBe('custom');
    });

    it('creates a Mock adapter', () => {
      const factory = createProviderFactory();
      const provider = factory.createProvider({
        type: 'mock',
        model: 'test-model',
        apiKey: 'Hello, World!',
      });
      expect(provider).toBeInstanceOf(MockAdapter);
      expect(provider.id).toBe('mock');
    });

    it('throws for unsupported provider type', () => {
      const factory = createProviderFactory();
      expect(() =>
        factory.createProvider({
          type: 'unsupported' as never,
        }),
      ).toThrow('Unsupported provider type');
    });
  });

  describe('getSupportedTypes', () => {
    it('returns all supported types', () => {
      const factory = createProviderFactory();
      const types = factory.getSupportedTypes();

      expect(types).toContain('openai');
      expect(types).toContain('anthropic');
      expect(types).toContain('ollama');
      expect(types).toContain('openai-compatible');
      expect(types).toContain('mock');
      expect(types.length).toBe(5);
    });
  });

  describe('defaultProviderFactory', () => {
    it('is a singleton instance', () => {
      expect(defaultProviderFactory.getSupportedTypes().length).toBe(5);
    });
  });
});
