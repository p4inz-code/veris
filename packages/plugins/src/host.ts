/**
 * Plugin Host for VERIS V2 Plugin Architecture.
 *
 * Central coordinator responsible for:
 * - Discovering local plugins across search paths
 * - Validating manifests and enforcing engine version compatibility
 * - Isolating and loading ESM plugin modules
 * - Managing plugin lifecycle state transitions (init, activate, deactivate, quarantine)
 * - Adapting external plugins to ExtractorRegistry and IRuleRegistry
 * - Preserving scan determinism and offline-first security invariants
 *
 * @module @veris/plugins/host
 */

import type { ExtractorRegistry } from '@veris/extractors';
import type { IRuleRegistry } from '@veris/rules';
import { CancellationToken } from '@veris/shared';

import { createExtractorAdapter } from './adapters/extractor-adapter.js';
import { registerPluginRulePack } from './adapters/rule-adapter.js';
import { PluginDiagnosticsCollector } from './diagnostics.js';
import { DEFAULT_HOST_VERSION, discoverPlugins } from './discovery.js';
import { loadPlugin } from './loader.js';
import { sortPluginsDeterministically } from './manifest.js';
import type {
  DiscoveredPlugin,
  IPluginStateTracker,
  LoadedPlugin,
  PluginContext,
  PluginDiagnostic,
  PluginHostOptions,
  ScopedPluginLogger,
} from './types.js';

export class PluginHost {
  private readonly _options: PluginHostOptions;
  private readonly _diagnostics: PluginDiagnosticsCollector;
  private readonly _discovered = new Map<string, DiscoveredPlugin>();
  private readonly _loaded = new Map<string, LoadedPlugin>();
  private readonly _active = new Map<string, LoadedPlugin>();

  constructor(options: PluginHostOptions = {}) {
    this._options = options;
    this._diagnostics = new PluginDiagnosticsCollector();
  }

  /**
   * Diagnostic log collector for the host.
   */
  get diagnostics(): PluginDiagnosticsCollector {
    return this._diagnostics;
  }

  /**
   * Discover candidate plugins from local search paths.
   */
  async discover(): Promise<readonly DiscoveredPlugin[]> {
    const plugins = await discoverPlugins(this._options, this._diagnostics);
    this._discovered.clear();

    for (const plugin of plugins) {
      this._discovered.set(plugin.manifest.id, plugin);
    }

    return Object.freeze(plugins);
  }

  /**
   * Load and initialize all discovered plugins.
   * Plugins are loaded deterministically in lexicographical ID order.
   */
  async loadAll(cancellationToken?: CancellationToken): Promise<readonly LoadedPlugin[]> {
    if (this._discovered.size === 0) {
      await this.discover();
    }

    const token = cancellationToken ?? new CancellationToken();
    const sortedDiscovered = sortPluginsDeterministically([...this._discovered.values()]);

    for (const discovered of sortedDiscovered) {
      if (token.isCancelled) {
        break;
      }

      const pluginId = discovered.manifest.id;
      const pluginConfig = this._options.pluginConfigs?.[pluginId] ?? {};
      const scopedLogger = this._createScopedLogger(pluginId);

      const context: PluginContext = {
        pluginId,
        verisVersion: this._options.hostVersion ?? DEFAULT_HOST_VERSION,
        config: Object.freeze({ ...pluginConfig }),
        logger: scopedLogger,
        cancellationToken: token,
      };

      const loaded = await loadPlugin(discovered, context, this._diagnostics);

      if (loaded) {
        this._loaded.set(pluginId, loaded);

        // Attempt activation hook
        loaded.stateTracker.transitionTo('active');

        if (loaded.instance.lifecycle?.onActivate) {
          try {
            await loaded.instance.lifecycle.onActivate(context);
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            loaded.stateTracker.recordError(err instanceof Error ? err : new Error(errorMsg));
            loaded.stateTracker.transitionTo('failed', `onActivate() failed: ${errorMsg}`);
            this._diagnostics.error(
              pluginId,
              'PLUGIN_ACTIVATE_FAILED',
              `Plugin "${pluginId}" onActivate() threw an error: ${errorMsg}`,
              { error: errorMsg },
            );
          }
        }

        if (loaded.stateTracker.status === 'active') {
          this._active.set(pluginId, loaded);
        }
      }
    }

    return Object.freeze([...this._loaded.values()]);
  }

