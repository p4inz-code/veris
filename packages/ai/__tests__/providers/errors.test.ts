/**
 * Tests for M2 — Provider errors.
 *
 * Tests:
 * - ProviderError construction
 * - Error code narrowing
 * - Recovery determination
 * - HTTP status mapping
 * - Error factory functions
 *
 * @module @veris/ai/__tests__/providers/errors.test
 */

import { describe, it, expect } from 'vitest';
import {
  ProviderError,
  httpStatusToErrorCode,
  createProviderErrorFromResponse,
  createProviderErrorFromNetworkError,
  createTimeoutError,
} from '../../src/providers/errors.js';
import type { ProviderErrorCode } from '../../src/providers/errors.js';

describe('ProviderError', () => {
  describe('construction', () => {
    it('can be created with minimal parameters', () => {
      const error = new ProviderError({
        code: 'PROVIDER_UNAVAILABLE',
        providerId: 'openai',
        message: 'Provider is not responding',
      });
      expect(error.code).toBe('PROVIDER_UNAVAILABLE');
      expect(error.providerId).toBe('openai');
      expect(error.message).toBe('Provider is not responding');
      expect(error.name).toBe('ProviderError');
      expect(error.recoverable).toBe(true);
      expect(error.statusCode).toBeUndefined();
    });

    it('can be created with all parameters', () => {
      const error = new ProviderError({
        code: 'RATE_LIMITED',
        providerId: 'anthropic',
        message: 'Rate limit exceeded',
        statusCode: 429,
        retryAfterMs: 5000,
        cause: new Error('429 Too Many Requests'),
      });
      expect(error.code).toBe('RATE_LIMITED');
      expect(error.statusCode).toBe(429);
      expect(error.retryAfterMs).toBe(5000);
      expect(error.cause).toBeInstanceOf(Error);
    });
  });

  describe('recoverable determination', () => {
    const recoverableCodes: ProviderErrorCode[] = [
      'PROVIDER_UNAVAILABLE',
      'TIMEOUT',
      'RATE_LIMITED',
      'INTERNAL_ERROR',
      'INVALID_RESPONSE',
    ];

    const nonRecoverableCodes: ProviderErrorCode[] = [
      'AUTHENTICATION_ERROR',
      'INVALID_REQUEST',
      'CONTENT_FILTERED',
      'CONTEXT_LENGTH_EXCEEDED',
      'UNKNOWN',
    ];

    for (const code of recoverableCodes) {
      it(`${code} is recoverable`, () => {
        const error = new ProviderError({ code, providerId: 'test', message: 'test' });
        expect(error.recoverable).toBe(true);
      });
    }

    for (const code of nonRecoverableCodes) {
      it(`${code} is not recoverable`, () => {
        const error = new ProviderError({ code, providerId: 'test', message: 'test' });
        expect(error.recoverable).toBe(false);
      });
    }
  });

  describe('is an Error instance', () => {
    it('is an instance of Error and ProviderError', () => {
      const error = new ProviderError({
        code: 'TIMEOUT',
        providerId: 'test',
        message: 'Timed out',
      });
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ProviderError);
    });

    it('has a stack trace', () => {
      const error = new ProviderError({
        code: 'UNKNOWN',
        providerId: 'test',
        message: 'test',
      });
      expect(error.stack).toBeDefined();
    });
  });
});

describe('httpStatusToErrorCode', () => {
  const testCases: Array<{ status: number; expected: ProviderErrorCode }> = [
    { status: 401, expected: 'AUTHENTICATION_ERROR' },
    { status: 403, expected: 'AUTHENTICATION_ERROR' },
    { status: 429, expected: 'RATE_LIMITED' },
    { status: 400, expected: 'INVALID_REQUEST' },
    { status: 404, expected: 'INVALID_REQUEST' },
    { status: 500, expected: 'INTERNAL_ERROR' },
    { status: 502, expected: 'INTERNAL_ERROR' },
    { status: 503, expected: 'INTERNAL_ERROR' },
    { status: 200, expected: 'UNKNOWN' },
    { status: 302, expected: 'UNKNOWN' },
    { status: 418, expected: 'UNKNOWN' },
  ];

  for (const { status, expected } of testCases) {
    it(`HTTP ${status} maps to ${expected}`, () => {
      expect(httpStatusToErrorCode(status, 'test')).toBe(expected);
    });
  }
});

describe('createProviderErrorFromResponse', () => {
  it('creates error with correct status code', async () => {
    const response = new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    const error = await createProviderErrorFromResponse(response, 'openai');
    expect(error.code).toBe('AUTHENTICATION_ERROR');
    expect(error.statusCode).toBe(401);
    expect(error.providerId).toBe('openai');
    expect(error.message).toContain('401');
  });

  it('parses retry-after header', async () => {
    const response = new Response('Rate limited', {
      status: 429,
      headers: { 'retry-after': '30' },
    });
    const error = await createProviderErrorFromResponse(response, 'ollama');
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.retryAfterMs).toBe(30_000);
  });

  it('handles response with no body', async () => {
    const response = new Response(null, { status: 500, statusText: 'Internal Error' });
    const error = await createProviderErrorFromResponse(response, 'test');
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.message).toContain('500');
  });
});

describe('createProviderErrorFromNetworkError', () => {
  it('creates PROVIDER_UNAVAILABLE from standard Error', () => {
    const error = createProviderErrorFromNetworkError(new Error('fetch failed'), 'ollama');
    expect(error.code).toBe('PROVIDER_UNAVAILABLE');
    expect(error.message).toBe('fetch failed');
    expect(error.recoverable).toBe(true);
  });

  it('creates PROVIDER_UNAVAILABLE from non-Error', () => {
    const error = createProviderErrorFromNetworkError('something broke', 'test');
    expect(error.code).toBe('PROVIDER_UNAVAILABLE');
    expect(error.message).toBe('Unknown network error');
  });
});

describe('createTimeoutError', () => {
  it('creates TIMEOUT error with message', () => {
    const error = createTimeoutError('openai', 30000);
    expect(error.code).toBe('TIMEOUT');
    expect(error.message).toContain('30000');
    expect(error.recoverable).toBe(true);
    expect(error.providerId).toBe('openai');
  });
});
