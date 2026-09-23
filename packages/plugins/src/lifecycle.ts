/**
 * Plugin Lifecycle State Machine and Quarantine Policy.
 *
 * @module @veris/plugins/lifecycle
 */

import type { IPluginStateTracker, PluginStatus, StateTransitionEvent } from './types.js';

export const MAX_CONSECUTIVE_ERRORS_BEFORE_QUARANTINE = 3;

export type { StateTransitionEvent, IPluginStateTracker };

/**
 * Manages runtime lifecycle transitions and error-containment tracking for a plugin.
 */
export class PluginStateTracker implements IPluginStateTracker {
  private _status: PluginStatus = 'discovered';
  private _consecutiveErrors: number = 0;
  private readonly _transitions: StateTransitionEvent[] = [];

  constructor(readonly pluginId: string) {}

  get status(): PluginStatus {
    return this._status;
  }

  get consecutiveErrors(): number {
    return this._consecutiveErrors;
  }

  get transitions(): readonly StateTransitionEvent[] {
    return this._transitions;
  }

  /**
   * Transition to a new lifecycle state.
   */
  transitionTo(to: PluginStatus, reason?: string): void {
    const from = this._status;
    // Security guard: Quarantined plugins cannot be silently transitioned back to active
    if (from === 'quarantined' && to === 'active') {
      return;
    }

    this._status = to;
    this._transitions.push({
      pluginId: this.pluginId,
      from,
      to,
      reason,
      timestamp: Date.now(),
    });
  }

  /**
   * Record a plugin error. If errors exceed the threshold, automatically quarantines the plugin.
   * Returns true if the plugin was quarantined as a result of this error.
   */
  recordError(error: Error | string): boolean {
    this._consecutiveErrors++;
    const message = error instanceof Error ? error.message : String(error);

    if (this._consecutiveErrors >= MAX_CONSECUTIVE_ERRORS_BEFORE_QUARANTINE) {
      this.transitionTo(
        'quarantined',
        `Quarantined after ${this._consecutiveErrors} consecutive errors. Last error: ${message}`,
      );
      return true;
    }

    return false;
  }

  /**
   * Reset consecutive error count on successful execution (no-op if quarantined).
   */
  recordSuccess(): void {
    if (this._status !== 'quarantined') {
      this._consecutiveErrors = 0;
    }
  }

  /**
   * Explicitly unquarantines the plugin (administrative override).
   */
  unquarantine(reason: string = 'Administratively unquarantined'): void {
    if (this._status === 'quarantined') {
      this._consecutiveErrors = 0;
      this._status = 'active';
      this._transitions.push({
        pluginId: this.pluginId,
        from: 'quarantined',
        to: 'active',
        reason,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Whether the plugin is currently permitted to execute work.
   */
  canExecute(): boolean {
    return this._status === 'active';
  }
}
