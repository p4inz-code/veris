/**
 * Anthropic adapter — implements LLMProvider for the Anthropic Messages API.
 *
 * Maps the unified GenerateOptions to the Anthropic Messages API format.
 * Supports JSON mode, streaming, and the extended context window.
 *
 * @module @veris/ai/providers/adapters/anthropic
 */

import type { ProviderCapabilities } from '../capabilities.js';
import { ANTHROPIC_CLAUDE_SONNET_4_CAPABILITIES } from '../capabilities.js';
import { ProviderError, createProviderErrorFromResponse } from '../errors.js';
import { executeFetchWithTimeout } from '../fetch-with-timeout.js';
import type {
  LLMProvider,
  GenerateOptions,
  GenerateResult,
  GenerateChunk,
  HealthResult,
} from '../interface.js';

// ── Anthropic Adapter Configuration ──

/** Configuration for the Anthropic adapter. */
export interface AnthropicAdapterConfig {
  /** Anthropic API key. */
  readonly apiKey: string;
  /** Model identifier. Default: "claude-sonnet-4-20250514". */
  readonly model?: string;
  /** API endpoint URL. Default: "https://api.anthropic.com". */
  readonly endpoint?: string;
  /** Request timeout in milliseconds. Default: 60000. */
  readonly timeoutMs?: number;
}

// ── Anthropic API Types ──

/** Anthropic Messages API request body. */
interface AnthropicRequest {
  model: string;
  system?: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  max_tokens: number;
  temperature?: number;
  stream?: boolean;
}

/** Anthropic Messages API response (non-streaming). */
interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: { type: string; text: string }[];
  model: string;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// ── Adapter Implementation ──

/**
 * Anthropic API adapter.
 *
 * Connects to the Anthropic Messages API (claude models).
 * Supports streaming via server-sent events.
 */
export class AnthropicAdapter implements LLMProvider {
  readonly id = 'anthropic';
  readonly name = 'Anthropic';
  readonly version = '1.0.0';

  private readonly apiKey: string;
  private readonly model: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(config: AnthropicAdapterConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'claude-sonnet-4-20250514';
    this.endpoint = (config.endpoint ?? 'https://api.anthropic.com').replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs ?? 60_000;
  }

  async healthCheck(): Promise<HealthResult> {
    try {
      const response = await executeFetchWithTimeout(
        `${this.endpoint}/v1/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: 10,
            messages: [{ role: 'user', content: 'ping' }],
          }),
        },
        this.timeoutMs,
        this.id,
      );

      if (response.ok || response.status === 400) {
        // 400 with "too many tokens" or similar is fine for health check
        return { healthy: true };
      }
      return {
        healthy: false,
        message: `Anthropic API returned HTTP ${response.status}`,
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
        `${this.endpoint}/v1/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(requestBody),
        },
        this.timeoutMs,
        this.id,
      );

      if (!response.ok) {
        throw await createProviderErrorFromResponse(response, this.id);
      }

      const data = (await response.json()) as AnthropicResponse;
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
        `${this.endpoint}/v1/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
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
      ...ANTHROPIC_CLAUDE_SONNET_4_CAPABILITIES,
      models: [this.model, ...ANTHROPIC_CLAUDE_SONNET_4_CAPABILITIES.models],
    };
  }

  // ── Private Helpers ──

  private buildRequest(options: GenerateOptions, stream: boolean): AnthropicRequest {
    const systemMessages = options.messages.filter((m) => m.role === 'system');
    const nonSystemMessages = options.messages.filter((m) => m.role !== 'system');

    return {
      model: this.model,
      system: systemMessages.map((m) => m.content).join('\n') || undefined,
      messages: nonSystemMessages.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      max_tokens: options.maxTokens ?? 8_192,
      temperature: options.temperature,
      stream,
    };
  }

  private parseResponse(data: AnthropicResponse): GenerateResult {
    const text =
      data.content
        ?.filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('') ?? '';

    return {
      content: text,
      finishReason: data.stop_reason ?? 'unknown',
      usage: {
        promptTokens: data.usage?.input_tokens ?? 0,
        completionTokens: data.usage?.output_tokens ?? 0,
        totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      },
      provider: this.id,
      model: data.model ?? this.model,
    };
  }

  private parseStreamLine(line: string): GenerateChunk | null {
    if (!line.startsWith('data: ')) return null;

    const data = line.slice(6).trim();
    try {
      const parsed = JSON.parse(data);
      if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
        return { content: parsed.delta.text, done: false };
      }
      if (parsed.type === 'message_stop') {
        return { content: '', done: true };
      }
      return null;
    } catch {
      return null;
    }
  }
}
