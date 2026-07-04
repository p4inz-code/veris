/**
 * Shared engine interface types for @veris/explain.
 *
 * Extracted to break the circular dependency:
 *   explainer.ts → explanation-engine.ts → explainer.ts
 *
 * Both files can now import these interfaces without creating cycles.
 *
 * @module @veris/explain/engine/engine-types
 */

import type { ProviderRegistry } from '@veris/ai';
import type { CanonicalReport } from '@veris/core';
import type { Logger } from '@veris/logger';

import type { PromptRegistry } from '../prompts/index.js';
import type { ExplainConfig } from '../types/config.js';
import type { ExplanationMode } from '../types/explanation.js';
import type { ExplainResult } from '../types/result.js';

import type { PersistentCache } from './persistent-cache-types.js';

/** Options for creating an Explainer instance. */
export interface ExplainerOptions {
  readonly providerRegistry: ProviderRegistry;
  readonly promptRegistry: PromptRegistry;
  readonly cache?: PersistentCache;
  readonly config: ExplainConfig;
  readonly logger: Logger;
}

/**
 * The top-level orchestrator for AI explanations.
 *
 * Coordinates: Scope Manager → Context Builder → Prompt Renderer →
 * Provider → Citation Verifier → Validation Agent → Formatter
 */
export interface Explainer {
  /** Explain a single finding. */
  explainFinding(
    findingId: string,
    report: CanonicalReport,
    mode?: ExplanationMode,
  ): Promise<ExplainResult>;

  /** Explain a behavior chain. */
  explainChain(
    chainId: string,
    report: CanonicalReport,
    mode?: ExplanationMode,
  ): Promise<ExplainResult>;

  /** Explain a risk dimension. */
  explainRiskDimension(
    dimensionId: string,
    report: CanonicalReport,
    mode?: ExplanationMode,
  ): Promise<ExplainResult>;

  /** Provide a full report summary. */
  summarizeReport(report: CanonicalReport, mode?: ExplanationMode): Promise<ExplainResult>;

  /** Clear the cache for a specific report. */
  clearCacheForReport(reportId: string): Promise<void>;
}
