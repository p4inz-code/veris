// Types
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
} from './types.js';
export { createProvenance, createKnowledgeDiagnostics, createKnowledgeLocation } from './types.js';

// Builder
export { FeatureBuilder } from './builder.js';

// Normalizer
export { FeatureNormalizer } from './normalizer.js';
export type { RawFeature, NormalizationRule, FeatureNormalizerConfig } from './normalizer.js';

// Validator
export {
  validateFeature,
  validateFeatureBatch,
  isKnownFeatureType,
  getKnownFeatureTypes,
} from './validator.js';

// Registry
export { FeatureRegistry } from './registry.js';
export type { FeatureHandler } from './registry.js';
