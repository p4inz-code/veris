/**
 * @veris/extractors — VERIS artifact extraction framework.
 *
 * Extractors discover and extract structured data from artifacts.
 * Extractors ONLY extract — they NEVER analyze, classify, or score.
 *
 * ## Invariants (from SPEC-010 §3):
 * - E1: Extractors only extract — never analyze
 * - E2: Extractors are stateless
 * - E3: Extraction is deterministic
 * - E4: Extraction never executes extracted content
 *
 * ## Architecture
 * - Extractor interface — plugin contract for all extractors
 * - ExtractorRegistry — manages registration, matching, and execution
 * - Built-in extractors — string, hash, entropy, archive, binary, document, language, config
 *
 * ## Pipeline
 * Artifact → ExtractorRegistry → Matching Extractors → RawFeatures → Knowledge Engine
 *
 * @module @veris/extractors
 */

// Core types
export type {
  RawFeature,
  ExtractionContext,
  Extractor,
  ExtractionResult,
  ExtractorRunDiagnostics,
  RegistryExtractionDiagnostics,
  DiagnosticsCollector,
  ExtractionOptions,
  ExtractionIssue,
} from './types.js';
export {
  ExtractionError,
  createRawFeature,
  createSkippedDiagnostics,
  createExtractionIssue,
  noIssues,
} from './types.js';

// Base extractor
export { BaseExtractor } from './base-extractor.js';
export type { BaseExtractorOptions } from './base-extractor.js';

// Extractor registry
export { ExtractorRegistry } from './extractor-registry.js';
export type { RegistryExtractionResult } from './extractor-registry.js';

// Diagnostics
export { DefaultDiagnosticsCollector } from './diagnostics.js';

// String extractor
export { StringExtractor } from './extractors/string-extractor.js';
export type { StringExtractorConfig, ExtractedString } from './extractors/string-extractor.js';

// Hash extractor
export { HashExtractor } from './extractors/hash-extractor.js';
export type { HashAlgorithm, HashExtractorConfig } from './extractors/hash-extractor.js';

// Entropy extractor
export { EntropyExtractor } from './extractors/entropy-extractor.js';
export type { EntropyExtractorConfig } from './extractors/entropy-extractor.js';

// Archive extractor
export { ArchiveExtractor } from './extractors/archive-extractor.js';
export type { ArchiveMember } from './extractors/archive-extractor.js';

// Binary extractors
export { PEExtractor, ELFExtractor, MachOExtractor } from './extractors/binary-extractors.js';

// Document extractors
export {
  PDFExtractor,
  OfficeExtractor,
  ImageExtractor,
  CertificateExtractor,
} from './extractors/document-extractors.js';

// Language extractors
export {
  JavaScriptExtractor,
  TypeScriptExtractor,
  PythonExtractor,
  GoExtractor,
  RustExtractor,
  JavaExtractor,
  CSharpExtractor,
  ShellExtractor,
} from './extractors/language-extractors.js';

// Config extractors
export {
  JSONExtractor,
  YAMLExtractor,
  XMLExtractor,
  DockerExtractor,
  KubernetesExtractor,
} from './extractors/config-extractors.js';

// Other extractors
export {
  GitExtractor,
  EnvFileExtractor,
  RequirementsExtractor,
  PackageManifestExtractor,
  LockfileExtractor,
} from './extractors/other-extractors.js';
