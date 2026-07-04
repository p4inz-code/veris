/**
 * @veris/correlation — VERIS correlation engine.
 *
 * Correlates related evidence into deterministic behavioral chains.
 *
 * ## Pipeline Position
 * Rules → **Correlation** → Risk → Recommendations → AI Assistant
 *
 * ## Invariants
 * - No AI, no scoring, no risk, no severity
 * - No recommendations, no telemetry
 * - Deterministic outputs
 * - Immutable outputs (Object.freeze everywhere)
 * - Confidence inherited ONLY from supporting evidence
 *
 * ## Pipeline
 * RuleMatches + Evidence + Features + Capabilities
 *   ↓
 * CorrelationEngine.evaluate()
 *   ↓
 * Correlation[]
 *   ↓
 * Diagnostics
 *
 * @module @veris/correlation
 */

// Types
export type {
  CorrelationId,
  CorrelationCategory,
  CorrelationCondition,
  Correlation,
  CorrelationPattern,
  CorrelationEvaluation,
  CorrelationContext,
  CorrelationProvenance,
  CorrelationEngineOptions,
  CorrelationEngineResult,
  CorrelationEngineDiagnostics,
  CorrelationDiagnosticsEntry,
  EvidenceRef,
  FeatureRef,
  CapabilityRef,
  ValidationResult,
  ValidationError,
  ICorrelationRegistry,
  ICorrelationBuilder,
} from './types.js';

// Builder
export { CorrelationBuilder } from './correlation-builder.js';

// Validator
export {
  validatePatternDefinition,
  validatePatternSet,
  clearValidationState,
} from './correlation-validator.js';

// Registry
export { CorrelationRegistry } from './correlation-registry.js';

// Engine
export { CorrelationEngine } from './correlation-engine.js';

// Diagnostics
export { CorrelationDiagnosticsCollector } from './correlation-diagnostics.js';

// Built-in Patterns
export { BUILT_IN_PATTERNS, BUILT_IN_PATTERNS_BY_CATEGORY } from './built-in/index.js';
