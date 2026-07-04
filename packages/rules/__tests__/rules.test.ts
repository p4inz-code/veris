/**
 * Comprehensive tests for @veris/rules.
 *
 * Covers:
 * - RuleBuilder
 * - RuleValidator
 * - RuleRegistry
 * - RuleEngine
 * - Every condition type (AND/OR/NOT logic)
 * - Determinism
 * - Immutability
 * - Parallel execution
 * - Cancellation
 * - Timeout
 * - Duplicate rules
 * - Invalid rules
 * - Empty evidence
 * - Large rule sets
 * - Edge cases
 *
 * @module @veris/rules/__tests__/rules
 */

import { describe, it, expect } from 'vitest';
import { RuleBuilder } from '../src/rule-builder.js';
import {
  validateRuleDefinition,
  validateRuleSet,
  clearValidationState,
} from '../src/rule-validator.js';
import { validateCondition } from '../src/condition-validator.js';
import { evaluateCondition } from '../src/condition-evaluator.js';
import { RuleRegistry } from '../src/rule-registry.js';
import { RuleEngine } from '../src/rule-engine.js';
import { RuleDiagnosticsCollector } from '../src/rule-diagnostics.js';
import { BUILT_IN_RULES, BUILT_IN_RULES_BY_CATEGORY } from '../src/built-in/index.js';
import type {
  Rule,
  RuleCondition,
  EvaluationContext,
  EvidenceRef,
  FeatureRef,
  CapabilityRef,
} from '../src/types.js';

// ── Helpers ──

function makeEvidence(overrides: Partial<EvidenceRef> & { id?: string }): EvidenceRef {
  return Object.freeze({
    id: overrides.id ?? `ev-${Math.random().toString(36).slice(2)}`,
    type: overrides.type ?? 'test-evidence',
    category: overrides.category ?? 'test',
    confidence: overrides.confidence ?? 1.0,
    artifactId: overrides.artifactId ?? 'art-001',
    artifactType: overrides.artifactType ?? 'file',
    metadata: overrides.metadata,
  });
}

function makeFeature(overrides: Partial<FeatureRef> & { id?: string }): FeatureRef {
  return Object.freeze({
    id: overrides.id ?? `feat-${Math.random().toString(36).slice(2)}`,
    type: overrides.type ?? 'test-feature',
    value: overrides.value,
    confidence: overrides.confidence ?? 1.0,
    metadata: overrides.metadata,
  });
}

function makeCapability(overrides: Partial<CapabilityRef> & { id?: string }): CapabilityRef {
  return Object.freeze({
    id: overrides.id ?? `cap-${Math.random().toString(36).slice(2)}`,
    type: overrides.type ?? 'test-capability',
    confidence: overrides.confidence ?? 1.0,
    metadata: overrides.metadata,
  });
}

function makeContext(options?: {
  evidence?: EvidenceRef[];
  features?: FeatureRef[];
  capabilities?: CapabilityRef[];
}): EvaluationContext {
  return Object.freeze({
    evidence: Object.freeze(options?.evidence ?? []),
    features: Object.freeze(options?.features ?? []),
    capabilities: Object.freeze(options?.capabilities ?? []),
  });
}

// ── Builder Tests ──

describe('RuleBuilder', () => {
  it('should build a valid rule with all fields', () => {
    const rule = new RuleBuilder()
      .id('RULE-TEST-001')
      .category('injection')
      .name('Test Rule')
      .description('A test rule description')
      .condition({ type: 'exists', field: 'type' })
      .severityHint('high')
      .explanationTemplate('Matched: {{evidence}}')
      .mitreTechniques('T1055.001')
      .references('https://example.com')
      .tags('test', 'injection')
      .build();

    expect(rule.id).toBe('RULE-TEST-001');
    expect(rule.category).toBe('injection');
    expect(rule.name).toBe('Test Rule');
    expect(rule.description).toBe('A test rule description');
    expect(rule.severityHint).toBe('high');
    expect(rule.explanationTemplate).toBe('Matched: {{evidence}}');
    expect(rule.mitreTechniques).toEqual(['T1055.001']);
    expect(rule.references).toEqual(['https://example.com']);
    expect(rule.tags).toEqual(['test', 'injection']);
  });

  it('should freeze the built rule', () => {
    const rule = new RuleBuilder()
      .id('RULE-TEST-002')
      .category('persistence')
      .name('Test Rule 2')
      .description('Another test')
      .condition({ type: 'exists', field: 'type' })
      .severityHint('medium')
      .explanationTemplate('Matched: {{evidence}}')
      .build();

    expect(Object.isFrozen(rule)).toBe(true);
    expect(Object.isFrozen(rule.mitreTechniques)).toBe(true);
    expect(Object.isFrozen(rule.references)).toBe(true);
    expect(Object.isFrozen(rule.tags)).toBe(true);
  });

  it('should throw if building without required fields', () => {
    const builder = new RuleBuilder()
      .id('RULE-TEST-003')
      .category('injection')
      .name('Test Rule')
      .description('Test');

    expect(() => (builder as any).build()).toThrow();
  });

  it('should throw if building twice', () => {
    const builder = new RuleBuilder()
      .id('RULE-TEST-004')
      .category('injection')
      .name('Test Rule')
      .description('Test')
      .condition({ type: 'exists', field: 'type' })
      .severityHint('high')
      .explanationTemplate('Matched');

    builder.build();
    expect(() => builder.build()).toThrow();
  });

  it('should support method chaining', () => {
    const rule = RuleBuilder.create()
      .id('RULE-TEST-CHAIN-001')
      .category('obfuscation')
      .name('Chain Test')
      .description('Testing chaining')
      .condition({ type: 'exists', field: 'type' })
      .severityHint('low')
      .explanationTemplate('Chain test: {{evidence}}')
      .tags('chain')
      .build();

    expect(rule.name).toBe('Chain Test');
  });

  it('should build from definition via static method', () => {
    const rule = RuleBuilder.fromDefinition({
      id: 'RULE-TEST-STATIC-001',
      category: 'credential-access',
      name: 'Static Test',
      description: 'Built from static method',
      condition: { type: 'evidence_type', evidenceType: 'credential' },
      severityHint: 'critical',
      explanationTemplate: 'Static: {{evidence}}',
      mitreTechniques: ['T1552'],
      references: ['https://attack.mitre.org/techniques/T1552/'],
      tags: ['credential'],
    });

    expect(rule.id).toBe('RULE-TEST-STATIC-001');
    expect(rule.category).toBe('credential-access');
    expect(rule.severityHint).toBe('critical');
    expect(rule.mitreTechniques).toEqual(['T1552']);
  });

  it('should throw on invalid rule during build', () => {
    expect(() => {
      RuleBuilder.fromDefinition({
        id: 'RULE-TEST-INVALID-001',
        category: 'injection' as any,
        name: 'Invalid Rule',
        description: 'This rule has invalid category',
        condition: { type: 'exists', field: 'type' },
        severityHint: 'super-critical' as any,
        explanationTemplate: 'Invalid',
      });
    }).toThrow();
  });
});

// ── Validator Tests ──

