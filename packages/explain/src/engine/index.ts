/**
 * Engine module exports.
 *
 * @module @veris/explain/engine
 */

// @veris/ai provider contracts — re-exported for @veris/explain public API
export type {
  ProviderCapabilities,
  LLMProvider,
  GenerateOptions,
  GenerateResult,
  GenerateChunk,
  ProviderRegistry,
} from '@veris/ai';

// @veris/explain engine types (defined locally)
export type {
  PersistentCache,
  CacheKey,
  CacheInvalidationFilter,
  CacheStats,
  ExplainerOptions,
  Explainer,
} from './explainer.js';

export { createExplainer } from './explainer.js';

export type {
  FindingScope,
  ChainScope,
  RiskScope,
  ReportScope,
  ExplainScope,
  ScopeManager,
} from './scope-manager.js';

export { createScopeManager } from './scope-manager.js';

export type { BudgetEntry, BudgetReport, TokenEstimator, TokenBudget } from './token-budget.js';

export { createTokenEstimator, createTokenBudget } from './token-budget.js';

// ── M5 Engine Implementation ──

export {
  createExplanationEngine,
  ExplanationEngine,
  ENGINE_VERSION,
} from './explanation-engine.js';
export type { ExplanationEngineOptions } from './explanation-engine.js';

export { Pipeline } from './pipeline.js';
export type { PipelineOptions } from './pipeline.js';

export { RequestBuilder } from './request-builder.js';
export type { RequestBuilderInput } from './request-builder.js';

export { ResponseParser } from './response-parser.js';

export { ExplanationCache, createExplanationCache } from './explanation-cache.js';

export { ExplanationService } from './explanation-service.js';
export type { ExplainTarget, ExplainBatchRequest } from './explanation-service.js';

export { RetryManager, withRetry } from './retry-manager.js';
export type { CircuitState, CircuitBreakerConfig, RetryConfig } from './retry-manager.js';

export { ProviderManager } from './provider-manager.js';

export { AuditLog } from './audit-log.js';
export type { AuditLogEntry, AuditLogOptions } from './audit-log.js';

export { Metrics } from './metrics.js';
export type { MetricsSnapshot } from './metrics.js';

export { ErrorCodes, createExplainError, mapProviderError } from './errors.js';
export type { ErrorCode } from './errors.js';
