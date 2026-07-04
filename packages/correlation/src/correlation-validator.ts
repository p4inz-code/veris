/**
 * CorrelationValidator — validates correlation pattern definitions.
 *
 * @module @veris/correlation/correlation-validator
 */

import type {
  CorrelationPattern,
  CorrelationCategory,
  CorrelationCondition,
  ValidationResult,
  ValidationError,
} from './types.js';

// ── Module-level state for cross-validation ──

const registeredIds = new Set<string>();

/**
 * Clear validation state.
 */
export function clearValidationState(): void {
  registeredIds.clear();
}

/**
 * Validate a single correlation pattern definition.
 */
export function validatePatternDefinition(pattern: CorrelationPattern): ValidationResult {
  const errors: ValidationError[] = [];

  // Check required fields
  if (!pattern.id || typeof pattern.id !== 'string') {
    errors.push({ code: 'CORR_VAL_001', message: 'Pattern must have a non-empty string id' });
  } else {
    if (registeredIds.has(pattern.id)) {
      errors.push({
        code: 'CORR_VAL_002',
        message: `Duplicate pattern ID: ${pattern.id}`,
        patternId: pattern.id,
        path: 'id',
      });
    }
    registeredIds.add(pattern.id);
  }

  // Validate name
  if (!pattern.name || typeof pattern.name !== 'string') {
    errors.push({
      code: 'CORR_VAL_003',
      message: 'Pattern must have a non-empty name',
      patternId: pattern.id,
      path: 'name',
    });
  }

  // Validate description
  if (!pattern.description || typeof pattern.description !== 'string') {
    errors.push({
      code: 'CORR_VAL_004',
      message: 'Pattern must have a non-empty description',
      patternId: pattern.id,
      path: 'description',
    });
  }

  // Validate category
  const validCategories: CorrelationCategory[] = [
    'process-injection',
    'persistence',
    'credential-theft',
    'obfuscation',
    'download-execution',
    'living-off-the-land',
    'script-obfuscation',
    'macro-execution',
    'suspicious-certificate',
    'archive-execution-chain',
    'defense-evasion',
    'privilege-escalation',
    'discovery',
    'exfiltration',
    'container-breakout',
    'supply-chain',
    'lateral-movement',
    'command-and-control',
  ];
  if (!pattern.category || !validCategories.includes(pattern.category)) {
    errors.push({
      code: 'CORR_VAL_005',
      message: `Invalid category: "${pattern.category}". Must be one of: ${validCategories.join(', ')}`,
      patternId: pattern.id,
      path: 'category',
    });
  }

  // Validate explanation template
  if (!pattern.explanationTemplate || typeof pattern.explanationTemplate !== 'string') {
    errors.push({
      code: 'CORR_VAL_006',
      message: 'Pattern must have a non-empty explanationTemplate',
      patternId: pattern.id,
      path: 'explanationTemplate',
    });
  }

  // Validate condition
  if (!pattern.condition) {
    errors.push({
      code: 'CORR_VAL_007',
      message: 'Pattern must have a condition',
      patternId: pattern.id,
      path: 'condition',
    });
  } else {
    const conditionErrors = validateCondition(pattern.condition, pattern.id);
    errors.push(...conditionErrors);
  }

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
  });
}

/**
 * Validate multiple patterns (detects duplicate IDs across the set).
 */
export function validatePatternSet(patterns: readonly CorrelationPattern[]): ValidationResult {
  clearValidationState();
  const allErrors: ValidationError[] = [];
  for (const pattern of patterns) {
    const result = validatePatternDefinition(pattern);
    allErrors.push(...result.errors);
  }
  return Object.freeze({ valid: allErrors.length === 0, errors: Object.freeze(allErrors) });
}

/**
 * Recursively validate a correlation condition.
 */