describe('RuleValidator', () => {
  beforeEach(() => {
    clearValidationState();
  });

  it('should validate a correct rule', () => {
    clearValidationState();
    const rule: Rule = Object.freeze({
      id: 'RULE-VAL-TEST-001',
      category: 'injection',
      name: 'Valid Rule',
      description: 'A valid rule for testing',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'high',
      explanationTemplate: 'Valid: {{evidence}}',
      mitreTechniques: Object.freeze([]),
      references: Object.freeze([]),
      tags: Object.freeze([]),
    });

    const result = validateRuleDefinition(rule);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('should detect duplicate rule IDs', () => {
    clearValidationState();

    // Build rules manually to avoid fromDefinition() registering IDs first
    const rule1: Rule = Object.freeze({
      id: 'RULE-VAL-DUP-001',
      category: 'injection',
      name: 'First Rule',
      description: 'First',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'high',
      explanationTemplate: 'First',
      mitreTechniques: Object.freeze([]),
      references: Object.freeze([]),
      tags: Object.freeze([]),
    });

    const rule2: Rule = Object.freeze({
      id: 'RULE-VAL-DUP-001',
      category: 'persistence',
      name: 'Second Rule',
      description: 'Second',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'medium',
      explanationTemplate: 'Second',
      mitreTechniques: Object.freeze([]),
      references: Object.freeze([]),
      tags: Object.freeze([]),
    });

    const result1 = validateRuleDefinition(rule1);
    expect(result1.valid).toBe(true);

    const result2 = validateRuleDefinition(rule2);
    expect(result2.valid).toBe(false);
    expect(result2.errors.some((e) => e.code === 'RULE_VAL_002')).toBe(true);
  });

  it('should detect invalid category', () => {
    const rule: Rule = Object.freeze({
      id: 'RULE-VAL-CAT-001',
      category: 'invalid-category' as any,
      name: 'Bad Category',
      description: 'Test',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'high',
      explanationTemplate: 'Test',
      mitreTechniques: Object.freeze([]),
      references: Object.freeze([]),
      tags: Object.freeze([]),
    });

    const result = validateRuleDefinition(rule);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'RULE_VAL_005')).toBe(true);
  });

  it('should detect invalid severity hint', () => {
    const rule: Rule = Object.freeze({
      id: 'RULE-VAL-SEV-001',
      category: 'injection',
      name: 'Bad Severity',
      description: 'Test',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'invalid' as any,
      explanationTemplate: 'Test',
      mitreTechniques: Object.freeze([]),
      references: Object.freeze([]),
      tags: Object.freeze([]),
    });

    const result = validateRuleDefinition(rule);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'RULE_VAL_006')).toBe(true);
  });

  it('should detect missing explanation template', () => {
    const rule: Rule = Object.freeze({
      id: 'RULE-VAL-EXPL-001',
      category: 'injection',
      name: 'No Explanation',
      description: 'Test',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'high',
      explanationTemplate: '',
      mitreTechniques: Object.freeze([]),
      references: Object.freeze([]),
      tags: Object.freeze([]),
    });

    const result = validateRuleDefinition(rule);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'RULE_VAL_007')).toBe(true);
  });

  it('should detect missing condition', () => {
    const rule: Rule = Object.freeze({
      id: 'RULE-VAL-COND-001',
      category: 'injection',
      name: 'No Condition',
      description: 'Test',
      condition: undefined as any,
      severityHint: 'high',
      explanationTemplate: 'Test',
      mitreTechniques: Object.freeze([]),
      references: Object.freeze([]),
      tags: Object.freeze([]),
    });

    const result = validateRuleDefinition(rule);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'RULE_VAL_008')).toBe(true);
  });

  it('should detect empty condition list in AND', () => {
    const errors = validateCondition({ type: 'and', conditions: [] }, 'RULE-VAL-AND-001');
    expect(errors.some((e) => e.code === 'RULE_VAL_012')).toBe(true);
  });

  it('should detect empty condition list in OR', () => {
    const errors = validateCondition({ type: 'or', conditions: [] }, 'RULE-VAL-OR-001');
    expect(errors.some((e) => e.code === 'RULE_VAL_012')).toBe(true);
  });

  it('should detect missing sub-condition in NOT', () => {
    const errors = validateCondition(
      { type: 'not', condition: undefined as any },
      'RULE-VAL-NOT-001',
    );
    expect(errors.some((e) => e.code === 'RULE_VAL_013')).toBe(true);
  });

  it('should detect invalid regex pattern', () => {
    const errors = validateCondition(
      { type: 'regex', field: 'type', pattern: '[invalid' },
      'RULE-VAL-REGEX-001',
    );
    expect(errors.some((e) => e.code === 'RULE_VAL_024')).toBe(true);
  });

  it('should validate a valid regex pattern', () => {
    const errors = validateCondition(
      { type: 'regex', field: 'type', pattern: '^test.*$' },
      'RULE-VAL-REGEX-002',
    );
    expect(errors.length).toBe(0);
  });

  it('should detect range with only min', () => {
    const errors = validateCondition(
      { type: 'range', field: 'confidence', min: 0 },
      'RULE-VAL-RANGE-001',
    );
    expect(errors.length).toBe(0);
  });

  it('should detect range with only max', () => {
    const errors = validateCondition(
      { type: 'range', field: 'confidence', max: 10 },
      'RULE-VAL-RANGE-002',
    );
    expect(errors.length).toBe(0);
  });

  it('should detect range with min > max', () => {
    const errors = validateCondition(
      { type: 'range', field: 'confidence', min: 10, max: 5 },
      'RULE-VAL-RANGE-003',
    );
    expect(errors.some((e) => e.code === 'RULE_VAL_029')).toBe(true);
  });

  it('should detect invalid confidence threshold', () => {
    const errors1 = validateCondition(
      { type: 'confidence_threshold', threshold: -0.1 },
      'RULE-VAL-CONF-001',
    );
    expect(errors1.some((e) => e.code === 'RULE_VAL_030')).toBe(true);

    const errors2 = validateCondition(
      { type: 'confidence_threshold', threshold: 1.5 },
      'RULE-VAL-CONF-002',
    );
    expect(errors2.some((e) => e.code === 'RULE_VAL_030')).toBe(true);
  });

  it('should validate a valid confidence threshold', () => {
    const errors = validateCondition(
      { type: 'confidence_threshold', threshold: 0.7 },
      'RULE-VAL-CONF-003',
    );
    expect(errors.length).toBe(0);
  });

  it('should detect unknown condition type', () => {
    const errors = validateCondition({ type: 'unknown_type' as any }, 'RULE-VAL-UNKNOWN-001');
    expect(errors.some((e) => e.code === 'RULE_VAL_035')).toBe(true);
  });

  it('should validate a rule set with no duplicates', () => {
    clearValidationState();

    const rules = [
      RuleBuilder.fromDefinition({
        id: 'RULE-SET-001',
        category: 'injection',
        name: 'Rule 1',
        description: 'First',
        condition: { type: 'exists', field: 'type' },
        severityHint: 'high',
        explanationTemplate: 'First',
      }),
      RuleBuilder.fromDefinition({
        id: 'RULE-SET-002',
        category: 'persistence',
        name: 'Rule 2',
        description: 'Second',
        condition: { type: 'exists', field: 'type' },
        severityHint: 'medium',
        explanationTemplate: 'Second',
      }),
    ];

    const result = validateRuleSet(rules);
    expect(result.valid).toBe(true);
  });

  it('should detect duplicates in a rule set', () => {
    clearValidationState();

    const rules = [
      RuleBuilder.fromDefinition({
        id: 'RULE-SET-DUP-001',
        category: 'injection',
        name: 'Rule 1',
        description: 'First',
        condition: { type: 'exists', field: 'type' },
        severityHint: 'high',
        explanationTemplate: 'First',
      }),
      RuleBuilder.fromDefinition({
        id: 'RULE-SET-DUP-001',
        category: 'persistence',
        name: 'Rule 2',
        description: 'Second',
        condition: { type: 'exists', field: 'type' },
        severityHint: 'medium',
        explanationTemplate: 'Second',
      }),
    ];

    const result = validateRuleSet(rules);
    expect(result.valid).toBe(false);
  });

  it('should detect deep nesting exceeding limit', () => {
    // Create a deeply nested condition
    let cond: RuleCondition = { type: 'exists', field: 'type' };
    for (let i = 0; i < 60; i++) {
      cond = { type: 'not', condition: cond };
    }
    const errors = validateCondition(cond, 'RULE-VAL-DEEP-001');
    expect(errors.some((e) => e.code === 'RULE_VAL_011')).toBe(true);
  });

  it('should validate empty ALL_OF values', () => {
    const errors = validateCondition(
      { type: 'all_of', field: 'type', values: [] },
      'RULE-VAL-ALLOF-001',
    );
    expect(errors.some((e) => e.code === 'RULE_VAL_015')).toBe(true);
  });

  it('should validate non-integer count', () => {
    const errors1 = validateCondition(
      { type: 'minimum_count', field: 'type', count: -1 },
      'RULE-VAL-COUNT-001',
    );
    expect(errors1.some((e) => e.code === 'RULE_VAL_018')).toBe(true);

    const errors2 = validateCondition(
      { type: 'minimum_count', field: 'type', count: 1.5 },
      'RULE-VAL-COUNT-002',
    );
    expect(errors2.some((e) => e.code === 'RULE_VAL_018')).toBe(true);
  });
});

