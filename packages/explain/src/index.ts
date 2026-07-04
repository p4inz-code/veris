/**
 * @veris/explain — VERIS AI explanation layer.
 *
 * Explains deterministic analysis results via LLM providers.
 * AI is always read-only, optional, and every claim is traced to evidence.
 *
 * ## Package invariants:
 * - IE1: AI NEVER participates in the analysis pipeline
 * - IE2: Every AI-generated sentence is traceable to deterministic evidence
 * - IE3: AI is always optional
 * - IE4: AI explanations are never part of the canonical data model
 * - IE5: AI outputs are clearly labeled as AI-generated
 * - IE6: The AI provider is abstracted and swappable
 * - IE7: All AI interactions are logged for auditability
 * - IE8: Offline is the default, not an afterthought
 *
 * @module @veris/explain
 */

// Public Types
export type {
  CitationSourceType,
  Citation,
  CitationValidationResult,
  ExplanationMode,
  ProviderInfo,
  TokenUsage,
  Explanation,
} from './types/explanation.js';

export type {
  ExplainedFinding,
  ExplainedEvidence,
  ExplainedRule,
  ExplainedArtifact,
  ExplainedRiskProfile,
  ExplainedChain,
  ExplainedReportSummary,
  ExplainedSubject,
  ContextTokenBudget,
  ExplainedContext,
} from './types/context.js';

export type { CacheOptions, ExplainConfig } from './types/config.js';

export type {
  ExplainSuccess,
  ExplainRefused,
  ExplainError,
  ExplainResult,
} from './types/result.js';

// Engine Types
export type {
  FindingScope,
  ChainScope,
  RiskScope,
  ReportScope,
  ExplainScope,
  ScopeManager,
  BudgetEntry,
  BudgetReport,
  TokenEstimator,
  TokenBudget,
  PersistentCache,
  CacheKey,
  CacheInvalidationFilter,
  CacheStats,
  ExplainerOptions,
  Explainer,
} from './engine/index.js';

// Context Types
export type { ContextBuilder } from './context/index.js';
export { createContextBuilder } from './context/index.js';

// Context Builders
export {
  buildExplainedFinding,
  buildExplainedEvidenceList,
  buildExplainedRule,
  buildExplainedArtifact,
  buildFindingContext,
  buildExplainedChain,
  buildChainContext,
  buildExplainedRiskProfile,
  buildRiskDimensionContext,
  buildExplainedReportSummary,
  calculateSeverityPercentages,
  sortExplainedEvidence,
  sortCanonicalEvidence,
  limitEvidence,
  serializeContext,
  hashContext,
  deepFreeze,
  getContextSchemaVersion,
} from './context/index.js';
export type { ChainBuildResult } from './context/index.js';

// Prompt Module
export {
  parseFrontmatter,
  validateSemver,
  compareSemver,
  extractVariables,
  validateVariables,
  detectMissingVariables,
  createBuiltinHelpers,
  validateTemplate,
  validateTemplateId,
  TemplateLoader,
  TemplateRegistry,
  PromptRenderer,
  extractCacheKeyComponents,
  formatPromptVersion,
  isCacheStale,
  encodePromptSegment,
  getMajorVersion,
  isVersionCompatible,
} from './prompts/index.js';
export type {
  TemplateFrontmatter,
  ParsedTemplate,
  TemplateType,
  TemplateVariable,
  VariableValidationResult,
  ValidationSeverity,
  ValidationIssue,
  ValidationResult,
  TemplateLoaderOptions,
  TemplateInfo,
  TemplateRegistryOptions,
  PromptRegistry,
  RenderedPrompt,
  PromptRendererOptions,
  RenderResult,
  PromptCacheKeyComponents,
} from './prompts/index.js';

// ── M6a: Deterministic Validation Pipeline ──

