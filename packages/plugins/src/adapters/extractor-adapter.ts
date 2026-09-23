/**
 * Extractor Adapter for VERIS V2 Plugin Host.
 *
 * Bridges external ExtractorPlugin implementations into internal Extractor instances
 * consumable by ExtractorRegistry.
 *
 * Enforces:
 * - Capability boundaries (target-read gating for content buffer)
 * - Error containment & auto-quarantine via PluginStateTracker
 * - Output validation (ensuring raw features only; prohibiting findings/risk scores)
 * - Cooperative cancellation propagation
 * - Deterministic diagnostics reporting
 *
 * @module @veris/plugins/adapters/extractor-adapter
 */

import type { ArtifactType } from '@veris/core';
import type { Extractor, ExtractionContext, ExtractionResult, RawFeature } from '@veris/extractors';
import { CancellationToken } from '@veris/shared';

import type { PluginDiagnosticsCollector } from '../diagnostics.js';
import type {
  ExtractorPlugin,
  LoadedPlugin,
  PluginExtractionContext,
  PluginRawFeature,
  ScopedPluginLogger,
} from '../types.js';

export const DEFAULT_PLUGIN_EXTRACTOR_PRIORITY = 600;
export const DEFAULT_PLUGIN_EXTRACTION_TIMEOUT_MS = 30000;
export const MAX_PLUGIN_FEATURES_PER_EXTRACTION = 5000;
export const MAX_PLUGIN_FEATURE_VALUE_BYTES = 1024 * 1024; // 1 MB
export const MAX_PLUGIN_METADATA_KEYS = 100;

/**
 * Creates an internal Extractor instance from a loaded ExtractorPlugin.
 */
export function createExtractorAdapter(
  loaded: LoadedPlugin,
  options?: {
    priority?: number;
    diagnostics?: PluginDiagnosticsCollector;
    pluginConfig?: Record<string, unknown>;
    timeoutMs?: number;
  },
): Extractor {
  return new PluginExtractorAdapter(loaded, options);
}

export class PluginExtractorAdapter implements Extractor {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly supportedArtifactTypes: readonly ArtifactType[];
  readonly priority: number;

  private readonly _loaded: LoadedPlugin;
  private readonly _plugin: ExtractorPlugin;
  private readonly _diagnostics?: PluginDiagnosticsCollector;
  private readonly _pluginConfig: Readonly<Record<string, unknown>>;
  private readonly _timeoutMs: number;

  constructor(
    loaded: LoadedPlugin,
    options?: {
      priority?: number;
      diagnostics?: PluginDiagnosticsCollector;
      pluginConfig?: Record<string, unknown>;
      timeoutMs?: number;
    },
  ) {
    this._loaded = loaded;
    this._plugin = loaded.instance as ExtractorPlugin;
    this._diagnostics = options?.diagnostics;
    this._pluginConfig = Object.freeze({ ...(options?.pluginConfig ?? {}) });
    this._timeoutMs = options?.timeoutMs ?? DEFAULT_PLUGIN_EXTRACTION_TIMEOUT_MS;

    this.id = loaded.manifest.id;
    this.name = loaded.manifest.name;
    this.version = loaded.manifest.version;
    this.priority = options?.priority ?? DEFAULT_PLUGIN_EXTRACTOR_PRIORITY;

    const manifestTypes = loaded.manifest.supportedArtifactTypes ?? [];
    this.supportedArtifactTypes = Object.freeze([...(manifestTypes as ArtifactType[])]);
  }

