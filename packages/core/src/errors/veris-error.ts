/**
 * Base error hierarchy for VERIS.
 *
 * All errors in VERIS extend VerisError, providing:
 * - Immutable error objects
 * - Hierarchical error codes
 * - Categories for grouping
 * - Nested cause chains
 * - Serializable to JSON
 * - Diagnostic metadata
 * - User-safe messages and internal debugging context
 *
 * @module @veris/core/errors/veris-error
 */

/** Error category for grouping and filtering. */
export type ErrorCategory =
  'validation' | 'parse' | 'extract' | 'rule' | 'config' | 'io' | 'internal' | 'security';

/** Serialized error format (JSON-safe). */
export interface SerializedError {
  readonly name: string;
  readonly code: string;
  readonly category: ErrorCategory;
  readonly message: string;
  readonly userMessage: string;
  readonly cause: SerializedError | null;
  readonly stack: string | null;
  readonly metadata: Record<string, unknown>;
}

/**
 * Base error class for all VERIS errors.
 *
 * Features:
 * - Immutable (no public setters)
 * - Error code for programmatic handling
 * - Category for grouping
 * - Nested cause support
 * - Serializable via toJSON()
 * - Separate user-safe and internal messages
 * - Diagnostic metadata
 */
export class VerisError extends Error {
  /** Error code (e.g., "PARSE_001", "EXTRACT_042"). */
  public readonly code: string;

  /** Error category for grouping. */
  public readonly category: ErrorCategory;

  /** User-safe error message (no internal details). */
  public readonly userMessage: string;

  /** Nested cause error, if any. */
  public readonly cause: Error | null;

  /** Diagnostic metadata (internal, not user-facing). */
  public readonly metadata: Readonly<Record<string, unknown>>;

  constructor(params: {
    code: string;
    category: ErrorCategory;
    message: string;
    userMessage?: string;
    cause?: Error | null;
    metadata?: Record<string, unknown>;
  }) {
    super(params.message);
    this.name = 'VerisError';
    this.code = params.code;
    this.category = params.category;
    this.userMessage = params.userMessage ?? params.message;
    this.cause = params.cause ?? null;
    this.metadata = Object.freeze({ ...(params.metadata ?? {}) });

    // Ensure prototype chain is correct
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Serialize to a plain JSON-safe object.
   * Includes all fields including stack trace.
   */
  toJSON(): SerializedError {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      message: this.message,
      userMessage: this.userMessage,
      cause: this.cause instanceof VerisError ? this.cause.toJSON() : null,
      stack: this.stack ?? null,
      metadata: { ...this.metadata },
    };
  }

  /**
   * Create a new error with additional metadata.
   * Returns a new instance (immutable pattern).
   */
  withMetadata(extra: Record<string, unknown>): VerisError {
    return new VerisError({
      code: this.code,
      category: this.category,
      message: this.message,
      userMessage: this.userMessage,
      cause: this.cause,
      metadata: { ...this.metadata, ...extra },
    });
  }

  /**
   * Get the full error chain as an array of errors.
   * [this, cause, cause.cause, ...]
   */
  getChain(): VerisError[] {
    const chain: VerisError[] = [this];
    let current = this.cause;
    while (current instanceof VerisError) {
      chain.push(current);
      current = current.cause;
    }
    return chain;
  }
}
