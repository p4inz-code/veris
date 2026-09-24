/**
 * @veris/cli/authoring/validator — Deterministic validation gate for candidate rule packs.
 *
 * Implements Section 4.3 of ADR-016:
 * - Manifest & Schema Validation
 * - Declarative Purity Check (checkDeclarativePurity)
 * - Supported Matchers & Operators
 * - Regex ReDoS safety checks (<= 1,000 chars)
 * - Severity bounds ([0.0, 10.0])
 * - Full engine adaptation via adaptRulePackToRules
 *
 * @module @veris/cli/authoring/validator
 */

import type { RulePack } from '@veris/core';
import { adaptRulePackToRules, checkDeclarativePurity } from '@veris/plugins';
import { clearValidationState, validateRuleDefinition } from '@veris/rules';

import type {
  PluginPropertyMatcher,
  PluginRule,
  PluginRuleLogic,
  PluginRulePack,
  PropertyMatcherOperator,
  RuleValidationReport,
} from './types.js';

const SUPPORTED_OPERATORS = new Set<PropertyMatcherOperator>([
  'equals',
  'not-equals',
  'contains',
  'matches',
  'gt',
  'gte',
  'lt',
  'lte',
  'exists',
  'in',
  'regex',
]);

const VALID_SEVERITY_LEVELS = new Set(['critical', 'high', 'medium', 'low', 'info']);
const MAX_REGEX_LENGTH = 1000;

/**
 * Validates a single property matcher.
 */
