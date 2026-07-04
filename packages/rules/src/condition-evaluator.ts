/**
 * Condition evaluator — evaluates RuleCondition objects against an EvaluationContext.
 *
 * @module @veris/rules/condition-evaluator
 */

import type { RuleCondition, EvaluationContext } from './types.js';

/**
 * Result of evaluating a condition.
 * Contains whether it matched, and which evidence, feature, and capability IDs were involved.
 */
export interface ConditionMatchResult {
  readonly matched: boolean;
  readonly matchedEvidenceIds: readonly string[];
  readonly matchedFeatureIds: readonly string[];
  readonly matchedCapabilityIds: readonly string[];
}

const EMPTY_MATCH: ConditionMatchResult = Object.freeze({
  matched: false,
  matchedEvidenceIds: Object.freeze([]),
  matchedFeatureIds: Object.freeze([]),
  matchedCapabilityIds: Object.freeze([]),
});

/**
 * Evaluate a condition against the given context.
 * Returns a match result with the IDs of the matching items.
 */
export function evaluateCondition(
  condition: RuleCondition,
  context: EvaluationContext,
): ConditionMatchResult {
  return evaluateConditionRecursive(condition, context, 0);
}

function evaluateConditionRecursive(
  condition: RuleCondition,
  context: EvaluationContext,
  depth: number,
): ConditionMatchResult {
  // Prevent stack overflow from deeply nested conditions
  if (depth > 100) {
    return EMPTY_MATCH;
  }

  switch (condition.type) {
    // ── Logical Operators ──

    case 'and': {
      const allEvidenceIds: string[] = [];
      const allFeatureIds: string[] = [];
      const allCapabilityIds: string[] = [];

      for (const sub of condition.conditions) {
        const result = evaluateConditionRecursive(sub, context, depth + 1);
        if (!result.matched) {
          return EMPTY_MATCH;
        }
        allEvidenceIds.push(...result.matchedEvidenceIds);
        allFeatureIds.push(...result.matchedFeatureIds);
        allCapabilityIds.push(...result.matchedCapabilityIds);
      }

      return Object.freeze({
        matched: true,
        matchedEvidenceIds: Object.freeze([...new Set(allEvidenceIds)]),
        matchedFeatureIds: Object.freeze([...new Set(allFeatureIds)]),
        matchedCapabilityIds: Object.freeze([...new Set(allCapabilityIds)]),
      });
    }

    case 'or': {
      const allEvidenceIds: string[] = [];
      const allFeatureIds: string[] = [];
      const allCapabilityIds: string[] = [];

      for (const sub of condition.conditions) {
        const result = evaluateConditionRecursive(sub, context, depth + 1);
        if (result.matched) {
          allEvidenceIds.push(...result.matchedEvidenceIds);
          allFeatureIds.push(...result.matchedFeatureIds);
          allCapabilityIds.push(...result.matchedCapabilityIds);
        }
      }

      if (
        allEvidenceIds.length === 0 &&
        allFeatureIds.length === 0 &&
        allCapabilityIds.length === 0
      ) {
        return EMPTY_MATCH;
      }

      return Object.freeze({
        matched: true,
        matchedEvidenceIds: Object.freeze([...new Set(allEvidenceIds)]),
        matchedFeatureIds: Object.freeze([...new Set(allFeatureIds)]),
        matchedCapabilityIds: Object.freeze([...new Set(allCapabilityIds)]),
      });
    }

    case 'not': {
      const result = evaluateConditionRecursive(condition.condition, context, depth + 1);
      // NOT inverts the match: if sub-condition matched, NOT does NOT match
      if (result.matched) {
        return EMPTY_MATCH;
      }
      // Sub-condition did NOT match, so NOT matches and contributes all items
      const allEvidenceIds = context.evidence.map((e) => e.id);
      const allFeatureIds = context.features.map((f) => f.id);
      const allCapabilityIds = context.capabilities.map((c) => c.id);
      return Object.freeze({
        matched: true,
        matchedEvidenceIds: Object.freeze(allEvidenceIds),
        matchedFeatureIds: Object.freeze(allFeatureIds),
        matchedCapabilityIds: Object.freeze(allCapabilityIds),
      });
    }

    // ── Set Operators ──

    case 'all_of': {
      // Check that all values exist in the specified field across all items
      const allValues = getAllFieldValues(condition.field, context);
      const allPresent = condition.values.every((v) => allValues.some((av) => deepEqual(av, v)));
      if (allPresent) {
        return Object.freeze({
          matched: true,
          matchedEvidenceIds: Object.freeze(context.evidence.map((e) => e.id)),
          matchedFeatureIds: Object.freeze(context.features.map((f) => f.id)),
          matchedCapabilityIds: Object.freeze(context.capabilities.map((c) => c.id)),
        });
      }
      return EMPTY_MATCH;
    }

    case 'any_of': {
      for (const sub of condition.conditions) {
        const result = evaluateConditionRecursive(sub, context, depth + 1);
        if (result.matched) {
          return result;
        }
      }
      return EMPTY_MATCH;
    }

    case 'none_of': {
      for (const sub of condition.conditions) {
        const result = evaluateConditionRecursive(sub, context, depth + 1);
        if (result.matched) {
          return EMPTY_MATCH;
        }
      }
      // None matched — return all items
      return Object.freeze({
        matched: true,
        matchedEvidenceIds: Object.freeze(context.evidence.map((e) => e.id)),
        matchedFeatureIds: Object.freeze(context.features.map((f) => f.id)),
        matchedCapabilityIds: Object.freeze(context.capabilities.map((c) => c.id)),
      });
    }

    // ── Count Operators ──

    case 'minimum_count': {
      const matchingItems = getFieldMatchCount(condition.field, context);
      const matched = matchingItems.count >= condition.count;
      if (matched) {
        return Object.freeze({
          matched: true,
          matchedEvidenceIds: Object.freeze(matchingItems.evidenceIds),
          matchedFeatureIds: Object.freeze(matchingItems.featureIds),
          matchedCapabilityIds: Object.freeze(matchingItems.capabilityIds),
        });
      }
      return EMPTY_MATCH;
    }

    case 'maximum_count': {
      const matchingItems = getFieldMatchCount(condition.field, context);
      const matched = matchingItems.count <= condition.count;
      if (matched) {
        return Object.freeze({
          matched: true,
          matchedEvidenceIds: Object.freeze(matchingItems.evidenceIds),
          matchedFeatureIds: Object.freeze(matchingItems.featureIds),
          matchedCapabilityIds: Object.freeze(matchingItems.capabilityIds),
        });
      }
      return EMPTY_MATCH;
    }

    // ── Existence / Comparison ──

    case 'exists': {
      const values = getAllFieldValues(condition.field, context);
      const entry = getFieldItems(condition.field, context);
      if (values.length > 0) {
        return Object.freeze({
          matched: true,
          matchedEvidenceIds: Object.freeze(entry.evidenceIds),
          matchedFeatureIds: Object.freeze(entry.featureIds),
          matchedCapabilityIds: Object.freeze(entry.capabilityIds),
        });
      }
      return EMPTY_MATCH;
    }

    case 'equals': {
      const evidenceIds: string[] = [];
      const featureIds: string[] = [];
      const capabilityIds: string[] = [];

      for (const ev of context.evidence) {
        const val = getFieldFromObject(condition.field, ev);
        if (val !== undefined && deepEqual(val, condition.value)) {
          evidenceIds.push(ev.id);
        }
      }
      for (const feat of context.features) {
        const val = getFieldFromObject(condition.field, feat);
        if (val !== undefined && deepEqual(val, condition.value)) {
          featureIds.push(feat.id);
        }
      }
      for (const cap of context.capabilities) {
        const val = getFieldFromObject(condition.field, cap);
        if (val !== undefined && deepEqual(val, condition.value)) {
          capabilityIds.push(cap.id);
        }
      }

      if (evidenceIds.length > 0 || featureIds.length > 0 || capabilityIds.length > 0) {
        return Object.freeze({
          matched: true,
          matchedEvidenceIds: Object.freeze(evidenceIds),
          matchedFeatureIds: Object.freeze(featureIds),
          matchedCapabilityIds: Object.freeze(capabilityIds),
        });
      }
      return EMPTY_MATCH;
    }

    case 'contains': {
      const evidenceIds: string[] = [];
      const featureIds: string[] = [];
      const capabilityIds: string[] = [];

      for (const ev of context.evidence) {
        const val = getFieldFromObject(condition.field, ev);
        if (val !== undefined && stringContains(val, condition.value)) {
          evidenceIds.push(ev.id);
        }
      }
      for (const feat of context.features) {
        const val = getFieldFromObject(condition.field, feat);
        if (val !== undefined && stringContains(val, condition.value)) {
          featureIds.push(feat.id);
        }
      }
      for (const cap of context.capabilities) {
        const val = getFieldFromObject(condition.field, cap);
        if (val !== undefined && stringContains(val, condition.value)) {
          capabilityIds.push(cap.id);
        }
      }

      if (evidenceIds.length > 0 || featureIds.length > 0 || capabilityIds.length > 0) {
        return Object.freeze({
          matched: true,
          matchedEvidenceIds: Object.freeze(evidenceIds),
          matchedFeatureIds: Object.freeze(featureIds),
          matchedCapabilityIds: Object.freeze(capabilityIds),
        });
      }
      return EMPTY_MATCH;
    }

    case 'regex': {
      let regex: RegExp;
      try {
        regex = new RegExp(condition.pattern, 'i');
      } catch {
        return EMPTY_MATCH;
      }

      const evidenceIds: string[] = [];
      const featureIds: string[] = [];
      const capabilityIds: string[] = [];

      for (const ev of context.evidence) {
        const val = getFieldFromObject(condition.field, ev);
        if (val !== undefined && regex.test(String(val))) {
          evidenceIds.push(ev.id);
        }
      }
      for (const feat of context.features) {
        const val = getFieldFromObject(condition.field, feat);
        if (val !== undefined && regex.test(String(val))) {
          featureIds.push(feat.id);
        }
      }
      for (const cap of context.capabilities) {
        const val = getFieldFromObject(condition.field, cap);
        if (val !== undefined && regex.test(String(val))) {
          capabilityIds.push(cap.id);
        }
      }

      if (evidenceIds.length > 0 || featureIds.length > 0 || capabilityIds.length > 0) {
        return Object.freeze({
          matched: true,
          matchedEvidenceIds: Object.freeze(evidenceIds),
          matchedFeatureIds: Object.freeze(featureIds),
          matchedCapabilityIds: Object.freeze(capabilityIds),
        });
      }
      return EMPTY_MATCH;
    }

    case 'range': {
      const evidenceIds: string[] = [];
      const featureIds: string[] = [];
      const capabilityIds: string[] = [];

      for (const ev of context.evidence) {
        const val = getFieldFromObject(condition.field, ev);
        if (typeof val === 'number' && inRange(val, condition.min, condition.max)) {
          evidenceIds.push(ev.id);
        }
      }
      for (const feat of context.features) {
        const val = getFieldFromObject(condition.field, feat);
        if (typeof val === 'number' && inRange(val, condition.min, condition.max)) {
          featureIds.push(feat.id);
        }
      }
      for (const cap of context.capabilities) {
        const val = getFieldFromObject(condition.field, cap);
        if (typeof val === 'number' && inRange(val, condition.min, condition.max)) {
          capabilityIds.push(cap.id);
        }
      }

      if (evidenceIds.length > 0 || featureIds.length > 0 || capabilityIds.length > 0) {
        return Object.freeze({
          matched: true,
          matchedEvidenceIds: Object.freeze(evidenceIds),
          matchedFeatureIds: Object.freeze(featureIds),
          matchedCapabilityIds: Object.freeze(capabilityIds),
        });
      }
      return EMPTY_MATCH;
    }

    case 'confidence_threshold': {
      const evidenceIds = context.evidence
        .filter((e) => e.confidence >= condition.threshold)
        .map((e) => e.id);
      const featureIds = context.features
        .filter((f) => f.confidence >= condition.threshold)
        .map((f) => f.id);
      const capabilityIds = context.capabilities
        .filter((c) => c.confidence >= condition.threshold)
        .map((c) => c.id);

      if (evidenceIds.length > 0 || featureIds.length > 0 || capabilityIds.length > 0) {
        return Object.freeze({
          matched: true,
          matchedEvidenceIds: Object.freeze(evidenceIds),
          matchedFeatureIds: Object.freeze(featureIds),
          matchedCapabilityIds: Object.freeze(capabilityIds),
        });
      }
      return EMPTY_MATCH;
    }

    // ── Type Matchers ──

    case 'artifact_type': {
      const evidenceIds = context.evidence
        .filter((e) => e.artifactType === condition.artifactType)
        .map((e) => e.id);

      if (evidenceIds.length > 0) {
        return Object.freeze({
          matched: true,
          matchedEvidenceIds: Object.freeze(evidenceIds),
          matchedFeatureIds: Object.freeze([]),
          matchedCapabilityIds: Object.freeze([]),
        });
      }
      return EMPTY_MATCH;
    }

    case 'evidence_type': {
      const evidenceIds = context.evidence
        .filter(
          (e) => e.type === condition.evidenceType || e.type.startsWith(condition.evidenceType),
        )
        .map((e) => e.id);

      if (evidenceIds.length > 0) {
        return Object.freeze({
          matched: true,
          matchedEvidenceIds: Object.freeze(evidenceIds),
          matchedFeatureIds: Object.freeze([]),
          matchedCapabilityIds: Object.freeze([]),
        });
      }
      return EMPTY_MATCH;
    }

    case 'feature_type': {
      const featureIds = context.features
        .filter((f) => f.type === condition.featureType || f.type.startsWith(condition.featureType))
        .map((f) => f.id);

      if (featureIds.length > 0) {
        return Object.freeze({
          matched: true,
          matchedEvidenceIds: Object.freeze([]),
          matchedFeatureIds: Object.freeze(featureIds),
          matchedCapabilityIds: Object.freeze([]),
        });
      }
      return EMPTY_MATCH;
    }

    case 'capability_type': {
      const capabilityIds = context.capabilities
        .filter(
          (c) => c.type === condition.capabilityType || c.type.startsWith(condition.capabilityType),
        )
        .map((c) => c.id);

      if (capabilityIds.length > 0) {
        return Object.freeze({
          matched: true,
          matchedEvidenceIds: Object.freeze([]),
          matchedFeatureIds: Object.freeze([]),
          matchedCapabilityIds: Object.freeze(capabilityIds),
        });
      }
      return EMPTY_MATCH;
    }

    default:
      return EMPTY_MATCH;
  }
}

