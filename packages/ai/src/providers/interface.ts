/**
 * LLM provider interface — the core abstraction for AI model providers.
 *
 * Every provider adapter implements this interface. The Exporter (in @veris/explain)
 * and other consumers depend only on this interface, never on concrete adapter classes.
 *
 * @module @veris/ai/providers/interface
 */

import type { ProviderCapabilities } from './capabilities.js';

// ── Message Types ──

/** A single message in a conversation with the LLM. */
export interface Message {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

// ── Request / Options ──

/**
 * Options for generating a response from an LLM provider.
 *
 * This is the unified request format that all adapters convert to
 * their provider's native request format.
 */
export interface GenerateOptions {
  /** The conversation messages (system prompt, user prompt, history). */
  readonly messages: readonly Message[];
  /** Sampling temperature [0.0, 2.0]. Lower = more deterministic. */
  readonly temperature?: number;
  /** Maximum tokens to generate in the response. */
  readonly maxTokens?: number;
  /** Response format preference. "json" enables JSON mode if supported. */
  readonly responseFormat?: 'text' | 'json';
  /** Optional abort signal for cancellation. */
  readonly abortSignal?: AbortSignal;
}

// ── Response / Result ──

/** Token usage statistics for a generation request. */
export interface TokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

/**
 * The result of a successful generation request.
 */
export interface GenerateResult {
  /** The generated text content. */
  readonly content: string;
  /** The reason generation finished (e.g., "stop", "length", "content_filter"). */
  readonly finishReason: string;
  /** Token usage statistics. */
  readonly usage: TokenUsage;
  /** The provider ID that generated the response. */
  readonly provider: string;
  /** The model name used for generation. */
  readonly model: string;
}

// ── Streaming ──

/**
 * A single chunk in a streaming generation response.
 */
export interface GenerateChunk {
  /** The text content for this chunk (may be empty). */
  readonly content: string;
  /** Whether this is the final chunk. */
  readonly done: boolean;
}

// ── Health Check ──

/** Result of a provider health check. */
export interface HealthResult {
  readonly healthy: boolean;
  readonly message?: string;
}

// ── Provider Interface ──

/**
 * LLMProvider — the core abstraction for AI model providers.
 *
 * Every adapter (OpenAI, Ollama, Anthropic, etc.) implements this interface.
 * Consumers (@veris/explain, @veris/cli, etc.) depend only on this interface.
 *
 * ## Invariants:
 * - Providers are stateless (all state lives in ProviderRegistry)
 * - All methods return Promises (network I/O)
 * - Errors are thrown as ProviderError (see errors.ts)
 * - Streaming does not buffer the entire response before yielding
 */
export interface LLMProvider {
  /** Unique provider identifier (e.g., "openai", "ollama"). */
  readonly id: string;
  /** Human-readable provider name (e.g., "OpenAI", "Ollama"). */
  readonly name: string;
  /** Provider version string. */
  readonly version: string;

  /**
   * Check whether the provider is healthy and reachable.
   * This should be a lightweight check (e.g., listing models or pinging the API).
   */
  healthCheck(): Promise<HealthResult>;

  /**
   * Generate a complete response from the LLM.
   *
   * @param options - The generation options (messages, temperature, etc.).
   * @returns The generated response with content and metadata.
   * @throws {ProviderError} On network errors, authentication failures, etc.
   */
  generate(options: GenerateOptions): Promise<GenerateResult>;

  /**
   * Generate a streaming response from the LLM.
   *
   * Yields chunks as they arrive from the provider. The final chunk
   * has `done: true` and may contain empty content.
   *
   * @param options - The generation options.
   * @returns An async iterable of response chunks.
   * @throws {ProviderError} On stream initialization failure.
   */
  generateStream(options: GenerateOptions): AsyncIterable<GenerateChunk>;

  /**
   * Get the capabilities of this provider.
   * Returns a static snapshot of what this provider supports.
   */
  getCapabilities(): ProviderCapabilities;
}

// ── ProviderRequest / ProviderResponse (aliases for consumer clarity) ──

/**
 * A provider request — alias for GenerateOptions.
 * Used in contexts where the request/response semantic is clearer.
 */
export type ProviderRequest = GenerateOptions;

/**
 * A provider response — alias for GenerateResult.
 * Used in contexts where the request/response semantic is clearer.
 */
export type ProviderResponse = GenerateResult;
