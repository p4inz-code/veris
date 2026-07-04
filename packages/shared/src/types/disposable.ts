/**
 * Disposable and AsyncDisposable interfaces.
 *
 * Provides standard disposability patterns for resource management.
 *
 * @module @veris/shared/types/disposable
 */

/**
 * A resource that can be disposed synchronously.
 */
export interface Disposable {
  /** Release all resources held by this object. */
  dispose(): void;
}

/**
 * A resource that can be disposed asynchronously.
 */
export interface AsyncDisposable {
  /** Release all resources held by this object asynchronously. */
  dispose(): Promise<void>;
}

/**
 * Helper to run a Disposable resource and ensure cleanup.
 */
export function using<T extends Disposable, R>(resource: T, fn: (resource: T) => R): R {
  try {
    return fn(resource);
  } finally {
    resource.dispose();
  }
}

/**
 * Helper to run an AsyncDisposable resource and ensure cleanup.
 */
export async function usingAsync<T extends AsyncDisposable, R>(
  resource: T,
  fn: (resource: T) => Promise<R>,
): Promise<R> {
  try {
    return await fn(resource);
  } finally {
    await resource.dispose();
  }
}
