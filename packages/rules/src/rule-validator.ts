/**
 * RuleValidator — validates rule definitions for correctness and consistency.
 *
 * @module @veris/rules/rule-validator
 */

import { validateCondition } from './condition-validator.js';
import type {
  Rule,
  RuleCondition,
  RuleCategory,
  ValidationResult,
  ValidationError,
} from './types.js';

// ── Module-level state for cross-validation ──

const registeredIds = new Set<string>();

/**
 * Clear validation state (used between validation runs).
 */
export function clearValidationState(): void {
  registeredIds.clear();
}

/**
 * Validate a single rule definition.
 */
export function validateRuleDefinition(rule: Rule): ValidationResult {
  const errors: ValidationError[] = [];

  // Check required fields
  if (!rule.id || typeof rule.id !== 'string') {
    errors.push({
      code: 'RULE_VAL_001',
      message: 'Rule must have a non-empty string id',
    });
  } else {
    // Check for duplicate IDs
    if (registeredIds.has(rule.id)) {
      errors.push({
        code: 'RULE_VAL_002',
        message: `Duplicate rule ID: ${rule.id}`,
        ruleId: rule.id,
        path: 'id',
      });
    }
    registeredIds.add(rule.id);
  }

  // Validate name
  if (!rule.name || typeof rule.name !== 'string') {
    errors.push({
      code: 'RULE_VAL_003',
      message: 'Rule must have a non-empty name',
      ruleId: rule.id,
      path: 'name',
    });
  }

  // Validate description
  if (!rule.description || typeof rule.description !== 'string') {
    errors.push({
      code: 'RULE_VAL_004',
      message: 'Rule must have a non-empty description',
      ruleId: rule.id,
      path: 'description',
    });
  }

  // Validate category
  const validCategories: RuleCategory[] = [
    'injection',
    'persistence',
    'obfuscation',
    'execution',
    'credential-access',
    'privilege-escalation',
    'defense-evasion',
    'discovery',
    'exfiltration',
    'container',
    'supply-chain',
    'configuration',
    'best-practice',
  ];
  if (!rule.category || !validCategories.includes(rule.category)) {
    errors.push({
      code: 'RULE_VAL_005',
      message: `Invalid rule category: "${rule.category}". Must be one of: ${validCategories.join(', ')}`,
      ruleId: rule.id,
      path: 'category',
    });
  }

  // Validate severity hint
  const validHints = ['critical', 'high', 'medium', 'low', 'info'] as const;
  if (
    !rule.severityHint ||
    !validHints.includes(rule.severityHint as (typeof validHints)[number])
  ) {
    errors.push({
      code: 'RULE_VAL_006',
      message: `Invalid severity hint: "${rule.severityHint}". Must be one of: ${validHints.join(', ')}`,
      ruleId: rule.id,
      path: 'severityHint',
    });
  }

  // Validate explanation template
  if (!rule.explanationTemplate || typeof rule.explanationTemplate !== 'string') {
    errors.push({
      code: 'RULE_VAL_007',
      message: 'Rule must have a non-empty explanationTemplate',
      ruleId: rule.id,
      path: 'explanationTemplate',
    });
  }

  // Validate condition
  if (!rule.condition) {
    errors.push({
      code: 'RULE_VAL_008',
      message: 'Rule must have a condition',
      ruleId: rule.id,
      path: 'condition',
    });
  } else {
    const conditionErrors = validateCondition(rule.condition, rule.id);
    errors.push(...conditionErrors);
  }

  // Validate MITRE techniques format
  if (rule.mitreTechniques) {
    for (const tech of rule.mitreTechniques) {
      if (typeof tech !== 'string' || tech.trim().length === 0) {
        errors.push({
          code: 'RULE_VAL_009',
          message: 'MITRE technique IDs must be non-empty strings',
          ruleId: rule.id,
          path: 'mitreTechniques',
        });
      }
    }
  }

  // Validate references
  if (rule.references) {
    for (const ref of rule.references) {
      if (typeof ref !== 'string' || ref.trim().length === 0) {
        errors.push({
          code: 'RULE_VAL_010',
          message: 'References must be non-empty strings',
          ruleId: rule.id,
          path: 'references',
        });
      }
    }
  }

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
  });
}

/**
 * Validate multiple rules at once (detects duplicate IDs across the set).
 */
export function validateRuleSet(rules: readonly Rule[]): ValidationResult {
  clearValidationState();
  const allErrors: ValidationError[] = [];

  for (const rule of rules) {
    const result = validateRuleDefinition(rule);
    allErrors.push(...result.errors);
  }

  return Object.freeze({
    valid: allErrors.length === 0,
    errors: Object.freeze(allErrors),
  });
}

// Re-export for convenience
export { validateCondition } from './condition-validator.js';
