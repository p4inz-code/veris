/**
 * Core types for @veris/correlation.
 *
 * Correlation sits AFTER Rules and BEFORE Risk in the pipeline.
 *
 * Its ONLY responsibility is correlating related evidence into
 * deterministic behavioral chains.
 *
 * ## Pipeline Position
 * Discovery → Classification → Extractors → Knowledge → Analysis
 * → Rules → **Correlation** → Risk → Recommendations → AI Assistant
 *
 * @module @veris/correlation/types
 */

import type { RuleMatch } from '@veris/rules';
import type { CancellationToken } from '@veris/shared';

// ── Identifiers ──

/** Unique correlation identifier (e.g., "CORR-INJECTION-001"). */
export type CorrelationId = string;

/** Correlation category for grouping related behavioral chains. */
export type CorrelationCategory =
  | 'process-injection'
  | 'persistence'
  | 'credential-theft'
  | 'obfuscation'
  | 'download-execution'
  | 'living-off-the-land'
  | 'script-obfuscation'
  | 'macro-execution'
  | 'suspicious-certificate'
  | 'archive-execution-chain'
  | 'defense-evasion'
  | 'privilege-escalation'
  | 'discovery'
  | 'exfiltration'
  | 'container-breakout'
  | 'supply-chain'
  | 'lateral-movement'
  | 'command-and-control';

// ── Reference Types ──