// Note: ValidationSeverity and ValidationIssue are also exported from
// the prompts module. Avoid duplicate re-exports.
export type {
  InputValidationResult,
  StructuralValidationResult,
  CitationVerificationResult,
  NullEvidenceRefusalResult,
  OutputFilterResult,
  ValidationPipelineResult,
  Validator,
} from './output/validation-result.js';

export { ValidationPipeline } from './output/validation-result.js';

export { InputFilter } from './output/input-filter.js';

export { StructuralValidator } from './output/structural-validator.js';

export { CitationVerifier } from './output/citation-verifier.js';

export { NullEvidenceRefusal } from './output/null-evidence-refusal.js';
export type { RefusalCode } from './output/null-evidence-refusal.js';
export { RefusalCodes } from './output/null-evidence-refusal.js';

export { OutputFilter } from './output/output-filter.js';

// ── M6b: ValidationAgent ──

export { ValidationAgent, createValidationAgent } from './output/validation-agent.js';
export type {
  ClaimScore,
  FactualClaim,
  ValidationAgentResult,
  ValidationAgentOptions,
} from './output/validation-agent.js';
export { DEFAULT_VALIDATION_OPTIONS } from './output/validation-agent.js';

// ── M6b: Formatter System ──

export {
  // Formatter Core
  Formatter,
  createFormatter,

  // Explanation Formatter
  ExplanationFormatter,
  createExplanationFormatter,

  // Formatter Options
  DEFAULT_FORMATTER_OPTIONS,
  DEFAULT_PARAGRAPH_OPTIONS,
  DEFAULT_LIST_OPTIONS,
  DEFAULT_CITATION_FORMAT_OPTIONS,

  // Formatter Presets
  SIMPLE_PRESET,
  TECHNICAL_PRESET,
  EXPERT_PRESET,
  PRESETS,
  PRESET_NAMES,
  PRESET_DESCRIPTIONS,
  getPreset,
  allowsTechnicalJargon,
  getMaxParagraphs,
  getMaxSentences,

  // Formatter Utilities
  formatInlineCitation,
  extractCitations,
  replaceCitationMarkers,
  stripCitationMarkers,
  formatCitationsSection,
  getCitationSourceTypes,
  generateHeading,
  formatUnorderedList,
  formatOrderedList,
  formatTable,
  formatInlineCode,
  formatCodeBlock,
  formatJSON,
  normalizeWhitespace,
  wrapParagraph,
  stableSortCitations,
  stableSortArray,
  deterministicStringify,
  countSentences,
  countParagraphs,
  truncateToSentences,
  truncateToParagraphs,
  formatSeverityLabel,
  formatConfidence,
  formatSourceLocation,
  getModeDescription,
} from './output/formatter/index.js';

export type {
  FormatInput,
  FormatResult,
  ExplanationFormatResult,
  CitationStyle,
  CitationSectionStyle,
  HeadingLevel,
  HeadingStyle,
  ParagraphOptions,
  ListOptions,
  CitationFormatOptions,
  ModeFormatConfig,
  FormatterOptions,
} from './output/formatter/index.js';

// ── Engine Factory Functions ──

export {
  createExplainer,
  createScopeManager,
  createTokenEstimator,
  createTokenBudget,
} from './engine/index.js';

// M5 Engine Implementation
export {
  createExplanationEngine,
  ExplanationEngine,
  ENGINE_VERSION,
  Pipeline,
  RequestBuilder,
  ResponseParser,
  ExplanationCache,
  createExplanationCache,
  ExplanationService,
  RetryManager,
  ProviderManager,
  AuditLog,
  Metrics,
  ErrorCodes,
  createExplainError,
  mapProviderError,
} from './engine/index.js';

// ── M8 Part B: Configuration Module ──

export type {
  ConfigValidationSeverity,
  ConfigValidationIssue,
  ConfigValidationResult,
  EnvVarSource,
  EnvConfigResult,
  ConfigSourceType,
  ConfigSource,
  ConfigLoadResult,
  NumericRange,
} from './config/index.js';