  canExtract(context: ExtractionContext): boolean {
    // 1. Quarantined or failed plugins cannot execute
    if (!this._loaded.stateTracker.canExecute()) {
      return false;
    }

    // 2. Artifact type match against declared manifest capabilities
    if (
      this.supportedArtifactTypes.length > 0 &&
      !this.supportedArtifactTypes.includes(context.artifact.type as ArtifactType)
    ) {
      return false;
    }

    // 3. Delegate to plugin's canExtract if implemented
    if (typeof this._plugin.canExtract === 'function') {
      try {
        const pluginContext = this._buildPluginContext(context);
        return Boolean(this._plugin.canExtract(pluginContext));
      } catch (err) {
        // Record error on state tracker for canExtract failures to prevent unquarantined error loops
        this._loaded.stateTracker.recordError(err instanceof Error ? err : new Error(String(err)));
        this._diagnostics?.warn(
          this.id,
          'PLUGIN_CAN_EXTRACT_ERROR',
          `Plugin canExtract threw an error: ${err instanceof Error ? err.message : String(err)}`,
        );
        return false;
      }
    }

    return true;
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const startTime = Date.now();

    // Guard 1: Cancellation check before invocation
    if (context.cancellationToken?.isCancelled) {
      return Object.freeze({
        features: Object.freeze([]),
        diagnostics: Object.freeze({
          extractorId: this.id,
          skipped: true,
          skipReason: 'Cancellation requested',
          startTime,
          endTime: Date.now(),
          durationMs: 0,
          bytesProcessed: 0,
          featuresEmitted: 0,
          issues: Object.freeze([]),
        }),
      });
    }

    // Guard 2: Check if plugin is permitted to execute
    if (!this._loaded.stateTracker.canExecute()) {
      return Object.freeze({
        features: Object.freeze([]),
        diagnostics: Object.freeze({
          extractorId: this.id,
          skipped: true,
          skipReason: `Plugin is in status "${this._loaded.stateTracker.status}"`,
          startTime,
          endTime: Date.now(),
          durationMs: 0,
          bytesProcessed: 0,
          featuresEmitted: 0,
          issues: Object.freeze([]),
        }),
      });
    }

    const pluginContext = this._buildPluginContext(context);
    const bytesToProcess = context.content?.byteLength ?? context.artifact.size ?? 0;

    try {
      // Execute with timeout race to prevent runaway/hanging plugins
      let timer: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Plugin extraction timed out after ${this._timeoutMs}ms`));
        }, this._timeoutMs);
        timer.unref?.();
      });

      const rawPluginFeatures = await Promise.race([
        this._plugin.extract(pluginContext),
        timeoutPromise,
      ]).finally(() => {
        if (timer) clearTimeout(timer);
      });

      // Cancellation check after execution
      if (context.cancellationToken?.isCancelled) {
        return Object.freeze({
          features: Object.freeze([]),
          diagnostics: Object.freeze({
            extractorId: this.id,
            skipped: true,
            skipReason: 'Cancellation requested',
            startTime,
            endTime: Date.now(),
            durationMs: Date.now() - startTime,
            bytesProcessed: 0,
            featuresEmitted: 0,
            issues: Object.freeze([]),
          }),
        });
      }

      const endTime = Date.now();

      // Successful execution resets consecutive failure counter
      this._loaded.stateTracker.recordSuccess();

      // Validate and sanitize features (Inviolable Invariant: RAW FEATURES ONLY)
      const sanitizedFeatures: RawFeature[] = [];
      const issues: Array<{
        extractorId: string;
        code: string;
        message: string;
        isError: boolean;
      }> = [];

      if (Array.isArray(rawPluginFeatures)) {
        let featureCount = 0;
        for (const raw of rawPluginFeatures) {
          if (!raw || typeof raw !== 'object') {
            continue;
          }

          // Enforce maximum features per extraction to prevent memory exhaustion
          if (++featureCount > MAX_PLUGIN_FEATURES_PER_EXTRACTION) {
            this._diagnostics?.warn(
              this.id,
              'PLUGIN_FEATURE_LIMIT_EXCEEDED',
              `Extractor "${this.id}" exceeded maximum feature limit (${MAX_PLUGIN_FEATURES_PER_EXTRACTION}); remaining discarded`,
            );
            issues.push({
              extractorId: this.id,
              code: 'FEATURE_LIMIT_EXCEEDED',
              message: `Extractor exceeded feature limit (${MAX_PLUGIN_FEATURES_PER_EXTRACTION})`,
              isError: false,
            });
            break;
          }

          // Security Guardrail: Reject any attempts by extractors to emit findings or risk scores
          const candidateRecord = raw as Record<string, unknown>;
          if (
            'finding' in candidateRecord ||
            'findings' in candidateRecord ||
            'riskScore' in candidateRecord ||
            'cve' in candidateRecord
          ) {
            this._diagnostics?.warn(
              this.id,
              'PLUGIN_ILLEGAL_FINDING_FEATURE',
              `Extractor "${this.id}" attempted to emit findings/riskScore in a raw feature; discarded`,
            );
            issues.push({
              extractorId: this.id,
              code: 'ILLEGAL_FEATURE_PAYLOAD',
              message: 'Extractor attempted to emit findings or riskScore; feature rejected',
              isError: false,
            });
            continue;
          }

          const rawFeature = raw as PluginRawFeature;
          const confidence =
            typeof rawFeature.confidence === 'number' && !Number.isNaN(rawFeature.confidence)
              ? Math.max(0, Math.min(1, rawFeature.confidence))
              : 1.0;

          // Sanitize type string
          const safeType = String(rawFeature.type ?? 'custom-feature')
            .replace(/[\x00-\x1F\x7F]/g, '')
            .trim()
            .slice(0, 100);

          // Deep sanitize feature value and metadata against prototype pollution and circular references
          const safeVal = sanitizePluginValue(rawFeature.value);
          const safeMeta = rawFeature.metadata
            ? (sanitizePluginValue(rawFeature.metadata) as Record<string, unknown>)
            : undefined;

          sanitizedFeatures.push({
            extractorId: this.id,
            type: safeType || 'custom-feature',
            value: safeVal,
            confidence,
            location: rawFeature.location,
            metadata: safeMeta ? Object.freeze({ ...safeMeta }) : undefined,
          });
        }
      }

      // Deterministic feature sorting
      sortFeaturesDeterministically(sanitizedFeatures);

      return Object.freeze({
        features: Object.freeze(sanitizedFeatures.map((f) => Object.freeze(f))),
        diagnostics: Object.freeze({
          extractorId: this.id,
          skipped: false,
          startTime,
          endTime,
          durationMs: endTime - startTime,
          bytesProcessed: bytesToProcess,
          featuresEmitted: sanitizedFeatures.length,
          issues: Object.freeze(issues),
        }),
      });
    } catch (err) {
      const endTime = Date.now();
      const errorMsg = err instanceof Error ? err.message : String(err);

      // Record failure in state tracker — auto-quarantines after 3 consecutive failures
      const quarantined = this._loaded.stateTracker.recordError(
        err instanceof Error ? err : new Error(errorMsg),
      );

      this._diagnostics?.error(
        this.id,
        quarantined ? 'PLUGIN_QUARANTINED' : 'PLUGIN_EXTRACTION_ERROR',
        `Plugin extraction failed: ${errorMsg}${quarantined ? ' (QUARANTINED)' : ''}`,
        { error: errorMsg, quarantined },
      );

      const issues: Array<{
        extractorId: string;
        code: string;
        message: string;
        isError: boolean;
      }> = [
        {
          extractorId: this.id,
          code: 'PLUGIN_EXTRACTION_ERROR',
          message: errorMsg,
          isError: true,
        },
      ];

      if (quarantined) {
        issues.push({
          extractorId: this.id,
          code: 'PLUGIN_QUARANTINED',
          message: 'Plugin quarantined after 3 consecutive failures',
          isError: true,
        });
      }

      return Object.freeze({
        features: Object.freeze([]),
        diagnostics: Object.freeze({
          extractorId: this.id,
          skipped: false,
          startTime,
          endTime,
          durationMs: endTime - startTime,
          bytesProcessed: 0,
          featuresEmitted: 0,
          issues: Object.freeze(issues),
        }),
      });
    }
  }

  /**
   * Constructs the scoped PluginExtractionContext, strictly enforcing capability boundaries.
   */
  private _buildPluginContext(context: ExtractionContext): PluginExtractionContext {
    const hasTargetRead = this._loaded.manifest.capabilities.includes('target-read');

    // Capability Boundary: content buffer is null if 'target-read' capability is not granted
    const content = hasTargetRead ? context.content : null;

    const logger: ScopedPluginLogger = {
      debug: (msg, ctx) => context.logger?.debug(`[plugin:${this.id}] ${msg}`, ctx),
      info: (msg, ctx) => context.logger?.info(`[plugin:${this.id}] ${msg}`, ctx),
      warn: (msg, ctx) => context.logger?.warn(`[plugin:${this.id}] ${msg}`, ctx),
      error: (msg, ctx) => context.logger?.error(`[plugin:${this.id}] ${msg}`, ctx),
    };

    return Object.freeze({
      artifact: context.artifact,
      content,
      logger,
      config: this._pluginConfig,
      cancellationToken: context.cancellationToken ?? new CancellationToken(),
    });
  }
}

function isSafeKey(key: string): boolean {
  return key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
}

function sanitizePluginValue(
  val: unknown,
  depth: number = 0,
  visited: Set<unknown> = new Set(),
): unknown {
  if (val === null || val === undefined) return val;
  if (depth > 20) return undefined;
  const type = typeof val;
  if (type === 'string' || type === 'number' || type === 'boolean') {
    if (type === 'string' && (val as string).length > MAX_PLUGIN_FEATURE_VALUE_BYTES) {
      return (val as string).slice(0, MAX_PLUGIN_FEATURE_VALUE_BYTES);
    }
    return val;
  }
  if (type === 'function' || type === 'symbol') {
    return undefined;
  }
  if (type === 'object') {
    if (visited.has(val)) return undefined; // Break circular references
    visited.add(val);

    if (Array.isArray(val)) {
      const arr: unknown[] = [];
      for (const item of val) {
        const s = sanitizePluginValue(item, depth + 1, visited);
        if (s !== undefined) arr.push(s);
      }
      return arr;
    }

    const proto = Object.getPrototypeOf(val);
    if (proto !== Object.prototype && proto !== null) {
      return undefined; // Reject non-plain objects
    }

    const clean: Record<string, unknown> = Object.create(null);
    let count = 0;
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (++count > MAX_PLUGIN_METADATA_KEYS) break;
      if (isSafeKey(k)) {
        const s = sanitizePluginValue(v, depth + 1, visited);
        if (s !== undefined) clean[k] = s;
      }
    }
    return clean;
  }
  return undefined;
}

function sortFeaturesDeterministically(features: RawFeature[]): void {
  features.sort((a, b) => {
    if (a.type !== b.type) return a.type < b.type ? -1 : 1;
    const locA = a.location
      ? `${a.location.offset ?? 0}:${a.location.startLine ?? 0}:${a.location.startColumn ?? 0}`
      : '';
    const locB = b.location
      ? `${b.location.offset ?? 0}:${b.location.startLine ?? 0}:${b.location.startColumn ?? 0}`
      : '';
    if (locA !== locB) return locA < locB ? -1 : 1;
    if (a.confidence !== b.confidence) return b.confidence - a.confidence;
    const valA = typeof a.value === 'string' ? a.value : JSON.stringify(a.value ?? '');
    const valB = typeof b.value === 'string' ? b.value : JSON.stringify(b.value ?? '');
    if (valA !== valB) return valA < valB ? -1 : 1;
    return 0;
  });
}
