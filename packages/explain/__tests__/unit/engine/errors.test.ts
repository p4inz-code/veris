/**
 * Tests for errors — error codes, createExplainError, mapProviderError.
 */

import { describe, it, expect } from 'vitest';
import { ErrorCodes, createExplainError, mapProviderError } from '../../../src/engine/errors.js';

describe('ErrorCodes', () => {
  it('has all required error codes', () => {
    expect(ErrorCodes.PROVIDER_UNAVAILABLE).toBe('PROVIDER_UNAVAILABLE');
    expect(ErrorCodes.PROVIDER_TIMEOUT).toBe('PROVIDER_TIMEOUT');
    expect(ErrorCodes.PROVIDER_ERROR).toBe('PROVIDER_ERROR');
    expect(ErrorCodes.CITATION_FAILURE).toBe('CITATION_FAILURE');
    expect(ErrorCodes.INVALID_RESPONSE).toBe('INVALID_RESPONSE');
    expect(ErrorCodes.FINDING_NOT_FOUND).toBe('FINDING_NOT_FOUND');
    expect(ErrorCodes.CHAIN_NOT_FOUND).toBe('CHAIN_NOT_FOUND');
    expect(ErrorCodes.RISK_DIMENSION_NOT_FOUND).toBe('RISK_DIMENSION_NOT_FOUND');
    expect(ErrorCodes.REPORT_NOT_FOUND).toBe('REPORT_NOT_FOUND');
    expect(ErrorCodes.CACHE_ERROR).toBe('CACHE_ERROR');
    expect(ErrorCodes.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    expect(ErrorCodes.CANCELLED).toBe('CANCELLED');
  });
});

describe('createExplainError', () => {
  it('creates an error result with the given code', () => {
    const error = createExplainError(ErrorCodes.FINDING_NOT_FOUND, 'f1', 'finding');

    expect(error.kind).toBe('error');
    expect(error.code).toBe('FINDING_NOT_FOUND');
    expect(error.subjectId).toBe('f1');
    expect(error.subjectType).toBe('finding');
  });

  it('includes a human-readable message', () => {
    const error = createExplainError(ErrorCodes.PROVIDER_UNAVAILABLE, 'f1', 'finding');
    expect(error.message).toContain('unavailable');
  });

  it('sets recoverable based on error code', () => {
    const recoverableError = createExplainError(ErrorCodes.PROVIDER_ERROR, 'f1', 'finding');
    expect(recoverableError.recoverable).toBe(true);

    const nonRecoverableError = createExplainError(ErrorCodes.FINDING_NOT_FOUND, 'f1', 'finding');
    expect(nonRecoverableError.recoverable).toBe(false);
  });

  it('includes custom message when provided', () => {
    const error = createExplainError(ErrorCodes.PROVIDER_ERROR, 'f1', 'finding', {
      message: 'Custom error message',
    });
    expect(error.message).toBe('Custom error message');
  });

  it('includes provider error when provided', () => {
    const error = createExplainError(ErrorCodes.PROVIDER_ERROR, 'f1', 'finding', {
      providerError: 'HTTP 500: Internal Server Error',
    });
    expect(error.providerError).toBe('HTTP 500: Internal Server Error');
  });
});

describe('mapProviderError', () => {
  it('maps timeout errors to PROVIDER_TIMEOUT', () => {
    const error = mapProviderError(new Error('Request timed out'), 'f1', 'finding');
    expect(error.code).toBe('PROVIDER_TIMEOUT');
    expect(error.recoverable).toBe(true);
  });

  it('maps cancellation errors to CANCELLED', () => {
    const abortError = new Error('abort');
    abortError.name = 'AbortError';
    const error = mapProviderError(abortError, 'f1', 'finding');
    expect(error.code).toBe('CANCELLED');
    expect(error.recoverable).toBe(false);
  });

  it('maps unknown errors to PROVIDER_ERROR', () => {
    const error = mapProviderError(new Error('Something went wrong'), 'f1', 'finding');
    expect(error.code).toBe('PROVIDER_ERROR');
    expect(error.recoverable).toBe(true);
  });

  it('wraps non-Error values', () => {
    const error = mapProviderError('string error', 'f1', 'finding');
    expect(error.kind).toBe('error');
    expect(error.code).toBe('PROVIDER_ERROR');
  });

  it('preserves subjectId and subjectType', () => {
    const error = mapProviderError(new Error('fail'), 'finding_001', 'finding');
    expect(error.subjectId).toBe('finding_001');
    expect(error.subjectType).toBe('finding');
  });
});