/** Lightweight evidence reference for correlation use. */
export interface EvidenceRef {
  readonly id: string;
  readonly type: string;
  readonly category: string;
  readonly confidence: number;
  readonly artifactId: string;
  readonly artifactType: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Lightweight feature reference. */
export interface FeatureRef {
  readonly id: string;
  readonly type: string;
  readonly value: unknown;
  readonly confidence: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Lightweight capability reference. */
export interface CapabilityRef {
  readonly id: string;
  readonly type: string;
  readonly confidence: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ── Correlation Pattern Condition ──

/**
 * A correlation condition describes what patterns of evidence,
 * rules, features, and capabilities should be linked together.
 */
export type CorrelationCondition =
  // Logical operators
  | { readonly type: 'and'; readonly conditions: readonly CorrelationCondition[] }
  | { readonly type: 'or'; readonly conditions: readonly CorrelationCondition[] }
  | { readonly type: 'not'; readonly condition: CorrelationCondition }
  // Rule reference conditions
  | { readonly type: 'rule_match'; readonly ruleIds: readonly string[] }
  | { readonly type: 'any_rule_match'; readonly ruleCategory?: string }
  // Evidence conditions
  | { readonly type: 'evidence_type'; readonly evidenceTypes: readonly string[] }
  | { readonly type: 'evidence_category'; readonly categories: readonly string[] }
  | { readonly type: 'evidence_artifact'; readonly artifactId: string }
  // Feature conditions
  | { readonly type: 'feature_type'; readonly featureTypes: readonly string[] }
  // Capability conditions
  | { readonly type: 'capability_type'; readonly capabilityTypes: readonly string[] }
  // Count conditions
  | { readonly type: 'minimum_count'; readonly field: string; readonly count: number }
  | { readonly type: 'maximum_count'; readonly field: string; readonly count: number }
  // Relationship conditions
  | { readonly type: 'shared_artifact'; readonly minEvidence?: number }
  | { readonly type: 'shared_artifact_type'; readonly artifactType: string }
  // Confidence
  | { readonly type: 'confidence_threshold'; readonly threshold: number };

// ── Provenance ──

/** Provenance information for a correlation — tracks how it was created. */
export interface CorrelationProvenance {
  /** The correlation pattern ID that produced this correlation. */
  readonly patternId: string;
  /** Timestamp when the correlation was created (ISO 8601). */
  readonly createdAt: string;
  /** Version of the correlation engine. */
  readonly engineVersion: string;
  /** Duration of evaluation in milliseconds. */
  readonly durationMs: number;
}

// ── Correlation ──

/**
 * A Correlation is a deterministic behavioral chain that links related
 * evidence, features, capabilities, and rule matches into a coherent story.
 *
 * Correlations answer: "What pieces of evidence are related?"
 * NOT: "How dangerous is this?"
 */
export interface Correlation {
  /** Deterministic correlation ID (prefix: "corr_"). */
  readonly id: CorrelationId;
  /** Correlation category. */
  readonly category: CorrelationCategory;
  /** Human-readable title. */
  readonly title: string;
  /** Detailed description of the behavioral chain. */
  readonly description: string;
  /** Plain-English explanation of WHY the chain exists. */
  readonly explanation: string;
  /** Evidence IDs that form this chain. */
  readonly evidenceIds: readonly string[];
  /** Feature IDs involved. */
  readonly featureIds: readonly string[];
  /** Capability IDs involved. */
  readonly capabilityIds: readonly string[];
  /** Rule match IDs that contributed to this correlation. */
  readonly ruleIds: readonly string[];
  /** Affected artifact IDs. */
  readonly artifactIds: readonly string[];
  /**
   * Confidence — inherited ONLY from supporting evidence.
   * Never invented or calculated from scoring models.
   */
  readonly confidence: number;
  /** Provenance information. */
  readonly provenance: CorrelationProvenance;
}

// ── Correlation Pattern ──

/**
 * A deterministic pattern that defines how evidence, rule matches, features,
 * and capabilities should be correlated into behavioral chains.
 */
export interface CorrelationPattern {
  /** Unique pattern identifier. */
  readonly id: string;
  /** Correlation category for the resulting chains. */
  readonly category: CorrelationCategory;
  /** Human-readable name. */
  readonly name: string;
  /** Description of what this pattern detects. */
  readonly description: string;
  /** The condition that triggers this correlation. */
  readonly condition: CorrelationCondition;
  /**
   * Explanation template.
   * Supports {{evidence}}, {{features}}, {{capabilities}}, {{rules}} placeholders.
   */
  readonly explanationTemplate: string;
  /** Tags for categorization. */
  readonly tags: readonly string[];
}

// ── Correlation Evaluation ──

/** The result of evaluating a single correlation pattern. */
export interface CorrelationEvaluation {
  /** The pattern ID. */
  readonly patternId: string;
  /** Whether a correlation was produced. */
  readonly matched: boolean;
  /** The resulting correlation (if matched). */
  readonly correlation?: Correlation;
  /** Duration of evaluation in milliseconds. */
  readonly durationMs: number;
  /** Error message if the pattern failed. */
  readonly error?: string;
}

// ── Correlation Engine Context ──

/** The input context for the correlation engine. */
export interface CorrelationContext {
  /** Rule matches produced by the rules layer. */
  readonly ruleMatches: readonly RuleMatch[];
  /** Available evidence references. */
  readonly evidence: readonly EvidenceRef[];
  /** Available feature references. */
  readonly features: readonly FeatureRef[];
  /** Available capability references. */
  readonly capabilities: readonly CapabilityRef[];
}

// ── Correlation Registry ──

export interface ICorrelationRegistry {
  /** Register one or more correlation patterns. */
  register(...patterns: CorrelationPattern[]): void;
  /** Unregister a pattern by ID. */
  unregister(patternId: string): boolean;
  /** Look up a pattern by ID. */
  lookup(patternId: string): CorrelationPattern | undefined;
  /** Get all registered patterns. */
  getAll(): readonly CorrelationPattern[];
  /** Get patterns for a specific category. */
  getByCategory(category: CorrelationCategory): readonly CorrelationPattern[];
  /** Total number of registered patterns. */
  readonly size: number;
  /** Clear all patterns. */
  clear(): void;
}

// ── Correlation Engine ──

export interface CorrelationEngineOptions {
  /** Timeout per pattern in milliseconds (default: 5000). */
  readonly timeoutMs?: number;
  /** Maximum concurrent pattern evaluations (default: 4). */
  readonly concurrency?: number;
  /** Cancellation token. */
  readonly cancellationToken?: CancellationToken;
}

/** The result of a full correlation engine evaluation cycle. */
export interface CorrelationEngineResult {
  /** All pattern evaluations, in deterministic order. */
  readonly evaluations: readonly CorrelationEvaluation[];
  /** Only the correlations that were produced. */
  readonly correlations: readonly Correlation[];
  /** Aggregate diagnostics. */
  readonly diagnostics: CorrelationEngineDiagnostics;
}

// ── Diagnostics ──

export interface CorrelationEngineDiagnostics {
  /** Total patterns evaluated. */
  readonly totalPatterns: number;
  /** Patterns that produced a correlation. */
  readonly matchedPatterns: number;
  /** Patterns that failed with an error. */
  readonly failedPatterns: number;
  /** Total evaluation time in milliseconds. */
  readonly totalDurationMs: number;
  /** Per-pattern diagnostics entries. */
  readonly perPattern: readonly CorrelationDiagnosticsEntry[];
}

export interface CorrelationDiagnosticsEntry {
  /** Pattern ID. */
  readonly patternId: string;
  /** Whether a correlation was produced. */
  readonly matched: boolean;
  /** Evaluation duration in milliseconds. */
  readonly durationMs: number;
  /** Error message if failed. */
  readonly error?: string;
}

// ── Validation ──

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ValidationError[];
}

export interface ValidationError {
  readonly code: string;
  readonly message: string;
  readonly patternId?: string;
  readonly path?: string;
}

// ── Builder Interface ──

export interface ICorrelationBuilder {
  id(id: string): ICorrelationBuilder;
  category(category: CorrelationCategory): ICorrelationBuilder;
  name(name: string): ICorrelationBuilder;
  description(description: string): ICorrelationBuilder;
  condition(condition: CorrelationCondition): ICorrelationBuilder;
  explanationTemplate(template: string): ICorrelationBuilder;
  tags(...tags: string[]): ICorrelationBuilder;
  build(): CorrelationPattern;
}