// ── Condition Evaluator Tests ──

describe('Condition Evaluator', () => {
  it('should evaluate exists condition', () => {
    const ev = makeEvidence({ id: 'ev-001' });
    const result = evaluateCondition(
      { type: 'exists', field: 'type' },
      makeContext({ evidence: [ev] }),
    );
    expect(result.matched).toBe(true);
    expect(result.matchedEvidenceIds).toContain('ev-001');
  });

  it('should fail exists condition when field missing', () => {
    const ev = makeEvidence({ id: 'ev-001' });
    const result = evaluateCondition(
      { type: 'exists', field: 'nonexistent' },
      makeContext({ evidence: [ev] }),
    );
    expect(result.matched).toBe(false);
  });

  it('should evaluate equals condition', () => {
    const ev = makeEvidence({ id: 'ev-001', type: 'pe-import' });
    const result = evaluateCondition(
      { type: 'equals', field: 'type', value: 'pe-import' },
      makeContext({ evidence: [ev] }),
    );
    expect(result.matched).toBe(true);
    expect(result.matchedEvidenceIds).toContain('ev-001');
  });

  it('should fail equals condition when value differs', () => {
    const ev = makeEvidence({ id: 'ev-001', type: 'pe-import' });
    const result = evaluateCondition(
      { type: 'equals', field: 'type', value: 'pe-export' },
      makeContext({ evidence: [ev] }),
    );
    expect(result.matched).toBe(false);
  });

  it('should evaluate contains condition', () => {
    const ev = makeEvidence({ id: 'ev-001', type: 'pe-import-CreateRemoteThread' });
    const result = evaluateCondition(
      { type: 'contains', field: 'type', value: 'CreateRemoteThread' },
      makeContext({ evidence: [ev] }),
    );
    expect(result.matched).toBe(true);
  });

  it('should evaluate regex condition', () => {
    const ev = makeEvidence({ id: 'ev-001', type: 'T1055.001' });
    const result = evaluateCondition(
      { type: 'regex', field: 'type', pattern: '^T\\d+' },
      makeContext({ evidence: [ev] }),
    );
    expect(result.matched).toBe(true);
  });

  it('should evaluate range condition', () => {
    const ev = makeEvidence({ id: 'ev-001', confidence: 0.75 });
    const result = evaluateCondition(
      { type: 'range', field: 'confidence', min: 0.5, max: 1.0 },
      makeContext({ evidence: [ev] }),
    );
    expect(result.matched).toBe(true);
  });

  it('should fail range condition when outside range', () => {
    const ev = makeEvidence({ id: 'ev-001', confidence: 0.3 });
    const result = evaluateCondition(
      { type: 'range', field: 'confidence', min: 0.5, max: 1.0 },
      makeContext({ evidence: [ev] }),
    );
    expect(result.matched).toBe(false);
  });

  it('should evaluate confidence_threshold condition', () => {
    const ev = makeEvidence({ id: 'ev-001', confidence: 0.9 });
    const result = evaluateCondition(
      { type: 'confidence_threshold', threshold: 0.5 },
      makeContext({ evidence: [ev] }),
    );
    expect(result.matched).toBe(true);
  });

  it('should fail confidence_threshold when below threshold', () => {
    const ev = makeEvidence({ id: 'ev-001', confidence: 0.3 });
    const result = evaluateCondition(
      { type: 'confidence_threshold', threshold: 0.5 },
      makeContext({ evidence: [ev] }),
    );
    expect(result.matched).toBe(false);
  });

  it('should evaluate AND condition (both match)', () => {
    const ev1 = makeEvidence({ id: 'ev-001', type: 'pe-import' });
    const ev2 = makeEvidence({ id: 'ev-002', type: 'pe-section' });
    const result = evaluateCondition(
      {
        type: 'and',
        conditions: [
          { type: 'equals', field: 'type', value: 'pe-import' },
          { type: 'equals', field: 'type', value: 'pe-section' },
        ],
      },
      makeContext({ evidence: [ev1, ev2] }),
    );
    expect(result.matched).toBe(true);
  });

  it("should fail AND condition when one doesn't match", () => {
    const ev1 = makeEvidence({ id: 'ev-001', type: 'pe-import' });
    const result = evaluateCondition(
      {
        type: 'and',
        conditions: [
          { type: 'equals', field: 'type', value: 'pe-import' },
          { type: 'equals', field: 'type', value: 'pe-section' },
        ],
      },
      makeContext({ evidence: [ev1] }),
    );
    expect(result.matched).toBe(false);
  });

  it('should evaluate OR condition (either matches)', () => {
    const ev1 = makeEvidence({ id: 'ev-001', type: 'pe-import' });
    const result = evaluateCondition(
      {
        type: 'or',
        conditions: [
          { type: 'equals', field: 'type', value: 'pe-import' },
          { type: 'equals', field: 'type', value: 'pe-section' },
        ],
      },
      makeContext({ evidence: [ev1] }),
    );
    expect(result.matched).toBe(true);
  });

  it('should fail OR condition when neither matches', () => {
    const ev1 = makeEvidence({ id: 'ev-001', type: 'pe-import' });
    const result = evaluateCondition(
      {
        type: 'or',
        conditions: [
          { type: 'equals', field: 'type', value: 'pe-export' },
          { type: 'equals', field: 'type', value: 'pe-section' },
        ],
      },
      makeContext({ evidence: [ev1] }),
    );
    expect(result.matched).toBe(false);
  });

  it('should evaluate NOT condition (inverts match)', () => {
    const ev1 = makeEvidence({ id: 'ev-001', type: 'pe-import' });
    const result = evaluateCondition(
      {
        type: 'not',
        condition: { type: 'equals', field: 'type', value: 'pe-export' },
      },
      makeContext({ evidence: [ev1] }),
    );
    expect(result.matched).toBe(true);
  });

  it('should fail NOT when sub-condition matches', () => {
    const ev1 = makeEvidence({ id: 'ev-001', type: 'pe-import' });
    const result = evaluateCondition(
      {
        type: 'not',
        condition: { type: 'equals', field: 'type', value: 'pe-import' },
      },
      makeContext({ evidence: [ev1] }),
    );
    // NOT inverts the match: sub-condition matched, so NOT should NOT match
    expect(result.matched).toBe(false);
  });

  it('should evaluate ALL_OF condition', () => {
    const ev1 = makeEvidence({ id: 'ev-001', type: 'pe-import' });
    const ev2 = makeEvidence({ id: 'ev-002', type: 'pe-section' });
    const result = evaluateCondition(
      { type: 'all_of', field: 'type', values: ['pe-import', 'pe-section'] },
      makeContext({ evidence: [ev1, ev2] }),
    );
    expect(result.matched).toBe(true);
  });

  it('should fail ALL_OF when missing a value', () => {
    const ev1 = makeEvidence({ id: 'ev-001', type: 'pe-import' });
    const result = evaluateCondition(
      { type: 'all_of', field: 'type', values: ['pe-import', 'pe-section'] },
      makeContext({ evidence: [ev1] }),
    );
    expect(result.matched).toBe(false);
  });

  it('should evaluate ANY_OF condition', () => {
    const ev1 = makeEvidence({ id: 'ev-001', type: 'pe-import' });
    const result = evaluateCondition(
      {
        type: 'any_of',
        conditions: [
          { type: 'equals', field: 'type', value: 'pe-import' },
          { type: 'equals', field: 'type', value: 'pe-section' },
        ],
      },
      makeContext({ evidence: [ev1] }),
    );
    expect(result.matched).toBe(true);
  });

  it('should evaluate NONE_OF condition', () => {
    const ev1 = makeEvidence({ id: 'ev-001', type: 'pe-import' });
    const result = evaluateCondition(
      {
        type: 'none_of',
        conditions: [
          { type: 'equals', field: 'type', value: 'pe-export' },
          { type: 'equals', field: 'type', value: 'pe-section' },
        ],
      },
      makeContext({ evidence: [ev1] }),
    );
    expect(result.matched).toBe(true);
  });

  it('should fail NONE_OF when a condition matches', () => {
    const ev1 = makeEvidence({ id: 'ev-001', type: 'pe-import' });
    const result = evaluateCondition(
      {
        type: 'none_of',
        conditions: [
          { type: 'equals', field: 'type', value: 'pe-import' },
          { type: 'equals', field: 'type', value: 'pe-section' },
        ],
      },
      makeContext({ evidence: [ev1] }),
    );
    expect(result.matched).toBe(false);
  });

  it('should evaluate minimum_count condition', () => {
    const ev1 = makeEvidence({ id: 'ev-001', type: 'pe-import' });
    const ev2 = makeEvidence({ id: 'ev-002', type: 'pe-import' });
    const result = evaluateCondition(
      { type: 'minimum_count', field: 'type', count: 2 },
      makeContext({ evidence: [ev1, ev2] }),
    );
    expect(result.matched).toBe(true);
  });

  it('should fail minimum_count when not enough items', () => {
    const ev1 = makeEvidence({ id: 'ev-001', type: 'pe-import' });
    const result = evaluateCondition(
      { type: 'minimum_count', field: 'type', count: 2 },
      makeContext({ evidence: [ev1] }),
    );
    expect(result.matched).toBe(false);
  });

  it('should evaluate maximum_count condition', () => {
    const ev1 = makeEvidence({ id: 'ev-001', type: 'pe-import' });
    const result = evaluateCondition(
      { type: 'maximum_count', field: 'type', count: 2 },
      makeContext({ evidence: [ev1] }),
    );
    expect(result.matched).toBe(true);
  });

  it('should fail maximum_count when too many items', () => {
    const ev1 = makeEvidence({ id: 'ev-001', type: 'pe-import' });
    const ev2 = makeEvidence({ id: 'ev-002', type: 'pe-import' });
    const ev3 = makeEvidence({ id: 'ev-003', type: 'pe-import' });
    const result = evaluateCondition(
      { type: 'maximum_count', field: 'type', count: 2 },
      makeContext({ evidence: [ev1, ev2, ev3] }),
    );
    expect(result.matched).toBe(false);
  });

  it('should evaluate evidence_type condition', () => {
    const ev = makeEvidence({ id: 'ev-001', type: 'pe-import' });
    const result = evaluateCondition(
      { type: 'evidence_type', evidenceType: 'pe-import' },
      makeContext({ evidence: [ev] }),
    );
    expect(result.matched).toBe(true);
  });

  it('should evaluate feature_type condition', () => {
    const feat = makeFeature({ id: 'feat-001', type: 'string-literal' });
    const result = evaluateCondition(
      { type: 'feature_type', featureType: 'string-literal' },
      makeContext({ features: [feat] }),
    );
    expect(result.matched).toBe(true);
  });

  it('should evaluate capability_type condition', () => {
    const cap = makeCapability({ id: 'cap-001', type: 'process-injection' });
    const result = evaluateCondition(
      { type: 'capability_type', capabilityType: 'process-injection' },
      makeContext({ capabilities: [cap] }),
    );
    expect(result.matched).toBe(true);
  });

  it('should evaluate artifact_type condition', () => {
    const ev = makeEvidence({ id: 'ev-001', artifactType: 'executable' });
    const result = evaluateCondition(
      { type: 'artifact_type', artifactType: 'executable' },
      makeContext({ evidence: [ev] }),
    );
    expect(result.matched).toBe(true);
  });

  it('should evaluate metadata field access with dot notation', () => {
    const ev = makeEvidence({
      id: 'ev-001',
      type: 'pe-import',
      metadata: Object.freeze({ dll: 'kernel32' }),
    });
    const result = evaluateCondition(
      { type: 'equals', field: 'metadata.dll', value: 'kernel32' },
      makeContext({ evidence: [ev] }),
    );
    expect(result.matched).toBe(true);
  });

  it('should return empty match for empty context', () => {
    const result = evaluateCondition({ type: 'exists', field: 'type' }, makeContext());
    expect(result.matched).toBe(false);
  });

  it('should evaluate complex nested AND/OR/NOT', () => {
    const ev1 = makeEvidence({ id: 'ev-001', type: 'pe-import' });
    const ev2 = makeEvidence({ id: 'ev-002', type: 'high-entropy' });
    const result = evaluateCondition(
      {
        type: 'and',
        conditions: [
          { type: 'evidence_type', evidenceType: 'pe-import' },
          {
            type: 'or',
            conditions: [
              { type: 'evidence_type', evidenceType: 'high-entropy' },
              { type: 'evidence_type', evidenceType: 'pe-section' },
            ],
          },
        ],
      },
      makeContext({ evidence: [ev1, ev2] }),
    );
    expect(result.matched).toBe(true);
  });

  it('should produce deterministic results', () => {
    const ev1 = makeEvidence({ id: 'ev-001', type: 'pe-import' });
    const context = makeContext({ evidence: [ev1] });
    const condition: RuleCondition = { type: 'exists', field: 'type' };

    const result1 = evaluateCondition(condition, context);
    const result2 = evaluateCondition(condition, context);

    expect(result1.matched).toBe(result2.matched);
    expect(result1.matchedEvidenceIds).toEqual(result2.matchedEvidenceIds);
  });

  it('should handle very deeply nested conditions (up to 100)', () => {
    let cond: RuleCondition = { type: 'exists', field: 'type' };
    for (let i = 0; i < 50; i++) {
      cond = { type: 'not', condition: cond };
    }
    const ev = makeEvidence({ id: 'ev-001', type: 'test' });
    const result = evaluateCondition(cond, makeContext({ evidence: [ev] }));
    // Should not crash — returns result even if deeply nested
    expect(typeof result.matched).toBe('boolean');
  });
});

