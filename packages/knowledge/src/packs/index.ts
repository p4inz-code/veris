/**
 * @veris/knowledge/packs — Knowledge Pack System.
 *
 * Knowledge Packs are deterministic offline intelligence databases that
 * enrich security analysis. They provide structured threat intelligence
 * data including malware families, LOLBins, persistence mechanisms,
 * credential theft techniques, and more.
 *
 * The system is modular, versioned, validated, extensible, and
 * production-ready — with zero cloud dependencies.
 */

// Core types
export type {
  KnowledgePack,
  KnowledgePackFile,
  KnowledgeEntry,
  KnowledgeIndicator,
  KnowledgeReference,
  KnowledgeSeverity,
  PackMetadata,
  PackDependency,
  PackError,
  PackLoadResult,
  PackEnrichment,
  ResolverMatch,
  IndicatorType,
} from './types.js';

// Schema
export {
  PACK_SCHEMA_VERSION,
  MIN_VERIS_VERSION,
  MAX_ENTRIES_PER_PACK,
  VALID_SEVERITIES,
  VALID_INDICATOR_TYPES,
  isValidSeverity,
  isValidIndicatorType,
  getPackFileExtension,
  createPackMetadata,
} from './schema.js';

// Categories
export {
  BUILT_IN_CATEGORIES,
  getCategory,
  isValidCategory,
  getAllCategoryIds,
  getAllCategories,
  type KnowledgeCategory,
} from './categories.js';

// Validator
export {
  validatePackFile,
  computePackChecksum,
  computePackContentHash,
  validateChecksum,
  type ValidationResult,
} from './validator.js';

// Registry
export {
  PackRegistry,
  type RegistryConfig,
  type RegistryEvent,
  type RegistryEventHandler,
} from './registry.js';

// Loader
export {
  loadAllPacks,
  loadPackFromFile,
  isVersionCompatible,
  type LoaderConfig,
} from './loader.js';

// Resolver
export { PackResolver } from './resolver.js';

// Cache
export { PackCache, type CacheConfig } from './cache.js';

// Configuration
export {
  createPackConfig,
  isPackEnabled,
  mergePackConfigs,
  DEFAULT_PACK_CONFIG,
  type KnowledgePackConfig,
} from './config.js';

// Diagnostics
export {
  createPackDiagnostics,
  formatPackDiagnostics,
  type PackDiagnostics,
} from './diagnostics.js';

// Update system
export {
  verifyBundleSignature,
  applyUpdateBundle,
  rollbackUpdate,
  getMigrationPath,
  BUNDLE_EXTENSION,
  BUNDLE_FORMAT_VERSION,
  type UpdateBundle,
  type UpdateBundleMetadata,
  type BundlePackEntry,
  type UpdateResult,
} from './update.js';

// Enricher
export { EvidenceEnricher, type EvidenceForEnrichment, type EnrichmentResult } from './enricher.js';

// Evidence Extractor
export {
  EvidenceValueExtractor,
  defaultEvidenceExtractor,
  type ExtractedValue,
} from './evidence-extractor.js';

// Built-in data packs
export {
  MALWARE_FAMILIES_PACK,
  LOBINS_PACK,
  PACKERS_PACK,
  PERSISTENCE_PACK,
  NETWORK_INDICATORS_PACK,
  SUSPICIOUS_APIS_PACK,
  BUILT_IN_PACKS,
} from './data/index.js';
