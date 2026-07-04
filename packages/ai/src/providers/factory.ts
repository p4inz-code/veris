/**
 * ProviderFactory — creates provider adapter instances from configuration.
 *
 * The factory maps a provider type string to the appropriate adapter class
 * and instantiates it with the given configuration.
 *
 * @module @veris/ai/providers/factory
 */

import { AnthropicAdapter } from './adapters/anthropic.js';
import { CustomAdapter } from './adapters/custom.js';
import { MockAdapter } from './adapters/mock.js';
import { OllamaAdapter } from './adapters/ollama.js';
import { OpenAIAdapter } from './adapters/openai.js';
import type { LLMProvider } from './interface.js';

// ── Provider Configuration ──

/**
 * Configuration for creating a provider instance.
 */
export interface ProviderConfig {
  /** The provider type identifier. */
  readonly type: 'openai' | 'anthropic' | 'ollama' | 'openai-compatible' | 'mock';
  /** API key (for cloud providers). */
  readonly apiKey?: string;
  /** Model identifier. */
  readonly model?: string;
  /** API endpoint URL. */
  readonly endpoint?: string;
  /** Organization ID (for OpenAI). */
  readonly organization?: string;
  /** Keep-alive duration (for Ollama). */
  readonly keepAlive?: string;
  /** Request timeout in milliseconds. */
  readonly timeoutMs?: number;
  /** Maximum retries for transient failures. */
  readonly maxRetries?: number;
}

// ── ProviderFactory ──

/**
 * ProviderFactory interface.
 */
export interface ProviderFactory {
  /**
   * Create a provider instance from configuration.
   *
   * @param config - Provider configuration.
   * @returns A configured LLMProvider instance.
   * @throws {Error} If the provider type is unsupported or configuration is invalid.
   */
  createProvider(config: ProviderConfig): LLMProvider;

  /**
   * Get the list of supported provider types.
   */
  getSupportedTypes(): readonly string[];
}

// ── Implementation ──

/**
 * Default ProviderFactory implementation.
 */
class ProviderFactoryImpl implements ProviderFactory {
  private readonly typeMap: Record<string, (config: ProviderConfig) => LLMProvider> = {
    openai: (config) =>
      new OpenAIAdapter({
        apiKey: config.apiKey ?? '',
        model: config.model ?? 'gpt-4o',
        endpoint: config.endpoint ?? 'https://api.openai.com/v1',
        organization: config.organization,
        timeoutMs: config.timeoutMs,
      }),
    anthropic: (config) =>
      new AnthropicAdapter({
        apiKey: config.apiKey ?? '',
        model: config.model ?? 'claude-sonnet-4-20250514',
        endpoint: config.endpoint ?? 'https://api.anthropic.com',
        timeoutMs: config.timeoutMs,
      }),
    ollama: (config) =>
      new OllamaAdapter({
        model: config.model ?? 'llama3.1:8b',
        endpoint: config.endpoint ?? 'http://localhost:11434',
        keepAlive: config.keepAlive ?? '5m',
        timeoutMs: config.timeoutMs,
      }),
    'openai-compatible': (config) =>
      new CustomAdapter({
        model: config.model ?? 'local-model',
        endpoint: config.endpoint ?? 'http://localhost:1234/v1',
        apiKey: config.apiKey ?? '',
        timeoutMs: config.timeoutMs,
      }),
    mock: (config) =>
      new MockAdapter({
        model: config.model ?? 'mock-model',
        response: config.apiKey, // Reuse apiKey field as default response text
      }),
  };

  createProvider(config: ProviderConfig): LLMProvider {
    const factory = this.typeMap[config.type];
    if (!factory) {
      throw new Error(
        `Unsupported provider type: '${config.type}'. Supported types: ${this.getSupportedTypes().join(', ')}`,
      );
    }
    return factory(config);
  }

  getSupportedTypes(): readonly string[] {
    return Object.keys(this.typeMap);
  }
}

// ── Default Instance ──

/** Default ProviderFactory instance. */
export const defaultProviderFactory: ProviderFactory = new ProviderFactoryImpl();

/**
 * Create a ProviderFactory with the default adapter mappings.
 */
export function createProviderFactory(): ProviderFactory {
  return new ProviderFactoryImpl();
}