// ── Helper Functions ──

/**
 * Get all values of a field across all items in the context.
 */
function getAllFieldValues(field: string, context: EvaluationContext): unknown[] {
  const values: unknown[] = [];

  for (const ev of context.evidence) {
    const val = getFieldFromObject(field, ev);
    if (val !== undefined) values.push(val);
  }
  for (const feat of context.features) {
    const val = getFieldFromObject(field, feat);
    if (val !== undefined) values.push(val);
  }
  for (const cap of context.capabilities) {
    const val = getFieldFromObject(field, cap);
    if (val !== undefined) values.push(val);
  }

  return values;
}

interface FieldItems {
  readonly evidenceIds: readonly string[];
  readonly featureIds: readonly string[];
  readonly capabilityIds: readonly string[];
}

/**
 * Get items that have a given field set.
 */
function getFieldItems(field: string, context: EvaluationContext): FieldItems {
  const evidenceIds = context.evidence
    .filter((e) => getFieldFromObject(field, e) !== undefined)
    .map((e) => e.id);
  const featureIds = context.features
    .filter((f) => getFieldFromObject(field, f) !== undefined)
    .map((f) => f.id);
  const capabilityIds = context.capabilities
    .filter((c) => getFieldFromObject(field, c) !== undefined)
    .map((c) => c.id);

  return {
    evidenceIds: Object.freeze(evidenceIds),
    featureIds: Object.freeze(featureIds),
    capabilityIds: Object.freeze(capabilityIds),
  };
}