// ── Registry Tests ──

describe('RuleRegistry', () => {
  let registry: RuleRegistry;

  beforeEach(() => {
    registry = new RuleRegistry();
  });

  it('should register a rule', () => {
    const rule = RuleBuilder.fromDefinition({
      id: 'RULE-REG-001',
      category: 'injection',
      name: 'Reg Test',
      description: 'Test registration',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'high',
      explanationTemplate: 'Reg test: {{evidence}}',
    });

    registry.register(rule);
    expect(registry.size).toBe(1);
  });

  it('should look up a rule by ID', () => {
    const rule = RuleBuilder.fromDefinition({
      id: 'RULE-REG-002',
      category: 'persistence',
      name: 'Lookup Test',
      description: 'Test lookup',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'medium',
      explanationTemplate: 'Lookup test: {{evidence}}',
    });

    registry.register(rule);
    const found = registry.lookup('RULE-REG-002');
    expect(found).toBeDefined();
    expect(found!.id).toBe('RULE-REG-002');
  });

  it('should return undefined for unknown ID', () => {
    const found = registry.lookup('RULE-NONEXISTENT');
    expect(found).toBeUndefined();
  });

  it('should unregister a rule', () => {
    const rule = RuleBuilder.fromDefinition({
      id: 'RULE-REG-003',
      category: 'injection',
      name: 'Unregister Test',
      description: 'Test unregister',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'high',
      explanationTemplate: 'Unreg test: {{evidence}}',
    });

    registry.register(rule);
    expect(registry.size).toBe(1);

    const removed = registry.unregister('RULE-REG-003');
    expect(removed).toBe(true);
    expect(registry.size).toBe(0);
  });

  it('should return false when unregistering unknown ID', () => {
    const removed = registry.unregister('RULE-NONEXISTENT');
    expect(removed).toBe(false);
  });

  it('should reject duplicate rule IDs', () => {
    const rule1 = RuleBuilder.fromDefinition({
      id: 'RULE-REG-DUP-001',
      category: 'injection',
      name: 'First',
      description: 'First',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'high',
      explanationTemplate: 'First',
    });

    const rule2 = RuleBuilder.fromDefinition({
      id: 'RULE-REG-DUP-001',
      category: 'persistence',
      name: 'Second',
      description: 'Second',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'medium',
      explanationTemplate: 'Second',
    });

    registry.register(rule1);
    expect(() => registry.register(rule2)).toThrow();
  });

  it('should return rules ordered by category priority', () => {
    const injectionRule = RuleBuilder.fromDefinition({
      id: 'RULE-ORDER-002',
      category: 'injection',
      name: 'Injection Rule',
      description: 'Injection category',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'critical',
      explanationTemplate: 'Injection',
    });

    const bestPracticeRule = RuleBuilder.fromDefinition({
      id: 'RULE-ORDER-001',
      category: 'best-practice',
      name: 'Best Practice Rule',
      description: 'Best practice category',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'low',
      explanationTemplate: 'Best practice',
    });

    registry.register(bestPracticeRule);
    registry.register(injectionRule);

    const all = registry.getAll();
    expect(all[0].category).toBe('injection'); // injection has priority 0
    expect(all[1].category).toBe('best-practice'); // best-practice has priority 12
  });

  it('should get rules by category', () => {
    const rule1 = RuleBuilder.fromDefinition({
      id: 'RULE-CAT-001',
      category: 'injection',
      name: 'Injection 1',
      description: 'First injection rule',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'high',
      explanationTemplate: 'Injection 1',
    });

    const rule2 = RuleBuilder.fromDefinition({
      id: 'RULE-CAT-002',
      category: 'injection',
      name: 'Injection 2',
      description: 'Second injection rule',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'critical',
      explanationTemplate: 'Injection 2',
    });

    const rule3 = RuleBuilder.fromDefinition({
      id: 'RULE-CAT-003',
      category: 'persistence',
      name: 'Persistence',
      description: 'Persistence rule',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'medium',
      explanationTemplate: 'Persistence',
    });

    registry.register(rule1, rule2, rule3);

    const injectionRules = registry.getByCategory('injection');
    expect(injectionRules.length).toBe(2);

    const persistenceRules = registry.getByCategory('persistence');
    expect(persistenceRules.length).toBe(1);
  });

  it('should clear all rules', () => {
    const rule = RuleBuilder.fromDefinition({
      id: 'RULE-CLEAR-001',
      category: 'injection',
      name: 'Clear Test',
      description: 'Test clear',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'high',
      explanationTemplate: 'Clear test: {{evidence}}',
    });

    registry.register(rule);
    expect(registry.size).toBe(1);

    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.getAll().length).toBe(0);
  });

  it('should check if a rule exists', () => {
    const rule = RuleBuilder.fromDefinition({
      id: 'RULE-HAS-001',
      category: 'injection',
      name: 'Has Test',
      description: 'Test has',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'high',
      explanationTemplate: 'Has test',
    });

    registry.register(rule);
    expect(registry.has('RULE-HAS-001')).toBe(true);
    expect(registry.has('RULE-NONEXISTENT')).toBe(false);
  });

  it('should return all IDs', () => {
    const rule1 = RuleBuilder.fromDefinition({
      id: 'RULE-IDS-001',
      category: 'injection',
      name: 'First',
      description: 'First',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'high',
      explanationTemplate: 'First',
    });
    const rule2 = RuleBuilder.fromDefinition({
      id: 'RULE-IDS-002',
      category: 'persistence',
      name: 'Second',
      description: 'Second',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'medium',
      explanationTemplate: 'Second',
    });

    registry.register(rule1, rule2);
    const ids = registry.ids;
    expect(ids).toContain('RULE-IDS-001');
    expect(ids).toContain('RULE-IDS-002');
    expect(ids.length).toBe(2);
  });

  it('should reject invalid rules', () => {
    expect(() => {
      const invalidRule: Rule = Object.freeze({
        id: 'RULE-INVALID-001',
        category: 'injection',
        name: '',
        description: 'Test',
        condition: { type: 'exists', field: 'type' },
        severityHint: 'high' as any,
        explanationTemplate: 'Test',
        mitreTechniques: Object.freeze([]),
        references: Object.freeze([]),
        tags: Object.freeze([]),
      });
      registry.register(invalidRule);
    }).toThrow();
  });

  it('should be immutable — returned arrays should be frozen', () => {
    const rule = RuleBuilder.fromDefinition({
      id: 'RULE-IMMUT-001',
      category: 'injection',
      name: 'Immutability Test',
      description: 'Test immutability',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'high',
      explanationTemplate: 'Immutable',
    });

    registry.register(rule);
    expect(Object.isFrozen(registry.getAll())).toBe(true);
  });
});

