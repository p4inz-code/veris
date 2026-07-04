/**
 * @veris/risk — VERIS risk engine.
 *
 * Transforms deterministic evidence (rule matches, correlations, evidence)
 * into explainable risk assessments with full traceability.
 *
 * ## Pipeline Position
 * Rules → Correlation → **Risk** → Recommendations → AI Assistant
 *
 * ## Core Invariants
 * - No AI — every value is derived from deterministic formulas.
 * - No scoring without evidence — risk comes from contributions, not invention.
 * - Fully explainable — every number traces to a formula and its inputs.
 * - Immutable outputs — every object is frozen, every array is readonly.
 * - No hidden heuristics — every coefficient is documented in constants.
 *
 * ## Pipeline
 * RuleMatches + Correlations + Evidence
 *   ↓
 * RiskEngine.evaluate()
 *   ↓
 * RiskAssessment (score, verdict, confidence, contributions)
 *   ↓
 * Explainability (on-demand explanation views)
 *
 * @module @veris/risk
 */

// Types
export type {
  RiskLevel,
  Verdict,
  SourceType,
  Contribution,
  RiskAssessment,
  RiskInput,
  RiskRuleMatch,
  RiskCorrelation,
  RiskEvidence,
  RiskEngineOptions,
  RiskDiagnosticsWriter,
  MultiplierItem,
  FormulaStep,
  FormulaSteps,
} from './types.js';

// Constants
export {
  // Versioning
  SCHEMA_VERSION,
  ENGINE_VERSION,

  // ID prefixes
  ASSESSMENT_ID_PREFIX,
  CONTRIBUTION_ID_PREFIX,

  // Mathematical constants
  PI_OVER_2,
  ROUND_PRECISION_INTERMEDIATE,
  ROUND_PRECISION_FINAL,

  // Score bounds
  RISK_SCORE_MIN,
  RISK_SCORE_MAX,
  CONFIDENCE_MIN,
  CONFIDENCE_MAX,
  CONFIDENCE_MIN_SUFFICIENT,

  // Ordering (used by tests and consumers for determinism verification)
  RISK_LEVEL_ORDER,
  VERDICT_ORDER,

  // Defaults
  DEFAULT_CONCURRENCY,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_CONTRIBUTIONS,

  // Multipliers
  SEVERITY_MULTIPLIER_BASE,
  CHAIN_MULTIPLIER_INCREMENT,
  CHAIN_MULTIPLIER_CAP,

  // Thresholds
  VERDICT_THRESHOLDS,
} from './constants.js';

export type { VerdictThresholdsConfig } from './constants.js';

// Constants from types.ts (branded values)
export { VERDICTS, SOURCE_TYPES } from './types.js';

// Scoring primitives
export {
  round2,
  round6,
  clamp,
  saturate,
  computeContributionValue,
  computeDimensionWeight,
} from './scoring.js';

// Contribution builder
export { buildContributions, validateContributionInput } from './contribution-builder.js';

export type { ValidationResult } from './contribution-builder.js';

// Aggregator
export { aggregateByDimension, computeEffectiveWeight } from './aggregator.js';

export type { DimensionSummary, AggregationResult } from './aggregator.js';

// Verdict resolution
export {
  resolveVerdict,
  resolveVerdictValue,
  getDefaultThresholds,
  validateVerdictThresholds,
} from './verdict.js';

export type { VerdictResult, ThresholdValidationResult } from './verdict.js';

// Assessment confidence
export { computeAssessmentConfidence } from './confidence.js';

export type { ConfidenceBreakdown, ConfidenceFactors } from './confidence.js';

// Risk Engine
export { RiskEngine } from './engine.js';

// Diagnostics
export { RiskDiagnosticsCollector, createNoopDiagnosticsWriter } from './diagnostics.js';

export type { RiskEngineDiagnostics, StageTiming, TruncationInfo } from './diagnostics.js';

// Explainers
export {
  explainContribution,
  explainDimension,
  breakdownByDimension,
  topContributions,
} from './explainer.js';

export type {
  ContributionExplanation,
  DimensionExplanation,
  DimensionBreakdown,
  TopContributionsResult,
} from './explainer.js';

// ── SPEC-012: Weighting ──
export {
  DEFAULT_WEIGHT_PROFILE,
  createWeightProfile,
  validateWeightProfile,
  getDimensionWeight,
  getEvidenceCategoryWeight,
  isDefaultWeightProfile,
  createDimensionWeightFn,
} from './weighting.js';

export type { DimensionWeights, EvidenceCategoryWeights, WeightProfile } from './weighting.js';

// ── SPEC-012: Thresholds ──
export {
  DEFAULT_THRESHOLD_PROFILE,
  createThresholdProfile,
  validateThresholdProfile,
  validateRiskLevelThresholds,
  resolveRiskLevelFromProfile,
} from './thresholds.js';

export type { RiskLevelThresholds, ThresholdProfile } from './thresholds.js';

// ── SPEC-012: Evaluator ──
export { RiskEvaluator, validateEvaluatorInput } from './evaluator.js';

export type {
  SourceRuleMatch,
  SourceCorrelation,
  SourceEvidence,
  EvaluatorInput,
  EvaluatorConfig,
} from './evaluator.js';

// ── SPEC-012: Decision Engine ──
export { DecisionEngine } from './decision-engine.js';

export type {
  DecisionAction,
  DecisionPriority,
  DecisionRecommendation,
  RiskDecision,
  DecisionEngineConfig,
} from './decision-engine.js';
