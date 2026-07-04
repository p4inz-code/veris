/**
 * ProviderCapabilities — describes what an LLM provider supports.
 *
 * Each adapter returns a static snapshot of its capabilities.
 * Consumers use this to decide how to interact with the provider
 * (e.g., whether to use JSON mode, streaming, function calling).
 *
 * @module @veris/ai/providers/capabilities
 */

/**
 * Capabilities of an LLM provider.
 *
 * All properties are read-only. Capabilities are static for a given
 * provider+model combination — they do not change at runtime.
 */
export interface ProviderCapabilities {
  /** Whether the provider supports JSON response mode. */
  readonly supportsJsonMode: boolean;
  /** Whether the provider supports streaming responses. */
  readonly supportsStreaming: boolean;
  /** Whether the provider supports function/tool calling. */
  readonly supportsFunctions: boolean;
  /** Maximum context window size in tokens. */
  readonly maxContextTokens: number;
  /** Maximum output tokens per request. */
  readonly maxOutputTokens: number;
  /** Available model identifiers. */
  readonly models: readonly string[];
  /** Whether this provider requires network access. */
  readonly requiresNetwork: boolean;
}

// ── Known Capability Presets ──

/** Default capabilities for OpenAI GPT-4o. */
export const OPENAI_GPT4O_CAPABILITIES: ProviderCapabilities = {
  supportsJsonMode: true,
  supportsStreaming: true,
  supportsFunctions: true,
  maxContextTokens: 128_000,
  maxOutputTokens: 16_384,
  models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  requiresNetwork: true,
} as const;

/** Default capabilities for Anthropic Claude Sonnet 4. */
export const ANTHROPIC_CLAUDE_SONNET_4_CAPABILITIES: ProviderCapabilities = {
  supportsJsonMode: true,
  supportsStreaming: true,
  supportsFunctions: true,
  maxContextTokens: 200_000,
  maxOutputTokens: 8_192,
  models: ['claude-sonnet-4-20250514', 'claude-haiku-3-5', 'claude-opus-4'],
  requiresNetwork: true,
} as const;

/** Default capabilities for Ollama (local models). */
export const OLLAMA_DEFAULT_CAPABILITIES: ProviderCapabilities = {
  supportsJsonMode: true,
  supportsStreaming: true,
  supportsFunctions: false,
  maxContextTokens: 8_192,
  maxOutputTokens: 4_096,
  models: ['llama3.1:8b', 'llama3.1:70b', 'mistral', 'qwen2', 'codellama'],
  requiresNetwork: false,
} as const;

/** Default capabilities for OpenAI-compatible endpoints (LM Studio, LocalAI). */
export const OPENAI_COMPATIBLE_CAPABILITIES: ProviderCapabilities = {
  supportsJsonMode: true,
  supportsStreaming: true,
  supportsFunctions: false,
  maxContextTokens: 8_192,
  maxOutputTokens: 4_096,
  models: ['local-model'],
  requiresNetwork: false,
} as const;

/** Default capabilities for the mock provider. */
export const MOCK_CAPABILITIES: ProviderCapabilities = {
  supportsJsonMode: true,
  supportsStreaming: true,
  supportsFunctions: true,
  maxContextTokens: 128_000,
  maxOutputTokens: 16_384,
  models: ['mock-model'],
  requiresNetwork: false,
} as const;