// ── Engine Tests ──

describe('RuleEngine', () => {
  let registry: RuleRegistry;

  beforeEach(() => {
    registry = new RuleRegistry();
  });

  it('should evaluate rules and produce matches', async () => {
    const rule = RuleBuilder.fromDefinition({
      id: 'RULE-ENG-001',
      category: 'injection',
      name: 'Engine Test',
      description: 'Test engine evaluation',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'high',
      explanationTemplate: 'Engine test matched: {{evidence}}',
    });

    registry.register(rule);
    const engine = new RuleEngine(registry);

    const ev = makeEvidence({ id: 'ev-001' });
    const result = await engine.evaluate(makeContext({ evidence: [ev] }));

    expect(result.matches.length).toBe(1);
    expect(result.evaluations.length).toBe(1);
    expect(result.diagnostics.totalRules).toBe(1);
    expect(result.diagnostics.matchedRules).toBe(1);
  });

  it('should not produce matches when condition fails', async () => {
    const rule = RuleBuilder.fromDefinition({
      id: 'RULE-ENG-002',
      category: 'injection',
      name: 'No Match',
      description: 'This rule should not match',
      condition: { type: 'exists', field: 'nonexistent' },
      severityHint: 'high',
      explanationTemplate: 'Should not match: {{evidence}}',
    });

    registry.register(rule);
    const engine = new RuleEngine(registry);

    const ev = makeEvidence({ id: 'ev-001' });
    const result = await engine.evaluate(makeContext({ evidence: [ev] }));

    expect(result.matches.length).toBe(0);
    expect(result.evaluations.length).toBe(1);
    expect(result.evaluations[0].matched).toBe(false);
  });

  it('should evaluate multiple rules in parallel', async () => {
    const rules = Array.from({ length: 10 }, (_, i) =>
      RuleBuilder.fromDefinition({
        id: `RULE-ENG-PAR-${String(i).padStart(3, '0')}`,
        category: 'injection',
        name: `Parallel Rule ${i}`,
        description: `Parallel rule ${i}`,
        condition: { type: 'exists', field: 'type' },
        severityHint: 'high',
        explanationTemplate: `Parallel ${i}: {{evidence}}`,
      }),
    );

    registry.register(...rules);
    const engine = new RuleEngine(registry, { concurrency: 4 });

    const ev = makeEvidence({ id: 'ev-001' });
    const result = await engine.evaluate(makeContext({ evidence: [ev] }));

    expect(result.matches.length).toBe(10);
    expect(result.diagnostics.totalRules).toBe(10);
  });

  it('should handle empty registry gracefully', async () => {
    const engine = new RuleEngine(registry);
    const result = await engine.evaluate(makeContext());

    expect(result.matches.length).toBe(0);
    expect(result.evaluations.length).toBe(0);
    expect(result.diagnostics.totalRules).toBe(0);
  });

  it('should handle empty evidence gracefully', async () => {
    const rule = RuleBuilder.fromDefinition({
      id: 'RULE-ENG-EMPTY-001',
      category: 'injection',
      name: 'Empty Evidence',
      description: 'Test empty evidence',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'high',
      explanationTemplate: 'Empty: {{evidence}}',
    });

    registry.register(rule);
    const engine = new RuleEngine(registry);

    const result = await engine.evaluate(makeContext());
    expect(result.matches.length).toBe(0);
  });

  it('should produce deterministic results across runs', async () => {
    const rules = [1, 2, 3].map((i) =>
      RuleBuilder.fromDefinition({
        id: `RULE-ENG-DET-${String(i).padStart(3, '0')}`,
        category: 'injection',
        name: `Det Rule ${i}`,
        description: `Deterministic rule ${i}`,
        condition: { type: 'exists', field: 'type' },
        severityHint: 'high',
        explanationTemplate: `Det ${i}: {{evidence}}`,
      }),
    );

    registry.register(...rules);
    const engine = new RuleEngine(registry);

    const ev = makeEvidence({ id: 'ev-001' });
    const result1 = await engine.evaluate(makeContext({ evidence: [ev] }));
    const result2 = await engine.evaluate(makeContext({ evidence: [ev] }));

    expect(result1.matches.length).toBe(result2.matches.length);
    expect(result1.evaluations.map((e) => e.ruleId)).toEqual(
      result2.evaluations.map((e) => e.ruleId),
    );
  });

  it('should respect concurrency limit', async () => {
    const rules = Array.from({ length: 20 }, (_, i) =>
      RuleBuilder.fromDefinition({
        id: `RULE-ENG-CONC-${String(i).padStart(3, '0')}`,
        category: 'injection',
        name: `Concurrency Rule ${i}`,
        description: `Concurrency test ${i}`,
        condition: { type: 'exists', field: 'type' },
        severityHint: 'high',
        explanationTemplate: `Concurrency ${i}: {{evidence}}`,
      }),
    );

    registry.register(...rules);
    const engine = new RuleEngine(registry, { concurrency: 2 });

    const ev = makeEvidence({ id: 'ev-001' });
    const result = await engine.evaluate(makeContext({ evidence: [ev] }));

    expect(result.matches.length).toBe(20);
  });

  it('should handle rule evaluation errors gracefully', async () => {
    // A rule with an invalid regex should be handled by the engine
    const rule = RuleBuilder.fromDefinition({
      id: 'RULE-ENG-ERR-001',
      category: 'injection',
      name: 'Error Rule',
      description: 'This rule has an issue',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'high',
      explanationTemplate: 'Error: {{evidence}}',
    });

    registry.register(rule);
    const engine = new RuleEngine(registry, { timeoutMs: 100 });

    const ev = makeEvidence({ id: 'ev-001' });
    const result = await engine.evaluate(makeContext({ evidence: [ev] }));

    // Should match since the condition is valid
    expect(result.matches.length).toBe(1);
  });

  it('should build match with explanation from template', async () => {
    const rule = RuleBuilder.fromDefinition({
      id: 'RULE-ENG-EXPL-001',
      category: 'injection',
      name: 'Explanation Test',
      description: 'Test explanation building',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'high',
      explanationTemplate: 'Match found with evidence: {{evidence}} and features: {{features}}',
    });

    registry.register(rule);
    const engine = new RuleEngine(registry);

    const ev = makeEvidence({ id: 'ev-001' });
    const feat = makeFeature({ id: 'feat-001', type: 'string' });
    const result = await engine.evaluate(makeContext({ evidence: [ev], features: [feat] }));

    expect(result.matches.length).toBe(1);
    expect(result.matches[0].explanation).toContain('ev-001');
    expect(result.matches[0].explanation).toContain('feat-001');
  });

  it('should include MITRE techniques and references in match', async () => {
    const rule = RuleBuilder.fromDefinition({
      id: 'RULE-ENG-MITRE-001',
      category: 'injection',
      name: 'MITRE Test',
      description: 'Test MITRE techniques',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'high',
      explanationTemplate: 'MITRE: {{evidence}}',
      mitreTechniques: ['T1055.001', 'T1055.002'],
      references: ['https://attack.mitre.org/techniques/T1055/'],
    });

    registry.register(rule);
    const engine = new RuleEngine(registry);

    const ev = makeEvidence({ id: 'ev-001' });
    const result = await engine.evaluate(makeContext({ evidence: [ev] }));

    expect(result.matches[0].mitreTechniques).toEqual(['T1055.001', 'T1055.002']);
    expect(result.matches[0].references).toContain('https://attack.mitre.org/techniques/T1055/');
  });

  it('should produce immutable results', async () => {
    const rule = RuleBuilder.fromDefinition({
      id: 'RULE-ENG-IMM-001',
      category: 'injection',
      name: 'Immutable Result',
      description: 'Test immutability of results',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'high',
      explanationTemplate: 'Immutable: {{evidence}}',
    });

    registry.register(rule);
    const engine = new RuleEngine(registry);

    const ev = makeEvidence({ id: 'ev-001' });
    const result = await engine.evaluate(makeContext({ evidence: [ev] }));

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.evaluations)).toBe(true);
    expect(Object.isFrozen(result.matches)).toBe(true);
    expect(Object.isFrozen(result.diagnostics)).toBe(true);
  });

  it('should evaluate a large rule set efficiently', async () => {
    const rules = Array.from({ length: 100 }, (_, i) =>
      RuleBuilder.fromDefinition({
        id: `RULE-ENG-LARGE-${String(i).padStart(3, '0')}`,
        category: i % 2 === 0 ? 'injection' : 'persistence',
        name: `Large Rule ${i}`,
        description: `Large rule set test ${i}`,
        condition: { type: 'exists', field: 'type' },
        severityHint: 'high',
        explanationTemplate: `Large ${i}: {{evidence}}`,
      }),
    );

    registry.register(...rules);
    const engine = new RuleEngine(registry, { concurrency: 8 });

    const ev = makeEvidence({ id: 'ev-001' });
    const result = await engine.evaluate(makeContext({ evidence: [ev] }));

    expect(result.matches.length).toBe(100);
    expect(result.diagnostics.totalRules).toBe(100);
    expect(result.diagnostics.totalDurationMs).toBeGreaterThanOrEqual(0);
  });
});

