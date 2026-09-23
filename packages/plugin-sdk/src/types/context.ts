/**
 * Plugin Execution Context and Scoped Utilities.
 *
 * @module @veris/plugin-sdk/types/context
 */

/**
 * Scoped diagnostic logger provided to plugins by the host.
 * Keeps output contained within the host's structured logging pipeline.
 */
export interface PluginLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Cooperative cancellation token interface.
 * Plugins should check `isCancellationRequested` during long-running tasks.
 */
export interface PluginCancellationToken {
  readonly isCancellationRequested: boolean;
  onCancellationRequested?(listener: () => void): { dispose(): void };
}

/**
 * Context provided to plugins during lifecycle events (init, activate).
 */
export interface PluginContext {
  /** The plugin's unique registered ID. */
  readonly pluginId: string;

  /** Host VERIS engine version. */
  readonly verisVersion: string;

  /** Plugin-specific configuration section. */
  readonly config: Readonly<Record<string, unknown>>;

  /** Scoped logger for diagnostics. */
  readonly logger: PluginLogger;

  /** Optional cooperative cancellation token. */
  readonly cancellationToken?: PluginCancellationToken;
}
