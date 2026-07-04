/**
 * Cancellation token for cooperative cancellation.
 *
 * Provides a standardized way to signal and check for cancellation
 * across async operations.
 *
 * @module @veris/shared/types/cancellation
 */

/** Reason for cancellation. */
export interface CancellationReason {
  readonly message: string;
  readonly code?: string;
}

/**
 * A CancellationToken that can be checked for cancellation requests.
 * Created via CancellationTokenSource.
 */
export class CancellationToken {
  private _cancelled = false;
  private _reason: CancellationReason | null = null;
  private readonly _listeners: Array<(reason: CancellationReason) => void> = [];

  /** Whether cancellation has been requested. */
  get isCancelled(): boolean {
    return this._cancelled;
  }

  /** The reason for cancellation, or null if not cancelled. */
  get reason(): CancellationReason | null {
    return this._reason;
  }

  /**
   * Throw if cancellation has been requested.
   * Throws a CancelledError if cancelled.
   */
  throwIfCancelled(): void {
    if (this._cancelled) {
      throw new CancelledError(this._reason?.message ?? 'Operation cancelled');
    }
  }

  /**
   * Register a listener to be called when cancellation is requested.
   * Returns a function to unregister the listener.
   */
  onCancelled(listener: (reason: CancellationReason) => void): () => void {
    this._listeners.push(listener);
    return () => {
      const idx = this._listeners.indexOf(listener);
      if (idx >= 0) this._listeners.splice(idx, 1);
    };
  }

  /** Internal: trigger cancellation. */
  _cancel(reason: CancellationReason): void {
    this._cancelled = true;
    this._reason = reason;
    for (const listener of this._listeners) {
      try {
        listener(reason);
      } catch {
        // Swallow listener errors
      }
    }
  }
}

/** Error thrown when an operation is cancelled. */
export class CancelledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CancelledError';
  }
}

/**
 * Source of CancellationTokens.
 * Call cancel() to signal cancellation to all linked tokens.
 */
export class CancellationTokenSource {
  private readonly _token: CancellationToken = new CancellationToken();

  /** Get the cancellation token associated with this source. */
  get token(): CancellationToken {
    return this._token;
  }

  /** Signal cancellation with an optional reason. */
  cancel(reason?: string): void {
    this._token._cancel({ message: reason ?? 'Operation cancelled' });
  }

  /** Whether cancellation has been requested. */
  get isCancelled(): boolean {
    return this._token.isCancelled;
  }

  /** Create a linked CancellationTokenSource that cancels when this source cancels. */
  createLinkedSource(): CancellationTokenSource {
    const linked = new CancellationTokenSource();
    this._token.onCancelled((reason) => {
      linked.cancel(reason.message);
    });
    return linked;
  }
}