export {
  DEFAULT_EXPLAIN_CONFIG,
  CONFIG_SCHEMA_VERSION,
  CURRENT_CONFIG_SCHEMA,
  MIN_COMPATIBLE_CONFIG_SCHEMA,
  MAX_SUPPORTED_CONFIG_SCHEMA,
  VALID_MODES,
  VALID_PROVIDER_TYPES,
  CONFIG_CONSTRAINTS,
  REQUIRED_FIELDS,
  isWithinRange,
  isSchemaCompatible,
  shouldInvalidateOnSchemaChange,
  getAllowedModeValues,
  validateConfig,
  mergeConfigs,
  mergeConfigSequence,
  freezeConfig,
  ENV_VARS,
  loadConfigFromEnv,
  hasEnvConfig,
  loadExplainConfig,
  loadExplainConfigSequence,
  createEngineConfig,
  createExplainConfig,
  getDefaultExplainConfig,
  freezeExplainConfig,
  validateExplainConfig,
  mergeExplainConfigs,
  loadExplainConfigFromEnv,
  getConfigSchemaVersion,
  extractCacheConfig,
  extractProviderConfig,
  resolveConfigMode,
  DEFAULT_CONFIG,
} from './config/index.js';

// ── M8 Part A: Explanation Modes Module ──

export {
  ALL_MODES,
  MODE_LABELS,
  MODE_DESCRIPTIONS,
  MODE_TAGS,
  MODE_DEPTH,
  DEFAULT_MODE,
  isValidMode,
  getDefaultMode,
  compareModes,
  isMoreDetailed,
  isLessDetailed,
  getModeLabel,
  getAllModes,
  parseMode,
} from './modes/explanation-mode.js';

export type { ModeConfig } from './modes/mode-config.js';

export {
  SIMPLE_MODE_CONFIG,
  TECHNICAL_MODE_CONFIG,
  EXPERT_MODE_CONFIG,
  MODE_CONFIGS,
  getModeConfig,
  getModeFormat,
  createModeConfig,
} from './modes/mode-config.js';

export {
  selectMode,
  resolveMode,
  validateMode,
  selectModeByConfidence,
  isAboveMode,
  isBelowMode,
} from './modes/mode-selector.js';

export type {
  ModeValidationSeverity,
  ModeValidationIssue,
  ModeValidationResult,
} from './modes/mode-validator.js';

export {
  validateModeIdentifier,
  validateModeConfig as validateModeConfiguration,
  createValidatedModeConfig,
} from './modes/mode-validator.js';

export {
  SIMPLE_OUTPUT_OPTIONS,
  TECHNICAL_OUTPUT_OPTIONS,
  EXPERT_OUTPUT_OPTIONS,
  OUTPUT_OPTIONS_PRESETS,
  getOutputOptions,
  mergeOutputOptions,
} from './modes/output-options.js';

export type {
  CitationDensity,
  ModeCitationPolicy,
  ExplanationTone,
  ExplanationDepth,
  TargetAudience,
  ModeVerbosity,
} from './modes/index.js';

export {
  SIMPLE_CITATION_POLICY,
  TECHNICAL_CITATION_POLICY,
  EXPERT_CITATION_POLICY,
  CITATION_POLICIES,
  getCitationPolicy,
  isSourceTypeAllowed,
  isSourceTypeRequired,
  isSourceTypeExcluded,
  getUniversalSourceTypes,
  getExpertOnlySourceTypes,
  getMinimumCitations,
} from './modes/citation-policy.js';

export {
  SIMPLE_VERBOSITY,
  TECHNICAL_VERBOSITY,
  EXPERT_VERBOSITY,
  VERBOSITY_RULES,
  getVerbosity,
  getTone,
  getDepth,
  getAudience,
  describeVerbosity,
} from './modes/verbosity.js';

