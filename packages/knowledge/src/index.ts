/**
 * @veris/knowledge — VERIS Knowledge Layer
 *
 * Implements the Feature extraction and normalization pipeline and the
 * Knowledge Pack System for offline threat intelligence enrichment.
 *
 * ## Sub-modules
 * - Feature extraction: converts classified artifacts into canonical Features
 * - Capability detection: identifies artifact capabilities
 * - Knowledge Packs: deterministic offline threat intelligence databases
 *
 * ## Invariants
 * - Features are immutable after creation
 * - Feature IDs are deterministic (content-addressed)
 * - Features carry complete provenance
 * - Knowledge Packs are offline-first, deterministic, versioned
 * - All outputs are deterministic (same input → same output)
 *
 * @module @veris/knowledge
 */

// Feature types and utilities
export type {
  FeatureType,
  FeatureValue,
  Feature,
  FeatureSet,
  Provenance,
  SourceLocation,
  ValidationError,
  NormalizationError,
  KnowledgeDiagnostics,
  KnowledgeError,
} from './feature/types.js';
export {
  createProvenance,
  createKnowledgeDiagnostics,
  createKnowledgeLocation,
} from './feature/types.js';
export { FeatureBuilder } from './feature/builder.js';
export { FeatureNormalizer } from './feature/normalizer.js';
export type {
  RawFeature,
  NormalizationRule,
  FeatureNormalizerConfig,
} from './feature/normalizer.js';
export {
  validateFeature,
  validateFeatureBatch,
  isKnownFeatureType,
  getKnownFeatureTypes,
} from './feature/validator.js';
export { FeatureRegistry } from './feature/registry.js';
export type { FeatureHandler } from './feature/registry.js';

// Capability types and utilities
export type { CapabilityCategory, Capability } from './capability/types.js';
export { createCapability } from './capability/types.js';
export { CapabilityBuilder } from './capability/builder.js';

// Provenance
export type { ExtractionProvenance } from './provenance/types.js';
export { createExtractionProvenance } from './provenance/types.js';

// Engine
export { KnowledgeEngine } from './engine/knowledge-engine.js';
export type {
  KnowledgeEngineConfig,
  ArtifactKnowledgeResult,
  BatchKnowledgeResult,
} from './engine/knowledge-engine.js';

// ── Knowledge Pack System ──

export * from './packs/index.js';
