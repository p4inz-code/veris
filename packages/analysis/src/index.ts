/**
 * @veris/analysis — VERIS Analysis Framework
 *
 * Converts normalized Features into structured Evidence.
 *
 * ## Invariants
 * - Analyzers ONLY produce evidence — never findings, risk, or severity
 * - Evidence is immutable after creation
 * - Evidence IDs are deterministic (content-addressed)
 * - All outputs are deterministic (same input → same output)
 * - No AI reasoning
 * - No scoring
 * - No severity
 * - No rule matching yet
 *
 * ## Pipeline
 * Features → AnalyzerRegistry → Matching Analyzers → Evidence → EvidenceRegistry
 *
 * @module @veris/analysis
 */

// Core types
export type {
  Evidence,
  EvidenceCategory,
  AnalysisContext,
  Analyzer,
  AnalysisResult,
  AnalyzerRunDiagnostics,
  RegistryAnalysisDiagnostics,
  DiagnosticsCollector,
  AnalysisOptions,
  AnalysisIssue,
} from './types.js';
export {
  AnalysisError,
  createEvidence,
  createSkippedDiagnostics,
  createAnalysisIssue,
  noIssues,
} from './types.js';

// Feature reference types
export type { FeatureReference } from './types-client.js';

// Evidence Builder
export { EvidenceBuilder } from './evidence-builder.js';

// Evidence Validator
export type { ValidationError } from './evidence-validator.js';
export {
  validateEvidence,
  validateEvidenceBatch,
  ValidationErrorCodes,
} from './evidence-validator.js';

// Base analyzer
export { BaseAnalyzer } from './base-analyzer.js';
export type { BaseAnalyzerOptions } from './base-analyzer.js';

// Analyzer registry
export { AnalyzerRegistry } from './analyzer-registry.js';
export type { RegistryAnalysisResult } from './analyzer-registry.js';

// Evidence registry
export { EvidenceRegistry } from './evidence-registry.js';
export type {
  EvidenceQuery,
  EvidenceQueryResult,
  EvidenceRegistryStats,
} from './evidence-registry.js';

// Diagnostics
export { DefaultDiagnosticsCollector } from './diagnostics.js';

// Analysis engine
export { AnalysisEngine } from './analysis-engine.js';
export type {
  AnalysisEngineConfig,
  ArtifactAnalysisResult,
  BatchAnalysisResult,
} from './analysis-engine.js';

// PE Analysis Engine
export { PEAnalyzer } from './analyzers/pe-analyzer.js';
export { analyzePE } from './pe/engine.js';
export type { PEEvidence, PEResult } from './pe/engine.js';
export { parsePE, computeEntropy, rvaToOffset } from './pe/parser.js';
export type {
  PEParsed,
  PESection,
  PEImport,
  PEExport,
  PEOverlay,
  PECertificate,
  PEResource,
  TLSInfo,
  CompilerInfo,
  PackerResult,
} from './pe/types.js';
export {
  analyzeSections,
  analyzeImports,
  detectPacker,
  analyzeOverlay,
  identifyCompiler,
  analyzeTLS,
  analyzeResources,
  analyzeSignature,
  analyzeTimestamp,
  analyzeEntryPoint,
} from './pe/analyzers/index.js';
export { SUSPICIOUS_APIS, KNOWN_PACKER_SECTIONS, STANDARD_SECTION_NAMES } from './pe/constants.js';
export { ELFAnalyzer } from './analyzers/elf-analyzer.js';
export { MachOAnalyzer } from './analyzers/macho-analyzer.js';
export { CertificateAnalyzer } from './analyzers/certificate-analyzer.js';
export { DocumentAnalyzer } from './analyzers/document-analyzer.js';
export { OfficeAnalyzer } from './analyzers/office-analyzer.js';
export { ArchiveAnalyzer } from './analyzers/archive-analyzer.js';
export { EntropyAnalyzer } from './analyzers/entropy-analyzer.js';
export { ImportAnalyzer } from './analyzers/import-analyzer.js';
export { StringAnalyzer } from './analyzers/string-analyzer.js';
export { PersistenceAnalyzer } from './analyzers/persistence-analyzer.js';
export { ScriptAnalyzer } from './analyzers/script-analyzer.js';
export { ContainerAnalyzer } from './analyzers/container-analyzer.js';
export { DependencyAnalyzer } from './analyzers/dependency-analyzer.js';
