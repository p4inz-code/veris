/**
 * Tests for M2 — Retry policy and circuit breaker.
 *
 * Tests:
 * - Retry delay calculation
 * - Retryable error detection
 * - withRetry helper
 * - Circuit breaker states
 * - Circuit breaker transitions
 *
 * @module @veris/ai/__tests__/providers/retry.test
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RETRY_POLICY,
  calculateRetryDelay,
  isRetryable,
  withRetry,
  createCircuitBreaker,
} from '../../src/providers/retry.js';
import { ProviderError } from '../../src/providers/errors.js';

describe('RetryPolicy', () => {
  describe('calculateRetryDelay', () => {
    it('returns base delay for first retry', () => {
      const delay = calculateRetryDelay(0, DEFAULT_RETRY_POLICY);
      expect(delay).toBe(1000);
    });

    it('applies exponential backoff', () => {
      const delay1 = calculateRetryDelay(0, DEFAULT_RETRY_POLICY);
      const delay2 = calculateRetryDelay(1, DEFAULT_RETRY_POLICY);
      const delay3 = calculateRetryDelay(2, DEFAULT_RETRY_POLICY);

      expect(delay1).toBe(1000);
      expect(delay2).toBe(2000);
      expect(delay3).toBe(4000);
    });

    it('caps at maxDelayMs', () => {
      const delay = calculateRetryDelay(10, {
        maxRetries: 10,
        baseDelayMs: 1000,
        maxDelayMs: 5000,
        backoffFactor: 2,
      });
      expect(delay).toBe(5000);
    });
  });

  describe('isRetryable', () => {
    it('returns true for recoverable errors', () => {
      const error = new ProviderError({
        code: 'PROVIDER_UNAVAILABLE',
        providerId: 'test',
        message: 'test',
      });
      expect(isRetryable(error, DEFAULT_RETRY_POLICY)).toBe(true);
    });

    it('returns false for non-recoverable errors', () => {
      const error = new ProviderError({
        code: 'AUTHENTICATION_ERROR',
        providerId: 'test',
        message: 'test',
      });
      expect(isRetryable(error, DEFAULT_RETRY_POLICY)).toBe(false);
    });

    it('returns false for non-ProviderError', () => {
      expect(isRetryable(new Error('generic'), DEFAULT_RETRY_POLICY)).toBe(false);
    });

    it('respects custom retryable codes', () => {
      const error = new ProviderError({
        code: 'RATE_LIMITED',
        providerId: 'test',
        message: 'test',
      });

      const policy = {
        ...DEFAULT_RETRY_POLICY,
        retryableCodes: ['RATE_LIMITED' as const],
      };

      expect(isRetryable(error, policy)).toBe(true);
    });
  });

  describe('withRetry', () => {
    it('returns result on first success', async () => {
      const result = await withRetry(async () => 'success', DEFAULT_RETRY_POLICY);
      expect(result).toBe('success');
    });

    it('retries on recoverable error and succeeds', async () => {
      let attempts = 0;

      const result = await withRetry(
        async () => {
          attempts++;
          if (attempts < 2) {
            throw new ProviderError({
              code: 'PROVIDER_UNAVAILABLE',
              providerId: 'test',
              message: 'not ready',
            });
          }
          return 'recovered';
        },
        { ...DEFAULT_RETRY_POLICY, baseDelayMs: 10 },
      );

      expect(result).toBe('recovered');
      expect(attempts).toBe(2);
    });

    it('throws after exhausting retries', async () => {
      const fn = async () => {
        throw new ProviderError({
          code: 'PROVIDER_UNAVAILABLE',
          providerId: 'test',
          message: 'always fails',
        });
      };

      await expect(
        withRetry(fn, { ...DEFAULT_RETRY_POLICY, baseDelayMs: 10, maxRetries: 1 }),
      ).rejects.toThrow(ProviderError);
    });

    it('does not retry non-recoverable errors', async () => {
      let attempts = 0;

      const fn = async () => {
        attempts++;
        throw new ProviderError({
          code: 'AUTHENTICATION_ERROR',
          providerId: 'test',
          message: 'bad key',
        });
      };

      await expect(withRetry(fn, DEFAULT_RETRY_POLICY)).rejects.toThrow(ProviderError);
      expect(attempts).toBe(1); // No retry
    });
  });
});

describe('CircuitBreaker', () => {
  describe('initial state', () => {
    it('starts closed', () => {
      const cb = createCircuitBreaker();
      expect(cb.state.state).toBe('closed');
      expect(cb.state.failureCount).toBe(0);
    });
  });

  describe('state transitions', () => {
    it('opens after failure threshold', async () => {
      const cb = createCircuitBreaker({
        failureThreshold: 3,
        resetTimeoutMs: 5000,
      });

      for (let i = 0; i < 3; i++) {
        try {
          await cb.call(async () => {
            throw new ProviderError({
              code: 'PROVIDER_UNAVAILABLE',
              providerId: 'test',
              message: 'fail',
            });
          });
        } catch {
          // Expected
        }
      }

      expect(cb.state.state).toBe('open');
      expect(cb.state.failureCount).toBe(3);
    });

    it('closes again after success threshold in half-open', async () => {
      const cb = createCircuitBreaker({
        failureThreshold: 2,
        resetTimeoutMs: 100, // Short timeout for testing
        halfOpenSuccessThreshold: 2,
      });

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await cb.call(async () => {
            throw new Error('fail');
          });
        } catch {
          // Expected
        }
      }

      expect(cb.state.state).toBe('open');

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should transition to half-open on next call
      const result = await cb.call(async () => 'success');
      expect(result).toBe('success');
      expect(cb.state.state).toBe('half-open');

      // Another success should close
      await cb.call(async () => 'success2');
      expect(cb.state.state).toBe('closed');
    });

    it('re-opens on failure in half-open state', async () => {
      const cb = createCircuitBreaker({
        failureThreshold: 2,
        resetTimeoutMs: 100,
      });

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await cb.call(async () => {
            throw new Error('fail');
          });
        } catch {
          /* Expected */
        }
      }

      // Wait for half-open transition
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should fail in half-open and re-open
      try {
        await cb.call(async () => {
          throw new Error('fail again');
        });
      } catch {
        /* Expected */
      }

      expect(cb.state.state).toBe('open');
    });
  });

  describe('reset', () => {
    it('resets to closed state', async () => {
      const cb = createCircuitBreaker({ failureThreshold: 1 });

      // Open it
      try {
        await cb.call(async () => {
          throw new Error('fail');
        });
      } catch {
        /* Expected */
      }

      cb.reset();
      expect(cb.state.state).toBe('closed');
      expect(cb.state.failureCount).toBe(0);
    });
  });

  describe('recordSuccess and recordFailure', () => {
    it('manually records success and failure', () => {
      const cb = createCircuitBreaker({ failureThreshold: 3 });

      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure();

      expect(cb.state.state).toBe('open');

      cb.reset();
      expect(cb.state.state).toBe('closed');
    });
  });
});
