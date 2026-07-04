/**
 * Explanation engine — the concrete Explainer implementation.
 *
 * Implements SPEC-011 §7 (Engine Orchestration) with:
 * - explainFinding() — explains a single finding
 * - explainChain() — explains a behavior chain
 * - explainRiskDimension() — explains a risk dimension
 * - summarizeReport() — provides a full report summary
 * - clearCacheForReport() — invalidates cache entries for a report
 *
 * Wires together:
 *   ScopeManager → ContextBuilder → Pipeline → Cache → AuditLog → Metrics
 *
 * @module @veris/explain/engine/explanation-engine
 */

import type { CanonicalReport } from '@veris/core';

import { Cache } from '../cache/cache.js';
import type { ContextBuilder } from '../context/context-builder.js';
import { createContextBuilder } from '../context/context-builder.js';
import type { PromptRegistry } from '../prompts/index.js';
import type { ExplanationMode } from '../types/explanation.js';
import type { ExplainResult } from '../types/result.js';

import { AuditLog } from './audit-log.js';
import type { Explainer, ExplainerOptions } from './engine-types.js';
import { createExplainError, ErrorCodes } from './errors.js';
import { Metrics } from './metrics.js';
import type { PersistentCache } from './persistent-cache-types.js';
import { Pipeline } from './pipeline.js';
import { ProviderManager } from './provider-manager.js';
import { RequestBuilder } from './request-builder.js';
import { ResponseParser } from './response-parser.js';
import type { ScopeManager } from './scope-manager.js';
import { createScopeManager } from './scope-manager.js';

// ═══════════════════════════════════════════════════════════════════════════
// Engine Version
// ═══════════════════════════════════════════════════════════════════════════

export const ENGINE_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// Explanation Engine Constructor Options
// ═══════════════════════════════════════════════════════════════════════════

/** Extended options for creating an ExplanationEngine. */
export interface ExplanationEngineOptions extends ExplainerOptions {
  readonly scopeManager?: ScopeManager;
  readonly contextBuilder?: ContextBuilder;
}

// ═══════════════════════════════════════════════════════════════════════════
// ExplanationEngine
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Concrete implementation of the Explainer interface.
 *
 * Thread-safe for single-threaded JS. All state lives in the injected
 * services (cache, audit log, metrics, provider manager).
 */
export class ExplanationEngine implements Explainer {
  private readonly scopeManager: ScopeManager;
  private readonly contextBuilder: ContextBuilder;
  private readonly promptRegistry: PromptRegistry;
  private readonly cache: PersistentCache | undefined;
  private readonly config: ExplainerOptions['config'];
  private readonly logger: ExplainerOptions['logger'];
  private readonly pipeline: Pipeline;
  private readonly auditLog: AuditLog;
  private readonly metrics: Metrics;

  constructor(options: ExplanationEngineOptions) {
    this.scopeManager = options.scopeManager ?? createScopeManager();
    this.contextBuilder = options.contextBuilder ?? createContextBuilder();
    this.promptRegistry = options.promptRegistry;
    // Use M7 Cache by default if no cache is provided and caching is enabled
    this.cache = options.cache ?? (options.config.caching ? new Cache() : undefined);
    this.config = options.config;
    this.logger = options.logger;
    this.auditLog = new AuditLog({
      enabled: options.config.logging?.auditEnabled ?? true,
    });
    this.metrics = new Metrics();

    // Create pipeline
    this.pipeline = new Pipeline({
      config: options.config,
      contextBuilder: this.contextBuilder,
      promptRegistry: this.promptRegistry,
      requestBuilder: new RequestBuilder(),
      responseParser: new ResponseParser(),
      providerManager: new ProviderManager(options.providerRegistry, options.config),
      cache: this.cache,
      auditLog: this.auditLog,
      metrics: this.metrics,
      engineVersion: ENGINE_VERSION,
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Explainer Methods
  // ═════════════════════════════════════════════════════════════════════════

  async explainFinding(
    findingId: string,
    report: CanonicalReport,
    mode?: ExplanationMode,
  ): Promise<ExplainResult> {
    const resolvedMode = mode ?? this.config.defaultMode;

    this.logger.debug(`Explaining finding: ${findingId} (mode: ${resolvedMode})`);

    try {
      const scope = this.scopeManager.determineScope(findingId, report);
      return await this.pipeline.run(scope, report, resolvedMode);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return createExplainError(ErrorCodes.FINDING_NOT_FOUND, findingId, 'finding', {
        message: err.message,
        recoverable: false,
      });
    }
  }

  async explainChain(
    chainId: string,
    report: CanonicalReport,
    mode?: ExplanationMode,
  ): Promise<ExplainResult> {
    const resolvedMode = mode ?? this.config.defaultMode;

    this.logger.debug(`Explaining chain: ${chainId} (mode: ${resolvedMode})`);

    try {
      const scope = this.scopeManager.determineChainScope(chainId, report);
      return await this.pipeline.run(scope, report, resolvedMode);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return createExplainError(ErrorCodes.CHAIN_NOT_FOUND, chainId, 'chain', {
        message: err.message,
        recoverable: false,
      });
    }
  }

  async explainRiskDimension(
    dimensionId: string,
    report: CanonicalReport,
    mode?: ExplanationMode,
  ): Promise<ExplainResult> {
    const resolvedMode = mode ?? this.config.defaultMode;

    this.logger.debug(`Explaining risk dimension: ${dimensionId} (mode: ${resolvedMode})`);

    try {
      const scope = this.scopeManager.determineRiskScope(dimensionId, report);
      return await this.pipeline.run(scope, report, resolvedMode);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return createExplainError(ErrorCodes.RISK_DIMENSION_NOT_FOUND, dimensionId, 'risk', {
        message: err.message,
        recoverable: false,
      });
    }
  }

  async summarizeReport(report: CanonicalReport, mode?: ExplanationMode): Promise<ExplainResult> {
    const resolvedMode = mode ?? this.config.defaultMode;

    this.logger.debug(`Summarizing report (mode: ${resolvedMode})`);

    try {
      const scope = this.scopeManager.determineReportScope(report);
      return await this.pipeline.run(scope, report, resolvedMode);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return createExplainError(ErrorCodes.REPORT_NOT_FOUND, 'report-summary', 'report', {
        message: err.message,
        recoverable: false,
      });
    }
  }

  async clearCacheForReport(reportId: string): Promise<void> {
    if (!this.cache) return;

    this.logger.debug(`Clearing cache for report: ${reportId}`);

    // M5 in-memory cache clears all entries. M7 will implement
    // report-scoped invalidation with the persistent cache.
    await this.cache.invalidate({
      olderThan: new Date().toISOString(),
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Public Accessors
  // ═════════════════════════════════════════════════════════════════════════

  /** Get the audit log instance. */
  getAuditLog(): AuditLog {
    return this.auditLog;
  }

  /** Get the metrics instance. */
  getMetrics(): Metrics {
    return this.metrics;
  }

  /** Get the engine version. */
  getEngineVersion(): string {
    return ENGINE_VERSION;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Default Factory
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create the main Explainer instance.
 *
 * Wires together the full M5 engine stack:
 *   ScopeManager → ContextBuilder → Pipeline → ProviderManager
 *   → RequestBuilder → ResponseParser → InMemoryCache → AuditLog → Metrics
 *
 * @param options - Configuration, provider registry, prompt registry, etc.
 * @returns An Explainer instance ready to generate explanations.
 */
export function createExplanationEngine(options: ExplanationEngineOptions): Explainer {
  return new ExplanationEngine(options);
}