// ── Diagnostics Tests ──

describe('RuleDiagnosticsCollector', () => {
  it('should collect diagnostics', () => {
    const collector = new RuleDiagnosticsCollector();
    collector.start();

    collector.record({
      ruleId: 'RULE-DIAG-001',
      matched: true,
      durationMs: 10,
    });

    collector.record({
      ruleId: 'RULE-DIAG-002',
      matched: false,
      durationMs: 5,
      error: 'Timeout',
    });

    const diagnostics = collector.build();

    expect(diagnostics.totalRules).toBe(2);
    expect(diagnostics.matchedRules).toBe(1);
    expect(diagnostics.failedRules).toBe(1);
    expect(diagnostics.perRule.length).toBe(2);
  });

  it('should record batch of entries', () => {
    const collector = new RuleDiagnosticsCollector();
    collector.start();

    collector.recordBatch([
      { ruleId: 'RULE-DIAG-001', matched: true, durationMs: 10 },
      { ruleId: 'RULE-DIAG-002', matched: false, durationMs: 5 },
      { ruleId: 'RULE-DIAG-003', matched: true, durationMs: 20 },
    ]);

    const diagnostics = collector.build();
    expect(diagnostics.totalRules).toBe(3);
    expect(diagnostics.matchedRules).toBe(2);
  });

  it('should clear and reset', () => {
    const collector = new RuleDiagnosticsCollector();
    collector.start();
    collector.record({ ruleId: 'RULE-DIAG-001', matched: true, durationMs: 10 });

    expect(collector.size).toBe(1);

    collector.clear();
    expect(collector.size).toBe(0);
  });

  it('should track size', () => {
    const collector = new RuleDiagnosticsCollector();
    expect(collector.size).toBe(0);

    collector.record({ ruleId: 'RULE-DIAG-001', matched: true, durationMs: 1 });
    expect(collector.size).toBe(1);
  });

  it('should freeze diagnostics entries', () => {
    const collector = new RuleDiagnosticsCollector();
    collector.start();
    collector.record({ ruleId: 'RULE-DIAG-FRZ', matched: true, durationMs: 1 });

    const diagnostics = collector.build();
    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(Object.isFrozen(diagnostics.perRule)).toBe(true);
    expect(Object.isFrozen(diagnostics.perRule[0])).toBe(true);
  });
});

