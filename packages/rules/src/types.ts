/**
 * Core types for @veris/rules.
 *
 * A Rule never scans files directly.
 * A Rule only evaluates Evidence produced by the Analysis layer.
 *
 * Rules consume:
 *   - Evidence
 *   - Features
 *   - Capabilities
 *
 * Rules produce ONLY:
 *   - RuleMatch
 *
 * @module @veris/rules/types
 */

import type { CancellationToken } from '@veris/shared';

// ── Identifiers ──

/** Unique rule identifier (e.g., "RULE-WIN-INJECTION-001"). */
export type RuleId = string;

/** Rule category for grouping and priority ordering. */
export type RuleCategory =
  | 'injection'
  | 'persistence'
  | 'obfuscation'
  | 'execution'
  | 'credential-access'
  | 'privilege-escalation'
  | 'defense-evasion'
  | 'discovery'
  | 'exfiltration'
  | 'container'
  | 'supply-chain'
  | 'configuration'
  | 'best-practice';

/** Severity hint — NOT final severity, just a hint for later phases. */
export type RuleSeverityHint = 'critical' | 'high' | 'medium' | 'low' | 'info';

// ── Reference Types (what rules evaluate against) ──

/** Lightweight evidence reference — rules never hold full evidence objects. */
export interface EvidenceRef {
  /** Evidence ID. */
  readonly id: string;
  /** Evidence type (e.g., "pe-import", "high-entropy"). */
  readonly type: string;
  /** Evidence category (e.g., "executable", "obfuscation"). */
  readonly category: string;
  /** Confidence score [0.0, 1.0]. */
  readonly confidence: number;
  /** The artifact this evidence relates to. */
  readonly artifactId: string;
  /** The artifact type (e.g., "executable", "script"). */
  readonly artifactType: string;
  /** Optional metadata for advanced condition matching. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Lightweight feature reference. */
export interface FeatureRef {
  /** Feature ID. */
  readonly id: string;
  /** Feature type (e.g., "string-literal", "import-statement"). */
  readonly type: string;
  /** The extracted value. */
  readonly value: unknown;
  /** Confidence score [0.0, 1.0]. */
  readonly confidence: number;
  /** Optional metadata. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Lightweight capability reference. */
export interface CapabilityRef {
  /** Capability ID. */
  readonly id: string;
  /** Capability type (e.g., "process-injection", "dll-hijacking"). */
  readonly type: string;
  /** Confidence score [0.0, 1.0]. */
  readonly confidence: number;
  /** Optional metadata. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ── Rule Condition ──

/**
 * Deterministic rule condition.
 *
 * Supports logical operators, set operators, count operators,
 * existence/comparison operators, and type matchers.
 */
export type RuleCondition =
  // Logical operators
  | { readonly type: 'and'; readonly conditions: readonly RuleCondition[] }
  | { readonly type: 'or'; readonly conditions: readonly RuleCondition[] }
  | { readonly type: 'not'; readonly condition: RuleCondition }
  // Set operators
  | { readonly type: 'all_of'; readonly field: string; readonly values: readonly unknown[] }
  | { readonly type: 'any_of'; readonly conditions: readonly RuleCondition[] }
  | { readonly type: 'none_of'; readonly conditions: readonly RuleCondition[] }
  // Count operators
  | { readonly type: 'minimum_count'; readonly field: string; readonly count: number }
  | { readonly type: 'maximum_count'; readonly field: string; readonly count: number }
  // Existence / comparison
  | { readonly type: 'exists'; readonly field: string }
  | { readonly type: 'equals'; readonly field: string; readonly value: unknown }
  | { readonly type: 'contains'; readonly field: string; readonly value: unknown }
  | { readonly type: 'regex'; readonly field: string; readonly pattern: string }
  | { readonly type: 'range'; readonly field: string; readonly min?: number; readonly max?: number }
  | { readonly type: 'confidence_threshold'; readonly threshold: number }
  // Type matchers
  | { readonly type: 'artifact_type'; readonly artifactType: string }
  | { readonly type: 'feature_type'; readonly featureType: string }
  | { readonly type: 'evidence_type'; readonly evidenceType: string }
  | { readonly type: 'capability_type'; readonly capabilityType: string };

// ── Rule ──

/** A deterministic, immutable rule definition. */
export interface Rule {
  /** Unique rule identifier. */
  readonly id: RuleId;
  /** Rule category for grouping and priority ordering. */
  readonly category: RuleCategory;
  /** Human-readable name. */
  readonly name: string;
  /** Detailed description of what this rule detects. */
  readonly description: string;
  /** The condition that must be satisfied for a match. */
  readonly condition: RuleCondition;
  /** Severity hint — NOT final severity. */
  readonly severityHint: RuleSeverityHint;
  /**
   * Explanation template.
   * Must include {{evidence}}, {{features}}, {{capabilities}} placeholders
   * that get dynamically filled during matching.
   */
  readonly explanationTemplate: string;
  /** MITRE ATT&CK technique IDs (when applicable). */
  readonly mitreTechniques: readonly string[];
  /** External reference URLs. */
  readonly references: readonly string[];
  /** Categorization tags. */
  readonly tags: readonly string[];
}

// ── Rule Match ──

/** The result of a single rule evaluation — the ONLY output of rule evaluation. */
export interface RuleMatch {
  /** The rule ID that matched. */
  readonly ruleId: RuleId;
  /** Human-readable title. */
  readonly title: string;
  /** Detailed description of the match. */
  readonly description: string;
  /** IDs of evidence items that contributed to this match. */
  readonly matchedEvidenceIds: readonly string[];
  /** IDs of features that contributed to this match. */
  readonly matchedFeatureIds: readonly string[];
  /** IDs of capabilities that contributed to this match. */
  readonly matchedCapabilityIds: readonly string[];
  /** Human-readable explanation of WHY the rule matched. */
  readonly explanation: string;
  /** Confidence contribution [0.0, 1.0]. */
  readonly confidenceContribution: number;
  /** External reference URLs. */
  readonly references: readonly string[];
  /** MITRE ATT&CK technique IDs. */
  readonly mitreTechniques: readonly string[];
}

// ── Rule Evaluation ──

/** The result of evaluating a single rule against input data. */
export interface RuleEvaluation {
  /** The rule ID. */
  readonly ruleId: RuleId;
  /** Whether the rule matched. */
  readonly matched: boolean;
  /** The match result (only present if matched). */
  readonly match?: RuleMatch;
  /** Duration of evaluation in milliseconds. */
  readonly durationMs: number;
  /** Error message if the rule failed to evaluate. */
  readonly error?: string;
}

// ── Rule Registry ──

/** Priority-ordered rule registry for rule storage and lookup. */
export interface IRuleRegistry {
  /** Register one or more rules. */
  register(...rules: Rule[]): void;
  /** Unregister a rule by ID. */
  unregister(ruleId: RuleId): boolean;
  /** Look up a rule by ID. */
  lookup(ruleId: RuleId): Rule | undefined;
  /** Get all registered rules, ordered by priority (category ordering). */
  getAll(): readonly Rule[];
  /** Get all rules in a specific category. */
  getByCategory(category: RuleCategory): readonly Rule[];
  /** Get the total number of registered rules. */
  readonly size: number;
  /** Clear all registered rules. */
  clear(): void;
}

// ── Rule Engine ──

/** Configuration options for the RuleEngine. */
export interface RuleEngineOptions {
  /** Timeout per rule in milliseconds (default: 5000). */
  readonly timeoutMs?: number;
  /** Maximum concurrent rule evaluations (default: 4). */
  readonly concurrency?: number;
  /** Cancellation token. */
  readonly cancellationToken?: CancellationToken;
}

/** The result of a full rule engine evaluation cycle. */
export interface RuleEngineResult {
  /** All rule evaluations, in deterministic order. */
  readonly evaluations: readonly RuleEvaluation[];
  /** Only the matched evaluations. */
  readonly matches: readonly RuleMatch[];
  /** Aggregate diagnostics. */
  readonly diagnostics: RuleEngineDiagnostics;
}

// ── Rule Engine Diagnostics ──

export interface RuleEngineDiagnostics {
  /** Total rules evaluated. */
  readonly totalRules: number;
  /** Rules that matched. */
  readonly matchedRules: number;
  /** Rules that failed with an error. */
  readonly failedRules: number;
  /** Total evaluation time in milliseconds. */
  readonly totalDurationMs: number;
  /** Per-rule diagnostics. */
  readonly perRule: readonly RuleDiagnosticsEntry[];
}

export interface RuleDiagnosticsEntry {
  /** Rule ID. */
  readonly ruleId: RuleId;
  /** Whether the rule matched. */
  readonly matched: boolean;
  /** Evaluation duration in milliseconds. */
  readonly durationMs: number;
  /** Error message if failed. */
  readonly error?: string;
}

// ── Validation ──

export interface ValidationResult {
  /** Whether validation passed. */
  readonly valid: boolean;
  /** Validation errors, if any. */
  readonly errors: readonly ValidationError[];
}

export interface ValidationError {
  /** Error code. */
  readonly code: string;
  /** Human-readable message. */
  readonly message: string;
  /** Rule ID if the error is rule-specific. */
  readonly ruleId?: RuleId;
  /** Path to the problematic field. */
  readonly path?: string;
}

// ── Builder Interface ──

export interface IRuleBuilder {
  /** Set the rule ID. */
  id(id: RuleId): IRuleBuilder;
  /** Set the rule category. */
  category(category: RuleCategory): IRuleBuilder;
  /** Set the rule name. */
  name(name: string): IRuleBuilder;
  /** Set the rule description. */
  description(description: string): IRuleBuilder;
  /** Set the rule condition. */
  condition(condition: RuleCondition): IRuleBuilder;
  /** Set the severity hint. */
  severityHint(hint: RuleSeverityHint): IRuleBuilder;
  /** Set the explanation template. */
  explanationTemplate(template: string): IRuleBuilder;
  /** Add MITRE ATT&CK techniques. */
  mitreTechniques(...techniques: string[]): IRuleBuilder;
  /** Add reference URLs. */
  references(...refs: string[]): IRuleBuilder;
  /** Add tags. */
  tags(...tags: string[]): IRuleBuilder;
  /** Build and freeze the rule. Validates before building. */
  build(): Rule;
}

// ── Condition Evaluation Context ──

/** The data context against which rule conditions are evaluated. */
export interface EvaluationContext {
  /** Evidence to evaluate. */
  readonly evidence: readonly EvidenceRef[];
  /** Features to evaluate. */
  readonly features: readonly FeatureRef[];
  /** Capabilities to evaluate. */
  readonly capabilities: readonly CapabilityRef[];
}
