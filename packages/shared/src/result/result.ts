/**
 * Result<T, E> monad for VERIS.
 *
 * Provides a type-safe way to handle operations that can succeed or fail,
 * without throwing exceptions. Inspired by Rust's Result type.
 *
 * @module @veris/shared/result
 */

/** A successful result. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** A failed result. */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/** Result type — either Ok(value) or Err(error). */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/**
 * Create a successful Result.
 */
export function ok<T, E = never>(value: T): Result<T, E> {
  return { ok: true, value };
}

/**
 * Create a failed Result.
 */
export function err<T = never, E = Error>(error: E): Result<T, E> {
  return { ok: false, error };
}

/**
 * Type guard — check if a Result is Ok.
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

/**
 * Type guard — check if a Result is Err.
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/**
 * Unwrap a Result, returning the value or throwing on Err.
 * Use sparingly — prefer pattern matching with isOk/isErr.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}

/**
 * Unwrap a Result, returning the value or a default on Err.
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (!result.ok) {
    return defaultValue;
  }
  return result.value;
}

/**
 * Unwrap a Result, returning the value or computing a fallback from the error.
 */
export function unwrapOrElse<T, E>(result: Result<T, E>, fallback: (error: E) => T): T {
  if (!result.ok) {
    return fallback(result.error);
  }
  return result.value;
}

/**
 * Map a Result's value using a transform function.
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (!result.ok) {
    return result as unknown as Result<U, E>;
  }
  return ok(fn(result.value));
}

/**
 * Map a Result's error using a transform function.
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (result.ok) {
    return result as unknown as Result<T, F>;
  }
  return err(fn(result.error));
}

/**
 * Chain a Result-producing function on the value.
 */
export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  if (!result.ok) {
    return result as unknown as Result<U, E>;
  }
  return fn(result.value);
}

/**
 * Convert a function that throws into one that returns a Result.
 */
export function tryCatch<T, E = Error>(
  fn: () => T,
  onError: (error: unknown) => E = (e) => e as E,
): Result<T, E> {
  try {
    return ok(fn());
  } catch (error) {
    return err(onError(error));
  }
}

/**
 * Convert a promise-returning function into one that returns a Promise<Result>.
 */
export async function tryCatchAsync<T, E = Error>(
  fn: () => Promise<T>,
  onError: (error: unknown) => E = (e) => e as E,
): Promise<Result<T, E>> {
  try {
    return ok(await fn());
  } catch (error) {
    return err(onError(error));
  }
}

/**
 * Collect an array of Results into a single Result containing an array of values.
 * Returns Err with the first error if any Result is Err.
 */
export function collect<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (!result.ok) {
      return result as unknown as Result<T[], E>;
    }
    values.push(result.value);
  }
  return ok(values);
}
