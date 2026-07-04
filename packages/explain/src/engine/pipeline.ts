/**
 * Pipeline — orchestrates the explanation pipeline end-to-end.
 *
 * Flow:
 * 1. Build context from scope + report (ContextBuilder)
 * 2. Build cache key from context + config
 * 3. Check cache (if enabled, in-memory for M5)
 * 4. Render prompts with context (TemplateRegistry)
 * 5. Build provider request (RequestBuilder)
 * 6. Call provider with retry + failover (ProviderManager)
 * 7. Parse response into Explanation (ResponseParser)
 * 8. Cache result (if enabled)
 * 9. Audit log the interaction
 * 10. Return ExplainResult
 *
 * @module @veris/explain/engine/pipeline
 */

import type { GenerateResult } from '@veris/ai';
import type { LLMProvider } from '@veris/ai';
import type { CanonicalReport } from '@veris/core';

import type { ContextBuilder } from '../context/context-builder.js';
import type { PromptRegistry, RenderedPrompt } from '../prompts/index.js';
import type { ExplainConfig } from '../types/config.js';
import type { ExplainedContext } from '../types/context.js';
import type { Explanation, ExplanationMode } from '../types/explanation.js';
import type { ExplainResult } from '../types/result.js';

import { AuditLog } from './audit-log.js';
import { ErrorCodes, createExplainError, mapProviderError } from './errors.js';
import { Metrics } from './metrics.js';
import type { PersistentCache, CacheKey } from './persistent-cache-types.js';
import { ProviderManager } from './provider-manager.js';
import { RequestBuilder } from './request-builder.js';
import { ResponseParser } from './response-parser.js';
import type { ExplainScope } from './scope-manager.js';

// ── Template ID Mapping ──

/** Maps subject types to their template IDs. */
const TEMPLATE_IDS: Record<string, { system?: string; user: string }> = {
  finding: {
    system: 'finding-explain-system-v1',
    user: 'finding-explain-v1',
  },
  chain: {
    system: 'chain-explain-system-v1',
    user: 'finding-explain-v1', // Chain uses finding context template
  },
  risk: {
    system: 'risk-explain-system-v1',
    user: 'finding-explain-v1', // Risk uses finding context template
  },
  report: {
    system: 'report-summary-system-v1',
    user: 'finding-explain-v1', // Report uses finding context template
  },
};

// ── Pipeline Options ──

/** Options for the pipeline. */
export interface PipelineOptions {
  readonly config: ExplainConfig;
  readonly contextBuilder: ContextBuilder;
  readonly promptRegistry: PromptRegistry;
  readonly requestBuilder: RequestBuilder;
  readonly responseParser: ResponseParser;
  readonly providerManager: ProviderManager;
  readonly cache?: PersistentCache;
  readonly auditLog?: AuditLog;
  readonly metrics?: Metrics;
  readonly engineVersion: string;
}

// ── Pipeline ──

/**
 * The explanation pipeline — orchestrates the full flow from scope to result.
 *
 * Each pipeline run processes one explanation request deterministically.
 * The pipeline is stateless (state lives in the injected services).
 */
export class Pipeline {
  private readonly config: ExplainConfig;
  private readonly contextBuilder: ContextBuilder;
  private readonly promptRegistry: PromptRegistry;
  private readonly requestBuilder: RequestBuilder;
  private readonly responseParser: ResponseParser;
  private readonly providerManager: ProviderManager;
  private readonly cache: PersistentCache | undefined;
  private readonly auditLog: AuditLog | undefined;
  private readonly metrics: Metrics | undefined;
  private readonly engineVersion: string;

  constructor(options: PipelineOptions) {
    this.config = options.config;
    this.contextBuilder = options.contextBuilder;
    this.promptRegistry = options.promptRegistry;
    this.requestBuilder = options.requestBuilder;
    this.responseParser = options.responseParser;
    this.providerManager = options.providerManager;
    this.cache = options.cache;
    this.auditLog = options.auditLog;
    this.metrics = options.metrics;
    this.engineVersion = options.engineVersion;
  }

