/**
 * Plugin Loader for VERIS V2 Plugin Host.
 *
 * Implements safe, isolated ESM dynamic loading:
 * - Uses URL-based dynamic import for cross-platform portability (pathToFileURL)
 * - Traps import, syntax, and evaluation errors
 * - Validates exports against ExtractorPlugin or RulePlugin contracts
 * - Enforces declarative purity for Rule Packs (no executable functions)
 * - Executes the onInit() lifecycle hook with scoped context
 * - Integrates with PluginStateTracker and PluginDiagnosticsCollector
 *
 * @module @veris/plugins/loader
 */

import { pathToFileURL } from 'node:url';

import type { PluginDiagnosticsCollector } from './diagnostics.js';
import { PluginStateTracker } from './lifecycle.js';
import type {
  DiscoveredPlugin,
  ExtractorPlugin,
  LoadedPlugin,
  PluginContext,
  RulePlugin,
} from './types.js';

/**
 * Loads and initializes a discovered plugin.
 *
 * Returns the LoadedPlugin record on success, or `null` if validation or initialization fails.
 */
export async function loadPlugin(
  discovered: DiscoveredPlugin,
  context: PluginContext,
  diagnostics?: PluginDiagnosticsCollector,
): Promise<LoadedPlugin | null> {
  const { manifest, entryPointFile, directory } = discovered;
  const stateTracker = new PluginStateTracker(manifest.id);
  stateTracker.transitionTo('validated');

  // Convert absolute file path to a file:// URL for reliable Node ESM dynamic import
  const fileUrl = pathToFileURL(entryPointFile).href;

  let mod: Record<string, unknown>;
  try {
    mod = (await import(fileUrl)) as Record<string, unknown>;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    stateTracker.recordError(err instanceof Error ? err : new Error(errorMsg));
    stateTracker.transitionTo('failed', `Module import failed: ${errorMsg}`);
    diagnostics?.error(
      manifest.id,
      'PLUGIN_LOAD_FAILED',
      `Failed to dynamically import plugin entry point "${entryPointFile}": ${errorMsg}`,
      { error: errorMsg, entryPointFile },
    );
    return null;
  }

  // Extract plugin instance: mod.default, mod.plugin, or mod itself
  const candidate = (mod.default ?? mod.plugin ?? mod) as Record<string, unknown>;

  if (!candidate || typeof candidate !== 'object') {
    stateTracker.transitionTo('failed', 'Plugin export must be an object');
    diagnostics?.error(
      manifest.id,
      'PLUGIN_INVALID_EXPORT',
      `Plugin "${manifest.id}" does not export a valid plugin object`,
    );
    return null;
  }

  // Verify export conforms to declared plugin type
  if (manifest.type === 'extractor') {
    if (typeof candidate.extract !== 'function') {
      stateTracker.transitionTo(
        'failed',
        'Extractor plugin must implement an extract(context) method',
      );
      diagnostics?.error(
        manifest.id,
        'PLUGIN_EXTRACTOR_CONTRACT_VIOLATION',
        `Extractor plugin "${manifest.id}" must implement an extract() function`,
      );
      return null;
    }

    if (candidate.canExtract !== undefined && typeof candidate.canExtract !== 'function') {
      stateTracker.transitionTo('failed', 'canExtract must be a function if defined');
      diagnostics?.error(
        manifest.id,
        'PLUGIN_EXTRACTOR_CONTRACT_VIOLATION',
        `Extractor plugin "${manifest.id}" canExtract property must be a function`,
      );
      return null;
    }
  } else if (manifest.type === 'rule-pack') {
    if (!candidate.rulePack || typeof candidate.rulePack !== 'object') {
      stateTracker.transitionTo('failed', 'Rule plugin must export a declarative rulePack object');
      diagnostics?.error(
        manifest.id,
        'PLUGIN_RULE_CONTRACT_VIOLATION',
        `Rule plugin "${manifest.id}" must export a rulePack object`,
      );
      return null;
    }

    // Invariant: Rule packs must be strictly declarative ASTs with ZERO executable functions
    const purity = checkDeclarativePurity(candidate.rulePack);
    if (!purity.pure) {
      stateTracker.transitionTo(
        'failed',
        `Rule pack is not purely declarative: ${purity.violation}`,
      );
      diagnostics?.error(
        manifest.id,
        'PLUGIN_RULE_NOT_DECLARATIVE',
        `Rule pack in plugin "${manifest.id}" contains executable functions or forbidden types: ${purity.violation}`,
        { violation: purity.violation },
      );
      return null;
    }
  }

  // Execute onInit lifecycle hook if present
  const instance = candidate as unknown as ExtractorPlugin | RulePlugin;

  if (instance.lifecycle?.onInit) {
    try {
      await instance.lifecycle.onInit(context);
      stateTracker.transitionTo('initialized');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      stateTracker.recordError(err instanceof Error ? err : new Error(errorMsg));
      stateTracker.transitionTo('failed', `onInit() hook failed: ${errorMsg}`);
      diagnostics?.error(
        manifest.id,
        'PLUGIN_INIT_FAILED',
        `Plugin "${manifest.id}" onInit() hook threw an exception: ${errorMsg}`,
        { error: errorMsg },
      );
      return null;
    }
  } else {
    stateTracker.transitionTo('initialized');
  }

  return {
    id: manifest.id,
    manifest,
    directory,
    entryPointFile,
    instance,
    stateTracker,
  };
}

