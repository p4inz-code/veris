/**
 * ProviderError — standardized error type for all provider operations.
 *
 * Every adapter throws (or rejects with) a ProviderError for any failure.
 * Consumers can inspect the error code to determine the appropriate action.
 *
 * @module @veris/ai/providers/errors
 */

// ── Error Codes ──

/**
 * Standardized provider error codes.
 *
 * Each code maps to a specific class of failure.
 * Consumers use these to determine recovery actions.
 */
export type ProviderErrorCode =
  | 'PROVIDER_UNAVAILABLE' // Provider is not reachable (network error, DNS failure)
  | 'AUTHENTICATION_ERROR' // Invalid or missing API key
  | 'RATE_LIMITED' // Rate limit exceeded (HTTP 429)
  | 'TIMEOUT' // Request timed out
  | 'INVALID_REQUEST' // Bad request (invalid parameters, model not found)
  | 'INVALID_RESPONSE' // Provider returned an unparseable or unexpected response
  | 'CONTENT_FILTERED' // Response was filtered by the provider's content policy
  | 'CONTEXT_LENGTH_EXCEEDED' // Input exceeds the model's context window
  | 'INTERNAL_ERROR' // Provider returned a 5xx error
  | 'UNKNOWN'; // Unknown or uncategorized error

// ── Error Class ──

/**
 * Standardized provider error.
 *
 * Every provider adapter throws this error type for all failures.
 * The `code` field allows consumers to determine recovery actions:
 * - `PROVIDER_UNAVAILABLE`, `TIMEOUT`: retry with backoff or fallback
 * - `AUTHENTICATION_ERROR`, `INVALID_REQUEST`: not recoverable without user action
 * - `RATE_LIMITED`: retry after `retryAfterMs`
 * - `CONTEXT_LENGTH_EXCEEDED`: reduce input size
 * - `INVALID_RESPONSE`, `INTERNAL_ERROR`: retry or fallback
 */
export class ProviderError extends Error {
  /** The standardized error code. */
  readonly code: ProviderErrorCode;
  /** The provider ID that produced this error. */
  readonly providerId: string;
  /** Whether this error is recoverable (retryable). */
  readonly recoverable: boolean;
  /** HTTP status code, if applicable. */
  readonly statusCode?: number;
  /** Retry-After duration in milliseconds, if rate-limited. */
  readonly retryAfterMs?: number;
  /** The underlying cause, if available. */
  readonly cause?: unknown;

  constructor(params: {
    readonly code: ProviderErrorCode;
    readonly providerId: string;
    readonly message: string;
    readonly recoverable?: boolean;
    readonly statusCode?: number;
    readonly retryAfterMs?: number;
    readonly cause?: unknown;
  }) {
    super(params.message);
    this.name = 'ProviderError';
    this.code = params.code;
    this.providerId = params.providerId;
    this.recoverable = params.recoverable ?? isRecoverable(params.code);
    this.statusCode = params.statusCode;
    this.retryAfterMs = params.retryAfterMs;
    this.cause = params.cause;
  }
}

// ── Helpers ──

/**
 * Determine whether an error code represents a recoverable (retryable) failure.
 */
function isRecoverable(code: ProviderErrorCode): boolean {
  switch (code) {
    case 'PROVIDER_UNAVAILABLE':
    case 'TIMEOUT':
    case 'RATE_LIMITED':
    case 'INTERNAL_ERROR':
    case 'INVALID_RESPONSE':
      return true;
    case 'AUTHENTICATION_ERROR':
    case 'INVALID_REQUEST':
    case 'CONTENT_FILTERED':
    case 'CONTEXT_LENGTH_EXCEEDED':
    case 'UNKNOWN':
      return false;
  }
}

/**
 * Map an HTTP status code to a ProviderErrorCode.
 */
export function httpStatusToErrorCode(status: number, providerId: string): ProviderErrorCode {
  if (status === 401 || status === 403) return 'AUTHENTICATION_ERROR';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 400) return 'INVALID_REQUEST';
  if (status === 404) return 'INVALID_REQUEST';
  if (status >= 500) return 'INTERNAL_ERROR';
  return 'UNKNOWN';
}

/**
 * Create a ProviderError from an HTTP response.
 */
export async function createProviderErrorFromResponse(
  response: Response,
  providerId: string,
): Promise<ProviderError> {
  const code = httpStatusToErrorCode(response.status, providerId);
  let message: string;

  try {
    const body = await response.text();
    message = `HTTP ${response.status}: ${body.slice(0, 500)}`;
  } catch {
    message = `HTTP ${response.status}: ${response.statusText}`;
  }

  return new ProviderError({
    code,
    providerId,
    message,
    statusCode: response.status,
    retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
  });
}

/**
 * Parse a Retry-After header value into milliseconds.
 */
function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = parseInt(value, 10);
  if (!isNaN(seconds)) return seconds * 1000;
  // HTTP-date format — not implementing full parsing, return default
  return 5_000;
}

/**
 * Create a ProviderError from a network/fetch error.
 */
export function createProviderErrorFromNetworkError(
  error: unknown,
  providerId: string,
): ProviderError {
  const message = error instanceof Error ? error.message : 'Unknown network error';
  return new ProviderError({
    code: 'PROVIDER_UNAVAILABLE',
    providerId,
    message,
    recoverable: true,
    cause: error,
  });
}

/**
 * Create a ProviderError for a timeout.
 */
export function createTimeoutError(providerId: string, timeoutMs: number): ProviderError {
  return new ProviderError({
    code: 'TIMEOUT',
    providerId,
    message: `Request timed out after ${timeoutMs}ms`,
    recoverable: true,
  });
}
