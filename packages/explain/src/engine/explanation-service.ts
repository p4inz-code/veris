/**
 * Explanation service — higher-level API for the Explainer engine.
 *
 * Provides a cleaner API surface for CLI and API consumers:
 * - Simple one-method explain() that auto-detects subject type
 * - Batch explanation support
 * - Streaming support (preparation for M6/M8)
 * - Metrics snapshots
 * - Audit log access
 *
 * @module @veris/explain/engine/explanation-service
 */

import type { CanonicalReport } from '@veris/core';

import type { Explanation, ExplanationMode } from '../types/explanation.js';
import type { ExplainResult } from '../types/result.js';

import { AuditLog } from './audit-log.js';
import type { Explainer } from './explainer.js';
import type { MetricsSnapshot } from './metrics.js';

// ── Explain Target ──

/** The subject of an explanation request. */
export type ExplainTarget =
  | { readonly type: 'finding'; readonly id: string }
  | { readonly type: 'chain'; readonly id: string }
  | { readonly type: 'risk'; readonly id: string }
  | { readonly type: 'report' };

// ── Explain Batch Request ──

/** A batch of explanation requests. */
export interface ExplainBatchRequest {
  readonly requests: readonly {
    readonly target: ExplainTarget;
    readonly mode?: ExplanationMode;
  }[];
}

// ── ExplanationService ──

/**
 * Higher-level service wrapping the Explainer.
 *
 * Provides:
 * - explain(target, report, mode) — auto-detects subject type
 * - explainBatch(batch, report) — batch explanations
 * - getMetrics() — metrics snapshot
 * - clearCache() — clear the entire cache
 */
export class ExplanationService {
  private readonly engine: Explainer;

  constructor(engine: Explainer) {
    this.engine = engine;
  }

  /**
   * Explain a subject.
   *
   * Auto-detects the subject type from the target and delegates
   * to the appropriate Explainer method.
   *
   * @param target - The subject to explain.
   * @param report - The canonical report.
   * @param mode - Optional explanation mode (defaults to engine config).
   * @returns The explanation result.
   */
  async explain(
    target: ExplainTarget,
    report: CanonicalReport,
    mode?: ExplanationMode,
  ): Promise<ExplainResult> {
    switch (target.type) {
      case 'finding':
        return this.engine.explainFinding(target.id, report, mode);
      case 'chain':
        return this.engine.explainChain(target.id, report, mode);
      case 'risk':
        return this.engine.explainRiskDimension(target.id, report, mode);
      case 'report':
        return this.engine.summarizeReport(report, mode);
    }
  }

  /**
   * Explain multiple subjects.
   *
   * All explanations run sequentially (not in parallel) to respect
   * rate limits and provider fairness.
   *
   * @param batch - The batch requests.
   * @param report - The canonical report.
   * @returns Array of explain results in the same order as requests.
   */
  async explainBatch(
    batch: ExplainBatchRequest,
    report: CanonicalReport,
  ): Promise<readonly ExplainResult[]> {
    const results: ExplainResult[] = [];

    for (const request of batch.requests) {
      const result = await this.explain(request.target, report, request.mode);
      results.push(result);
    }

    return results;
  }

  /**
   * Get a snapshot of the current engine metrics.
   *
   * @returns A metrics snapshot, or undefined if metrics are not available.
   */
  getMetrics(): MetricsSnapshot | undefined {
    if (this.engine instanceof Object && 'getMetrics' in this.engine) {
      // Safe: verified via has-check that getMetrics() exists on the engine
      const engine = this.engine as { getMetrics(): { snapshot(): MetricsSnapshot } };
      return engine.getMetrics().snapshot();
    }
    return undefined;
  }

  /**
   * Clear the explanation cache.
   */
  async clearCache(): Promise<void> {
    if (this.engine instanceof Object && 'clearCacheForReport' in this.engine) {
      await this.engine.clearCacheForReport('__all__');
    }
  }
}