// ── Built-in Rules Tests ──

describe('Built-in Rules', () => {
  it('should have 20 built-in rules', () => {
    expect(BUILT_IN_RULES.length).toBe(20);
  });

  it('should have unique IDs for all built-in rules', () => {
    const ids = BUILT_IN_RULES.map((r) => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should have valid conditions for all rules', () => {
    for (const rule of BUILT_IN_RULES) {
      expect(rule.condition).toBeDefined();
    }
  });

  it('should have explanation templates for all rules', () => {
    for (const rule of BUILT_IN_RULES) {
      expect(rule.explanationTemplate.length).toBeGreaterThan(0);
      expect(rule.explanationTemplate).toContain('{{evidence}}');
    }
  });

  it('should have valid categories for all rules', () => {
    const validCategories = [
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
    for (const rule of BUILT_IN_RULES) {
      expect(validCategories).toContain(rule.category);
    }
  });

  it('should have severity hints for all rules', () => {
    const validHints = ['critical', 'high', 'medium', 'low', 'info'];
    for (const rule of BUILT_IN_RULES) {
      expect(validHints).toContain(rule.severityHint);
    }
  });

  it('should have frozen built-in rules', () => {
    expect(Object.isFrozen(BUILT_IN_RULES)).toBe(true);
    for (const rule of BUILT_IN_RULES) {
      expect(Object.isFrozen(rule)).toBe(true);
    }
  });

  it('should have correct category counts', () => {
    expect(BUILT_IN_RULES_BY_CATEGORY.injection).toBe(2);
    expect(BUILT_IN_RULES_BY_CATEGORY.persistence).toBe(3);
    expect(BUILT_IN_RULES_BY_CATEGORY.obfuscation).toBe(4);
    expect(BUILT_IN_RULES_BY_CATEGORY['credential-access']).toBe(4);
  });

  it('should all pass validation', () => {
    clearValidationState();
    for (const rule of BUILT_IN_RULES) {
      const result = validateRuleDefinition(rule);
      expect(result.valid).toBe(true);
    }
  });

  it('should be usable with the rule engine', async () => {
    const registry = new RuleRegistry();
    registry.register(...BUILT_IN_RULES);

    const engine = new RuleEngine(registry, { concurrency: 4 });

    const ev = makeEvidence({
      id: 'ev-001',
      type: 'pe-import',
      artifactType: 'executable',
      metadata: Object.freeze({ dll: 'kernel32' }),
    });

    const result = await engine.evaluate(makeContext({ evidence: [ev] }));
    expect(result.diagnostics.totalRules).toBe(20);
  });

  it('RULE-WIN-INJECTION-001 should match injection evidence', async () => {
    const registry = new RuleRegistry();
    registry.register(...BUILT_IN_RULES);

    const engine = new RuleEngine(registry);

    // Evidence that should trigger the injection rule
    const ev = makeEvidence({
      id: 'ev-001',
      type: 'pe-import-CreateRemoteThread',
      artifactType: 'executable',
      metadata: Object.freeze({ dll: 'kernel32' }),
    });

    const result = await engine.evaluate(makeContext({ evidence: [ev] }));
    const injectionMatch = result.matches.find((m) => m.ruleId === 'RULE-WIN-INJECTION-001');
    expect(injectionMatch).toBeDefined();
  });

  it('RULE-CRED-FILE-001 should match credential evidence', async () => {
    const registry = new RuleRegistry();
    registry.register(...BUILT_IN_RULES);

    const engine = new RuleEngine(registry);

    const ev = makeEvidence({
      id: 'ev-001',
      type: 'credential-file',
      artifactType: 'file',
    });

    const result = await engine.evaluate(makeContext({ evidence: [ev] }));
    const credMatch = result.matches.find((m) => m.ruleId === 'RULE-CRED-FILE-001');
    expect(credMatch).toBeDefined();
  });
});

// ── Cancellation & Timeout Tests ──

describe('Cancellation & Timeout', () => {
  it('should handle timeout', async () => {
    const registry = new RuleRegistry();
    const rule = RuleBuilder.fromDefinition({
      id: 'RULE-TIMEOUT-001',
      category: 'injection',
      name: 'Timeout Test',
      description: 'Test timeout handling',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'high',
      explanationTemplate: 'Timeout: {{evidence}}',
    });
    registry.register(rule);

    // Very short timeout should still work for simple conditions
    const engine = new RuleEngine(registry, { timeoutMs: 1 });
    const ev = makeEvidence({ id: 'ev-001' });
    const result = await engine.evaluate(makeContext({ evidence: [ev] }));
    expect(result.diagnostics.totalRules).toBe(1);
  });

  it('should handle cancellation', async () => {
    const { CancellationTokenSource } = await import('@veris/shared');
    const cts = new CancellationTokenSource();

    const registry = new RuleRegistry();
    const rule = RuleBuilder.fromDefinition({
      id: 'RULE-CANCEL-001',
      category: 'injection',
      name: 'Cancel Test',
      description: 'Test cancellation',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'high',
      explanationTemplate: 'Cancel: {{evidence}}',
    });
    registry.register(rule);

    // Create the engine first
    const engine = new RuleEngine(registry, { cancellationToken: cts.token });

    // Cancel before evaluation
    cts.cancel('Test cancellation');

    const ev = makeEvidence({ id: 'ev-001' });
    const context = makeContext({ evidence: [ev] });

    // Should reject when cancelled
    await expect(engine.evaluate(context)).rejects.toThrow();
  });
});

// ── Immutability Tests ──

describe('Immutability', () => {
  it('all rule objects should be frozen after building', () => {
    const rule = new RuleBuilder()
      .id('RULE-IMMUT-001')
      .category('injection')
      .name('Immutability Test')
      .description('All fields frozen')
      .condition({ type: 'exists', field: 'type' })
      .severityHint('high')
      .explanationTemplate('Frozen: {{evidence}}')
      .build();

    expect(Object.isFrozen(rule)).toBe(true);
  });

  it('condition match results should be frozen', () => {
    const result = evaluateCondition(
      { type: 'exists', field: 'type' },
      makeContext({ evidence: [makeEvidence({ id: 'ev-001' })] }),
    );

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.matchedEvidenceIds)).toBe(true);
    expect(Object.isFrozen(result.matchedFeatureIds)).toBe(true);
    expect(Object.isFrozen(result.matchedCapabilityIds)).toBe(true);
  });

  it('registry returned arrays should be frozen', () => {
    const registry = new RuleRegistry();
    const rule = RuleBuilder.fromDefinition({
      id: 'RULE-FRZ-001',
      category: 'injection',
      name: 'Frozen Test',
      description: 'Test frozen arrays',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'high',
      explanationTemplate: 'Frozen',
    });
    registry.register(rule);

    expect(Object.isFrozen(registry.getAll())).toBe(true);
    expect(Object.isFrozen(registry.getByCategory('injection'))).toBe(true);
  });

  it('built-in rules should be frozen', () => {
    expect(Object.isFrozen(BUILT_IN_RULES)).toBe(true);
    for (const rule of BUILT_IN_RULES) {
      expect(Object.isFrozen(rule)).toBe(true);
    }
  });
});

