/**
 * Provider manager — provider selection, health checks, and failover.
 *
 * Coordinates:
 * - Active provider selection from ProviderRegistry
 * - Health checks before routing
 * - Provider failover to fallback
 * - Graceful degradation
 *
 * @module @veris/explain/engine/provider-manager
 */

import type { LLMProvider, ProviderRegistry, GenerateOptions, GenerateResult } from '@veris/ai';

import type { ExplainConfig } from '../types/config.js';

import { ErrorCodes, createExplainError, mapProviderError } from './errors.js';
import type { ErrorCode } from './errors.js';
import { RetryManager } from './retry-manager.js';
import { withRetry } from './retry-manager.js';

// ── Types ──

/** A provider entry with its retry manager. */
interface ProviderEntry {
  readonly provider: LLMProvider;
  readonly retryManager: RetryManager;
}

// ── ProviderManager ──

/**
 * Manages provider selection, health checks, and failover.
 *
 * On request:
 * 1. Get active provider from registry
 * 2. Health check active provider
 * 3. If unhealthy, try fallback
 * 4. If all providers unhealthy, return ExplainError
 */
export class ProviderManager {
  private readonly registry: ProviderRegistry;
  private readonly config: ExplainConfig;
  private readonly providerEntries: Map<string, ProviderEntry> = new Map();

  constructor(registry: ProviderRegistry, config: ExplainConfig) {
    this.registry = registry;
    this.config = config;

    // Initialize retry managers for all providers
    this.initializeProviders();
  }

  /**
   * Initialize retry managers for all providers in the registry.
   */
  private initializeProviders(): void {
    const providers = this.registry.list();
    for (const status of providers) {
      try {
        this.registry.setActive(status.id);
        const provider = this.registry.getActive();
        this.providerEntries.set(provider.id, {
          provider,
          retryManager: new RetryManager(),
        });
      } catch {
        // Provider not available yet
      }
    }
    // Restore active provider
    if (providers.length > 0) {
      try {
        this.registry.setActive(this.config.provider.active);
      } catch {
        // Config references non-existent provider — use whatever is set
      }
    }
  }

  /**
   * Generate an explanation using the best available provider.
   * Implements provider failover logic:
   * 1. Try active provider
   * 2. If unavailable, try fallback
   * 3. If all fail, return ExplainError
   *
   * @param buildRequest - Function that builds a GenerateOptions.
   * @param subjectId - Subject being explained.
   * @param subjectType - Subject type.
   * @param abortSignal - Optional abort signal.
   * @returns GenerateResult or ExplainError.
   */
  async generate(
    buildRequest: () => GenerateOptions,
    subjectId: string,
    subjectType: string,
    abortSignal?: AbortSignal,
  ): Promise<GenerateResult | { kind: 'error'; error: ReturnType<typeof createExplainError> }> {
    // Try active provider
    const activeResult = await this.tryProvider(
      this.config.provider.active,
      buildRequest,
      abortSignal,
    );

    if (activeResult && !('kind' in activeResult)) {
      return activeResult;
    }

    // Try fallback if active fails
    if (this.config.provider.fallback) {
      const fallbackResult = await this.tryProvider(
        this.config.provider.fallback!,
        buildRequest,
        abortSignal,
      );

      if (fallbackResult && !('kind' in fallbackResult)) {
        return fallbackResult;
      }
    }

    // All providers failed
    return {
      kind: 'error',
      error: createExplainError(ErrorCodes.PROVIDER_UNAVAILABLE, subjectId, subjectType, {
        message: 'AI explanation is unavailable. No AI provider is currently accessible.',
      }),
    };
  }

  /**
   * Try to generate with a specific provider.
   *
   * @param providerId - The provider ID to try.
   * @param buildRequest - Function to build the request.
   * @param abortSignal - Optional abort signal.
   * @returns GenerateResult or undefined if failed.
   */
  private async tryProvider(
    providerId: string,
    buildRequest: () => GenerateOptions,
    abortSignal?: AbortSignal,
  ): Promise<GenerateResult | undefined> {
    try {
      // Select provider
      this.registry.setActive(providerId);
    } catch {
      return undefined;
    }

    const active = this.registry.getActive();
    let entry = this.providerEntries.get(providerId);

    if (!entry) {
      entry = { provider: active, retryManager: new RetryManager() };
      this.providerEntries.set(providerId, entry);
    }

    // Check circuit breaker
    if (!entry.retryManager.allowRequest()) {
      return undefined;
    }

    try {
      const options = buildRequest();

      const result = await withRetry(
        async (signal: AbortSignal) => {
          return active.generate({
            ...options,
            abortSignal: signal,
          });
        },
        entry.retryManager,
        abortSignal,
        this.config.provider.timeoutMs,
      );

      return result;
    } catch {
      // Provider failure recorded by withRetry.
      // The caller (generate) handles failover to the next provider.
      return undefined;
    }
  }

  /**
   * Check if any provider is healthy.
   */
  async isAnyProviderHealthy(): Promise<boolean> {
    const report = await this.registry.healthCheckAll();
    return Object.values(report.results).some((r) => r.healthy);
  }

  /**
   * Get the retry manager for a specific provider.
   */
  getRetryManager(providerId: string): RetryManager | undefined {
    return this.providerEntries.get(providerId)?.retryManager;
  }

  /**
   * Reset all retry managers.
   */
  resetAll(): void {
    for (const entry of this.providerEntries.values()) {
      entry.retryManager.reset();
    }
  }
}
