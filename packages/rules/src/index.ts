/**
 * @veris/rules — VERIS rule engine for deterministic, immutable rule evaluation.
 *
 * Rules consume Evidence, Features, and Capabilities.
 * Rules produce ONLY RuleMatch.
 *
 * ## Invariants
 * - Rules NEVER scan files directly
 * - Rules NEVER duplicate evidence (only store IDs)
 * - Rules are deterministic — same input always produces same output
 * - All public outputs are frozen (immutable)
 * - No mutable shared state
 * - No AI, no scoring, no risk calculation, no severity calculation
 *
 * ## Pipeline
 * Evidence + Features + Capabilities
 *   ↓
 * RuleEngine.evaluate()
 *   ↓
 * RuleMatch[]
 *   ↓
 * Diagnostics
 *
 * @module @veris/rules
 */

// Types
export type {
  RuleId,
  RuleCategory,
  RuleSeverityHint,
  RuleCondition,
  Rule,
  RuleMatch,
  RuleEvaluation,
  RuleEngineOptions,
  RuleEngineResult,
  RuleEngineDiagnostics,
  RuleDiagnosticsEntry,
  ValidationResult,
  ValidationError,
  IRuleRegistry,
  IRuleBuilder,
  EvaluationContext,
  EvidenceRef,
  FeatureRef,
  CapabilityRef,
} from './types.js';

// Conditions
export { evaluateCondition } from './condition-evaluator.js';
export type { ConditionMatchResult } from './condition-evaluator.js';

// Builder
export { RuleBuilder } from './rule-builder.js';

// Validator
export { validateRuleDefinition, validateRuleSet, clearValidationState } from './rule-validator.js';
export { validateCondition } from './condition-validator.js';

// Registry
export { RuleRegistry } from './rule-registry.js';

// Engine
export { RuleEngine } from './rule-engine.js';

// Diagnostics
export { RuleDiagnosticsCollector } from './rule-diagnostics.js';

// Built-in Rules
export { BUILT_IN_RULES, BUILT_IN_RULES_BY_CATEGORY } from './built-in/index.js';
