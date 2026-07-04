/**
 * Public type exports for @veris/explain.
 *
 * @module @veris/explain/types
 */

export type {
  CitationSourceType,
  Citation,
  CitationValidationResult,
  ExplanationMode,
  ProviderInfo,
  TokenUsage,
  Explanation,
} from './explanation.js';

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
} from './context.js';

export type { CacheOptions, ExplainConfig, ProviderConfigEntry } from './config.js';

export type { ExplainSuccess, ExplainRefused, ExplainError, ExplainResult } from './result.js';