function validateCondition(
  condition: CorrelationCondition,
  patternId?: string,
  depth = 0,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (depth > 50) {
    errors.push({
      code: 'CORR_VAL_008',
      message: 'Condition nesting exceeds maximum depth of 50',
      patternId,
      path: 'condition',
    });
    return errors;
  }

  switch (condition.type) {
    case 'and':
    case 'or': {
      if (!condition.conditions || condition.conditions.length === 0) {
        errors.push({
          code: 'CORR_VAL_009',
          message: `${condition.type} condition must have at least one sub-condition`,
          patternId,
          path: `condition.${condition.type}`,
        });
      }
      for (const sub of condition.conditions) {
        errors.push(...validateCondition(sub, patternId, depth + 1));
      }
      break;
    }

    case 'not': {
      if (!condition.condition) {
        errors.push({
          code: 'CORR_VAL_010',
          message: 'NOT condition must have a sub-condition',
          patternId,
          path: 'condition.not',
        });
      } else {
        errors.push(...validateCondition(condition.condition, patternId, depth + 1));
      }
      break;
    }

    case 'rule_match': {
      if (!condition.ruleIds || condition.ruleIds.length === 0) {
        errors.push({
          code: 'CORR_VAL_011',
          message: 'RULE_MATCH condition must have at least one ruleId',
          patternId,
          path: 'condition.rule_match',
        });
      }
      break;
    }

    case 'any_rule_match': {
      // category is optional — no validation needed
      break;
    }

    case 'evidence_type': {
      if (!condition.evidenceTypes || condition.evidenceTypes.length === 0) {
        errors.push({
          code: 'CORR_VAL_012',
          message: 'EVIDENCE_TYPE condition must have at least one evidenceType',
          patternId,
          path: 'condition.evidence_type',
        });
      }
      break;
    }

    case 'evidence_category': {
      if (!condition.categories || condition.categories.length === 0) {
        errors.push({
          code: 'CORR_VAL_013',
          message: 'EVIDENCE_CATEGORY condition must have at least one category',
          patternId,
          path: 'condition.evidence_category',
        });
      }
      break;
    }

    case 'evidence_artifact': {
      if (!condition.artifactId || typeof condition.artifactId !== 'string') {
        errors.push({
          code: 'CORR_VAL_014',
          message: 'EVIDENCE_ARTIFACT condition must have a non-empty artifactId',
          patternId,
          path: 'condition.evidence_artifact',
        });
      }
      break;
    }

    case 'feature_type': {
      if (!condition.featureTypes || condition.featureTypes.length === 0) {
        errors.push({
          code: 'CORR_VAL_015',
          message: 'FEATURE_TYPE condition must have at least one featureType',
          patternId,
          path: 'condition.feature_type',
        });
      }
      break;
    }

    case 'capability_type': {
      if (!condition.capabilityTypes || condition.capabilityTypes.length === 0) {
        errors.push({
          code: 'CORR_VAL_016',
          message: 'CAPABILITY_TYPE condition must have at least one capabilityType',
          patternId,
          path: 'condition.capability_type',
        });
      }
      break;
    }

    case 'minimum_count':
    case 'maximum_count': {
      if (!condition.field || typeof condition.field !== 'string') {
        errors.push({
          code: 'CORR_VAL_017',
          message: `${condition.type} condition must have a non-empty field`,
          patternId,
          path: `condition.${condition.type}`,
        });
      }
      if (
        typeof condition.count !== 'number' ||
        condition.count < 0 ||
        !Number.isInteger(condition.count)
      ) {
        errors.push({
          code: 'CORR_VAL_018',
          message: `${condition.type} condition must have a non-negative integer count`,
          patternId,
          path: `condition.${condition.type}`,
        });
      }
      break;
    }

    case 'shared_artifact': {
      // minEvidence is optional
      break;
    }

    case 'shared_artifact_type': {
      if (!condition.artifactType || typeof condition.artifactType !== 'string') {
        errors.push({
          code: 'CORR_VAL_019',
          message: 'SHARED_ARTIFACT_TYPE condition must have a non-empty artifactType',
          patternId,
          path: 'condition.shared_artifact_type',
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
          code: 'CORR_VAL_020',
          message: 'CONFIDENCE_THRESHOLD must be a number between 0.0 and 1.0',
          patternId,
          path: 'condition.confidence_threshold',
        });
      }
      break;
    }

    default: {
      errors.push({
        code: 'CORR_VAL_021',
        message: `Unknown condition type: "${(condition as CorrelationCondition).type}"`,
        patternId,
        path: 'condition.type',
      });
      break;
    }
  }

  return errors;
}
