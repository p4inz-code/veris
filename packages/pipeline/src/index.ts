/**
 * @veris/pipeline — VERIS pipeline orchestration.
 *
 * Wires together the full deterministic analysis pipeline:
 *   Analysis → Rules → Correlation → RiskEvaluator → DecisionEngine
 *
 * ## Pipeline
 *
 * ```
 * Evidence + Features
 *   ↓
 * RuleEngine — produces RuleMatch[]
 *   ↓
 * CorrelationEngine — produces Correlation[]
 *   ↓
 * RiskEvaluator — produces RiskAssessment
 *   ↓
 * DecisionEngine — produces RiskDecision
 *   ↓
 * All outputs available for Explain layer
 * ```
 *
 * ## Core Invariants
 * - No AI — every stage is purely deterministic.
 * - No state — the orchestrator is stateless and thread-safe.
 * - Constructor dependency injection only.
 * - Frozen outputs everywhere.
 *
 * @module @veris/pipeline
 */

// Pipeline Orchestrator
export {
  PipelineOrchestrator,
  createDefaultPipeline,
  createPipelineWithFactory,
} from './pipeline-orchestrator.js';

export type {
  PipelineConfig,
  PipelineInput,
  PipelineResult,
  PipelineDiagnostics,
  EngineFactory,
} from './pipeline-orchestrator.js';
