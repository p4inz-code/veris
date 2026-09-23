/**
 * Declarative Rule Pack Plugin Contract and Types.
 *
 * @module @veris/plugin-sdk/types/rule-pack
 */

import type { Plugin, PluginLifecycle } from './lifecycle.js';
import type { PluginManifest } from './manifest.js';

/**
 * Supported comparison operators for declarative property matching.
 */
export type PropertyMatcherOperator =
  | 'equals'
  | 'not-equals'
  | 'contains'
  | 'matches'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'exists'
  | 'in'
  | 'regex';

/**
 * Property matcher for single-behavior inspection.
 */
export interface PluginPropertyMatcher {
  /** JSON path to the target property. */
  readonly path: string;
  /** Comparison operator. */
  readonly operator: PropertyMatcherOperator;
  /** Expected value or pattern to match against. */
  readonly value: unknown;
}

/**
 * Multi-behavior pattern for complex correlation.
 */
export interface PluginBehaviorPattern {
  /** Taxonomy IDs to match. */
  readonly taxonomyIds: readonly string[];
  /** Optional property matchers per behavior. */
  readonly matchers?: readonly PluginPropertyMatcher[];
}

/**
 * Pure declarative rule logic AST.
 *
 * CRITICAL INVARIANT:
 * Rules are declarative data representations only. Imperative executable code,
 * lambdas, or custom function callbacks are strictly prohibited in Rule Packs.
 */
export type PluginRuleLogic =
  | {
      readonly kind: 'single-behavior';
      readonly behaviorTaxonomyId: string;
      readonly propertyMatcher: PluginPropertyMatcher;
    }
  | {
      readonly kind: 'multi-behavior';
      readonly pattern: PluginBehaviorPattern;
      readonly relationship: 'all' | 'any' | 'sequence' | 'graph';
    }
  | {
      readonly kind: 'threshold';
      readonly metric: string;
      readonly threshold: number;
      readonly window: string;
    }
  | {
      readonly kind: 'composite';
      readonly subRules: readonly PluginRuleLogic[];
      readonly operator: 'and' | 'or';
    };

/**
 * Rule metadata — author, compliance citations, references, and remediation guidance.
 */
export interface PluginRuleMetadata {
  /** Rule author or organization. */
  readonly author?: string;
  /** Categorization tags. */
  readonly tags?: readonly string[];
  /** Related Common Weakness Enumeration identifiers (e.g. ["CWE-798"]). */
  readonly cweIds?: readonly string[];
  /** Related OWASP category (e.g. "A01:2021-Broken Access Control"). */
  readonly owaspCategory?: string;
  /** Related NIST security control (e.g. "IA-2"). */
  readonly nistControl?: string;
  /** External documentation or advisory URLs. */
  readonly references?: readonly string[];
  /** Actionable remediation guidance for operators. */
  readonly remediation?: string;
}

/**
 * Declarative rule severity definition.
 */
export interface PluginRuleSeverity {
  /** Human-readable level: "low" | "medium" | "high" | "critical" | "informational". */
  readonly level: string;
  /** Normalized score [0.0, 10.0]. */
  readonly score: number;
}

/**
 * Canonical declarative rule definition within a Rule Pack.
 */
export interface PluginRule {
  /** Unique, stable rule identifier (e.g. "company-rules/hardcoded-api-key"). */
  readonly id: string;
  /** Owning rule pack identifier. */
  readonly packId: string;
  /** Rule version (semver). */
  readonly version: string;
  /** Human-readable rule title. */
  readonly name: string;
  /** Description of the threat or condition detected. */
  readonly description: string;
  /** Severity score and level. */
  readonly severity: PluginRuleSeverity;
  /** Behavior taxonomy IDs this rule monitors. */
  readonly taxonomyIds: readonly string[];
  /** Declarative match logic AST. */
  readonly matchLogic: PluginRuleLogic;
  /** Structured metadata. */
  readonly metadata: PluginRuleMetadata;
}

/**
 * Rule Pack metadata and severity bounds.
 */
export interface PluginRulePackMetadata {
  readonly author: string;
  readonly tags: readonly string[];
  readonly severity: {
    readonly min: number;
    readonly max: number;
  };
}

/**
 * Declarative Rule Pack containing a collection of related rules.
 */
export interface PluginRulePack {
  /** Unique pack identifier (e.g. "fintech-compliance"). */
  readonly id: string;
  /** Pack semver version. */
  readonly version: string;
  /** Human-readable pack summary. */
  readonly description: string;
  /** Rules contained in this pack. */
  readonly rules: readonly PluginRule[];
  /** Other pack IDs this pack depends upon or extends. */
  readonly dependencies?: readonly string[];
  /** Pack-level metadata. */
  readonly metadata: PluginRulePackMetadata;
}

/**
 * Rule Plugin contract.
 *
 * Implemented by third-party packages to deploy domain-specific detection rules.
 */
export interface RulePlugin extends Plugin {
  readonly type: 'rule-pack';

  /** The declarative rule pack provided by this plugin. */
  readonly rulePack: Readonly<PluginRulePack>;
}

/**
 * Authoring options for defining a rule-pack plugin.
 */
export interface RulePackPluginDefinition {
  readonly manifest: PluginManifest;
  readonly rulePack: PluginRulePack;
  readonly lifecycle?: PluginLifecycle;
}