const FORBIDDEN_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_PURITY_DEPTH = 50;

/**
 * Recursively verifies that an object contains only JSON-primitive values and data structures,
 * strictly forbidding functions, classes, symbols, executable callbacks, accessor properties,
 * prototype pollution keys, circular structures, and custom prototypes.
 */
export function checkDeclarativePurity(
  target: unknown,
  currentPath: string = 'rulePack',
  visited: Set<unknown> = new Set(),
  depth: number = 0,
): { pure: boolean; violation?: string } {
  if (target === null || target === undefined) {
    return { pure: true };
  }

  if (depth > MAX_PURITY_DEPTH) {
    return {
      pure: false,
      violation: `Maximum nesting depth exceeded (${MAX_PURITY_DEPTH}) at "${currentPath}"`,
    };
  }

  const type = typeof target;

  if (type === 'function') {
    return {
      pure: false,
      violation: `Executable function found at "${currentPath}"`,
    };
  }

  if (type === 'symbol') {
    return {
      pure: false,
      violation: `Symbol found at "${currentPath}"`,
    };
  }

  if (type === 'string' || type === 'number' || type === 'boolean') {
    return { pure: true };
  }

  if (type === 'object') {
    if (visited.has(target)) {
      return {
        pure: false,
        violation: `Circular structure detected at "${currentPath}"`,
      };
    }
    visited.add(target);

    if (Array.isArray(target)) {
      for (let i = 0; i < target.length; i++) {
        const res = checkDeclarativePurity(target[i], `${currentPath}[${i}]`, visited, depth + 1);
        if (!res.pure) return res;
      }
      return { pure: true };
    }

    // Verify plain object prototype
    const proto = Object.getPrototypeOf(target);
    if (proto !== Object.prototype && proto !== null) {
      return {
        pure: false,
        violation: `Non-plain object with custom prototype at "${currentPath}"`,
      };
    }

    // Inspect own property descriptors to prevent getters/setters and prototype poisoning
    const descriptors = Object.getOwnPropertyDescriptors(target);
    for (const [key, desc] of Object.entries(descriptors)) {
      if (FORBIDDEN_OBJECT_KEYS.has(key)) {
        return {
          pure: false,
          violation: `Forbidden prototype poisoning property "${key}" at "${currentPath}"`,
        };
      }
      if (desc.get || desc.set) {
        return {
          pure: false,
          violation: `Accessor property (getter/setter) "${key}" found at "${currentPath}"`,
        };
      }
      const res = checkDeclarativePurity(desc.value, `${currentPath}.${key}`, visited, depth + 1);
      if (!res.pure) return res;
    }

    return { pure: true };
  }

  return {
    pure: false,
    violation: `Unsupported data type "${type}" at "${currentPath}"`,
  };
}
