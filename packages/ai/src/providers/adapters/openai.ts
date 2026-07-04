/**
 * OpenAI adapter — implements LLMProvider for the OpenAI API.
 *
 * Maps the unified GenerateOptions to the OpenAI chat completions API format.
 * Supports JSON mode, streaming, and function calling.
 *
 * @module @veris/ai/providers/adapters/openai
 */

import type { ProviderCapabilities } from '../capabilities.js';
import { OPENAI_GPT4O_CAPABILITIES } from '../capabilities.js';
import { ProviderError, createProviderErrorFromResponse } from '../errors.js';
import { executeFetchWithTimeout } from '../fetch-with-timeout.js';
import type {
  LLMProvider,
  GenerateOptions,
  GenerateResult,
  GenerateChunk,
  HealthResult,
} from '../interface.js';

// ── OpenAI Adapter Configuration ──

/** Configuration for the OpenAI adapter. */
export interface OpenAIAdapterConfig {
  /** OpenAI API key. */
  readonly apiKey: string;
  /** Model identifier (e.g., "gpt-4o", "gpt-4o-mini"). Default: "gpt-4o". */
  readonly model?: string;
  /** API endpoint URL. Default: "https://api.openai.com/v1". */
  readonly endpoint?: string;
  /** Optional organization ID. */
  readonly organization?: string;
  /** Request timeout in milliseconds. Default: 60000. */
  readonly timeoutMs?: number;
}

// ── OpenAI Message Format ──

/** OpenAI-specific message format. */
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** OpenAI chat completion request body. */
interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'text' | 'json_object' };
  stream?: boolean;
}

/** OpenAI chat completion response (non-streaming). */
interface OpenAIResponse {
  id: string;
  object: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string | null;
    };
    finish_reason: string | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

// ── Adapter Implementation ──

/**
 * OpenAI API adapter.
 *
 * Connects to the OpenAI chat completions API (or any OpenAI-compatible endpoint).
 * Supports JSON mode via response_format, streaming via server-sent events.
 */
export class OpenAIAdapter implements LLMProvider {
  readonly id = 'openai';
  readonly name = 'OpenAI';
  readonly version = '1.0.0';

  private readonly apiKey: string;
  private readonly model: string;
  private readonly endpoint: string;
  private readonly organization?: string;
  private readonly timeoutMs: number;

  constructor(config: OpenAIAdapterConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'gpt-4o';
    this.endpoint = (config.endpoint ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.organization = config.organization;
    this.timeoutMs = config.timeoutMs ?? 60_000;
  }

  async healthCheck(): Promise<HealthResult> {
    try {
      const response = await executeFetchWithTimeout(
        `${this.endpoint}/models`,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            ...(this.organization ? { 'OpenAI-Organization': this.organization } : {}),
          },
        },
        this.timeoutMs,
        this.id,
      );

      if (response.ok) {
        return { healthy: true };
      }
      return {
        healthy: false,
        message: `OpenAI API returned HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Health check failed',
      };
    }
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const requestBody = this.buildRequest(options, false);

    try {
      const response = await executeFetchWithTimeout(
        `${this.endpoint}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
            ...(this.organization ? { 'OpenAI-Organization': this.organization } : {}),
          },
          body: JSON.stringify(requestBody),
        },
        this.timeoutMs,
        this.id,
      );

      if (!response.ok) {
        throw await createProviderErrorFromResponse(response, this.id);
      }

      const data = (await response.json()) as OpenAIResponse;
      return this.parseResponse(data);
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError({
        code: 'PROVIDER_UNAVAILABLE',
        providerId: this.id,
        message: error instanceof Error ? error.message : 'Unknown network error',
        recoverable: true,
        cause: error,
      });
    }
  }

  async *generateStream(options: GenerateOptions): AsyncIterable<GenerateChunk> {
    const requestBody = this.buildRequest(options, true);

    try {
      const response = await executeFetchWithTimeout(
        `${this.endpoint}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
            ...(this.organization ? { 'OpenAI-Organization': this.organization } : {}),
            Accept: 'text/event-stream',
          },
          body: JSON.stringify(requestBody),
        },
        this.timeoutMs,
        this.id,
      );

      if (!response.ok) {
        throw await createProviderErrorFromResponse(response, this.id);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new ProviderError({
          code: 'INVALID_RESPONSE',
          providerId: this.id,
          message: 'No response body available for streaming',
          recoverable: false,
        });
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            yield { content: '', done: true };
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const chunk = this.parseStreamLine(line);
            if (chunk) yield chunk;
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError({
        code: 'PROVIDER_UNAVAILABLE',
        providerId: this.id,
        message: error instanceof Error ? error.message : 'Unknown network error',
        recoverable: true,
        cause: error,
      });
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      ...OPENAI_GPT4O_CAPABILITIES,
      models: [this.model, ...OPENAI_GPT4O_CAPABILITIES.models],
    };
  }

  // ── Private Helpers ──

  private buildRequest(options: GenerateOptions, stream: boolean): OpenAIRequest {
    return {
      model: this.model,
      messages: options.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      response_format: options.responseFormat === 'json' ? { type: 'json_object' } : undefined,
      stream,
    };
  }

  private parseResponse(data: OpenAIResponse): GenerateResult {
    const choice = data.choices?.[0];
    if (!choice) {
      throw new ProviderError({
        code: 'INVALID_RESPONSE',
        providerId: this.id,
        message: 'OpenAI response missing choices',
        recoverable: true,
      });
    }

    return {
      content: choice.message?.content ?? '',
      finishReason: choice.finish_reason ?? 'unknown',
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      provider: this.id,
      model: data.model ?? this.model,
    };
  }

  private parseStreamLine(line: string): GenerateChunk | null {
    if (!line.startsWith('data: ')) return null;

    const data = line.slice(6).trim();
    if (data === '[DONE]') {
      return { content: '', done: true };
    }

    try {
      const parsed = JSON.parse(data);
      const delta = parsed.choices?.[0]?.delta;
      if (!delta) return null;

      return {
        content: delta.content ?? '',
        done: false,
      };
    } catch {
      return null;
    }
  }
}