  /**
   * Run the pipeline for a single explanation request.
   *
   * @param scope - The scope (finding, chain, risk, or report).
   * @param report - The canonical report.
   * @param mode - The explanation mode.
   * @returns An ExplainResult (success, refused, or error).
   */
  async run(
    scope: ExplainScope,
    report: CanonicalReport,
    mode: ExplanationMode,
  ): Promise<ExplainResult> {
    const startTime = Date.now();
    const subjectId = this.getSubjectId(scope);
    const subjectType = scope.type;

    try {
      // Step 1: Build context
      const context = this.contextBuilder.build(scope, report);

      // Step 2: Check cache
      if (this.cache && this.config.caching) {
        const cacheKey = this.buildCacheKey(context, mode);
        const cached = await this.cache.get(cacheKey);
        if (cached) {
          this.recordMetrics(mode, subjectType, startTime, true, 0, undefined, true);
          return { kind: 'success', explanation: cached };
        }
      }

      // Step 3: Render prompts
      const renderedPrompt = this.renderPrompts(scope, context, mode);

      // Step 4: Build provider request
      const generateOptions = this.requestBuilder.build({
        renderedPrompt,
        context,
        mode,
        config: this.config,
      });

      // Step 5: Call provider
      const providerResult = await this.providerManager.generate(
        () => generateOptions,
        subjectId,
        subjectType,
      );

      // Handle provider error
      if ('kind' in providerResult && providerResult.kind === 'error') {
        this.auditLogInteraction(subjectId, subjectType, mode, startTime, false, {
          errorCode: providerResult.error.code,
          errorMessage: providerResult.error.message,
        });
        this.recordMetrics(mode, subjectType, startTime, false, 0, providerResult.error.code);
        return providerResult.error;
      }

      const generateResult = providerResult as GenerateResult;

      // Step 6: Parse response
      const explanation = this.responseParser.parse(
        generateResult,
        subjectId,
        subjectType as 'finding' | 'chain' | 'risk' | 'report',
        mode,
        renderedPrompt.version,
      );

      // Step 7: Cache result (if enabled)
      if (this.cache && this.config.caching && !explanation.refused) {
        const cacheKey = this.buildCacheKey(context, mode);
        await this.cache.set(cacheKey, explanation);
      }

      // Step 8: Audit log
      this.auditLogInteraction(subjectId, subjectType, mode, startTime, true, {
        provider: generateResult.provider,
        model: generateResult.model,
        promptTokens: generateResult.usage.promptTokens,
        completionTokens: generateResult.usage.completionTokens,
        totalTokens: generateResult.usage.totalTokens,
      });

      // Step 9: Record metrics
      this.recordMetrics(mode, subjectType, startTime, true, 0, undefined, false);

      return { kind: 'success', explanation };
    } catch (error) {
      // Catch unexpected errors
      const err = error instanceof Error ? error : new Error(String(error));
      const duration = Date.now() - startTime;

      // Map to ExplainError
      const explainError = mapProviderError(err, subjectId, subjectType);

      this.auditLogInteraction(subjectId, subjectType, mode, startTime, false, {
        errorCode: explainError.code,
        errorMessage: err.message,
      });

      this.recordMetrics(mode, subjectType, startTime, false, 0, explainError.code);

      return explainError;
    }
  }

  /**
   * Get the subject ID from a scope.
   */
  private getSubjectId(scope: ExplainScope): string {
    switch (scope.type) {
      case 'finding':
        return scope.findingId;
      case 'chain':
        return scope.chainId;
      case 'risk':
        return scope.dimensionId;
      case 'report':
        return 'report-summary';
    }
  }

  /**
   * Build a cache key from context and mode.
   */
  private buildCacheKey(context: ExplainedContext, mode: ExplanationMode): CacheKey {
    return {
      promptVersion: context.contextSchemaVersion ?? '1.0.0',
      modelId: this.config.provider.active,
      modelVersion: this.engineVersion,
      inputHash: this.computeContextHash(context),
      engineVersion: this.engineVersion,
      mode,
    };
  }

  /**
   * Compute a deterministic hash from the context for cache keying.
   */
  private computeContextHash(context: ExplainedContext): string {
    // Use deterministic JSON serialization (sorted keys)
    const json = JSON.stringify(context, Object.keys(context).sort());
    // Simple hash (SHA-256 will be used in M7)
    let hash = 0;
    for (let i = 0; i < json.length; i++) {
      const char = json.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Render prompts for the given scope, context, and mode.
   *
   * @param scope - The explanation scope.
   * @param context - The explained context.
   * @param mode - The explanation mode (simple/technical/expert), used for template selection.
   */
  private renderPrompts(
    scope: ExplainScope,
    context: ExplainedContext,
    mode: ExplanationMode,
  ): RenderedPrompt {
    const templateIds = TEMPLATE_IDS[scope.type];
    if (!templateIds) {
      throw new Error(`No template mapping for scope type: ${scope.type}`);
    }

    // Flatten context for template rendering
    const flatContext = this.flattenContext(context);

    // Render user prompt with the actual mode
    const rendered = this.promptRegistry.render(templateIds.user, flatContext, mode);

    // If a system template is available, override the system prompt
    if (templateIds.system && this.promptRegistry.has(templateIds.system)) {
      const systemRendered = this.promptRegistry.render(templateIds.system, flatContext, mode);
      return {
        ...rendered,
        systemPrompt: systemRendered.userPrompt,
      };
    }

    return rendered;
  }

  /**
   * Flatten context for template rendering.
   */
  private flattenContext(context: ExplainedContext): Record<string, unknown> {
    const flat: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(context)) {
      if (value !== undefined && value !== null) {
        flat[key] = value;
      }
    }
    return flat;
  }

  /**
   * Audit log the interaction.
   */
  private auditLogInteraction(
    subjectId: string,
    subjectType: string,
    mode: ExplanationMode,
    startTime: number,
    success: boolean,
    details: {
      provider?: string;
      model?: string;
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
      errorCode?: string;
      errorMessage?: string;
    },
  ): void {
    if (!this.auditLog) return;

    const entry = this.auditLog.createEntry({
      subjectId,
      subjectType,
      mode,
      provider: details.provider ?? this.config.provider.active,
      model: details.model ?? 'unknown',
      promptVersion: '1.0.0',
      promptTokens: details.promptTokens,
      completionTokens: details.completionTokens,
      totalTokens: details.totalTokens,
      success,
      errorCode: details.errorCode,
      errorMessage: details.errorMessage,
      durationMs: Date.now() - startTime,
    });

    // Log-before-return: write before returning the result
    this.auditLog.log(entry);
  }

  /**
   * Record metrics for the interaction.
   */
  private recordMetrics(
    mode: ExplanationMode,
    subjectType: string,
    startTime: number,
    success: boolean,
    retries: number,
    errorCode?: string,
    cacheHit?: boolean,
  ): void {
    if (!this.metrics) return;

    this.metrics.recordRequest({
      mode,
      subjectType,
      latencyMs: Date.now() - startTime,
      success,
      retries,
      cacheHit,
      errorCode,
    });
  }
}
