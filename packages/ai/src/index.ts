/**
 * @veris/ai — VERIS AI provider adapters.
 *
 * AI is strictly a CONSUMER of analysis results.
 * AI NEVER participates in the analysis pipeline.
 *
 * ## Invariants (from SPEC-010 §3):
 * - A1: AI never participates in analysis
 * - A2: AI output is never part of the canonical report
 * - A3: AI is always optional
 * - A4: AI never modifies analysis results
 * - A5: All AI features are clearly labeled as AI-generated
 *
 * ## Package Architecture
 *
 * ```
 * @veris/ai/
 * ├── src/
 * │   ├── index.ts          # → Public API (this file)
 * │   └── providers/
 * │       ├── interface.ts  # → LLMProvider, GenerateOptions, GenerateResult
 * │       ├── capabilities.ts # → ProviderCapabilities
 * │       ├── errors.ts     # → ProviderError
 * │       ├── registry.ts   # → ProviderRegistry + factory
 * │       ├── factory.ts    # → ProviderFactory
 * │       ├── retry.ts      # → RetryPolicy, CircuitBreaker
 * │       └── adapters/
 * │           ├── openai.ts     # → OpenAI API adapter
 * │           ├── anthropic.ts  # → Anthropic API adapter
 * │           ├── ollama.ts     # → Ollama (local) adapter
 * │           ├── custom.ts     # → OpenAI-compatible adapter
 * │           └── mock.ts       # → Mock provider for testing
 * ```
 *
 * ## Usage
 *
 * ```typescript
 * import { createProviderRegistry, MockAdapter } from "@veris/ai";
 *
 * const registry = createProviderRegistry([
 *   new MockAdapter({ response: "Hello, world!" }),
 * ]);
 *
 * const result = await registry.getActive().generate({
 *   messages: [{ role: "user", content: "Hello" }],
 * });
 * ```
 *
 * @module @veris/ai
 */

// ── Provider Interfaces ──
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
} from './providers/interface.js';

// ── Provider Capabilities ──
export type { ProviderCapabilities } from './providers/capabilities.js';
export {
  OPENAI_GPT4O_CAPABILITIES,
  ANTHROPIC_CLAUDE_SONNET_4_CAPABILITIES,
  OLLAMA_DEFAULT_CAPABILITIES,
  OPENAI_COMPATIBLE_CAPABILITIES,
  MOCK_CAPABILITIES,
} from './providers/capabilities.js';

// ── Provider Errors ──
export type { ProviderErrorCode } from './providers/errors.js';
export {
  ProviderError,
  httpStatusToErrorCode,
  createProviderErrorFromResponse,
  createProviderErrorFromNetworkError,
  createTimeoutError,
} from './providers/errors.js';

// ── Provider Registry ──
export type {
  ProviderRegistry,
  ProviderStatus,
  ProviderHealthReport,
  ProviderRegistryOptions,
} from './providers/registry.js';
export { createProviderRegistry } from './providers/registry.js';

// ── Provider Factory ──
export type { ProviderFactory, ProviderConfig } from './providers/factory.js';
export { createProviderFactory, defaultProviderFactory } from './providers/factory.js';

// ── Retry & Circuit Breaker ──
export type {
  RetryPolicy,
  CircuitBreakerState,
  CircuitState,
  CircuitBreaker,
  CircuitBreakerOptions,
} from './providers/retry.js';
export {
  DEFAULT_RETRY_POLICY,
  createCircuitBreaker,
  withRetry,
  calculateRetryDelay,
  isRetryable,
} from './providers/retry.js';

// ── Provider Adapters ──
export {
  OpenAIAdapter,
  AnthropicAdapter,
  OllamaAdapter,
  CustomAdapter,
  MockAdapter,
} from './providers/adapters/index.js';
export type {
  OpenAIAdapterConfig,
  AnthropicAdapterConfig,
  OllamaAdapterConfig,
  CustomAdapterConfig,
  MockAdapterConfig,
} from './providers/adapters/index.js';
