/**
 * @veris/cli/authoring/test-generator — Automated deterministic test generator and runner for candidate rules.
 *
 * Implements Section 4.4 of ADR-016:
 * - Deterministic synthetic test fixture generation (positive & negative contexts)
 * - Evaluation against real @veris/rules RuleEngine
 * - False-positive and false-negative detection
 * - 10-iteration determinism verification
 *
 * @module @veris/cli/authoring/test-generator
 */

import type { RulePack } from '@veris/core';
import { adaptRulePackToRules } from '@veris/plugins';
import {
  type CapabilityRef,
  type EvaluationContext,
  type EvidenceRef,
  type FeatureRef,
  type Rule,
  RuleEngine,
  RuleRegistry,
} from '@veris/rules';

import type {
  FixtureTestOutcome,
  PluginRule,
  PluginRulePack,
  RuleTestExecutionReport,
} from './types.js';

/**
 * Sets a deeply nested property on an object based on dot-separated path.
 */
function setDeepProperty(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part] || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * Builds an EvaluationContext for testing a single rule.
 */
function buildTestContext(
  rule: PluginRule,
  testValue: unknown,
  isPositive: boolean,
): EvaluationContext {
  const logic = rule.matchLogic;
  let taxonomyId = 'detection.test';
  let propPath = 'value';

  if (logic.kind === 'single-behavior') {
    taxonomyId = logic.behaviorTaxonomyId;
    propPath = logic.propertyMatcher.path;
  } else if (logic.kind === 'multi-behavior') {
    taxonomyId = logic.pattern.taxonomyIds[0] || 'detection.test';
    propPath = logic.pattern.matchers?.[0]?.path || 'value';
  }

  const evidenceMeta: Record<string, unknown> = {};
  setDeepProperty(evidenceMeta, propPath, testValue);

  // If path was 'metadata.xxx', also ensure direct access works
  if (propPath.startsWith('metadata.')) {
    const stripped = propPath.slice('metadata.'.length);
    setDeepProperty(evidenceMeta, stripped, testValue);
  }

  const evidence: EvidenceRef[] = [
    Object.freeze({
      id: isPositive ? 'ev-test-positive-1' : 'ev-test-negative-1',
      type: taxonomyId,
      category: 'security',
      confidence: 1.0,
      artifactId: 'art-test-1',
      artifactType: 'file',
      metadata: Object.freeze(evidenceMeta),
    }),
  ];

  const featureMeta: Record<string, unknown> = {};
  setDeepProperty(featureMeta, propPath, testValue);

  const features: FeatureRef[] = [
    Object.freeze({
      id: isPositive ? 'feat-test-positive-1' : 'feat-test-negative-1',
      type: taxonomyId,
      value: testValue,
      confidence: 1.0,
      metadata: Object.freeze(featureMeta),
    }),
  ];

  const capabilities: CapabilityRef[] = [];

  return Object.freeze({
    evidence: Object.freeze(evidence),
    features: Object.freeze(features),
    capabilities: Object.freeze(capabilities),
  });
}

/**
 * Executes automated test fixtures against a candidate rule pack.
 */
export async function executeCandidateRuleTests(
  candidateRulePack: PluginRulePack,
  samplePositiveValue: unknown,
  sampleNegativeValue: unknown,
): Promise<RuleTestExecutionReport> {
  const startTime = Date.now();
  const outcomes: FixtureTestOutcome[] = [];
  const errors: string[] = [];

  let internalRules: readonly Rule[];
  try {
    internalRules = adaptRulePackToRules(candidateRulePack as unknown as RulePack);
  } catch (err) {
    return Object.freeze({
      passed: false,
      determinismPass: false,
      totalDurationMs: Date.now() - startTime,
      outcomes: Object.freeze([]),
      errors: Object.freeze([
        `Failed to adapt candidate rule pack: ${err instanceof Error ? err.message : String(err)}`,
      ]),
    });
  }

  const registry = new RuleRegistry();
  for (const r of internalRules) {
    registry.register(r);
  }
  const engine = new RuleEngine(registry);

  let allPassed = true;
  let determinismPass = true;

  for (const pluginRule of candidateRulePack.rules) {
    const matchedInternalRule = internalRules.find((r) => r.id === pluginRule.id);
    if (!matchedInternalRule) continue;

    // ── Test 1: Positive Matching Fixture ──
    const posStart = Date.now();
    const posContext = buildTestContext(pluginRule, samplePositiveValue, true);
    let posResult;
    try {
      posResult = await engine.evaluateRules([matchedInternalRule], posContext);
    } catch (err) {
      errors.push(
        `Positive fixture evaluation threw error on rule "${pluginRule.id}": ${String(err)}`,
      );
      allPassed = false;
      continue;
    }

    const posMatched = posResult.matches.length > 0;
    const posPass = posMatched; // Expected positive fixture to match
    if (!posPass) allPassed = false;

    outcomes.push({
      fixtureName: `${pluginRule.id} [positive-match]`,
      expectedMatch: true,
      actualMatch: posMatched,
      passed: posPass,
      matchedRules: posResult.matches.map((m) => m.ruleId),
      durationMs: Date.now() - posStart,
    });

    // ── Test 2: Negative Non-Matching Fixture ──
    const negStart = Date.now();
    const negContext = buildTestContext(pluginRule, sampleNegativeValue, false);
    let negResult;
    try {
      negResult = await engine.evaluateRules([matchedInternalRule], negContext);
    } catch (err) {
      errors.push(
        `Negative fixture evaluation threw error on rule "${pluginRule.id}": ${String(err)}`,
      );
      allPassed = false;
      continue;
    }

    const negMatched = negResult.matches.length > 0;
    const negPass = !negMatched; // Expected negative fixture to NOT match
    if (!negPass) allPassed = false;

    outcomes.push({
      fixtureName: `${pluginRule.id} [negative-non-match]`,
      expectedMatch: false,
      actualMatch: negMatched,
      passed: negPass,
      matchedRules: negResult.matches.map((m) => m.ruleId),
      durationMs: Date.now() - negStart,
    });

    // ── Test 3: Determinism Iteration Check (10 runs) ──
    const firstMatchCount = posResult.matches.length;
    for (let iter = 0; iter < 10; iter++) {
      const iterRes = await engine.evaluateRules([matchedInternalRule], posContext);
      if (iterRes.matches.length !== firstMatchCount) {
        determinismPass = false;
        errors.push(`Determinism check failed on iteration ${iter} for rule "${pluginRule.id}".`);
        break;
      }
    }
  }

  const totalDurationMs = Date.now() - startTime;

  return Object.freeze({
    passed: allPassed && errors.length === 0,
    determinismPass,
    totalDurationMs,
    outcomes: Object.freeze(outcomes),
    errors: Object.freeze(errors),
  });
}
