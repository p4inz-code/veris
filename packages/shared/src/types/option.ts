/**
 * Option<T> type — a type-safe alternative to nullable values.
 *
 * Inspired by Rust's Option type and functional programming patterns.
 *
 * @module @veris/shared/types/option
 */

/** Represents a value that is present. */
export interface Some<T> {
  readonly _tag: 'some';
  readonly value: T;
}

/** Represents a value that is absent. */
export interface None {
  readonly _tag: 'none';
}

/** Option type — either Some(value) or None. */
export type Option<T> = Some<T> | None;

/**
 * Create an Option containing a value.
 * Returns None if the value is null or undefined.
 */
export function some<T>(value: T): Option<T> {
  return { _tag: 'some', value };
}

/**
 * Create a None Option.
 */
export function none<T = never>(): Option<T> {
  return { _tag: 'none' };
}

/**
 * Create an Option from a nullable value.
 * Returns Some(value) if value is not null/undefined, None otherwise.
 */
export function fromNullable<T>(value: T | null | undefined): Option<T> {
  return value === null || value === undefined ? none() : some(value);
}

/**
 * Check if an Option is Some.
 */
export function isSome<T>(option: Option<T>): option is Some<T> {
  return option._tag === 'some';
}

/**
 * Check if an Option is None.
 */
export function isNone<T>(option: Option<T>): option is None {
  return option._tag === 'none';
}

/**
 * Unwrap the value from an Option, throwing if None.
 */
export function unwrap<T>(option: Option<T>): T {
  if (option._tag === 'none') throw new Error('Called unwrap on a None value');
  return option.value;
}

/**
 * Unwrap the value or return a default.
 */
export function unwrapOr<T>(option: Option<T>, defaultValue: T): T {
  return option._tag === 'some' ? option.value : defaultValue;
}

/**
 * Map the inner value of an Option.
 */
export function map<T, U>(option: Option<T>, fn: (value: T) => U): Option<U> {
  return option._tag === 'some' ? some(fn(option.value)) : none();
}

/**
 * Apply a side effect to the inner value if present.
 */
export function tap<T>(option: Option<T>, fn: (value: T) => void): Option<T> {
  if (option._tag === 'some') fn(option.value);
  return option;
}