interface FieldMatchCount {
  readonly count: number;
  readonly evidenceIds: readonly string[];
  readonly featureIds: readonly string[];
  readonly capabilityIds: readonly string[];
}

/**
 * Get the count of items matching a field (existence-based for count conditions).
 */
function getFieldMatchCount(field: string, context: EvaluationContext): FieldMatchCount {
  const items = getFieldItems(field, context);
  const totalCount =
    items.evidenceIds.length + items.featureIds.length + items.capabilityIds.length;

  return {
    count: totalCount,
    evidenceIds: items.evidenceIds,
    featureIds: items.featureIds,
    capabilityIds: items.capabilityIds,
  };
}

/**
 * Get a field value from an object using dot notation.
 * Supports: "type", "metadata.section"
 */
function getFieldFromObject(field: string, obj: object): unknown {
  const parts = field.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Check if a value contains a substring (case-insensitive).
 */
function stringContains(value: unknown, search: unknown): boolean {
  const str = String(value).toLowerCase();
  const searchStr = String(search).toLowerCase();
  return str.includes(searchStr);
}

/**
 * Check if a number falls within a range.
 */
function inRange(value: number, min?: number, max?: number): boolean {
  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  return true;
}

/**
 * Deep equality comparison for primitive values, arrays, and plain objects.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!(key in bObj)) return false;
      if (!deepEqual(aObj[key], bObj[key])) return false;
    }
    return true;
  }

  return a === b;
}