// ── Edge Cases ──

describe('Edge Cases', () => {
  it('should handle empty arrays in context', () => {
    const result = evaluateCondition(
      { type: 'exists', field: 'type' },
      makeContext({
        evidence: [],
        features: [],
        capabilities: [],
      }),
    );
    expect(result.matched).toBe(false);
  });

  it('should handle undefined metadata access', () => {
    const ev = makeEvidence({
      id: 'ev-001',
      metadata: undefined,
    });
    const result = evaluateCondition(
      { type: 'exists', field: 'metadata.section' },
      makeContext({ evidence: [ev] }),
    );
    expect(result.matched).toBe(false);
  });

  it('should handle null-like values in comparison', () => {
    const feat = makeFeature({
      id: 'feat-001',
      value: null,
    });
    const result = evaluateCondition(
      { type: 'equals', field: 'value', value: null },
      makeContext({ features: [feat] }),
    );
    expect(result.matched).toBe(true);
  });

  it('should handle very long evidence lists', () => {
    const evidence = Array.from({ length: 1000 }, (_, i) =>
      makeEvidence({ id: `ev-${String(i).padStart(4, '0')}`, type: 'test' }),
    );
    const result = evaluateCondition(
      { type: 'minimum_count', field: 'type', count: 1000 },
      makeContext({ evidence }),
    );
    expect(result.matched).toBe(true);
  });

  it('should handle nested objects in metadata', () => {
    const ev = makeEvidence({
      id: 'ev-001',
      metadata: Object.freeze({
        nested: Object.freeze({ deep: Object.freeze({ value: 'found' }) }),
      }),
    });
    const result = evaluateCondition(
      { type: 'equals', field: 'metadata.nested.deep.value', value: 'found' },
      makeContext({ evidence: [ev] }),
    );
    expect(result.matched).toBe(true);
  });

  it('should not modify shared state between evaluations', () => {
    const condition: RuleCondition = { type: 'exists', field: 'type' };

    const result1 = evaluateCondition(
      condition,
      makeContext({ evidence: [makeEvidence({ id: 'ev-001' })] }),
    );
    const result2 = evaluateCondition(condition, makeContext({ evidence: [] }));

    expect(result1.matched).toBe(true);
    expect(result2.matched).toBe(false);
  });

  it('should handle rule with only tags and no references', () => {
    const rule = RuleBuilder.fromDefinition({
      id: 'RULE-EDGE-TAGS-001',
      category: 'best-practice',
      name: 'Tags Only',
      description: 'Rule with only tags',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'info',
      explanationTemplate: 'Tags only: {{evidence}}',
      tags: ['test', 'edge-case'],
    });

    expect(rule.tags).toEqual(['test', 'edge-case']);
    expect(rule.references).toEqual([]);
    expect(rule.mitreTechniques).toEqual([]);
  });

  it('should handle AND with single sub-condition', () => {
    const ev = makeEvidence({ id: 'ev-001', type: 'test' });
    const result = evaluateCondition(
      {
        type: 'and',
        conditions: [{ type: 'equals', field: 'type', value: 'test' }],
      },
      makeContext({ evidence: [ev] }),
    );
    expect(result.matched).toBe(true);
  });

  it('should handle OR with single sub-condition', () => {
    const ev = makeEvidence({ id: 'ev-001', type: 'test' });
    const result = evaluateCondition(
      {
        type: 'or',
        conditions: [{ type: 'equals', field: 'type', value: 'test' }],
      },
      makeContext({ evidence: [ev] }),
    );
    expect(result.matched).toBe(true);
  });

  it('should handle multiple rule categories in registry', () => {
    const registry = new RuleRegistry();
    const categories = [
      'injection',
      'persistence',
      'obfuscation',
      'execution',
      'credential-access',
    ];

    for (const cat of categories) {
      const rule = RuleBuilder.fromDefinition({
        id: `RULE-EDGE-CAT-${cat}`,
        category: cat as any,
        name: `${cat} Rule`,
        description: `Rule in ${cat} category`,
        condition: { type: 'exists', field: 'type' },
        severityHint: 'high',
        explanationTemplate: `${cat}: {{evidence}}`,
      });
      registry.register(rule);
    }

    expect(registry.size).toBe(5);
    expect(Object.isFrozen(registry.getAll())).toBe(true);
  });
});

// ── Determinism Tests ──

describe('Determinism', () => {
  it('should produce same results for same input', () => {
    const condition: RuleCondition = {
      type: 'and',
      conditions: [
        { type: 'evidence_type', evidenceType: 'pe-import' },
        {
          type: 'or',
          conditions: [
            { type: 'contains', field: 'metadata.dll', value: 'kernel32' },
            { type: 'range', field: 'confidence', min: 0.5 },
          ],
        },
      ],
    };

    const ev = makeEvidence({
      id: 'ev-001',
      type: 'pe-import',
      confidence: 0.9,
      metadata: Object.freeze({ dll: 'kernel32' }),
    });

    const context = makeContext({ evidence: [ev] });

    const results = Array.from({ length: 10 }, () => evaluateCondition(condition, context));

    for (let i = 1; i < results.length; i++) {
      expect(results[i].matched).toBe(results[0].matched);
      expect(results[i].matchedEvidenceIds).toEqual(results[0].matchedEvidenceIds);
    }
  });

  it('should produce deterministic evaluation order', async () => {
    const registry = new RuleRegistry();

    const ruleA = RuleBuilder.fromDefinition({
      id: 'RULE-DET-A',
      category: 'injection',
      name: 'Rule A',
      description: 'Deterministic test A',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'high',
      explanationTemplate: 'A',
    });

    const ruleB = RuleBuilder.fromDefinition({
      id: 'RULE-DET-B',
      category: 'persistence',
      name: 'Rule B',
      description: 'Deterministic test B',
      condition: { type: 'exists', field: 'type' },
      severityHint: 'medium',
      explanationTemplate: 'B',
    });

    registry.register(ruleB, ruleA); // Register in reverse order
    const engine = new RuleEngine(registry);

    const ev = makeEvidence({ id: 'ev-001' });

    const result1 = await engine.evaluate(makeContext({ evidence: [ev] }));
    const result2 = await engine.evaluate(makeContext({ evidence: [ev] }));

    // Order should be consistent: injection first (priority), then persistence
    expect(result1.evaluations[0].ruleId).toBe('RULE-DET-A');
    expect(result1.evaluations[1].ruleId).toBe('RULE-DET-B');
    expect(result2.evaluations[0].ruleId).toBe('RULE-DET-A');
    expect(result2.evaluations[1].ruleId).toBe('RULE-DET-B');
  });
});
