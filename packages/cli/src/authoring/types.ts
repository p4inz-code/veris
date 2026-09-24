/**
 * @veris/cli/authoring/types — Types and contracts for AI-assisted rule authoring.
 *
 * Implements ADR-016:
 * - Pure declarative candidate rule representation
 * - Strict validation and test execution results
 * - Human-reviewable candidate artifact contracts
 *
 * @module @veris/cli/authoring/types
 */

import type {
  PluginPropertyMatcher,
  PluginRule,
  PluginRuleLogic,
  PluginRulePack,
  PropertyMatcherOperator,
} from '@veris/plugin-sdk';
import type { RuleCategory } from '@veris/rules';

export type {
  PropertyMatcherOperator,
  PluginPropertyMatcher,
  PluginRuleLogic,
  PluginRule,
  PluginRulePack,
};

/**
 * Severity level string representation.
 */
export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * User request options for generating a candidate rule.
 */
export interface RuleAuthoringRequest {
  /** High-level description of threat or condition to detect. */
  readonly intent: string;
  /** Suggested rule title. */
  readonly name?: string;
  /** Suggested rule pack identifier. */
  readonly packId?: string;
  /** Security rule category. */
  readonly category?: RuleCategory;
  /** Primary evidence type (e.g. "pe-import", "configuration", "script-pattern"). */
  readonly evidenceType?: string;
  /** JSON path to property in evidence (e.g. "metadata.commandLine", "name"). */
  readonly propertyPath?: string;
  /** Matcher comparison operator. */
  readonly matcherOperator?: PropertyMatcherOperator;
  /** Expected target value or regex pattern. */
  readonly expectedValue?: unknown;
  /** Associated CWE ID (e.g. "CWE-798"). */
  readonly cweId?: string;
  /** Associated taxonomy ID (e.g. "credential.access"). */
  readonly taxonomyId?: string;
  /** Target severity level. */
  readonly severity?: SeverityLevel;
  /** LLM provider identifier ("offline", "ollama", "openai", "anthropic"). */
  readonly provider?: string;
  /** Model name override. */
  readonly model?: string;
  /** Enforce purely offline template generation (no network). */
  readonly offline?: boolean;
  /** Output file path. */
  readonly output?: string;
  /** Output presentation format: "json" | "markdown". */
  readonly format?: 'json' | 'markdown';
  /** Dry-run mode: evaluate and test without writing to disk. */
  readonly dryRun?: boolean;
}

/**
 * Results of deterministic rule validation.
 */
export interface RuleValidationReport {
  /** True if all validation gates passed. */
  readonly valid: boolean;
  /** True if the rule pack is strictly declarative (no executable code). */
  readonly isPure: boolean;
  /** True if the manifest and rule schema are fully valid. */
  readonly isValidSchema: boolean;
  /** True if all property matchers use supported operators. */
  readonly supportedMatchers: boolean;
  /** True if all regex patterns are safe and compile cleanly. */
  readonly regexSafe: boolean;
  /** True if severity scores are within bounds [0.0, 10.0]. */
  readonly severityValid: boolean;
  /** True if the rule pack successfully adapts into @veris/rules internal Rule definitions. */
  readonly adaptedSuccessfully: boolean;
  /** Number of rules adapted for the engine. */
  readonly adaptedRuleCount: number;
  /** Detailed list of validation errors. */
  readonly errors: readonly string[];
  /** Detailed list of non-fatal warnings or advisories. */
  readonly warnings: readonly string[];
}

/**
 * Single test fixture outcome.
 */
export interface FixtureTestOutcome {
  readonly fixtureName: string;
  readonly expectedMatch: boolean;
  readonly actualMatch: boolean;
  readonly passed: boolean;
  readonly matchedRules: readonly string[];
  readonly durationMs: number;
}

/**
 * Results of automated deterministic test execution.
 */
export interface RuleTestExecutionReport {
  /** True if both positive and negative fixture tests passed. */
  readonly passed: boolean;
  /** True if repeated evaluations produced byte-for-byte identical outcomes (determinism check). */
  readonly determinismPass: boolean;
  /** Total evaluation duration in milliseconds. */
  readonly totalDurationMs: number;
  /** Individual test fixture outcomes. */
  readonly outcomes: readonly FixtureTestOutcome[];
  /** Errors encountered during test execution. */
  readonly errors: readonly string[];
}

/**
 * Human-reviewable candidate rule artifact structure.
 */
export interface CandidateRuleArtifact {
  /** Unique artifact identifier. */
  readonly id: string;
  /** Generation timestamp (ISO 8601). */
  readonly createdAt: string;
  /** Original authoring request. */
  readonly request: RuleAuthoringRequest;
  /** The generated declarative rule pack. */
  readonly candidateRulePack: PluginRulePack;
  /** Human-readable explanation and rationale (non-authoritative). */
  readonly rationale: string;
  /** Threat scenario and context. */
  readonly threatScenario: string;
  /** Comprehensive deterministic validation report. */
  readonly validation: RuleValidationReport;
  /** Automated deterministic test execution report. */
  readonly testExecution: RuleTestExecutionReport;
  /** Metadata regarding generation provider, model, and instructions. */
  readonly metadata: {
    readonly provider: string;
    readonly model?: string;
    readonly generatorVersion: string;
    readonly reviewNotice: string;
    readonly promotionInstructions: string;
  };
}

/**
 * Execution outcome from the rule authoring command.
 */
export interface RuleAuthoringResult {
  readonly exitCode: number;
  readonly artifact?: CandidateRuleArtifact;
  readonly savedFiles?: readonly string[];
  readonly error?: string;
}
