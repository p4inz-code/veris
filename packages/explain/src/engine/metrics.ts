/**
 * Metrics — aggregated metrics for monitoring explanation engine performance.
 *
 * Collects:
 * - Request count (total, by mode, by subject type)
 * - Success/failure counts
 * - Retry count
 * - Provider latency (min, max, avg)
 * - Token usage (prompt, completion, total)
 * - Cache hit/miss
 * - Streaming metrics
 *
 * @module @veris/explain/engine/metrics
 */

import type { ExplanationMode } from '../types/explanation.js';

// ── Types ──

/** Aggregated metrics snapshot. */
export interface MetricsSnapshot {
  readonly totalRequests: number;
  readonly successfulRequests: number;
  readonly failedRequests: number;
  readonly refusedRequests: number;
  readonly totalRetries: number;
  readonly cacheHits: number;
  readonly cacheMisses: number;
  readonly avgLatencyMs: number;
  readonly minLatencyMs: number;
  readonly maxLatencyMs: number;
  readonly totalPromptTokens: number;
  readonly totalCompletionTokens: number;
  readonly totalTokens: number;
  readonly requestsByMode: Record<string, number>;
  readonly requestsBySubjectType: Record<string, number>;
  readonly errorsByCode: Record<string, number>;
}

// ── Metrics ──

/**
 * Collects and aggregates metrics for the explanation engine.
 */
export class Metrics {
  private totalRequests = 0;
  private successfulRequests = 0;
  private failedRequests = 0;
  private refusedRequests = 0;
  private totalRetries = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private latencies: number[] = [];
  private static readonly MAX_LATENCY_SAMPLES = 10000;
  private totalPromptTokens = 0;
  private totalCompletionTokens = 0;
  private totalTokens = 0;
  private readonly requestsByMode: Map<string, number> = new Map();
  private readonly requestsBySubjectType: Map<string, number> = new Map();
  private readonly errorsByCode: Map<string, number> = new Map();

  /**
   * Record a request.
   */
  recordRequest(fields: {
    readonly mode: ExplanationMode;
    readonly subjectType: string;
    readonly latencyMs: number;
    readonly success: boolean;
    readonly refused?: boolean;
    readonly retries?: number;
    readonly cacheHit?: boolean;
    readonly promptTokens?: number;
    readonly completionTokens?: number;
    readonly errorCode?: string;
  }): void {
    this.totalRequests++;
    // Cap latency samples to prevent unbounded memory growth
    if (this.latencies.length < Metrics.MAX_LATENCY_SAMPLES) {
      this.latencies.push(fields.latencyMs);
    }

    // Mode tracking
    const modeCount = this.requestsByMode.get(fields.mode) ?? 0;
    this.requestsByMode.set(fields.mode, modeCount + 1);

    // Subject type tracking
    const typeCount = this.requestsBySubjectType.get(fields.subjectType) ?? 0;
    this.requestsBySubjectType.set(fields.subjectType, typeCount + 1);

    // Success/failure
    if (fields.success) {
      this.successfulRequests++;
    } else if (fields.refused) {
      this.refusedRequests++;
    } else {
      this.failedRequests++;
    }

    // Error code tracking
    if (fields.errorCode) {
      const errorCount = this.errorsByCode.get(fields.errorCode) ?? 0;
      this.errorsByCode.set(fields.errorCode, errorCount + 1);
    }

    // Cache tracking
    if (fields.cacheHit) {
      this.cacheHits++;
    } else {
      this.cacheMisses++;
    }

    // Retry tracking
    if (fields.retries) {
      this.totalRetries += fields.retries;
    }

    // Token tracking
    if (fields.promptTokens) this.totalPromptTokens += fields.promptTokens;
    if (fields.completionTokens) this.totalCompletionTokens += fields.completionTokens;
    this.totalTokens = this.totalPromptTokens + this.totalCompletionTokens;
  }

  /**
   * Get a snapshot of current metrics.
   */
  snapshot(): MetricsSnapshot {
    const sortedLatencies = [...this.latencies].sort((a, b) => a - b);

    return {
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      refusedRequests: this.refusedRequests,
      totalRetries: this.totalRetries,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      avgLatencyMs:
        this.latencies.length > 0
          ? Math.round(this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length)
          : 0,
      minLatencyMs: sortedLatencies[0] ?? 0,
      maxLatencyMs: sortedLatencies[sortedLatencies.length - 1] ?? 0,
      totalPromptTokens: this.totalPromptTokens,
      totalCompletionTokens: this.totalCompletionTokens,
      totalTokens: this.totalTokens,
      requestsByMode: Object.fromEntries(this.requestsByMode),
      requestsBySubjectType: Object.fromEntries(this.requestsBySubjectType),
      errorsByCode: Object.fromEntries(this.errorsByCode),
    };
  }

  /**
   * Reset all metrics.
   */
  reset(): void {
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.refusedRequests = 0;
    this.totalRetries = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.latencies = [];
    this.totalPromptTokens = 0;
    this.totalCompletionTokens = 0;
    this.totalTokens = 0;
    this.requestsByMode.clear();
    this.requestsBySubjectType.clear();
    this.errorsByCode.clear();
  }
}
