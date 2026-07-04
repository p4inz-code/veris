/**
 * Condition validator — validates RuleCondition structure and semantics.
 *
 * This is the canonical implementation. rule-validator.ts imports from here.
 *
 * @module @veris/rules/condition-validator
 */

import type { RuleCondition, ValidationError } from './types.js';

/**
 * Validate a condition and all its sub-conditions recursively.
 */
export function validateCondition(
  condition: RuleCondition,
  ruleId?: string,
  depth = 0,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Prevent excessively deep nesting
  if (depth > 50) {
    errors.push({
      code: 'RULE_VAL_011',
      message: 'Condition nesting exceeds maximum depth of 50',
      ruleId,
      path: 'condition',
    });
    return errors;
  }

  switch (condition.type) {
    // Logical operators — validate sub-conditions
    case 'and':
    case 'or': {
      if (!condition.conditions || condition.conditions.length === 0) {
        errors.push({
          code: 'RULE_VAL_012',
          message: `${condition.type} condition must have at least one sub-condition`,
          ruleId,
          path: `condition.${condition.type}`,
        });
      }
      for (const sub of condition.conditions) {
        errors.push(...validateCondition(sub, ruleId, depth + 1));
      }
      break;
    }

    case 'not': {
      if (!condition.condition) {
        errors.push({
          code: 'RULE_VAL_013',
          message: 'NOT condition must have a sub-condition',
          ruleId,
          path: 'condition.not',
        });
      } else {
        errors.push(...validateCondition(condition.condition, ruleId, depth + 1));
      }
      break;
    }

    // Set operators
    case 'all_of': {
      if (!condition.field || typeof condition.field !== 'string') {
        errors.push({
          code: 'RULE_VAL_014',
          message: 'ALL_OF condition must have a non-empty field',
          ruleId,
          path: 'condition.all_of',
        });
      }
      if (!condition.values || condition.values.length === 0) {
        errors.push({
          code: 'RULE_VAL_015',
          message: 'ALL_OF condition must have at least one value',
          ruleId,
          path: 'condition.all_of',
        });
      }
      break;
    }

    case 'any_of':
    case 'none_of': {
      if (!condition.conditions || condition.conditions.length === 0) {
        errors.push({
          code: 'RULE_VAL_016',
          message: `${condition.type} condition must have at least one sub-condition`,
          ruleId,
          path: `condition.${condition.type}`,
        });
      }
      for (const sub of condition.conditions) {
        errors.push(...validateCondition(sub, ruleId, depth + 1));
      }
      break;
    }

    // Count operators
    case 'minimum_count':
    case 'maximum_count': {
      if (!condition.field || typeof condition.field !== 'string') {
        errors.push({
          code: 'RULE_VAL_017',
          message: `${condition.type} condition must have a non-empty field`,
          ruleId,
          path: `condition.${condition.type}`,
        });
      }
      if (
        typeof condition.count !== 'number' ||
        condition.count < 0 ||
        !Number.isInteger(condition.count)
      ) {
        errors.push({
          code: 'RULE_VAL_018',
          message: `${condition.type} condition must have a non-negative integer count`,
          ruleId,
          path: `condition.${condition.type}`,
        });
      }
      break;
    }

    // Existence / comparison
    case 'exists': {
      if (!condition.field || typeof condition.field !== 'string') {
        errors.push({
          code: 'RULE_VAL_019',
          message: 'EXISTS condition must have a non-empty field',
          ruleId,
          path: 'condition.exists',
        });
      }
      break;
    }

    case 'equals': {
      if (!condition.field || typeof condition.field !== 'string') {
        errors.push({
          code: 'RULE_VAL_020',
          message: 'EQUALS condition must have a non-empty field',
          ruleId,
          path: 'condition.equals',
        });
      }
      break;
    }

    case 'contains': {
      if (!condition.field || typeof condition.field !== 'string') {
        errors.push({
          code: 'RULE_VAL_021',
          message: 'CONTAINS condition must have a non-empty field',
          ruleId,
          path: 'condition.contains',
        });
      }
      break;
    }

    case 'regex': {
      if (!condition.field || typeof condition.field !== 'string') {
        errors.push({
          code: 'RULE_VAL_022',
          message: 'REGEX condition must have a non-empty field',
          ruleId,
          path: 'condition.regex',
        });
      }
      if (!condition.pattern || typeof condition.pattern !== 'string') {
        errors.push({
          code: 'RULE_VAL_023',
          message: 'REGEX condition must have a non-empty pattern',
          ruleId,
          path: 'condition.regex',
        });
      } else {
        try {
          new RegExp(condition.pattern);
        } catch {
          errors.push({
            code: 'RULE_VAL_024',
            message: `REGEX pattern is invalid: "${condition.pattern}"`,
            ruleId,
            path: 'condition.regex',
          });
        }
      }
      break;
    }

    case 'range': {
      if (!condition.field || typeof condition.field !== 'string') {
        errors.push({
          code: 'RULE_VAL_025',
          message: 'RANGE condition must have a non-empty field',
          ruleId,
          path: 'condition.range',
        });
      }
      if (condition.min === undefined && condition.max === undefined) {
        errors.push({
          code: 'RULE_VAL_026',
          message: 'RANGE condition must have at least one of min or max',
          ruleId,
          path: 'condition.range',
        });
      }
      if (condition.min !== undefined && typeof condition.min !== 'number') {
        errors.push({
          code: 'RULE_VAL_027',
          message: 'RANGE condition min must be a number',
          ruleId,
          path: 'condition.range.min',
        });
      }
      if (condition.max !== undefined && typeof condition.max !== 'number') {
        errors.push({
          code: 'RULE_VAL_028',
          message: 'RANGE condition max must be a number',
          ruleId,
          path: 'condition.range.max',
        });
      }
      if (
        condition.min !== undefined &&
        condition.max !== undefined &&
        condition.min > condition.max
      ) {
        errors.push({
          code: 'RULE_VAL_029',
          message: 'RANGE condition min must be <= max',
          ruleId,
          path: 'condition.range',
        });
      }
      break;
    }

    case 'confidence_threshold': {
      if (
        typeof condition.threshold !== 'number' ||
        condition.threshold < 0 ||
        condition.threshold > 1
      ) {
        errors.push({
          code: 'RULE_VAL_030',
          message: 'CONFIDENCE_THRESHOLD must be a number between 0.0 and 1.0',
          ruleId,
          path: 'condition.confidence_threshold',
        });
      }
      break;
    }

    // Type matchers
    case 'artifact_type': {
      if (!condition.artifactType || typeof condition.artifactType !== 'string') {
        errors.push({
          code: 'RULE_VAL_031',
          message: 'ARTIFACT_TYPE condition must have a non-empty artifactType',
          ruleId,
          path: 'condition.artifact_type',
        });
      }
      break;
    }

    case 'feature_type': {
      if (!condition.featureType || typeof condition.featureType !== 'string') {
        errors.push({
          code: 'RULE_VAL_032',
          message: 'FEATURE_TYPE condition must have a non-empty featureType',
          ruleId,
          path: 'condition.feature_type',
        });
      }
      break;
    }

    case 'evidence_type': {
      if (!condition.evidenceType || typeof condition.evidenceType !== 'string') {
        errors.push({
          code: 'RULE_VAL_033',
          message: 'EVIDENCE_TYPE condition must have a non-empty evidenceType',
          ruleId,
          path: 'condition.evidence_type',
        });
      }
      break;
    }

    case 'capability_type': {
      if (!condition.capabilityType || typeof condition.capabilityType !== 'string') {
        errors.push({
          code: 'RULE_VAL_034',
          message: 'CAPABILITY_TYPE condition must have a non-empty capabilityType',
          ruleId,
          path: 'condition.capability_type',
        });
      }
      break;
    }

    default:
      errors.push({
        code: 'RULE_VAL_035',
        message: `Unknown condition type: "${(condition as RuleCondition).type}"`,
        ruleId,
        path: 'condition.type',
      });
      break;
  }

  return errors;
}
