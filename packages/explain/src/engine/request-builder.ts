/**
 * Request builder — constructs GenerateOptions from scope, context, and templates.
 *
 * Transforms the ExplainedContext + rendered templates into the
 * provider-agnostic GenerateOptions message format used by @veris/ai providers.
 *
 * @module @veris/explain/engine/request-builder
 */

import type { GenerateOptions } from '@veris/ai';

import type { RenderedPrompt } from '../prompts/index.js';
import type { ExplainConfig } from '../types/config.js';
import type { ExplainedContext } from '../types/context.js';
import type { ExplanationMode } from '../types/explanation.js';

// ── Types ──

/** Input for building a provider request. */
export interface RequestBuilderInput {
  readonly renderedPrompt: RenderedPrompt;
  readonly context: ExplainedContext;
  readonly mode: ExplanationMode;
  readonly config: ExplainConfig;
  readonly abortSignal?: AbortSignal;
}

// ── RequestBuilder ──

/**
 * Builds GenerateOptions from scope, context, templates, and config.
 *
 * The builder:
 * 1. Combines system prompt + user prompt into a Message array
 * 2. Sets temperature based on mode (lower = more deterministic for "simple")
 * 3. Configures maxTokens, responseFormat, and abortSignal from config
 */
export class RequestBuilder {
  /**
   * Build a complete GenerateOptions from the provided input.
   *
   * @param input - The rendered prompt, context, mode, and config.
   * @returns GenerateOptions ready to send to a provider.
   */
  build(input: RequestBuilderInput): GenerateOptions {
    const { renderedPrompt, mode, config, abortSignal } = input;
    const messages = this.buildMessages(renderedPrompt);
    const temperature = this.getTemperature(mode);

    return {
      messages,
      temperature,
      maxTokens: config.tokenBudget.maxOutputTokens,
      responseFormat: 'text',
      abortSignal,
    };
  }

  /**
   * Build the messages array from system + user prompts.
   */
  private buildMessages(
    renderedPrompt: RenderedPrompt,
  ): readonly { role: 'system' | 'user'; content: string }[] {
    const messages: { role: 'system' | 'user'; content: string }[] = [];

    if (renderedPrompt.systemPrompt) {
      messages.push({
        role: 'system',
        content: renderedPrompt.systemPrompt,
      });
    }

    messages.push({
      role: 'user',
      content: renderedPrompt.userPrompt,
    });

    return messages;
  }

  /**
   * Get the sampling temperature for a given explanation mode.
   *
   * Lower temperatures produce more deterministic output:
   * - "simple": 0.2 (highly deterministic, safe defaults)
   * - "technical": 0.4 (balanced creativity and accuracy)
   * - "expert": 0.6 (more creative for complex traceability)
   */
  private getTemperature(mode: ExplanationMode): number {
    switch (mode) {
      case 'simple':
        return 0.2;
      case 'technical':
        return 0.4;
      case 'expert':
        return 0.6;
    }
  }
}
