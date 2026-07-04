/**
 * FeatureRegistry — registers and discovers feature type handlers.
 *
 * Provides a registry mapping canonical FeatureTypes to their handlers,
 * enabling extensible feature processing.
 *
 * @module @veris/knowledge/feature/registry
 */

import type { Feature, FeatureType } from './types.js';

/** Handler function for a specific FeatureType. */
export type FeatureHandler = (feature: Feature) => Feature | null;

/** Registry entry mapping a FeatureType to its handler. */
interface RegistryEntry {
  readonly type: FeatureType;
  readonly handler: FeatureHandler;
  readonly priority: number;
  readonly description: string;
}

/**
 * Registry for feature type handlers.
 *
 * Handlers can be registered for specific FeatureTypes and are invoked
 * during feature processing to enrich, filter, or transform features.
 */
export class FeatureRegistry {
  private readonly _entries: Map<string, RegistryEntry[]> = new Map();

  /**
   * Register a handler for a FeatureType.
   *
   * @param type - The canonical FeatureType to handle
   * @param handler - Handler function (returns null to filter out, or Feature to keep/enrich)
   * @param options - Optional configuration
   */
  register(
    type: FeatureType,
    handler: FeatureHandler,
    options?: { priority?: number; description?: string },
  ): void {
    const entry: RegistryEntry = {
      type,
      handler,
      priority: options?.priority ?? 100,
      description: options?.description ?? '',
    };

    const existing = this._entries.get(type) ?? [];
    existing.push(entry);
    // Sort by priority (lower = runs first)
    existing.sort((a, b) => a.priority - b.priority);
    this._entries.set(type, existing);
  }

  /**
   * Unregister all handlers for a FeatureType.
   */
  unregister(type: FeatureType): void {
    this._entries.delete(type);
  }

  /**
   * Get all handlers for a FeatureType, sorted by priority.
   */
  getHandlers(type: FeatureType): readonly FeatureHandler[] {
    return this._entries.get(type)?.map((e) => e.handler) ?? [];
  }

  /**
   * Check if any handlers are registered for a FeatureType.
   */
  hasHandlers(type: FeatureType): boolean {
    return (this._entries.get(type)?.length ?? 0) > 0;
  }

  /**
   * Get all registered FeatureTypes.
   */
  getRegisteredTypes(): readonly FeatureType[] {
    return Array.from(this._entries.keys()).sort() as FeatureType[];
  }

  /**
   * Process a feature through all registered handlers for its type.
   * Returns the processed feature, or null if filtered out.
   */
  processFeature(feature: Feature): Feature | null {
    const handlers = this._entries.get(feature.type);
    if (!handlers || handlers.length === 0) {
      return feature;
    }

    let current: Feature | null = feature;
    for (const entry of handlers) {
      current = entry.handler(current);
      if (current === null) {
        return null; // Filtered out
      }
    }

    return current;
  }

  /**
   * Process a batch of features through their registered handlers.
   */
  processBatch(features: readonly Feature[]): Feature[] {
    const result: Feature[] = [];
    for (const feature of features) {
      const processed = this.processFeature(feature);
      if (processed !== null) {
        result.push(processed);
      }
    }
    return result;
  }

  /** Clear all registered handlers. */
  clear(): void {
    this._entries.clear();
  }

  /** Get the number of registered handler entries. */
  get size(): number {
    let count = 0;
    for (const entries of this._entries.values()) {
      count += entries.length;
    }
    return count;
  }
}
