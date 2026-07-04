/**
 * AnalysisEngine — orchestrates evidence production through the analysis pipeline.
 *
 * The AnalysisEngine orchestrates analyzers to produce Evidence from
 * artifacts and their features. It ONLY produces evidence — it never
 * assigns severity, creates findings, or performs rule matching.
 *
 * Pipeline:
 *   Artifact + Features → AnalyzerRegistry → Analyzers → Evidence → EvidenceRegistry
 *
 * @module @veris/analysis/analysis-engine
 */

import type { Artifact, SourceLocation } from '@veris/core';
import { type Result, ok, err } from '@veris/shared';

import { AnalyzerRegistry, type RegistryAnalysisResult } from './analyzer-registry.js';
import { EvidenceRegistry } from './evidence-registry.js';
import type { FeatureReference } from './types-client.js';
import type {
  Analyzer,
  AnalysisContext,
  AnalysisOptions,
  Evidence,
  EvidenceCategory,
  RegistryAnalysisDiagnostics,
} from './types.js';

/** Configuration for the AnalysisEngine. */
export interface AnalysisEngineConfig {
  /** Custom analyzers to register. */
  readonly analyzers?: readonly Analyzer[];
  /** Default analysis options. */
  readonly defaultOptions?: Partial<AnalysisOptions>;
  /** Whether to validate evidence after analysis (default: true). */
  readonly validateEvidence?: boolean;
  /** Maximum evidence per artifact (default: 10000). */
  readonly maxEvidencePerArtifact?: number;
}

/** The result of analyzing a single artifact. */
export interface ArtifactAnalysisResult {
  /** The artifact that was analyzed. */
  readonly artifactId: string;
  /** All evidence produced. */
  readonly evidence: readonly Evidence[];
  /** Registry diagnostics. */
  readonly diagnostics: RegistryAnalysisDiagnostics;
}

/** The result of analyzing multiple artifacts. */
export interface BatchAnalysisResult {
  /** Results per artifact. */
  readonly results: readonly ArtifactAnalysisResult[];
  /** All evidence across all artifacts. */
  readonly allEvidence: readonly Evidence[];
  /** Aggregated diagnostics. */
  readonly diagnostics: {
    readonly totalArtifacts: number;
    readonly totalEvidence: number;
    readonly totalErrors: number;
    readonly totalWarnings: number;
    readonly totalDurationMs: number;
  };
}

/**
 * AnalysisEngine — orchestrates evidence production.
 *
 * @example
 * ```typescript
 * const engine = new AnalysisEngine();
 * const result = await engine.analyzeArtifact(artifact, sessionId, features);
 * ```
 */
export class AnalysisEngine {
  private readonly _registry: AnalyzerRegistry;
  private readonly _evidenceRegistry: EvidenceRegistry;
  private readonly _validateEvidence: boolean;
  private readonly _maxEvidencePerArtifact: number;
  private readonly _defaultOptions: Partial<AnalysisOptions>;

  constructor(config?: AnalysisEngineConfig) {
    this._registry = new AnalyzerRegistry();
    this._evidenceRegistry = new EvidenceRegistry();
    this._validateEvidence = config?.validateEvidence ?? true;
    this._maxEvidencePerArtifact = config?.maxEvidencePerArtifact ?? 10_000;
    this._defaultOptions = config?.defaultOptions ?? {};

    // Register built-in analyzers if provided
    if (config?.analyzers) {
      this._registry.registerAll(config.analyzers);
    }
  }

  /**
   * Get the underlying AnalyzerRegistry for customization.
   */
  getRegistry(): AnalyzerRegistry {
    return this._registry;
  }

  /**
   * Get the EvidenceRegistry for querying collected evidence.
   */
  getEvidenceRegistry(): EvidenceRegistry {
    return this._evidenceRegistry;
  }

  /**
   * Analyze an artifact and produce evidence.
   *
   * @param artifact - The artifact to analyze
   * @param sessionId - The owning session ID
   * @param features - Features extracted from this artifact
   * @param options - Analysis options
   * @returns ArtifactAnalysisResult with evidence and diagnostics
   */
  async analyzeArtifact(
    artifact: Artifact,
    sessionId: string,
    features: readonly FeatureReference[],
    options?: AnalysisOptions,
  ): Promise<ArtifactAnalysisResult> {
    const context: AnalysisContext = {
      artifact,
      sessionId,
      content: null, // Content may not be available at analysis stage
      features,
      config: undefined,
    };

    const mergedOptions: AnalysisOptions = {
      ...this._defaultOptions,
      ...options,
    };

    const result = await this._registry.analyze(context, mergedOptions);

    // Validate evidence if configured
    let evidence = result.evidence;
    if (this._validateEvidence) {
      const { validateEvidenceBatch } = await import('./evidence-validator.js');
      const validationResult = validateEvidenceBatch(evidence);
      if (validationResult.ok) {
        evidence = validationResult.value;
      }
      // If validation fails, we still return the evidence since validation
      // errors are diagnostics, not blocking
    }

    // Truncate if over limit
    if (evidence.length > this._maxEvidencePerArtifact) {
      evidence = Object.freeze(evidence.slice(0, this._maxEvidencePerArtifact));
    }

    // Store in evidence registry
    this._evidenceRegistry.addAll(evidence);

    return {
      artifactId: artifact.id,
      evidence,
      diagnostics: result.diagnostics,
    };
  }

  /**
   * Analyze multiple artifacts in batch.
   */
  async analyzeBatch(
    items: readonly {
      artifact: Artifact;
      sessionId: string;
      features: readonly FeatureReference[];
    }[],
    options?: AnalysisOptions,
  ): Promise<BatchAnalysisResult> {
    const results: ArtifactAnalysisResult[] = [];
    const startTime = Date.now();
    let totalErrors = 0;
    let totalWarnings = 0;

    for (const item of items) {
      const result = await this.analyzeArtifact(
        item.artifact,
        item.sessionId,
        item.features,
        options,
      );
      results.push(result);
      totalErrors += result.diagnostics.errors.length;
      totalWarnings += result.diagnostics.warnings.length;
    }

    const allEvidence = results.flatMap((r) => r.evidence);

    return Object.freeze({
      results: Object.freeze(results),
      allEvidence: Object.freeze(allEvidence),
      diagnostics: Object.freeze({
        totalArtifacts: items.length,
        totalEvidence: allEvidence.length,
        totalErrors,
        totalWarnings,
        totalDurationMs: Date.now() - startTime,
      }),
    });
  }

  /**
   * Clear all stored evidence.
   */
  clear(): void {
    this._evidenceRegistry.clear();
  }
}
