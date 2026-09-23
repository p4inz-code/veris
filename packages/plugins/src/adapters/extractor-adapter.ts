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

/**
 * Creates an internal Extractor instance from a loaded ExtractorPlugin.
 */
export function createExtractorAdapter(
  loaded: LoadedPlugin,
  options?: {
    priority?: number;
    diagnostics?: PluginDiagnosticsCollector;
    pluginConfig?: Record<string, unknown>;
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

  constructor(
    loaded: LoadedPlugin,
    options?: {
      priority?: number;
      diagnostics?: PluginDiagnosticsCollector;
      pluginConfig?: Record<string, unknown>;
    },
  ) {
    this._loaded = loaded;
    this._plugin = loaded.instance as ExtractorPlugin;
    this._diagnostics = options?.diagnostics;
    this._pluginConfig = Object.freeze({ ...(options?.pluginConfig ?? {}) });

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

    // Guard: Check if plugin is permitted to execute
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
      const rawPluginFeatures = await this._plugin.extract(pluginContext);
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
        for (const raw of rawPluginFeatures) {
          if (!raw || typeof raw !== 'object') {
            continue;
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

          sanitizedFeatures.push(
            Object.freeze({
              extractorId: this.id,
              type: String(rawFeature.type ?? 'custom-feature'),
              value: rawFeature.value,
              confidence,
              location: rawFeature.location,
              metadata: rawFeature.metadata ? Object.freeze({ ...rawFeature.metadata }) : undefined,
            }),
          );
        }
      }

      return Object.freeze({
        features: Object.freeze(sanitizedFeatures),
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
