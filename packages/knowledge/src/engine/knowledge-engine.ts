/**
 * KnowledgeEngine — the Feature extraction and normalization pipeline orchestrator.
 *
 * The KnowledgeEngine converts classified artifacts into canonical Features
 * through the complete normalization pipeline:
 *
 *   Raw Input → Feature Extraction → Normalization → Validation → Emission
 *
 * This engine ONLY extracts knowledge. It does NOT:
 * - produce findings
 * - produce risk
 * - produce severity
 * - perform rule matching
 * - perform AI reasoning
 * - perform scoring
 *
 * @see SPEC-004 §7
 * @module @veris/knowledge/engine
 */

import type { Artifact, SourceLocation } from '@veris/core';

import { CapabilityBuilder } from '../capability/builder.js';
import type { Capability, CapabilityCategory } from '../capability/types.js';
import { FeatureNormalizer } from '../feature/normalizer.js';
import type { RawFeature } from '../feature/normalizer.js';
import type { NormalizationRule } from '../feature/normalizer.js';
import { FeatureRegistry } from '../feature/registry.js';
import { createProvenance, createKnowledgeDiagnostics } from '../feature/types.js';
import type {
  FeatureSet,
  FeatureType,
  KnowledgeDiagnostics,
  KnowledgeError,
} from '../feature/types.js';
import { validateFeatureBatch } from '../feature/validator.js';

/** Configuration for the KnowledgeEngine. */
export interface KnowledgeEngineConfig {
  /** Custom normalization rules (merged with defaults). */
  readonly normalizationRules?: NormalizationRule[];
  /** Whether to enable enrichment (default: false). */
  readonly enableEnrichment?: boolean;
  /** Whether to enable deduplication (default: true). */
  readonly enableDeduplication?: boolean;
  /** Custom FeatureRegistry (created automatically if not provided). */
  readonly registry?: FeatureRegistry;
  /** Maximum features per artifact (default: 100000). */
  readonly maxFeaturesPerArtifact?: number;
  /** Injected timestamp for deterministic output (ISO 8601). */
  readonly extractedAt?: string;
}

/** The result of processing an artifact through the KnowledgeEngine. */
export interface ArtifactKnowledgeResult {
  /** The artifact that was processed. */
  readonly artifactId: string;
  /** The extracted feature set. */
  readonly featureSet: FeatureSet;
  /** Extracted capabilities. */
  readonly capabilities: readonly Capability[];
  /** Diagnostics for this artifact. */
  readonly diagnostics: KnowledgeDiagnostics;
}

/** The result of processing multiple artifacts. */
export interface BatchKnowledgeResult {
  /** Results per artifact. */
  readonly results: readonly ArtifactKnowledgeResult[];
  /** Aggregated diagnostics across all artifacts. */
  readonly diagnostics: KnowledgeDiagnostics;
}

/**
 * KnowledgeEngine — orchestrates Feature extraction from Artifacts.
 *
 * @example
 * ```typescript
 * const engine = new KnowledgeEngine();
 * const result = await engine.processArtifact(artifact, "session_123", rawFeatures);
 * ```
 */
export class KnowledgeEngine {
  private readonly _normalizer: FeatureNormalizer;
  private readonly _registry: FeatureRegistry;
  private readonly _maxFeaturesPerArtifact: number;
  private readonly _provenance: {
    readonly normalizedBy: string;
    readonly engineVersion: string;
  };
  private readonly _extractedAt: string;

  constructor(config?: KnowledgeEngineConfig) {
    this._normalizer = new FeatureNormalizer({
      rules: config?.normalizationRules,
      enableEnrichment: config?.enableEnrichment ?? false,
      enableDeduplication: config?.enableDeduplication ?? true,
    });
    this._registry = config?.registry ?? new FeatureRegistry();
    this._maxFeaturesPerArtifact = config?.maxFeaturesPerArtifact ?? 100_000;
    this._provenance = {
      normalizedBy: 'knowledge-engine',
      engineVersion: '0.1.0',
    };
    this._extractedAt = config?.extractedAt ?? new Date().toISOString();
  }