function validateMatcher(matcher: PluginPropertyMatcher, ruleId: string, errors: string[]): void {
  if (!matcher || typeof matcher !== 'object') {
    errors.push(`Rule "${ruleId}": Property matcher must be an object.`);
    return;
  }

  if (typeof matcher.path !== 'string' || matcher.path.trim().length === 0) {
    errors.push(`Rule "${ruleId}": Matcher path must be a non-empty string.`);
  }

  if (!SUPPORTED_OPERATORS.has(matcher.operator)) {
    errors.push(
      `Rule "${ruleId}": Unsupported matcher operator "${matcher.operator}". Supported: ${Array.from(
        SUPPORTED_OPERATORS,
      ).join(', ')}`,
    );
  }

  if (matcher.operator === 'regex' || matcher.operator === 'matches') {
    if (typeof matcher.value !== 'string') {
      errors.push(`Rule "${ruleId}": Regex matcher value must be a string pattern.`);
    } else {
      if (matcher.value.length > MAX_REGEX_LENGTH) {
        errors.push(
          `Rule "${ruleId}": Regex pattern exceeds maximum length of ${MAX_REGEX_LENGTH} characters (${matcher.value.length}).`,
        );
      }
      try {
        new RegExp(matcher.value);
      } catch (err) {
        errors.push(
          `Rule "${ruleId}": Malformed regex pattern "${matcher.value}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}

/**
 * Recursively validates match logic AST.
 */
function validateLogic(logic: PluginRuleLogic, ruleId: string, errors: string[], depth = 0): void {
  if (depth > 50) {
    errors.push(`Rule "${ruleId}": Rule logic exceeds maximum permitted depth (50).`);
    return;
  }

  if (!logic || typeof logic !== 'object') {
    errors.push(`Rule "${ruleId}": Rule matchLogic must be an object.`);
    return;
  }

  switch (logic.kind) {
    case 'single-behavior':
      if (typeof logic.behaviorTaxonomyId !== 'string' || logic.behaviorTaxonomyId.length === 0) {
        errors.push(`Rule "${ruleId}": Single-behavior logic missing behaviorTaxonomyId.`);
      }
      validateMatcher(logic.propertyMatcher, ruleId, errors);
      break;

    case 'multi-behavior':
      if (
        !logic.pattern ||
        !Array.isArray(logic.pattern.taxonomyIds) ||
        logic.pattern.taxonomyIds.length === 0
      ) {
        errors.push(
          `Rule "${ruleId}": Multi-behavior pattern must include non-empty taxonomyIds array.`,
        );
      }
      if (logic.pattern?.matchers) {
        for (const m of logic.pattern.matchers) {
          validateMatcher(m, ruleId, errors);
        }
      }
      break;

    case 'threshold':
      if (typeof logic.metric !== 'string' || logic.metric.length === 0) {
        errors.push(`Rule "${ruleId}": Threshold rule missing metric identifier.`);
      }
      if (typeof logic.threshold !== 'number' || isNaN(logic.threshold)) {
        errors.push(`Rule "${ruleId}": Threshold value must be a valid number.`);
      }
      break;

    case 'composite':
      if (!Array.isArray(logic.subRules) || logic.subRules.length === 0) {
        errors.push(`Rule "${ruleId}": Composite logic must have non-empty subRules array.`);
      } else {
        for (const sub of logic.subRules) {
          validateLogic(sub, ruleId, errors, depth + 1);
        }
      }
      if (logic.operator !== 'and' && logic.operator !== 'or') {
        errors.push(`Rule "${ruleId}": Composite operator must be "and" or "or".`);
      }
      break;

    default:
      errors.push(
        `Rule "${ruleId}": Unknown matchLogic kind: "${(logic as { kind?: unknown }).kind}".`,
      );
  }
}

/**
 * Validates a single declarative rule.
 */
function validateSingleRule(
  rule: PluginRule,
  packId: string,
  errors: string[],
  warnings: string[],
): void {
  if (!rule || typeof rule !== 'object') {
    errors.push('Rule entry must be an object.');
    return;
  }

  const ruleId = rule.id || 'unknown';

  if (typeof rule.id !== 'string' || rule.id.trim().length === 0) {
    errors.push('Rule must have a non-empty string ID.');
  }

  if (typeof rule.name !== 'string' || rule.name.trim().length === 0) {
    errors.push(`Rule "${ruleId}": Must have a non-empty name.`);
  }

  if (typeof rule.version !== 'string' || rule.version.trim().length === 0) {
    errors.push(`Rule "${ruleId}": Must specify semver version.`);
  }

  // Severity checks
  if (!rule.severity || typeof rule.severity !== 'object') {
    errors.push(`Rule "${ruleId}": Missing severity object.`);
  } else {
    const level = rule.severity.level?.toLowerCase();
    if (!VALID_SEVERITY_LEVELS.has(level)) {
      errors.push(
        `Rule "${ruleId}": Invalid severity level "${rule.severity.level}". Expected one of: ${Array.from(
          VALID_SEVERITY_LEVELS,
        ).join(', ')}`,
      );
    }
    if (
      typeof rule.severity.score !== 'number' ||
      rule.severity.score < 0 ||
      rule.severity.score > 10
    ) {
      errors.push(`Rule "${ruleId}": Severity score must be a number between 0.0 and 10.0.`);
    }
  }

  // Match logic
  if (!rule.matchLogic) {
    errors.push(`Rule "${ruleId}": Missing matchLogic.`);
  } else {
    validateLogic(rule.matchLogic, ruleId, errors);
  }

  // Metadata checks
  if (rule.metadata) {
    if (!rule.metadata.remediation || rule.metadata.remediation.trim().length === 0) {
      warnings.push(
        `Rule "${ruleId}": Recommended to provide actionable remediation text in metadata.`,
      );
    }
    if (!rule.metadata.cweIds || rule.metadata.cweIds.length === 0) {
      warnings.push(`Rule "${ruleId}": Recommended to cite related CWE identifiers.`);
    }
  }
}

/**
 * Perform comprehensive deterministic validation of a candidate rule pack.
 */
export function validateCandidateRulePack(candidate: unknown): RuleValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Gate 1: Non-null object check
  if (!candidate || typeof candidate !== 'object') {
    return Object.freeze({
      valid: false,
      isPure: false,
      isValidSchema: false,
      supportedMatchers: false,
      regexSafe: false,
      severityValid: false,
      adaptedSuccessfully: false,
      adaptedRuleCount: 0,
      errors: Object.freeze(['Candidate rule pack must be a non-null JSON object.']),
      warnings: Object.freeze([]),
    });
  }

  // Gate 2: Declarative purity check (zero functions, getters, setters, prototype pollution)
  const purity = checkDeclarativePurity(candidate);
  if (!purity.pure) {
    errors.push(`Declarative purity violation: ${purity.violation}`);
  }

  const pack = candidate as PluginRulePack;

  // Gate 3: Pack-level schema validation
  if (typeof pack.id !== 'string' || pack.id.trim().length === 0) {
    errors.push('Rule pack must have a non-empty string ID.');
  }

  if (typeof pack.version !== 'string' || pack.version.trim().length === 0) {
    errors.push('Rule pack must have a semver version string.');
  }

  if (!Array.isArray(pack.rules)) {
    errors.push('Rule pack must contain a "rules" array.');
  } else if (pack.rules.length === 0) {
    errors.push('Rule pack contains zero rules.');
  } else {
    // Check duplicate rule IDs
    const seenIds = new Set<string>();
    for (const rule of pack.rules) {
      if (rule.id) {
        if (seenIds.has(rule.id)) {
          errors.push(`Duplicate rule ID detected: "${rule.id}".`);
        }
        seenIds.add(rule.id);
      }
      validateSingleRule(rule, pack.id, errors, warnings);
    }
  }

  let adaptedSuccessfully = false;
  let adaptedRuleCount = 0;

  // Gate 4: Adapt to @veris/rules engine and validate engine compatibility
  if (errors.length === 0) {
    try {
      clearValidationState();
      const internalRules = adaptRulePackToRules(pack as unknown as RulePack);
      adaptedRuleCount = internalRules.length;

      for (const ir of internalRules) {
        const valRes = validateRuleDefinition(ir);
        if (!valRes.valid) {
          for (const err of valRes.errors) {
            errors.push(`Engine validation failed for "${ir.id}": ${err.message}`);
          }
        }
      }

      if (errors.length === 0) {
        adaptedSuccessfully = true;
      }
    } catch (err) {
      errors.push(`Engine adaptation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const valid = errors.length === 0;

  return Object.freeze({
    valid,
    isPure: purity.pure,
    isValidSchema:
      errors.filter((e) => !e.includes('purity') && !e.includes('operator')).length === 0,
    supportedMatchers:
      errors.filter((e) => e.includes('operator') || e.includes('Matcher')).length === 0,
    regexSafe: errors.filter((e) => e.includes('regex') || e.includes('Regex')).length === 0,
    severityValid:
      errors.filter((e) => e.includes('severity') || e.includes('Severity')).length === 0,
    adaptedSuccessfully,
    adaptedRuleCount,
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
  });
}
