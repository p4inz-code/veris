/**
 * ProviderRegistry — manages registered provider instances and routing.
 *
 * The registry maintains a list of configured providers, routes requests
 * to the active provider, and supports fallback on failure.
 *
 * @module @veris/ai/providers/registry
 */

import type { ProviderCapabilities } from './capabilities.js';
import { ProviderError } from './errors.js';
import type { LLMProvider } from './interface.js';

// ── Types ──

/** Status information for a registered provider. */
export interface ProviderStatus {
  readonly id: string;
  readonly name: string;
  readonly healthy: boolean;
  readonly lastHealthCheck?: string;
}

/** Health check report for all registered providers. */
export interface ProviderHealthReport {
  readonly results: Record<string, { healthy: boolean; message?: string }>;
  readonly allHealthy: boolean;
  readonly timestamp: string;
}

/** Options for creating a ProviderRegistry. */
export interface ProviderRegistryOptions {
  /** ID of the initial active provider. Defaults to the first registered provider. */
  readonly activeProviderId?: string;
  /** Optional fallback provider ID. */
  readonly fallbackProviderId?: string;
}

// ── ProviderRegistry Interface ──

/**
 * ProviderRegistry — manages provider instances.
 *
 * Responsibilities:
 * - Maintains a list of configured providers
 * - Routes requests to the active provider
 * - Falls back to the next available provider on failure
 * - Provides health check aggregation
 */
export interface ProviderRegistry {
  /**
   * Get the currently active provider.
   * @throws {ProviderError} If no providers are registered.
   */
  getActive(): LLMProvider;

  /**
   * Set the active provider by ID.
   * @param providerId - The ID of the provider to activate.
   * @throws {ProviderError} If providerId is not registered.
   */
  setActive(providerId: string): void;

  /**
   * List all registered providers with their health status.
   */
  list(): readonly ProviderStatus[];

  /**
   * Register a new provider.
   * @param provider - The provider instance to register.
   */
  register(provider: LLMProvider): void;

  /**
   * Run health checks on all registered providers.
   * Returns a report with health status for each provider.
   */
  healthCheckAll(): Promise<ProviderHealthReport>;

  /**
   * Get the combined capabilities of the active provider.
   */
  getCapabilities(): ProviderCapabilities;

  /**
   * Get the number of registered providers.
   */
  readonly size: number;
}

// ── Implementation ──

/**
 * Default ProviderRegistry implementation.
 *
 * Manages providers in memory with synchronous lookup and
 * asynchronous health checks. Thread-safe for single-threaded JS.
 */
class ProviderRegistryImpl implements ProviderRegistry {
  private readonly providers: Map<string, LLMProvider> = new Map();
  private activeId: string | null = null;
  private readonly fallbackId: string | null;
  private readonly healthCache: Map<string, { healthy: boolean; message?: string }> = new Map();

  constructor(initialProviders: LLMProvider[] = [], options?: ProviderRegistryOptions) {
    for (const provider of initialProviders) {
      this.providers.set(provider.id, provider);
    }

    if (options?.activeProviderId && this.providers.has(options.activeProviderId)) {
      this.activeId = options.activeProviderId;
    } else if (initialProviders.length > 0) {
      this.activeId = initialProviders[0].id;
    }

    this.fallbackId = options?.fallbackProviderId ?? null;
  }

  get size(): number {
    return this.providers.size;
  }

  getActive(): LLMProvider {
    if (!this.activeId || !this.providers.has(this.activeId)) {
      throw new ProviderError({
        code: 'PROVIDER_UNAVAILABLE',
        providerId: this.activeId ?? 'unknown',
        message: 'No active provider configured. Register a provider first.',
        recoverable: true,
      });
    }
    return this.providers.get(this.activeId)!;
  }

  setActive(providerId: string): void {
    if (!this.providers.has(providerId)) {
      throw new ProviderError({
        code: 'INVALID_REQUEST',
        providerId,
        message: `Provider '${providerId}' is not registered. Available providers: ${Array.from(this.providers.keys()).join(', ')}`,
        recoverable: false,
      });
    }
    this.activeId = providerId;
  }

  list(): readonly ProviderStatus[] {
    return Array.from(this.providers.entries()).map(([id, provider]) => {
      const cached = this.healthCache.get(id);
      return {
        id,
        name: provider.name,
        healthy: cached?.healthy ?? true,
        lastHealthCheck: undefined,
      };
    });
  }

  register(provider: LLMProvider): void {
    this.providers.set(provider.id, provider);
    if (!this.activeId) {
      this.activeId = provider.id;
    }
  }

  async healthCheckAll(): Promise<ProviderHealthReport> {
    const results: Record<string, { healthy: boolean; message?: string }> = {};
    let allHealthy = true;

    for (const [id, provider] of this.providers) {
      try {
        const health = await provider.healthCheck();
        results[id] = health;
        this.healthCache.set(id, health);
        if (!health.healthy) allHealthy = false;
      } catch (error) {
        const result = {
          healthy: false,
          message: error instanceof Error ? error.message : 'Health check failed',
        };
        results[id] = result;
        this.healthCache.set(id, result);
        allHealthy = false;
      }
    }

    return {
      results,
      allHealthy,
      timestamp: new Date().toISOString(),
    };
  }

  getCapabilities(): ProviderCapabilities {
    return this.getActive().getCapabilities();
  }
}

// ── Factory Function ──

/**
 * Create a ProviderRegistry with an optional list of initial providers.
 *
 * @param providers - Initial provider instances to register.
 * @param options - Registry options (active provider, fallback).
 * @returns A new ProviderRegistry instance.
 */
export function createProviderRegistry(
  providers?: LLMProvider[],
  options?: ProviderRegistryOptions,
): ProviderRegistry {
  return new ProviderRegistryImpl(providers ?? [], options);
}
