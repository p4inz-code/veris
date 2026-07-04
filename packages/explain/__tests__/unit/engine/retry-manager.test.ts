/**
 * Tests for RetryManager — circuit breaker, retry budget, exponential backoff.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RetryManager, withRetry } from '../../../src/engine/retry-manager.js';

describe('RetryManager', () => {
  let manager: RetryManager;

  beforeEach(() => {
    manager = new RetryManager({
      maxRetries: 2,
      baseDelayMs: 10,
      maxDelayMs: 100,
      circuitBreaker: {
        failureThreshold: 3,
        resetTimeoutMs: 100,
        halfOpenSuccessThreshold: 1,
      },
    });
  });

  describe('initial state', () => {
    it('starts as closed', () => {
      expect(manager.state).toBe('closed');
    });

    it('allows requests when closed', () => {
      expect(manager.allowRequest()).toBe(true);
    });

    it('has zero failures', () => {
      expect(manager.failures).toBe(0);
    });

    it('has zero retries', () => {
      expect(manager.retries).toBe(0);
    });
  });

  describe('circuit breaker', () => {
    it('opens after failure threshold reached', () => {
      manager.recordFailure();
      manager.recordFailure();
      manager.recordFailure();
      expect(manager.state).toBe('open');
    });

    it('blocks requests when open', () => {
      for (let i = 0; i < 3; i++) manager.recordFailure();
      expect(manager.allowRequest()).toBe(false);
    });

    it('transitions to half-open after reset timeout', () => {
      for (let i = 0; i < 3; i++) manager.recordFailure();
      expect(manager.state).toBe('open');

      // Simulate time passing
      vi.useFakeTimers();
      vi.advanceTimersByTime(200);
      expect(manager.allowRequest()).toBe(true);
      expect(manager.state).toBe('half-open');
      vi.useRealTimers();
    });

    it('closes after half-open success threshold', () => {
      for (let i = 0; i < 3; i++) manager.recordFailure();
      expect(manager.state).toBe('open');

      vi.useFakeTimers();
      vi.advanceTimersByTime(200);
      expect(manager.allowRequest()).toBe(true);
      expect(manager.state).toBe('half-open');

      manager.recordSuccess();
      expect(manager.state).toBe('closed');
      vi.useRealTimers();
    });

    it('reopens on failure in half-open', () => {
      for (let i = 0; i < 3; i++) manager.recordFailure();

      vi.useFakeTimers();
      vi.advanceTimersByTime(200);
      manager.allowRequest();
      expect(manager.state).toBe('half-open');

      manager.recordFailure();
      expect(manager.state).toBe('open');
      vi.useRealTimers();
    });

    it('resets failure count on success in closed state', () => {
      manager.recordFailure();
      manager.recordFailure();
      expect(manager.failures).toBe(2);

      manager.recordSuccess();
      expect(manager.failures).toBe(0);
    });
  });

  describe('retry budget', () => {
    it('can retry when under max retries', () => {
      expect(manager.canRetry()).toBe(true);
    });

    it('cannot retry when max retries exhausted', () => {
      manager.recordFailure();
      manager.recordFailure();
      manager.recordFailure();
      expect(manager.canRetry()).toBe(false);
    });
  });

  describe('reset', () => {
    it('resets to initial state', () => {
      manager.recordFailure();
      manager.recordFailure();
      manager.recordFailure();
      expect(manager.state).toBe('open');

      manager.reset();
      expect(manager.state).toBe('closed');
      expect(manager.failures).toBe(0);
      expect(manager.retries).toBe(0);
    });
  });
});

describe('withRetry', () => {
  let manager: RetryManager;

  beforeEach(() => {
    manager = new RetryManager({
      maxRetries: 2,
      baseDelayMs: 5,
      maxDelayMs: 50,
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeoutMs: 1000,
        halfOpenSuccessThreshold: 1,
      },
    });
  });

  it('succeeds on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn, manager);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    const result = await withRetry(fn, manager);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistent failure'));

    await expect(withRetry(fn, manager)).rejects.toThrow('persistent failure');
  });

  it('does not retry on abort', async () => {
    const fn = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));

    await expect(withRetry(fn, manager)).rejects.toThrow('Aborted');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('rejects if circuit breaker is open', async () => {
    for (let i = 0; i < 5; i++) manager.recordFailure();
    expect(manager.state).toBe('open');

    const fn = vi.fn().mockResolvedValue('success');
    await expect(withRetry(fn, manager)).rejects.toThrow('Circuit breaker is open');
  });

  it('can be aborted via signal', async () => {
    const controller = new AbortController();
    // Signal is already aborted before the call
    controller.abort();

    const fn = vi.fn().mockResolvedValue('should-not-be-called');

    await expect(withRetry(fn, manager, controller.signal)).rejects.toThrow('Aborted');
    expect(fn).toHaveBeenCalledTimes(0);
  });
});
