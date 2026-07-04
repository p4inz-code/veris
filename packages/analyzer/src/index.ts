/**
 * @veris/analyzer — VERIS analysis pipeline orchestrator.
 *
 * Orchestrates the analysis pipeline:
 * 1. Load config
 * 2. Select extractors
 * 3. Run extraction
 * 4. Run rules engine
 * 5. Collect findings
 * 6. Build report
 *
 * This package wraps @veris/pipeline's PipelineOrchestrator and provides
 * a simplified factory interface.
 *
 * ## Invariants (from SPEC-010 §3):
 * - A1: Analysis is deterministic
 * - A2: Analyzer never performs extraction or rule matching itself
 * - A3: Everything works offline
 * - A4: All analysis paths are reproducible
 *
 * @module @veris/analyzer
 */

import {
  PipelineOrchestrator,
  createDefaultPipeline,
  createPipelineWithFactory,
} from '@veris/pipeline';
import type {
  PipelineConfig,
  PipelineInput,
  PipelineResult,
  PipelineDiagnostics,
  EngineFactory,
} from '@veris/pipeline';

export { PipelineOrchestrator, createDefaultPipeline, createPipelineWithFactory };
export type { PipelineConfig, PipelineInput, PipelineResult, PipelineDiagnostics, EngineFactory };

// ── Analyzer Factory ──

/**
 * Create the default analysis pipeline.
 *
 * Convenience wrapper around createDefaultPipeline.
 *
 * @param config - Optional pipeline configuration.
 * @returns A configured PipelineOrchestrator ready to run.
 */
export function createAnalyzer(config?: PipelineConfig): PipelineOrchestrator {
  return createDefaultPipeline(config);
}
