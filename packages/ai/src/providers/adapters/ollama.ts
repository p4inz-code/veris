/**
 * Ollama adapter — implements LLMProvider for the Ollama API.
 *
 * Maps the unified GenerateOptions to the Ollama chat API format.
 * Supports JSON mode (via format field) and streaming.
 * Ollama runs locally and does not require API keys.
 *
 * @module @veris/ai/providers/adapters/ollama
 */

import type { ProviderCapabilities } from '../capabilities.js';
import { OLLAMA_DEFAULT_CAPABILITIES } from '../capabilities.js';
import { ProviderError, createProviderErrorFromResponse } from '../errors.js';
import { executeFetchWithTimeout } from '../fetch-with-timeout.js';
import type {
  LLMProvider,
  GenerateOptions,
  GenerateResult,
  GenerateChunk,
  HealthResult,
} from '../interface.js';

// ── Ollama Adapter Configuration ──

/** Configuration for the Ollama adapter. */
export interface OllamaAdapterConfig {
  /** Model identifier. Default: "llama3.1:8b". */
  readonly model?: string;
  /** Ollama API endpoint URL. Default: "http://localhost:11434". */
  readonly endpoint?: string;
  /** Keep-alive duration for the model. Default: "5m". */
  readonly keepAlive?: string;
  /** Request timeout in milliseconds. Default: 120000 (Ollama loads models). */
  readonly timeoutMs?: number;
}

// ── Ollama API Types ──

/** Ollama chat request body. */
interface OllamaRequest {
  model: string;
  messages: { role: string; content: string }[];
  stream?: boolean;
  format?: 'json';
  options?: {
    temperature?: number;
    num_predict?: number;
  };
  keep_alive?: string;
}

/** Ollama chat response (non-streaming). */
interface OllamaResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done_reason: string;
  done: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

// ── Adapter Implementation ──

/**
 * Ollama API adapter.
 *
 * Connects to the Ollama chat API on localhost.
 * Supports JSON mode via the `format: "json"` field.
 * Does not require authentication.
 */
export class OllamaAdapter implements LLMProvider {
  readonly id = 'ollama';
  readonly name = 'Ollama';
  readonly version = '1.0.0';

  private readonly model: string;
  private readonly endpoint: string;
  private readonly keepAlive: string;
  private readonly timeoutMs: number;

  constructor(config?: OllamaAdapterConfig) {
    const { model, endpoint, keepAlive, timeoutMs } = config ?? {};
    this.model = model ?? 'llama3.1:8b';
    this.endpoint = (endpoint ?? 'http://localhost:11434').replace(/\/+$/, '');
    this.keepAlive = keepAlive ?? '5m';
    this.timeoutMs = timeoutMs ?? 120_000;
  }

  async healthCheck(): Promise<HealthResult> {
    try {
      const response = await fetch(`${this.endpoint}/api/tags`, {
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        return { healthy: true };
      }
      return {
        healthy: false,
        message: `Ollama API returned HTTP ${response.status}`,
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
        `${this.endpoint}/api/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        },
        this.timeoutMs,
        this.id,
      );

      if (!response.ok) {
        throw await createProviderErrorFromResponse(response, this.id);
      }

      const data = (await response.json()) as OllamaResponse;
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
        `${this.endpoint}/api/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
            if (!line.trim()) continue;
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
      ...OLLAMA_DEFAULT_CAPABILITIES,
      models: [this.model, ...OLLAMA_DEFAULT_CAPABILITIES.models],
    };
  }

  // ── Private Helpers ──

  private buildRequest(options: GenerateOptions, stream: boolean): OllamaRequest {
    return {
      model: this.model,
      messages: options.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      stream,
      format: options.responseFormat === 'json' ? 'json' : undefined,
      options: {
        temperature: options.temperature,
        num_predict: options.maxTokens,
      },
      keep_alive: this.keepAlive,
    };
  }

  private parseResponse(data: OllamaResponse): GenerateResult {
    return {
      content: data.message?.content ?? '',
      finishReason: data.done_reason ?? 'stop',
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
      provider: this.id,
      model: data.model ?? this.model,
    };
  }

  private parseStreamLine(line: string): GenerateChunk | null {
    try {
      const parsed = JSON.parse(line);
      if (parsed.done) {
        return { content: '', done: true };
      }
      return {
        content: parsed.message?.content ?? '',
        done: false,
      };
    } catch {
      return null;
    }
  }
}