  /**
   * Process an Artifact through the knowledge extraction pipeline.
   *
   * @param artifact - The artifact to process
   * @param sessionId - The owning session ID
   * @param rawFeatures - Raw features extracted from the artifact
   * @param rawCapabilities - (Optional) Raw capabilities extracted from the artifact
   * @returns ArtifactKnowledgeResult with features, capabilities, and diagnostics
   */
  async processArtifact(
    artifact: Artifact,
    sessionId: string,
    rawFeatures: readonly RawFeature[],
    rawCapabilities?: readonly RawRawCapability[],
  ): Promise<ArtifactKnowledgeResult> {
    const startTime = performance.now();
    const errors: KnowledgeError[] = [];
    const warnings: string[] = [];

    // Create provenance for this extraction using injected timestamp
    const provenance = createProvenance({
      extractorId: artifact.extractorId,
      extractorVersion: '0.1.0',
      normalizedBy: this._provenance.normalizedBy,
      extractedAt: this._extractedAt,
      normalizedAt: this._extractedAt,
    });

    // Reset deduplication cache between artifacts
    this._normalizer.resetCache();

    // Truncate raw features if over limit
    const featuresToProcess = rawFeatures.slice(0, this._maxFeaturesPerArtifact);
    if (rawFeatures.length > this._maxFeaturesPerArtifact) {
      warnings.push(
        `Artifact "${artifact.id}" has ${rawFeatures.length} raw features, truncated to ${this._maxFeaturesPerArtifact}`,
      );
    }

    // Normalize features
    const {
      normalized,
      errors: normalizationErrors,
      deduplicated,
    } = this._normalizer.normalizeBatch(featuresToProcess, artifact.id, sessionId, provenance);

    // Collect normalization errors as warnings
    for (const ne of normalizationErrors) {
      if (ne.code !== 'DUPLICATE_FEATURE') {
        warnings.push(`[${ne.code}] ${ne.message}`);
      }
    }

    // Process features through registry handlers
    const processedFeatures = this._registry.processBatch(normalized);

    // Validate the final feature set
    const validationResult = validateFeatureBatch(processedFeatures);
    const validFeatures = validationResult.ok
      ? validationResult.value
      : (() => {
          // Collect validation errors
          for (const veList of validationResult.error) {
            for (const ve of veList) {
              errors.push({
                code: ve.code,
                message: ve.message,
                artifactId: artifact.id,
              });
            }
          }
          // Return features that passed validation (those not in error list)
          return processedFeatures;
        })();

    // Build capabilities from raw capabilities
    const capabilities = await this._extractCapabilities(
      rawCapabilities ?? [],
      artifact.id,
      sessionId,
    );

    // Build the FeatureSet
    const featureSetId = `${artifact.id}_fs`;
    const featureSet: FeatureSet = Object.freeze({
      id: featureSetId,
      artifactId: artifact.id,
      sessionId,
      features: Object.freeze(validFeatures),
      extractedAt: provenance.extractedAt,
      metadata: Object.freeze({
        totalRawFeatures: rawFeatures.length,
        truncated: rawFeatures.length > this._maxFeaturesPerArtifact,
        normalizationErrors: normalizationErrors.length,
        normalizedBy: this._provenance.normalizedBy,
      }),
    });

    const durationMs = performance.now() - startTime;
    const featuresRejected = rawFeatures.length - validFeatures.length;
    const featuresExtracted = normalized.length;

    const diagnostics = createKnowledgeDiagnostics({
      artifactsProcessed: 1,
      featuresExtracted,
      featuresNormalized: normalized.length,
      featuresValidated: validFeatures.length,
      featuresRejected,
      featuresDeduplicated: deduplicated,
      errors,
      warnings,
      durationMs,
    });

    return {
      artifactId: artifact.id,
      featureSet,
      capabilities,
      diagnostics,
    };
  }

  /**
   * Process multiple artifacts in batch.
   */
  async processBatch(
    artifacts: readonly {
      artifact: Artifact;
      sessionId: string;
      rawFeatures: readonly RawFeature[];
      rawCapabilities?: readonly RawRawCapability[];
    }[],
  ): Promise<BatchKnowledgeResult> {
    const startTime = performance.now();
    const results: ArtifactKnowledgeResult[] = [];
    const allErrors: KnowledgeError[] = [];
    const allWarnings: string[] = [];
    let totalExtracted = 0;
    let totalNormalized = 0;
    let totalValidated = 0;
    let totalRejected = 0;
    let totalDeduplicated = 0;

    for (const item of artifacts) {
      const result = await this.processArtifact(
        item.artifact,
        item.sessionId,
        item.rawFeatures,
        item.rawCapabilities,
      );
      results.push(result);
      allErrors.push(...result.diagnostics.errors);
      allWarnings.push(...result.diagnostics.warnings);
      totalExtracted += result.diagnostics.featuresExtracted;
      totalNormalized += result.diagnostics.featuresNormalized;
      totalValidated += result.diagnostics.featuresValidated;
      totalRejected += result.diagnostics.featuresRejected;
      totalDeduplicated += result.diagnostics.featuresDeduplicated;
    }

    const diagnostics = createKnowledgeDiagnostics({
      artifactsProcessed: artifacts.length,
      featuresExtracted: totalExtracted,
      featuresNormalized: totalNormalized,
      featuresValidated: totalValidated,
      featuresRejected: totalRejected,
      featuresDeduplicated: totalDeduplicated,
      errors: allErrors,
      warnings: allWarnings,
      durationMs: performance.now() - startTime,
    });

    return { results, diagnostics };
  }

  /**
   * Get the supported FeatureTypes (from the normalizer's rules).
   */
  getSupportedFeatureTypes(): readonly FeatureType[] {
    const types = new Set<FeatureType>();
    for (const rule of this._normalizer.getRules()) {
      types.add(rule.targetType);
    }
    return Array.from(types).sort() as FeatureType[];
  }

  /**
   * Get the FeatureRegistry for registering custom handlers.
   */
  getRegistry(): FeatureRegistry {
    return this._registry;
  }

  /**
   * Get the FeatureNormalizer for customization.
   */
  getNormalizer(): FeatureNormalizer {
    return this._normalizer;
  }

  /**
   * Extract capabilities from raw capability data.
   */
  private async _extractCapabilities(
    rawCapabilities: readonly RawRawCapability[],
    artifactId: string,
    _sessionId: string,
  ): Promise<readonly Capability[]> {
    const capabilities: Capability[] = [];
    for (const raw of rawCapabilities) {
      const builder = new CapabilityBuilder();
      try {
        const cap = builder
          .withArtifactId(artifactId)
          .withName(raw.name)
          .withCategory(raw.category)
          .withSource(raw.source)
          .withConfidence(raw.confidence)
          .withProperties(raw.properties ?? {})
          .build();
        capabilities.push(cap);
      } catch {
        // Skip invalid capabilities
      }
    }
    return Object.freeze(capabilities);
  }
}

/** Raw capability input from an extractor. */
export interface RawRawCapability {
  readonly name: string;
  readonly category: CapabilityCategory;
  readonly source: SourceLocation;
  readonly confidence: number;
  readonly properties?: Record<string, unknown>;
}