// ── M7: Cache System ──

export {
  Cache,
  createCache,
  createTestCache,
  CacheManager,
  createCacheManager,
  MemoryStore,
  createMemoryStore,
  LruTracker,
  Evictor,
  createEvictor,
  CacheMetrics,
  createCacheMetrics,
  MigrationRegistry,
  createDefaultMigrationSteps,
  CURRENT_SCHEMA_VERSION,
  MIN_COMPATIBLE_SCHEMA_VERSION,
  MAX_SUPPORTED_SCHEMA_VERSION,
  checkSchemaCompatibility,
  shouldInvalidateOnEngineChange,
  generateCacheKey,
  generateCacheKeySync,
  buildCacheKeyComponents,
  stableStringify,
  createCacheEntry,
  createEntryBuilder,
  freezeEntry,
  touchEntry,
  isEntryExpired,
  calculateEntrySize,
  serializeEntry,
  deserializeEntry,
  getRemainingTtl,
} from './cache/index.js';

export type {
  CacheKeyComponents,
  ResolvedCacheKey,
  CacheEntry,
  CacheEntryBuilder,
  CacheManagerOptions,
  CacheManagerStats,
  CacheStore,
  StoreEvents,
  EvictionResult,
  EvictionReason,
  EvictionConfig,
  SchemaCompatibilityResult,
  MigrationResult,
  MigrationStep,
  CacheMetricsSnapshot,
} from './cache/index.js';
export type {
  PipelineOptions,
  RequestBuilderInput,
  ExplainTarget,
  ExplainBatchRequest,
  CircuitState,
  CircuitBreakerConfig,
  RetryConfig,
  AuditLogEntry,
  AuditLogOptions,
  MetricsSnapshot,
  ErrorCode,
} from './engine/index.js';

// ── M10A: Export Pipeline ──

export {
  // Exporter Orchestrator
  Exporter,

  // Markdown Exporter
  MarkdownExporter,

  // JSON Exporter
  JsonExporter,

  // Output Writer
  OutputWriter,

  // Export Options
  DEFAULT_EXPORT_OPTIONS,
  validateExportOptions,
  SYSTEM_CLOCK,

  // Explanation Document
  buildDocument,
  buildCitationEntries,
  buildSections,
  citationToEntry,

  // Default factory
} from './export/index.js';

export type {
  // Export Options
  ExportFormat,
  JsonMode,
  Clock,
  ExportOptions,
  OptionSeverity,
  OptionIssue,
  OptionsValidationResult,

  // Document types
  DocumentSection,
  CitationEntry,
  ExportMetadata,
  ExplanationDocument,

  // Output Writer
  WriteResult,

  // Exporter
  ExportResult,
  BatchExportResult,
  ExportReport,
} from './export/index.js';

// ── M10B: Reporting, Batch Export, Final Export UX ──

export {
  // Report Builder
  ReportBuilder,

  // Batch Export
  BatchExporter,
  DEFAULT_BATCH_OPTIONS,

  // Export Summary
  ExportSummaryBuilder,

  // Export Validator
  ExportValidator,
  isDocumentValid,

  // Export Manifest
  ManifestBuilder,
} from './export/index.js';

export type {
  // Report
  ReportStatistics,
  ReportEntry,
  ExplanationReport,

  // Batch
  BatchPhase,
  BatchProgress,
  ProgressCallback,
  BatchOptions as ExportBatchOptions,
  BatchEntry as ExportBatchEntry,
  BatchItemResult,
  BatchResult,

  // Summary
  SingleExportSummary,
  CacheStats as ExportCacheStats,
  ExportSummary,

  // Validator
  ExportValidationSeverity,
  ExportValidationIssue,
  ExportValidationResult,

  // Manifest
  ManifestEntry,
  ExportManifest,
  ManifestEntryInput,

  // Full Export
  FullExportResult,
} from './export/index.js';