  /**
   * Register all active extractor plugins into the given ExtractorRegistry.
   * Returns the count of registered extractors.
   */
  registerExtractors(registry: ExtractorRegistry): number {
    let count = 0;
    const sortedActive = sortPluginsDeterministically([...this._active.values()]);

    for (const loaded of sortedActive) {
      if (loaded.manifest.type === 'extractor') {
        const pluginConfig = this._options.pluginConfigs?.[loaded.manifest.id];
        const adapter = createExtractorAdapter(loaded, {
          diagnostics: this._diagnostics,
          pluginConfig,
        });

        registry.register(adapter);
        count++;
      }
    }

    return count;
  }

  /**
   * Register all active rule-pack plugins into the given IRuleRegistry.
   * Returns the total count of rules registered across all rule packs.
   */
  registerRulePacks(registry: IRuleRegistry): number {
    let count = 0;
    const sortedActive = sortPluginsDeterministically([...this._active.values()]);

    for (const loaded of sortedActive) {
      if (loaded.manifest.type === 'rule-pack') {
        try {
          const rulesRegistered = registerPluginRulePack(registry, loaded);
          count += rulesRegistered;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          loaded.stateTracker.recordError(err instanceof Error ? err : new Error(errorMsg));
          this._diagnostics.error(
            loaded.manifest.id,
            'PLUGIN_RULE_REGISTRATION_FAILED',
            `Failed to register rule pack "${loaded.manifest.id}": ${errorMsg}`,
            { error: errorMsg },
          );
        }
      }
    }

    return count;
  }

  /**
   * Get all loaded plugins.
   */
  getLoadedPlugins(): readonly LoadedPlugin[] {
    return Object.freeze([...this._loaded.values()]);
  }

  /**
   * Get all active plugins.
   */
  getActivePlugins(): readonly LoadedPlugin[] {
    return Object.freeze([...this._active.values()]);
  }

  /**
   * Get a loaded plugin by its ID.
   */
  getPlugin(id: string): LoadedPlugin | undefined {
    return this._loaded.get(id);
  }

  /**
   * Get the state tracker for a plugin.
   */
  getStateTracker(id: string): IPluginStateTracker | undefined {
    return this._loaded.get(id)?.stateTracker;
  }

  /**
   * Get all diagnostics collected by the host.
   */
  getDiagnostics(): readonly PluginDiagnostic[] {
    return this._diagnostics.getAll();
  }

  /**
   * Safely deactivates and cleans up all active plugins.
   */
  async dispose(): Promise<void> {
    for (const loaded of this._active.values()) {
      if (loaded.instance.lifecycle?.onDeactivate) {
        try {
          await loaded.instance.lifecycle.onDeactivate();
        } catch (err) {
          this._diagnostics.warn(
            loaded.manifest.id,
            'PLUGIN_DEACTIVATE_ERROR',
            `onDeactivate() threw an error: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      loaded.stateTracker.transitionTo('deactivated');
    }

    this._active.clear();
  }

  private _createScopedLogger(pluginId: string): ScopedPluginLogger {
    const baseLogger = this._options.logger;
    return {
      debug: (msg, ctx) => baseLogger?.debug(`[plugin:${pluginId}] ${msg}`, ctx),
      info: (msg, ctx) => baseLogger?.info(`[plugin:${pluginId}] ${msg}`, ctx),
      warn: (msg, ctx) => baseLogger?.warn(`[plugin:${pluginId}] ${msg}`, ctx),
      error: (msg, ctx) => baseLogger?.error(`[plugin:${pluginId}] ${msg}`, ctx),
    };
  }
}
