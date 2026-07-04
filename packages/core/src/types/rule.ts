/**
 * Rule types for VERIS.
 *
 * Rules are declarative matching patterns that, when applied to Behaviors,
 * produce Evidence. Rules are loaded from rule packs and are immutable at rest.
 *
 * @module @veris/core/types/rule
 */

/** Unique rule identifier (e.g., "secrets/aws-key"). */
export type RuleId = string;

/** Rule pack identifier (e.g., "secrets", "configuration"). */
export type PackId = string;

/**
 * Canonical Rule definition.
 * Rules are defined in rule packs and loaded into the engine at scan start.
 */
export interface Rule {
  /** Unique, human-readable, stable identifier. */
  readonly id: RuleId;
  /** Rule pack this rule belongs to. */
  readonly packId: PackId;
  /** Rule version (semver). */
  readonly version: string;
  /** Human-readable name. */
  readonly name: string;
  /** Description of what this rule detects. */
  readonly description: string;
  /** Severity when this rule matches. */
  readonly severity: { readonly level: string; readonly score: number };
  /** Behavior taxonomy nodes this rule matches. */
  readonly taxonomyIds: readonly string[];
  /** The matching logic. */
  readonly matchLogic: RuleLogic;
  /** Rule metadata. */
  readonly metadata: RuleMetadata;
}

/** Rule metadata — author, references, tags. */
export interface RuleMetadata {
  /** Rule author. */
  readonly author?: string;
  /** Categorization tags. */
  readonly tags?: readonly string[];
  /** Related CWE identifiers. */
  readonly cweIds?: readonly string[];
  /** Related OWASP category. */
  readonly owaspCategory?: string;
  /** Related NIST control. */
  readonly nistControl?: string;
  /** External reference URLs. */
  readonly references?: readonly string[];
  /** Remediation guidance. */
  readonly remediation?: string;
}

/**
 * Declarative rule matching logic.
 * Rules are declarative only — no imperative code.
 */
export type RuleLogic =
  | {
      readonly kind: 'single-behavior';
      readonly behaviorTaxonomyId: string;
      readonly propertyMatcher: PropertyMatcher;
    }
  | {
      readonly kind: 'multi-behavior';
      readonly pattern: BehaviorPattern;
      readonly relationship: 'all' | 'any' | 'sequence' | 'graph';
    }
  | {
      readonly kind: 'threshold';
      readonly metric: string;
      readonly threshold: number;
      readonly window: string;
    }
  | { readonly kind: 'composite'; readonly subRules: RuleLogic[]; readonly operator: 'and' | 'or' };

/** Property matcher for single-behavior rules. */
export interface PropertyMatcher {
  /** JSON path to the property to match. */
  readonly path: string;
  /** Match operation. */
  readonly operator:
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
  /** Value to match against. */
  readonly value: unknown;
}

/** Multi-behavior pattern for complex rules. */
export interface BehaviorPattern {
  /** Taxonomy IDs to match. */
  readonly taxonomyIds: readonly string[];
  /** Optional property matchers per behavior. */
  readonly matchers?: readonly PropertyMatcher[];
}

/** Match detail — how a rule matched. */
export type MatchDetail =
  | { readonly kind: 'exact'; readonly pattern: string; readonly matched: string }
  | { readonly kind: 'regex'; readonly pattern: string; readonly matched: string }
  | {
      readonly kind: 'heuristic';
      readonly rule: string;
      readonly score: number;
      readonly threshold: number;
    }
  | {
      readonly kind: 'threshold';
      readonly metric: string;
      readonly value: number;
      readonly threshold: number;
      readonly direction: 'gt' | 'gte' | 'lt' | 'lte';
    }
  | {
      readonly kind: 'composite';
      readonly subMatches: MatchDetail[];
      readonly operator: 'and' | 'or' | 'sequence';
    };

/** Result of applying a rule to a behavior or set of behaviors. */
export interface RuleResult {
  /** Deterministic rule result ID. */
  readonly id: string;
  /** The rule that was applied. */
  readonly ruleId: RuleId;
  /** Behavior IDs involved in the match. */
  readonly behaviorIds: readonly string[];
  /** Whether the rule matched. */
  readonly matched: boolean;
  /** Confidence in the match [0.0, 1.0]. */
  readonly confidence: number;
  /** Match detail if matched. */
  readonly matchDetail: MatchDetail | null;
  /** How long the rule took to execute (ms). */
  readonly executionTimeMs: number;
  /** Owning session ID. */
  readonly sessionId: string;
}

/** A rule pack — a collection of related rules. */
export interface RulePack {
  /** Pack identifier (e.g., "secrets"). */
  readonly id: PackId;
  /** Pack version (semver). */
  readonly version: string;
  /** Human-readable description. */
  readonly description: string;
  /** Rules in this pack. */
  readonly rules: Rule[];
  /** Other pack IDs this pack extends. */
  readonly dependencies?: readonly string[];
  /** Pack metadata. */
  readonly metadata: {
    readonly author: string;
    readonly tags: readonly string[];
    readonly severity: { readonly min: number; readonly max: number };
  };
}
