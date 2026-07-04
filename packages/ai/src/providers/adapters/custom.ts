/**
 * Custom/OAI-compatible adapter — implements LLMProvider for any OpenAI-compatible endpoint.
 *
 * This adapter works with any provider that implements the OpenAI chat completions
 * API format, including LM Studio, LocalAI, vLLM, and others.
 *
 * @module @veris/ai/providers/adapters/custom
 */

import type { ProviderCapabilities } from '../capabilities.js';
import { OPENAI_COMPATIBLE_CAPABILITIES } from '../capabilities.js';
import { ProviderError, createProviderErrorFromResponse } from '../errors.js';
import { executeFetchWithTimeout } from '../fetch-with-timeout.js';
import type {
  LLMProvider,
  GenerateOptions,
  GenerateResult,
  GenerateChunk,
  HealthResult,
} from '../interface.js';

// ── Custom Adapter Configuration ──

/** Configuration for the Custom (OpenAI-compatible) adapter. */
export interface CustomAdapterConfig {
  /** Model identifier. Default: "local-model". */
  readonly model?: string;
  /** API endpoint URL. Default: "http://localhost:1234/v1". */
  readonly endpoint?: string;
  /** Optional API key (if the endpoint requires one). */
  readonly apiKey?: string;
  /** Request timeout in milliseconds. Default: 120000. */
  readonly timeoutMs?: number;
}

// ── OpenAI-Compatible Request/Response Types ──

interface CustomRequest {
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'text' | 'json_object' };
  stream?: boolean;
}

interface CustomResponse {
  id: string;
  object: string;
  choices: {
    index: number;
    message: { role: string; content: string | null };
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
 * Custom (OpenAI-compatible) API adapter.
 *
 * Connects to any OpenAI-compatible chat completions endpoint.
 * Supports JSON mode, streaming, and optional authentication.
 * Use this for LM Studio, LocalAI, vLLM, and similar local inference servers.
 */
export class CustomAdapter implements LLMProvider {
  readonly id = 'custom';
  readonly name = 'OpenAI-Compatible';
  readonly version = '1.0.0';

  private readonly model: string;
  private readonly endpoint: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  constructor(config?: CustomAdapterConfig) {
    const { model, endpoint, apiKey, timeoutMs } = config ?? {};
    this.model = model ?? 'local-model';
    this.endpoint = (endpoint ?? 'http://localhost:1234/v1').replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs ?? 120_000;
  }

  async healthCheck(): Promise<HealthResult> {
    try {
      const headers: Record<string, string> = {};
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(`${this.endpoint}/models`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        return { healthy: true };
      }
      return {
        healthy: false,
        message: `Custom endpoint returned HTTP ${response.status}`,
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
            ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
          },
          body: JSON.stringify(requestBody),
        },
        this.timeoutMs,
        this.id,
      );

      if (!response.ok) {
        throw await createProviderErrorFromResponse(response, this.id);
      }

      const data = (await response.json()) as CustomResponse;
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
            ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
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
      ...OPENAI_COMPATIBLE_CAPABILITIES,
      models: [this.model, ...OPENAI_COMPATIBLE_CAPABILITIES.models],
    };
  }

  // ── Private Helpers ──

  private buildRequest(options: GenerateOptions, stream: boolean): CustomRequest {
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

  private parseResponse(data: CustomResponse): GenerateResult {
    const choice = data.choices?.[0];
    if (!choice) {
      throw new ProviderError({
        code: 'INVALID_RESPONSE',
        providerId: this.id,
        message: 'Custom endpoint response missing choices',
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
