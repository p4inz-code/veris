/**
 * Retry manager — retry budget, circuit breaker, exponential backoff.
 *
 * Implements:
 * - Retry budget (max retries per request)
 * - Circuit breaker (per-provider state tracking)
 * - Exponential backoff with jitter
 * - Timeout handling via AbortController
 *
 * @module @veris/explain/engine/retry-manager
 */

// ── Circuit Breaker States ──

/** Circuit breaker state. */
export type CircuitState = 'closed' | 'open' | 'half-open';

/** Circuit breaker configuration. */
export interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit. */
  readonly failureThreshold: number;
  /** Duration in ms to wait before transitioning from open to half-open. */
  readonly resetTimeoutMs: number;
  /** Number of successes in half-open state to close the circuit. */
  readonly halfOpenSuccessThreshold: number;
}

// ── Retry Configuration ──

/** Retry configuration for provider calls. */
export interface RetryConfig {
  /** Maximum number of retries. */
  readonly maxRetries: number;
  /** Base delay in ms for exponential backoff. */
  readonly baseDelayMs: number;
  /** Maximum delay in ms for exponential backoff. */
  readonly maxDelayMs: number;
  /** Circuit breaker configuration. */
  readonly circuitBreaker: CircuitBreakerConfig;
}

// ── Default Configuration ──

/** Default retry configuration. */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeoutMs: 30000,
    halfOpenSuccessThreshold: 2,
  },
};

// ── Retry Manager ──

/**
 * Manages retry budget and circuit breaker state for a single provider.
 */
export class RetryManager {
  private readonly config: RetryConfig;
  private circuitState: CircuitState = 'closed';
  private failureCount = 0;
  private halfOpenSuccessCount = 0;
  private lastFailureTime = 0;
  private retryCount = 0;

  constructor(config?: Partial<RetryConfig>) {
    this.config = {
      ...DEFAULT_RETRY_CONFIG,
      ...config,
      circuitBreaker: {
        ...DEFAULT_RETRY_CONFIG.circuitBreaker,
        ...config?.circuitBreaker,
      },
    };
  }

  // ── Circuit Breaker ──

  /** Get the current circuit breaker state. */
  get state(): CircuitState {
    return this.circuitState;
  }

  /** Get the current failure count. */
  get failures(): number {
    return this.failureCount;
  }

  /** Get the current retry count for the current request. */
  get retries(): number {
    return this.retryCount;
  }

  /**
   * Check if a request should be allowed through the circuit breaker.
   */
  allowRequest(): boolean {
    this.checkTimeout();

    if (this.circuitState === 'closed') return true;
    if (this.circuitState === 'half-open') return true;

    return false;
  }

  /**
   * Record a successful request.
   */
  recordSuccess(): void {
    this.retryCount = 0;

    if (this.circuitState === 'half-open') {
      this.halfOpenSuccessCount++;
      if (this.halfOpenSuccessCount >= this.config.circuitBreaker.halfOpenSuccessThreshold) {
        this.circuitState = 'closed';
        this.failureCount = 0;
        this.halfOpenSuccessCount = 0;
      }
    } else if (this.circuitState === 'closed') {
      // Reset failure count on success in closed state
      this.failureCount = 0;
    }
  }

  /**
   * Record a failed request.
   */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.retryCount++;

    if (this.circuitState === 'half-open') {
      this.circuitState = 'open';
      this.halfOpenSuccessCount = 0;
    } else if (
      this.circuitState === 'closed' &&
      this.failureCount >= this.config.circuitBreaker.failureThreshold
    ) {
      this.circuitState = 'open';
    }
  }

  /**
   * Check if the circuit should transition from open to half-open.
   */
  private checkTimeout(): void {
    if (
      this.circuitState === 'open' &&
      Date.now() - this.lastFailureTime >= this.config.circuitBreaker.resetTimeoutMs
    ) {
      this.circuitState = 'half-open';
      this.halfOpenSuccessCount = 0;
    }
  }

  // ── Retry Budget ──

  /**
   * Check if we can retry (retry budget remaining).
   */
  canRetry(): boolean {
    // retryCount is incremented by recordFailure() on EVERY failure,
    // including the initial attempt. Using <= ensures that with
    // maxRetries=2 we get: initial + 1st retry + 2nd retry = 3 total
    // calls before giving up. With < it would only give 1 retry (2 calls).
    return this.retryCount <= this.config.maxRetries;
  }

  /**
   * Get the delay in ms before the next retry (exponential backoff with deterministic jitter).
   *
   * Uses a deterministic jitter based on a hash of the retry attempt to ensure
   * reproducible behavior across runs.
   */
  getNextRetryDelay(): number {
    const baseDelay = this.config.baseDelayMs * Math.pow(2, this.retryCount - 1);
    const cappedDelay = Math.min(baseDelay, this.config.maxDelayMs);
    // Add deterministic jitter: ±25% based on attempt number hash
    const jitterAmount = cappedDelay * 0.25;
    const hash = ((this.retryCount * 2654435761) ^ (this.config.baseDelayMs * 16777619)) >>> 0;
    const normalized = (hash % 1000) / 1000; // 0.0 to 1.0 deterministic
    const jitter = jitterAmount * (normalized - 0.5);
    return Math.max(0, Math.round(cappedDelay + jitter));
  }

  /**
   * Reset all state (for testing or when provider changes).
   */
  reset(): void {
    this.circuitState = 'closed';
    this.failureCount = 0;
    this.halfOpenSuccessCount = 0;
    this.lastFailureTime = 0;
    this.retryCount = 0;
  }

  /** Get the retry config. */
  getConfig(): RetryConfig {
    return this.config;
  }
}

// ── Helpers ──

/**
 * Execute a function with retry logic.
 *
 * @param fn - The async function to execute.
 * @param manager - The RetryManager instance.
 * @param abortSignal - Optional abort signal.
 * @param timeoutMs - Optional timeout in milliseconds per attempt.
 * @returns The result of the function.
 * @throws The last error if all retries are exhausted.
 */
export async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  manager: RetryManager,
  abortSignal?: AbortSignal,
  timeoutMs?: number,
): Promise<T> {
  let lastError: Error | undefined;

  while (true) {
    if (!manager.allowRequest()) {
      throw new Error('Circuit breaker is open — request blocked');
    }

    if (abortSignal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    try {
      const controller = new AbortController();

      // Link parent abort signal
      const onAbort = (): void => {
        controller.abort();
      };
      abortSignal?.addEventListener('abort', onAbort, { once: true });

      // Apply timeout per attempt
      const timeoutController = timeoutMs ? AbortSignal.timeout(timeoutMs) : null;

      if (timeoutController) {
        const onTimeout = (): void => {
          controller.abort();
        };
        timeoutController.addEventListener('abort', onTimeout, { once: true });
      }

      const result = await fn(controller.signal);

      manager.recordSuccess();
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Don't retry on cancellation
      if (err.name === 'AbortError' || err.message.includes('abort')) {
        throw err;
      }

      manager.recordFailure();

      if (!manager.canRetry()) {
        throw lastError ?? err;
      }

      lastError = err;

      // Wait before retrying
      const delay = manager.getNextRetryDelay();
      await new Promise((resolve) => setTimeout(resolve, delay));

      if (abortSignal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
    }
  }
}
