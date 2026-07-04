/**
 * Mock provider — configurable LLMProvider for testing.
 *
 * Returns configurable responses, simulates errors, and provides
 * deterministic behavior for unit tests. Never makes network calls.
 *
 * @module @veris/ai/providers/adapters/mock
 */

import type { ProviderCapabilities } from '../capabilities.js';
import { MOCK_CAPABILITIES } from '../capabilities.js';
import { ProviderError } from '../errors.js';
import type {
  LLMProvider,
  GenerateOptions,
  GenerateResult,
  GenerateChunk,
  HealthResult,
} from '../interface.js';

// ── Mock Provider Configuration ──

/** Configuration for the mock provider. */
export interface MockAdapterConfig {
  /** Default response text when no response map matches. */
  readonly response?: string;
  /** Model identifier. Default: "mock-model". */
  readonly model?: string;
  /** Whether to simulate health check failure. */
  readonly simulateUnhealthy?: boolean;
  /** Whether to simulate errors on generate. */
  readonly simulateError?: boolean;
  /** Error code to simulate. */
  readonly simulateErrorCode?: string;
  /** Delay in ms before responding (to simulate latency). */
  readonly simulateLatencyMs?: number;
  /** Map of prompt hash to response for deterministic behavior. */
  readonly responseMap?: Record<string, string>;
  /** Token usage to report. */
  readonly tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

// ── Adapter Implementation ──

/**
 * Mock provider for testing.
 *
 * Returns configurable responses without making network calls.
 * Supports deterministic response mapping based on prompt content.
 * Can simulate errors, latency, and health check failures.
 */
export class MockAdapter implements LLMProvider {
  readonly id = 'mock';
  readonly name = 'Mock Provider';
  readonly version = '1.0.0';

  private readonly config: Required<MockAdapterConfig>;
  private callCount = 0;

  constructor(config?: MockAdapterConfig) {
    this.config = {
      response: config?.response ?? 'Mock response',
      model: config?.model ?? 'mock-model',
      simulateUnhealthy: config?.simulateUnhealthy ?? false,
      simulateError: config?.simulateError ?? false,
      simulateErrorCode: config?.simulateErrorCode ?? 'PROVIDER_UNAVAILABLE',
      simulateLatencyMs: config?.simulateLatencyMs ?? 0,
      responseMap: config?.responseMap ?? {},
      tokenUsage: config?.tokenUsage ?? {
        promptTokens: 50,
        completionTokens: 100,
        totalTokens: 150,
      },
    };
  }

  /** Number of times generate() was called. */
  get invocationCount(): number {
    return this.callCount;
  }

  /** Reset the call counter. */
  resetCount(): void {
    this.callCount = 0;
  }

  async healthCheck(): Promise<HealthResult> {
    if (this.config.simulateLatencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.simulateLatencyMs));
    }

    if (this.config.simulateUnhealthy) {
      return { healthy: false, message: 'Mock provider is unhealthy' };
    }

    return { healthy: true };
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    this.callCount++;

    if (this.config.simulateLatencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.simulateLatencyMs));
    }

    if (this.config.simulateError) {
      throw new ProviderError({
        code: this.config.simulateErrorCode as never,
        providerId: this.id,
        message: `Mock provider simulated error: ${this.config.simulateErrorCode}`,
        recoverable: true,
      });
    }

    // Check response map for deterministic behavior
    const promptText = options.messages.map((m) => m.content).join('\n');
    const promptHash = this.simpleHash(promptText);
    const content = this.config.responseMap[promptHash] ?? this.config.response;

    return {
      content,
      finishReason: 'stop',
      usage: { ...this.config.tokenUsage },
      provider: this.id,
      model: this.config.model,
    };
  }

  async *generateStream(options: GenerateOptions): AsyncIterable<GenerateChunk> {
    this.callCount++;

    if (this.config.simulateError) {
      throw new ProviderError({
        code: this.config.simulateErrorCode as never,
        providerId: this.id,
        message: `Mock provider simulated error: ${this.config.simulateErrorCode}`,
        recoverable: true,
      });
    }

    if (this.config.simulateLatencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.simulateLatencyMs));
    }

    // Yield content in chunks
    const content = this.config.response;
    const chunkSize = Math.max(1, Math.floor(content.length / 3));

    for (let i = 0; i < content.length; i += chunkSize) {
      yield {
        content: content.slice(i, i + chunkSize),
        done: false,
      };
    }

    yield { content: '', done: true };
  }

  getCapabilities(): ProviderCapabilities {
    return MOCK_CAPABILITIES;
  }

  /**
   * Configure the mock provider for a specific test scenario.
   * Returns a new MockAdapter with the given overrides.
   */
  withConfig(overrides: Partial<MockAdapterConfig>): MockAdapter {
    return new MockAdapter({ ...this.config, ...overrides });
  }

  // ── Private Helpers ──

  /**
   * Simple string hash for deterministic response mapping.
   * Not cryptographically secure — for testing only.
   */
  private simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }
}
