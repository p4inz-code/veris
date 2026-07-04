/**
 * Providers barrel export.
 *
 * @module @veris/ai/providers
 */

// Types
export type {
  LLMProvider,
  ProviderRequest,
  ProviderResponse,
  GenerateOptions,
  GenerateResult,
  GenerateChunk,
  Message,
  TokenUsage,
  HealthResult,
} from './interface.js';

export type { ProviderCapabilities } from './capabilities.js';
export {
  OPENAI_GPT4O_CAPABILITIES,
  ANTHROPIC_CLAUDE_SONNET_4_CAPABILITIES,
  OLLAMA_DEFAULT_CAPABILITIES,
  OPENAI_COMPATIBLE_CAPABILITIES,
  MOCK_CAPABILITIES,
} from './capabilities.js';

export type { ProviderErrorCode } from './errors.js';
export {
  ProviderError,
  httpStatusToErrorCode,
  createProviderErrorFromResponse,
  createProviderErrorFromNetworkError,
  createTimeoutError,
} from './errors.js';

export type {
  ProviderRegistry,
  ProviderStatus,
  ProviderHealthReport,
  ProviderRegistryOptions,
} from './registry.js';
export { createProviderRegistry } from './registry.js';

export type { ProviderFactory, ProviderConfig } from './factory.js';
export { createProviderFactory, defaultProviderFactory } from './factory.js';

export type {
  RetryPolicy,
  CircuitBreakerState,
  CircuitState,
  CircuitBreaker,
  CircuitBreakerOptions,
} from './retry.js';
export {
  DEFAULT_RETRY_POLICY,
  createCircuitBreaker,
  withRetry,
  calculateRetryDelay,
  isRetryable,
} from './retry.js';

// Adapters
export {
  OpenAIAdapter,
  AnthropicAdapter,
  OllamaAdapter,
  CustomAdapter,
  MockAdapter,
} from './adapters/index.js';
export type {
  OpenAIAdapterConfig,
  AnthropicAdapterConfig,
  OllamaAdapterConfig,
  CustomAdapterConfig,
  MockAdapterConfig,
} from './adapters/index.js';
