/**
 * @veris/knowledge — VERIS Knowledge Layer
 *
 * Implements the Feature extraction and normalization pipeline that converts
 * classified artifacts into canonical Features. This is the first stage of
 * the analysis pipeline after discovery and classification.
 *
 * ## Pipeline
 * Raw Input → Feature Extraction → Normalization → Validation → Emission → Knowledge Layer
 *
 * ## Invariants
 * - Features are immutable after creation
 * - Feature IDs are deterministic (content-addressed)
 * - Features carry complete provenance
 * - The engine ONLY extracts knowledge — it never produces findings,
 *   risk, severity, or performs rule matching
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
