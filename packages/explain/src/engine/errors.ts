/**
 * Error types, codes, and mapping for the explanation engine.
 *
 * Maps provider-level errors to user-facing ExplainError results
 * with consistent error codes and recovery hints.
 *
 * @module @veris/explain/engine/errors
 */

import type { ExplainError } from '../types/result.js';

// ── Error Codes ──

/** Canonical error codes for explanation failures. */
export const ErrorCodes = {
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  CITATION_FAILURE: 'CITATION_FAILURE',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  FINDING_NOT_FOUND: 'FINDING_NOT_FOUND',
  CHAIN_NOT_FOUND: 'CHAIN_NOT_FOUND',
  RISK_DIMENSION_NOT_FOUND: 'RISK_DIMENSION_NOT_FOUND',
  REPORT_NOT_FOUND: 'REPORT_NOT_FOUND',
  CACHE_ERROR: 'CACHE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  CANCELLED: 'CANCELLED',
} as const;

/** Union type of all error codes. */
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// ── Error Factory ──

/**
 * Create an ExplainError result for a given error code.
 *
 * @param code - The canonical error code.
 * @param subjectId - The subject being explained.
 * @param subjectType - The type of subject.
 * @param options - Optional details.
 * @returns An ExplainError result.
 */
export function createExplainError(
  code: ErrorCode,
  subjectId: string,
  subjectType: string,
  options?: {
    readonly message?: string;
    readonly providerError?: string;
    readonly recoverable?: boolean;
  },
): ExplainError {
  const message = options?.message ?? getDefaultMessage(code);

  return {
    kind: 'error',
    code,
    message,
    subjectId,
    subjectType,
    providerError: options?.providerError,
    recoverable: options?.recoverable ?? isRecoverable(code),
  };
}

/**
 * Map a provider error to an ExplainError result.
 *
 * @param error - The error from the provider layer.
 * @param subjectId - The subject being explained.
 * @param subjectType - The type of subject.
 * @returns An ExplainError result.
 */
export function mapProviderError(
  error: unknown,
  subjectId: string,
  subjectType: string,
): ExplainError {
  const err = error instanceof Error ? error : new Error(String(error));

  if (isTimeoutError(err)) {
    return createExplainError(ErrorCodes.PROVIDER_TIMEOUT, subjectId, subjectType, {
      providerError: err.message,
      recoverable: true,
    });
  }

  if (isCancellationError(err)) {
    return createExplainError(ErrorCodes.CANCELLED, subjectId, subjectType, {
      message: 'Explanation was cancelled.',
      providerError: err.message,
      recoverable: false,
    });
  }

  return createExplainError(ErrorCodes.PROVIDER_ERROR, subjectId, subjectType, {
    providerError: err.message,
    recoverable: true,
  });
}

/**
 * Check if an error is a timeout.
 */
function isTimeoutError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('deadline') ||
    error.name === 'TimeoutError'
  );
}

/**
 * Check if an error is a cancellation.
 */
function isCancellationError(error: Error): boolean {
  return (
    error.name === 'AbortError' ||
    error.name === 'CancelError' ||
    error.message.includes('abort') ||
    error.message.includes('cancel')
  );
}

// ── Helpers ──

/**
 * Get the default human-readable message for an error code.
 */
function getDefaultMessage(code: ErrorCode): string {
  switch (code) {
    case ErrorCodes.PROVIDER_UNAVAILABLE:
      return 'AI explanation is unavailable. No AI provider is currently accessible.';
    case ErrorCodes.PROVIDER_TIMEOUT:
      return 'AI provider took too long to respond. Please try again.';
    case ErrorCodes.PROVIDER_ERROR:
      return 'AI provider returned an error. Please check provider configuration.';
    case ErrorCodes.CITATION_FAILURE:
      return 'Explanation was rejected because citations could not be verified.';
    case ErrorCodes.INVALID_RESPONSE:
      return 'AI provider returned an invalid response. Please try again.';
    case ErrorCodes.FINDING_NOT_FOUND:
      return 'The specified finding was not found in the report.';
    case ErrorCodes.CHAIN_NOT_FOUND:
      return 'The specified behavior chain was not found in the report.';
    case ErrorCodes.RISK_DIMENSION_NOT_FOUND:
      return 'The specified risk dimension was not found in the report.';
    case ErrorCodes.REPORT_NOT_FOUND:
      return 'No report data available for summarization.';
    case ErrorCodes.CACHE_ERROR:
      return 'Cache error occurred. Explanation was generated without caching.';
    case ErrorCodes.INTERNAL_ERROR:
      return 'An internal error occurred while generating the explanation.';
    case ErrorCodes.CANCELLED:
      return 'Explanation was cancelled.';
  }
}

/**
 * Determine if an error code represents a recoverable error.
 */
function isRecoverable(code: ErrorCode): boolean {
  switch (code) {
    case ErrorCodes.PROVIDER_UNAVAILABLE:
    case ErrorCodes.PROVIDER_TIMEOUT:
    case ErrorCodes.PROVIDER_ERROR:
    case ErrorCodes.CITATION_FAILURE:
    case ErrorCodes.INVALID_RESPONSE:
    case ErrorCodes.CACHE_ERROR:
      return true;
    case ErrorCodes.FINDING_NOT_FOUND:
    case ErrorCodes.CHAIN_NOT_FOUND:
    case ErrorCodes.RISK_DIMENSION_NOT_FOUND:
    case ErrorCodes.REPORT_NOT_FOUND:
    case ErrorCodes.INTERNAL_ERROR:
    case ErrorCodes.CANCELLED:
      return false;
  }
}
