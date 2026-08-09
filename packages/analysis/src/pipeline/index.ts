/**
 * @veris/analysis/pipeline — Binary Intelligence Pipeline.
 *
 * A deterministic, failure-isolated pipeline for analyzing binary artifacts.
 * Combines all existing analyzers (PE, ELF, Mach-O, archive, script, etc.)
 * into one cohesive, production-grade analysis pipeline.
 *
 * ## Architecture
 *
 * ```
 * Artifact + Content → BinaryAnalysisPipeline
 *   ├── Preprocessing (classification, hashing, caching)
 *   ├── Parsers (PE, ELF, Mach-O, Archive)
 *   ├── Metadata (file metadata, hashes, timestamps)
 *   ├── Binary Analyzers (PE sections, imports, packer, etc.)
 *   ├── Language Analyzers (scripts, documents, etc.)
 *   ├── Knowledge Enrichment
 *   ├── Evidence Normalization & Aggregation
 *   └── Report Generation
 * ```
 *
 * ## Key Design Principles
 * - Deterministic: same input → same output
 * - Failure isolation: broken analyzer never aborts scan
 * - Immutable context: all state updates produce new instances
 * - Incremental caching: parser outputs reused via SHA-256 keys
 * - Comprehensive metrics: per-stage and per-analyzer timing
 *
 * @module @veris/analysis/pipeline
 */

// Core pipeline
export { BinaryAnalysisPipeline } from './pipeline.js';
export type { BinaryAnalysisPipelineOptions, PipelineResult } from './pipeline.js';

// Analysis context
export { BinaryAnalysisContext, createAnalysisContext } from './analysis-context.js';
export type { ParserOutput, ArtifactHashes, StageTiming } from './analysis-context.js';

// Classification
export { classifyArtifact, refinePEClassification } from './classification.js';
export type {
  ArtifactClassification,
  ArtifactType,
  ClassificationMethod,
} from './classification.js';

// Configuration
export {
  mergeConfig,
  DEFAULT_PIPELINE_CONFIG,
  DEFAULT_STAGE_CONFIG,
  STAGE_DEPENDENCIES,
} from './config.js';
export type { PipelineConfig, AnalyzerConfig, StageConfig, PipelineStage } from './config.js';
export { isStageEnabled, isAnalyzerEnabled, getEffectivePriority } from './config.js';

// Cache
export { IncrementalCache } from './cache.js';
export type { CacheStats } from './cache.js';

// Evidence aggregation
export { EvidenceAggregator, defaultAggregator } from './aggregator.js';
export type {
  AggregatedEvidence,
  AggregationStats,
  AggregationOptions,
  EvidenceOrder,
} from './aggregator.js';

// Diagnostics
export { PipelineDiagnosticsCollector } from './diagnostics.js';
export type { PipelineDiagnosticsResult, AnalyzerDiagnosticEntry } from './diagnostics.js';

// Metrics
export { PipelineMetrics } from './metrics.js';
export type { PipelineMetricsResult, TimingMeasurement, AnalyzerTiming } from './metrics.js';

// Stage orchestrator
export { StageOrchestrator, createDefaultOrchestrator } from './orchestrator.js';
export type { StageHandler } from './orchestrator.js';
