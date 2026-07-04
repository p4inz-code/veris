/**
 * Fetch-with-timeout — shared timeout and cancellation helper for provider adapters.
 *
 * Every adapter performs fetch requests with a configurable timeout. This helper
 * eliminates the duplicated `AbortController` + `setTimeout` + `clearTimeout` +
 * DOMException-to-ProviderError conversion pattern across all adapters.
 *
 * ## Usage
 *
 * ```typescript
 * const response = await executeFetchWithTimeout(url, options, this.timeoutMs, this.id);
 * ```
 *
 * On timeout, throws a `ProviderError` with code `TIMEOUT`.
 * On network error, throws a `ProviderError` with code `PROVIDER_UNAVAILABLE`.
 *
 * @module @veris/ai/providers/fetch-with-timeout
 */

import { ProviderError } from './errors.js';

/**
 * Execute a fetch request with a timeout.
 *
 * The timer is always cleared in the finally block to prevent
 * timer leaks and retained closures.
 *
 * @param url - The URL to fetch
 * @param options - Standard fetch RequestInit options
 * @param timeoutMs - Timeout in milliseconds
 * @param providerId - Provider ID for error reporting
 * @returns The fetch Response
 * @throws {ProviderError} TIMEOUT if the request times out
 * @throws {ProviderError} PROVIDER_UNAVAILABLE on network errors
 */
export async function executeFetchWithTimeout(
  url: string | URL,
  options: RequestInit,
  timeoutMs: number,
  providerId: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ProviderError({
        code: 'TIMEOUT',
        providerId,
        message: `Request timed out after ${timeoutMs}ms`,
        recoverable: true,
      });
    }
    if (error instanceof ProviderError) throw error;
    throw new ProviderError({
      code: 'PROVIDER_UNAVAILABLE',
      providerId,
      message: error instanceof Error ? error.message : 'Unknown network error',
      recoverable: true,
      cause: error,
    });
  } finally {
    clearTimeout(timer);
  }
}
