/**
 * Tests for M2 — Provider capabilities.
 *
 * Tests:
 * - Capability presets
 * - Custom capability construction
 * - Field access and types
 *
 * @module @veris/ai/__tests__/providers/capabilities.test
 */

import { describe, it, expect } from 'vitest';
import type { ProviderCapabilities } from '../../src/providers/capabilities.js';
import {
  OPENAI_GPT4O_CAPABILITIES,
  ANTHROPIC_CLAUDE_SONNET_4_CAPABILITIES,
  OLLAMA_DEFAULT_CAPABILITIES,
  OPENAI_COMPATIBLE_CAPABILITIES,
  MOCK_CAPABILITIES,
} from '../../src/providers/capabilities.js';

describe('ProviderCapabilities', () => {
  describe('presets', () => {
    it('OPENAI_GPT4O_CAPABILITIES has correct values', () => {
      expect(OPENAI_GPT4O_CAPABILITIES.supportsJsonMode).toBe(true);
      expect(OPENAI_GPT4O_CAPABILITIES.supportsStreaming).toBe(true);
      expect(OPENAI_GPT4O_CAPABILITIES.supportsFunctions).toBe(true);
      expect(OPENAI_GPT4O_CAPABILITIES.maxContextTokens).toBe(128_000);
      expect(OPENAI_GPT4O_CAPABILITIES.maxOutputTokens).toBe(16_384);
      expect(OPENAI_GPT4O_CAPABILITIES.models.length).toBeGreaterThan(0);
      expect(OPENAI_GPT4O_CAPABILITIES.requiresNetwork).toBe(true);
    });

    it('ANTHROPIC_CLAUDE_SONNET_4_CAPABILITIES has correct values', () => {
      expect(ANTHROPIC_CLAUDE_SONNET_4_CAPABILITIES.supportsJsonMode).toBe(true);
      expect(ANTHROPIC_CLAUDE_SONNET_4_CAPABILITIES.supportsStreaming).toBe(true);
      expect(ANTHROPIC_CLAUDE_SONNET_4_CAPABILITIES.supportsFunctions).toBe(true);
      expect(ANTHROPIC_CLAUDE_SONNET_4_CAPABILITIES.maxContextTokens).toBe(200_000);
      expect(ANTHROPIC_CLAUDE_SONNET_4_CAPABILITIES.requiresNetwork).toBe(true);
    });

    it('OLLAMA_DEFAULT_CAPABILITIES has correct values', () => {
      expect(OLLAMA_DEFAULT_CAPABILITIES.supportsJsonMode).toBe(true);
      expect(OLLAMA_DEFAULT_CAPABILITIES.supportsStreaming).toBe(true);
      expect(OLLAMA_DEFAULT_CAPABILITIES.supportsFunctions).toBe(false);
      expect(OLLAMA_DEFAULT_CAPABILITIES.requiresNetwork).toBe(false);
      expect(OLLAMA_DEFAULT_CAPABILITIES.maxContextTokens).toBe(8_192);
    });

    it('OPENAI_COMPATIBLE_CAPABILITIES has correct values', () => {
      expect(OPENAI_COMPATIBLE_CAPABILITIES.supportsJsonMode).toBe(true);
      expect(OPENAI_COMPATIBLE_CAPABILITIES.requiresNetwork).toBe(false);
    });

    it('MOCK_CAPABILITIES has correct values', () => {
      expect(MOCK_CAPABILITIES.supportsJsonMode).toBe(true);
      expect(MOCK_CAPABILITIES.supportsStreaming).toBe(true);
      expect(MOCK_CAPABILITIES.supportsFunctions).toBe(true);
      expect(MOCK_CAPABILITIES.requiresNetwork).toBe(false);
    });
  });

  describe('custom capabilities', () => {
    it('can be constructed with arbitrary values', () => {
      const caps: ProviderCapabilities = {
        supportsJsonMode: false,
        supportsStreaming: false,
        supportsFunctions: false,
        maxContextTokens: 2048,
        maxOutputTokens: 512,
        models: ['custom-model'],
        requiresNetwork: false,
      };
      expect(caps.supportsJsonMode).toBe(false);
      expect(caps.models).toEqual(['custom-model']);
    });

    it('models is readonly array', () => {
      const caps: ProviderCapabilities = OPENAI_GPT4O_CAPABILITIES;
      expect(Array.isArray(caps.models)).toBe(true);
      expect(caps.models.length).toBeGreaterThan(0);
    });
  });
});
