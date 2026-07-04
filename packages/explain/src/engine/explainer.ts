/**
 * Explainer interface — the top-level orchestrator for AI explanations.
 *
 * Coordinates: Scope Manager → Context Builder → Prompt Renderer →
 * Provider → Citation Verifier → Validation Agent → Formatter
 *
 * Provider contracts (LLMProvider, ProviderRegistry, ProviderCapabilities,
 * GenerateOptions, GenerateResult, GenerateChunk) are owned by @veris/ai.
 *
 * @module @veris/explain/engine/explainer
 */

import type {
  LLMProvider,
  ProviderCapabilities,
  GenerateOptions,
  GenerateResult,
  GenerateChunk,
  ProviderRegistry,
} from '@veris/ai';
import type { CanonicalReport } from '@veris/core';
import type { Logger } from '@veris/logger';

import type { PromptRegistry } from '../prompts/index.js';
import type { ExplainConfig } from '../types/config.js';
import type { ExplanationMode } from '../types/explanation.js';
import type { ExplainResult } from '../types/result.js';

// ═══════════════════════════════════════════════════════════════════════════
// Provider contracts — imported from @veris/ai (Milestone M2)
// @veris/explain MUST NOT define provider contracts.
// ═══════════════════════════════════════════════════════════════════════════

import type { Explainer, ExplainerOptions } from './engine-types.js';
import { createExplanationEngine } from './explanation-engine.js';

// Re-export cache types from the shared types file to break circular dependencies.
export type {
  PersistentCache,
  CacheKey,
  CacheInvalidationFilter,
  CacheStats,
} from './persistent-cache-types.js';
export type { Explainer, ExplainerOptions };

/**
 * Create the main explainer instance.
 *
 * Delegates to createExplanationEngine for the full M5 implementation.
 *
 * @param options - Configuration, provider registry, prompt registry, etc.
 * @returns An Explainer instance ready to generate explanations.
 */
export function createExplainer(options: ExplainerOptions): Explainer {
  return createExplanationEngine(options);
}
