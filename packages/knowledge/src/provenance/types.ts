/**
 * Provenance tracking types for VERIS Knowledge Layer.
 *
 * Tracks the complete extraction lineage for features, including
 * extractor identity, timing, and normalization metadata.
 *
 * @module @veris/knowledge/provenance/types
 */

/**
 * Extended provenance information for a feature extraction operation.
 * Provides detailed tracking beyond the basic Provenance interface.
 */
export interface ExtractionProvenance {
  /** ID of the extractor that produced the feature. */
  readonly extractorId: string;
  /** Version of the extractor. */
  readonly extractorVersion: string;
  /** When extraction started (ISO 8601). */
  readonly extractedAt: string;
  /** How long extraction took (ms). */
  readonly extractionDurationMs: number;
  /** When normalization completed (ISO 8601). */
  readonly normalizedAt: string;
  /** ID of the normalizer/pipeline stage. */
  readonly normalizedBy: string;
  /** The artifact version/hash at time of extraction. */
  readonly artifactVersion: string;
  /** Pipeline stage that produced this feature. */
  readonly pipelineStage: string;
  /** Whether the feature was truncated due to limits. */
  readonly truncated: boolean;
}

/** Create a frozen ExtractionProvenance with sensible defaults. */
export function createExtractionProvenance(params: {
  extractorId: string;
  extractorVersion?: string;
  artifactVersion?: string;
  pipelineStage?: string;
  extractionDurationMs?: number;
  truncated?: boolean;
}): ExtractionProvenance {
  const now = new Date().toISOString();
  return Object.freeze({
    extractorId: params.extractorId,
    extractorVersion: params.extractorVersion ?? '0.1.0',
    extractedAt: params.extractionDurationMs !== undefined ? now : now,
    extractionDurationMs: params.extractionDurationMs ?? 0,
    normalizedAt: now,
    normalizedBy: 'knowledge-engine',
    artifactVersion: params.artifactVersion ?? 'unknown',
    pipelineStage: params.pipelineStage ?? 'feature-extraction',
    truncated: params.truncated ?? false,
  });
}
