/**
 * Plugin Lifecycle Hooks and States.
 *
 * @module @veris/plugin-sdk/types/lifecycle
 */

import type { PluginContext } from './context.js';
import type { PluginManifest } from './manifest.js';

/**
 * Lifecycle states of a plugin within the VERIS host.
 */
export type PluginStatus =
  'discovered' | 'validated' | 'initialized' | 'active' | 'deactivated' | 'failed' | 'quarantined';

/**
 * Optional lifecycle hooks implemented by plugins.
 */
export interface PluginLifecycle {
  /**
   * Called once when the plugin is loaded into the host environment.
   */
  onInit?(context: PluginContext): Promise<void> | void;

  /**
   * Called when the plugin is activated and registered into engine registries.
   */
  onActivate?(context: PluginContext): Promise<void> | void;

  /**
   * Called during scan shutdown or when the plugin is unloaded.
   * Free all allocated resources, buffers, or cached data.
   */
  onDeactivate?(): Promise<void> | void;
}

/**
 * Base interface for all VERIS plugins.
 */
export interface Plugin {
  /** Validated manifest definition. */
  readonly manifest: PluginManifest;

  /** Optional lifecycle hooks. */
  readonly lifecycle?: PluginLifecycle;
}
