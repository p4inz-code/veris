/**
 * Tests for RequestBuilder — message construction, temperature by mode, config propagation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RequestBuilder } from '../../../src/engine/request-builder.js';
import type { RenderedPrompt } from '../../../src/prompts/index.js';

describe('RequestBuilder', () => {
  let builder: RequestBuilder;
  let mockConfig: any;

  beforeEach(() => {
    builder = new RequestBuilder();
    mockConfig = {
      provider: { active: 'test', timeoutMs: 5000, maxRetries: 2 },
      defaultMode: 'simple',
      caching: false,
      tokenBudget: { maxContextTokens: 4000, maxOutputTokens: 1000 },
      output: { maxLength: 5000, includeDisclaimer: true },
      logging: { auditEnabled: false, metricsEnabled: false },
    };
  });

  it('builds messages with system prompt when available', () => {
    const rendered: RenderedPrompt = {
      systemPrompt: 'You are a security expert.',
      userPrompt: 'Explain this finding.',
      expectedCitations: [],
      tokenEstimate: 50,
      version: '1.0.0',
    };

    const options = builder.build({
      renderedPrompt: rendered,
      context: {} as any,
      mode: 'simple',
      config: mockConfig,
    });

    expect(options.messages).toHaveLength(2);
    expect(options.messages[0].role).toBe('system');
    expect(options.messages[0].content).toBe('You are a security expert.');
    expect(options.messages[1].role).toBe('user');
    expect(options.messages[1].content).toBe('Explain this finding.');
  });

  it('builds messages without system prompt', () => {
    const rendered: RenderedPrompt = {
      systemPrompt: '',
      userPrompt: 'Explain this finding.',
      expectedCitations: [],
      tokenEstimate: 30,
      version: '1.0.0',
    };

    const options = builder.build({
      renderedPrompt: rendered,
      context: {} as any,
      mode: 'simple',
      config: mockConfig,
    });

    expect(options.messages).toHaveLength(1);
    expect(options.messages[0].role).toBe('user');
  });

  it('uses low temperature for simple mode', () => {
    const rendered: RenderedPrompt = {
      systemPrompt: '',
      userPrompt: 'test',
      expectedCitations: [],
      tokenEstimate: 10,
      version: '1.0.0',
    };

    const options = builder.build({
      renderedPrompt: rendered,
      context: {} as any,
      mode: 'simple',
      config: mockConfig,
    });

    expect(options.temperature).toBe(0.2);
  });

  it('uses medium temperature for technical mode', () => {
    const rendered: RenderedPrompt = {
      systemPrompt: '',
      userPrompt: 'test',
      expectedCitations: [],
      tokenEstimate: 10,
      version: '1.0.0',
    };

    const options = builder.build({
      renderedPrompt: rendered,
      context: {} as any,
      mode: 'technical',
      config: mockConfig,
    });

    expect(options.temperature).toBe(0.4);
  });

  it('uses higher temperature for expert mode', () => {
    const rendered: RenderedPrompt = {
      systemPrompt: '',
      userPrompt: 'test',
      expectedCitations: [],
      tokenEstimate: 10,
      version: '1.0.0',
    };

    const options = builder.build({
      renderedPrompt: rendered,
      context: {} as any,
      mode: 'expert',
      config: mockConfig,
    });

    expect(options.temperature).toBe(0.6);
  });

  it('sets maxTokens from config', () => {
    const rendered: RenderedPrompt = {
      systemPrompt: '',
      userPrompt: 'test',
      expectedCitations: [],
      tokenEstimate: 10,
      version: '1.0.0',
    };

    const options = builder.build({
      renderedPrompt: rendered,
      context: {} as any,
      mode: 'simple',
      config: mockConfig,
    });

    expect(options.maxTokens).toBe(1000);
  });

  it('propagates abort signal', () => {
    const controller = new AbortController();
    const rendered: RenderedPrompt = {
      systemPrompt: '',
      userPrompt: 'test',
      expectedCitations: [],
      tokenEstimate: 10,
      version: '1.0.0',
    };

    const options = builder.build({
      renderedPrompt: rendered,
      context: {} as any,
      mode: 'simple',
      config: mockConfig,
      abortSignal: controller.signal,
    });

    expect(options.abortSignal).toBe(controller.signal);
  });
});
