/**
 * Knowledge Pack Registry — manages loading, unloading, listing, and resolving packs.
 *
 * @module @veris/knowledge/packs/registry
 */

import { createPackDiagnostics } from './diagnostics.js';
import type { PackDiagnostics } from './diagnostics.js';
import { loadPackFromFile } from './loader.js';
import {
  type KnowledgePack,
  type PackMetadata,
  type PackError,
  type PackLoadResult,
} from './types.js';
import type { ValidationResult } from './validator.js';
import { validatePackFile } from './validator.js';

/** Registry configuration. */
export interface RegistryConfig {
  readonly strict?: boolean;
  readonly validateOnLoad?: boolean;
  readonly packDirectories?: readonly string[];
}

/** Registry event types. */
export type RegistryEvent = 'pack-loaded' | 'pack-unloaded' | 'pack-failed' | 'pack-reloaded';

/** Registry event handler. */
export type RegistryEventHandler = (
  event: RegistryEvent,
  packId: string,
  details?: Record<string, unknown>,
) => void;

/**
 * Knowledge Pack Registry — manages all loaded packs.
 */
export class PackRegistry {
  private readonly _packs: Map<string, KnowledgePack> = new Map();
  private readonly _loadOrder: string[] = [];
  private readonly _failedPacks: Map<string, PackError[]> = new Map();
  private readonly _listeners: Set<RegistryEventHandler> = new Set();
  private readonly _config: Required<RegistryConfig>;
  private _diagnostics: PackDiagnostics;

  constructor(config?: RegistryConfig) {
    this._config = {
      strict: config?.strict ?? false,
      validateOnLoad: config?.validateOnLoad ?? true,
      packDirectories: config?.packDirectories ?? [],
    };
    this._diagnostics = createPackDiagnostics();
  }

  get size(): number {
    return this._packs.size;
  }

  get loadOrder(): readonly string[] {
    return [...this._loadOrder];
  }

  get diagnostics(): PackDiagnostics {
    return this._diagnostics;
  }

  get config(): Required<RegistryConfig> {
    return { ...this._config };
  }

  subscribe(handler: RegistryEventHandler): () => void {
    this._listeners.add(handler);
    return () => this._listeners.delete(handler);
  }

  load(pack: KnowledgePack, _source?: string): PackLoadResult {
    const errors: PackError[] = [];
    const warnings: string[] = [];
    const packId = pack.metadata.id;

    if (this._packs.has(packId)) {
      const existing = this._packs.get(packId)!;
      if (existing.metadata.version !== pack.metadata.version) {
        errors.push({
          code: 'VERSION_CONFLICT',
          message: `Pack "${packId}" version ${existing.metadata.version} already loaded. Cannot load version ${pack.metadata.version}.`,
          packId,
        });
        this._failedPacks.set(packId, errors);
        this._emit('pack-failed', packId, { errors });
        return { errors, warnings };
      }
      errors.push({
        code: 'ALREADY_LOADED',
        message: `Pack "${packId}" is already loaded.`,
        packId,
      });
      this._failedPacks.set(packId, errors);
      this._emit('pack-failed', packId, { errors });
      return { errors, warnings };
    }

    this._packs.set(packId, pack);
    this._loadOrder.push(packId);
    this._diagnostics = createPackDiagnostics({
      loadedPacks: [...this._diagnostics.loadedPacks, packId],
      totalPacks: this._packs.size,
    });
    this._emit('pack-loaded', packId, { entries: pack.entries.length });

    return { pack, errors: [], warnings: [] };
  }

  async loadFromFile(filePath: string): Promise<PackLoadResult> {
    const result = await loadPackFromFile(filePath, this._config.validateOnLoad);
    if (result.pack) {
      return this.load(result.pack, filePath);
    }
    return { errors: result.errors, warnings: result.warnings };
  }

  unload(packId: string): boolean {
    const removed = this._packs.delete(packId);
    if (removed) {
      const idx = this._loadOrder.indexOf(packId);
      if (idx >= 0) this._loadOrder.splice(idx, 1);
      this._failedPacks.delete(packId);
      this._diagnostics = createPackDiagnostics({
        loadedPacks: [...this._loadOrder],
        totalPacks: this._packs.size,
      });
      this._emit('pack-unloaded', packId);
    }
    return removed;
  }

  reload(pack: KnowledgePack): PackLoadResult {
    this.unload(pack.metadata.id);
    return this.load(pack);
  }

  lookup(packId: string): KnowledgePack | undefined {
    return this._packs.get(packId);
  }

  list(): readonly string[] {
    return [...this._loadOrder];
  }

  listWithMetadata(): PackMetadata[] {
    return this._loadOrder.map((id) => this._packs.get(id)!.metadata);
  }

  resolveDependencies(packId: string): { satisfied: boolean; missing: string[] } {
    const pack = this._packs.get(packId);
    if (!pack) return { satisfied: false, missing: [packId] };

    const missing: string[] = [];
    for (const dep of pack.metadata.dependencies) {
      if (!this._packs.has(dep.id) && !dep.optional) {
        missing.push(dep.id);
      }
    }
    return { satisfied: missing.length === 0, missing };
  }

  detectConflicts(): string[] {
    const conflicts: string[] = [];
    const seen = new Map<string, string>();
    for (const [id, pack] of this._packs) {
      if (seen.has(id) && seen.get(id) !== pack.metadata.version) {
        conflicts.push(`Version conflict for "${id}": ${seen.get(id)} vs ${pack.metadata.version}`);
      }
      seen.set(id, pack.metadata.version);
    }
    return conflicts;
  }

  getFailedPacks(): Map<string, PackError[]> {
    return this._failedPacks;
  }

  clear(): void {
    this._packs.clear();
    this._loadOrder.length = 0;
    this._failedPacks.clear();
    this._diagnostics = createPackDiagnostics();
  }

  searchByCategory(category: string): KnowledgePack[] {
    const results: KnowledgePack[] = [];
    for (const pack of this._packs.values()) {
      if (pack.metadata.categories.includes(category)) {
        results.push(pack);
      }
    }
    return results;
  }

  searchByTag(tag: string): KnowledgePack[] {
    const results: KnowledgePack[] = [];
    for (const pack of this._packs.values()) {
      if (pack.metadata.tags.includes(tag)) {
        results.push(pack);
      }
    }
    return results;
  }

  getEntriesByCategory(
    category: string,
  ): Array<{ pack: KnowledgePack; entry: KnowledgePack['entries'][number] }> {
    const results: Array<{ pack: KnowledgePack; entry: KnowledgePack['entries'][number] }> = [];
    for (const pack of this._packs.values()) {
      for (const entry of pack.entries) {
        if (entry.category === category) {
          results.push({ pack, entry });
        }
      }
    }
    return results;
  }

  private _emit(event: RegistryEvent, packId: string, details?: Record<string, unknown>): void {
    for (const handler of this._listeners) {
      try {
        handler(event, packId, details);
      } catch {
        /* swallow */
      }
    }
  }
}
