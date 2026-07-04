/**
 * Retry policy and circuit breaker interfaces for provider resilience.
 *
 * These are optional resilience layers that wrap provider calls.
 * Consumers can use them to add automatic retries and circuit breaking.
 *
 * @module @veris/ai/providers/retry
 */

import { ProviderError } from './errors.js';

// ── Retry Policy ──

/**
 * Configuration for retry behavior.
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts. Default: 2. */
  readonly maxRetries: number;
  /** Base delay in milliseconds before the first retry. Default: 1000. */
  readonly baseDelayMs: number;
  /** Maximum delay in milliseconds between retries. Default: 30000. */
  readonly maxDelayMs: number;
  /** Exponential backoff factor. Default: 2. */
  readonly backoffFactor: number;
  /** Whether to retry on all recoverable errors, or only specific codes. */
  readonly retryableCodes?: readonly ProviderError['code'][];
}

/** Default retry policy. */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 2,
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
  backoffFactor: 2,
};

// ── Circuit Breaker State ──

/** Circuit breaker state. */
export type CircuitState = 'closed' | 'open' | 'half-open';

/** Circuit breaker state information. */
export interface CircuitBreakerState {
  readonly state: CircuitState;
  readonly failureCount: number;
  readonly lastFailureAt: number | null;
  readonly resetTimeoutMs: number;
}

// ── Circuit Breaker Interface ──

/**
 * Circuit breaker for provider calls.
 *
 * Prevents cascading failures by opening the circuit when failures
 * exceed a threshold. After a reset timeout, transitions to half-open
 * to test if the provider has recovered.
 */
export interface CircuitBreaker {
  /** Current circuit breaker state. */
  readonly state: CircuitBreakerState;

  /**
   * Execute a function through the circuit breaker.
   *
   * @param fn - The function to execute.
   * @returns The result of the function.
   * @throws {ProviderError} If the circuit is open.
   */
  call<T>(fn: () => Promise<T>): Promise<T>;

  /**
   * Reset the circuit breaker to closed state.
   */
  reset(): void;

  /**
   * Record a success (used externally when the caller handles the call).
   */
  recordSuccess(): void;

  /**
   * Record a failure (used externally when the caller handles the call).
   */
  recordFailure(): void;
}

// ── Retry Helper ──

/**
 * Default codes that are considered retryable.
 */
const DEFAULT_RETRYABLE_CODES: readonly ProviderError['code'][] = [
  'PROVIDER_UNAVAILABLE',
  'TIMEOUT',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
];

/**
 * Calculate the delay for a given retry attempt using exponential backoff.
 *
 * @param attempt - The current retry attempt (0-based).
 * @param policy - The retry policy.
 * @returns Delay in milliseconds.
 */
export function calculateRetryDelay(attempt: number, policy: RetryPolicy): number {
  const delay = policy.baseDelayMs * Math.pow(policy.backoffFactor, attempt);
  return Math.min(delay, policy.maxDelayMs);
}

/**
 * Determine whether an error should be retried based on the retry policy.
 *
 * @param error - The error to check.
 * @param policy - The retry policy.
 * @returns Whether the error is retryable.
 */
export function isRetryable(error: unknown, policy: RetryPolicy): boolean {
  if (!(error instanceof ProviderError)) return false;
  if (!error.recoverable) return false;
  if (policy.retryableCodes) {
    return policy.retryableCodes.includes(error.code);
  }
  return DEFAULT_RETRYABLE_CODES.includes(error.code);
}

// ── Circuit Breaker Implementation ──

/** Default circuit breaker configuration. */
export interface CircuitBreakerOptions {
  /** Number of consecutive failures to open the circuit. Default: 5. */
  readonly failureThreshold?: number;
  /** Time in ms before transitioning from open to half-open. Default: 30000. */
  readonly resetTimeoutMs?: number;
  /** Number of successful calls in half-open to close the circuit. Default: 3. */
  readonly halfOpenSuccessThreshold?: number;
}

/** Default circuit breaker options. */
const DEFAULT_CIRCUIT_BREAKER_OPTIONS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenSuccessThreshold: 3,
};

/**
 * Default CircuitBreaker implementation.
 */
class CircuitBreakerImpl implements CircuitBreaker {
  private currentState: CircuitState = 'closed';
  private failures = 0;
  private lastFailure: number | null = null;
  private halfOpenSuccesses = 0;
  private readonly options: Required<CircuitBreakerOptions>;

  constructor(options?: CircuitBreakerOptions) {
    this.options = { ...DEFAULT_CIRCUIT_BREAKER_OPTIONS, ...options };
  }

  get state(): CircuitBreakerState {
    return {
      state: this.currentState,
      failureCount: this.failures,
      lastFailureAt: this.lastFailure,
      resetTimeoutMs: this.options.resetTimeoutMs,
    };
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.currentState === 'open') {
      const elapsed = this.lastFailure ? Date.now() - this.lastFailure : 0;
      if (elapsed >= this.options.resetTimeoutMs) {
        this.currentState = 'half-open';
        this.halfOpenSuccesses = 0;
      } else {
        throw new ProviderError({
          code: 'PROVIDER_UNAVAILABLE',
          providerId: 'circuit-breaker',
          message: `Circuit breaker is open. Retry in ${this.options.resetTimeoutMs - elapsed}ms.`,
          recoverable: true,
        });
      }
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  recordSuccess(): void {
    if (this.currentState === 'half-open') {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.options.halfOpenSuccessThreshold) {
        this.reset();
      }
    } else if (this.currentState === 'closed') {
      this.failures = 0;
    }
  }

  recordFailure(): void {
    this.lastFailure = Date.now();
    if (this.currentState === 'half-open') {
      this.currentState = 'open';
      this.failures = this.options.failureThreshold;
    } else {
      this.failures++;
      if (this.failures >= this.options.failureThreshold) {
        this.currentState = 'open';
      }
    }
  }

  reset(): void {
    this.currentState = 'closed';
    this.failures = 0;
    this.lastFailure = null;
    this.halfOpenSuccesses = 0;
  }
}

/**
 * Create a CircuitBreaker.
 *
 * @param options - Circuit breaker configuration options.
 * @returns A new CircuitBreaker instance.
 */
export function createCircuitBreaker(options?: CircuitBreakerOptions): CircuitBreaker {
  return new CircuitBreakerImpl(options);
}

/**
 * Execute a function with retry logic.
 *
 * @param fn - The function to execute with retries.
 * @param policy - The retry policy.
 * @param context - Optional context for error messages.
 * @returns The result of the function.
 * @throws The last error encountered if all retries are exhausted.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  context?: string,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < policy.maxRetries && isRetryable(error, policy)) {
        const delay = calculateRetryDelay(attempt, policy);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }

  throw lastError;
}
