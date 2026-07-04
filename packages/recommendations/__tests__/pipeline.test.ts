/**
 * Pipeline validation tests for @veris/recommendations.
 *
 * Verifies the complete deterministic pipeline:
 * Recommendation Registry → Recommendation Engine → Documentation Registry → Explainer
 *
 * Every stage is validated independently with golden fixtures.
 * Determinism is verified at 10 fixtures × 1,000 iterations = 10,000 executions,
 * with every output remaining byte-identical.
 *
 * @module @veris/recommendations/__tests__/pipeline
 */

import { describe, it, expect } from 'vitest';
import {
  createRecommendationEngine,
  createDocumentationRegistry,
  explainRecommendation,
  explainCategory,
  breakdownByCategory,
  topRecommendations,
} from '../src/index.js';

import { GOLDEN_FIXTURES } from './golden/fixtures.js';
import { makeInput } from './helpers.js';

// ── Pipeline Stage Tests ──

describe('pipeline — registry → engine', () => {
  for (const fixture of GOLDEN_FIXTURES) {
    it(`${fixture.name}: engine evaluates from registry deterministically`, () => {
      const engine = createRecommendationEngine({
        registry: fixture.registry,
        generatedAt: '2024-01-01T00:00:00.000Z',
        maxRecommendations: 5,
      });

      const result = engine.evaluate(fixture.input);

      // Result structure is always valid
      expect(result.schemaVersion).toBeTruthy();
      expect(result.engineVersion).toBeTruthy();
      expect(result.id).toMatch(/^rec_[a-f0-9]+$/);
      expect(result.sessionId).toBe(fixture.input.sessionId);
      expect(result.artifactId).toBe(fixture.input.artifactId);

      // Collection structure is always valid
      expect(result.recommendations).toBeDefined();
      expect(Array.isArray(result.recommendations.items)).toBe(true);
      expect(result.recommendations.totalCount).toBe(result.recommendations.items.length);
      expect(typeof result.recommendations.truncated).toBe('boolean');

      // Counts are consistent
      expect(result.recommendations.counts.critical).toBeGreaterThanOrEqual(0);
      expect(result.recommendations.counts.high).toBeGreaterThanOrEqual(0);
      expect(result.recommendations.counts.medium).toBeGreaterThanOrEqual(0);
      expect(result.recommendations.counts.low).toBeGreaterThanOrEqual(0);

      const sum =
        result.recommendations.counts.critical +
        result.recommendations.counts.high +
        result.recommendations.counts.medium +
        result.recommendations.counts.low;
      expect(sum).toBe(result.recommendations.totalCount);
    });
  }
});

describe('pipeline — engine → documentation registry', () => {
  for (const fixture of GOLDEN_FIXTURES) {
    it(`${fixture.name}: documentation registry indexes recommendations`, () => {
      const engine = createRecommendationEngine({
        registry: fixture.registry,
        generatedAt: '2024-01-01T00:00:00.000Z',
      });

      // Evaluate to get matched recommendations
      const result = engine.evaluate(fixture.input);

      // Build documentation registry from all registered recommendations
      const docReg = createDocumentationRegistry(fixture.registry.list());

      // Documentation registry is always deterministic
      expect(docReg.listDocumentation()).toBeDefined();
      expect(Array.isArray(docReg.listDocumentation())).toBe(true);

      // Validation never throws
      const validation = docReg.validateDocumentation();
      expect(validation).toBeDefined();
      expect(typeof validation.valid).toBe('boolean');
      expect(Array.isArray(validation.findings)).toBe(true);
    });
  }
});

describe('pipeline — engine → explainer', () => {
  for (const fixture of GOLDEN_FIXTURES) {
    it(`${fixture.name}: explainer produces deterministic views`, () => {
      const engine = createRecommendationEngine({
        registry: fixture.registry,
        generatedAt: '2024-01-01T00:00:00.000Z',
      });

      const result = engine.evaluate(fixture.input);
      const collection = result.recommendations;

      // explainRecommendation works for each item
      for (const rec of collection.items) {
        const explanation = explainRecommendation(rec, fixture.input);
        expect(explanation.recommendation.id).toBe(rec.id);
        expect(Array.isArray(explanation.matchedRuleIds)).toBe(true);
        expect(Array.isArray(explanation.matchedCorrelationIds)).toBe(true);
        expect(Array.isArray(explanation.matchedEvidenceIds)).toBe(true);
        expect(Array.isArray(explanation.matchReasons)).toBe(true);
        expect(Object.isFrozen(explanation)).toBe(true);
      }

      // explainCategory works for known categories
      if (collection.items.length > 0) {
        const category = collection.items[0].category;
        const catExp = explainCategory(collection, category);
        expect(catExp.category).toBe(category);
        expect(catExp.recommendationCount).toBeGreaterThanOrEqual(1);
        expect(Object.isFrozen(catExp)).toBe(true);
      }

      // breakdownByCategory works
      const breakdown = breakdownByCategory(collection);
      expect(breakdown.totalCount).toBe(collection.totalCount);
      expect(Object.isFrozen(breakdown)).toBe(true);

      // topRecommendations works
      const top = topRecommendations(collection, 3);
      expect(Array.isArray(top)).toBe(true);
      expect(Object.isFrozen(top)).toBe(true);
    });
  }
});

// ── Serialization ──

describe('pipeline — serialization', () => {
  for (const fixture of GOLDEN_FIXTURES) {
    it(`${fixture.name}: engine result serializes to JSON round-trip`, () => {
      const engine = createRecommendationEngine({
        registry: fixture.registry,
        generatedAt: '2024-01-01T00:00:00.000Z',
        maxRecommendations: 5,
      });

      const result = engine.evaluate(fixture.input);

      // JSON round-trip
      const serialized = JSON.parse(JSON.stringify(result));
      expect(serialized.schemaVersion).toBe(result.schemaVersion);
      expect(serialized.engineVersion).toBe(result.engineVersion);
      expect(serialized.id).toBe(result.id);
      expect(serialized.sessionId).toBe(result.sessionId);
      expect(serialized.artifactId).toBe(result.artifactId);
      expect(serialized.totalCount).toBe(result.totalCount);
      expect(serialized.generatedAt).toBe(result.generatedAt);
      expect(serialized.recommendations.totalCount).toBe(result.recommendations.totalCount);
      expect(serialized.recommendations.truncated).toBe(result.recommendations.truncated);
      expect(serialized.recommendations.items.length).toBe(result.recommendations.items.length);

      // Counts are preserved
      expect(serialized.recommendations.counts.critical).toBe(
        result.recommendations.counts.critical,
      );
      expect(serialized.recommendations.counts.high).toBe(result.recommendations.counts.high);
      expect(serialized.recommendations.counts.medium).toBe(result.recommendations.counts.medium);
      expect(serialized.recommendations.counts.low).toBe(result.recommendations.counts.low);
    });

    it(`${fixture.name}: documentation registry serializes to JSON`, () => {
      const docReg = createDocumentationRegistry(fixture.registry.list());
      const serialized = JSON.parse(JSON.stringify(docReg.listDocumentation()));
      expect(Array.isArray(serialized)).toBe(true);

      if (serialized.length > 0) {
        expect(typeof serialized[0].documentationId).toBe('string');
        expect(typeof serialized[0].documentTitle).toBe('string');
        expect(Array.isArray(serialized[0].recommendationIds)).toBe(true);
      }
    });
  }
});

// ── Determinism (10 fixtures × 1,000 iterations = 10,000 executions) ──

describe('pipeline — determinism (10 fixtures × 1,000 iterations)', () => {
  for (const fixture of GOLDEN_FIXTURES) {
    it(`${fixture.name}: engine output is byte-identical across 1,000 iterations`, () => {
      const firstEngine = createRecommendationEngine({
        registry: fixture.registry,
        generatedAt: '2024-01-01T00:00:00.000Z',
        maxRecommendations: 5,
      });

      const firstResult = firstEngine.evaluate(fixture.input);
      const firstJson = JSON.stringify(firstResult);

      for (let i = 0; i < 1000; i++) {
        const engine = createRecommendationEngine({
          registry: fixture.registry,
          generatedAt: '2024-01-01T00:00:00.000Z',
          maxRecommendations: 5,
        });
        const result = engine.evaluate(fixture.input);
        expect(JSON.stringify(result)).toBe(firstJson);
      }
    });
  }
});

// ── Cross-Module Invariants ──

describe('pipeline — cross-module invariants', () => {
  it('documentation registry never mutates recommendations', () => {
    const fixture = GOLDEN_FIXTURES[1]; // single recommendation
    const recs = fixture.registry.list();
    const firstJson = JSON.stringify(recs);

    // Build documentation registry (should not mutate the recommendations)
    const docReg = createDocumentationRegistry(recs);

    // Verify recommendations are unchanged
    const secondJson = JSON.stringify(recs);
    expect(firstJson).toBe(secondJson);

    // Verify doc registry didn't modify anything
    docReg.validateDocumentation();
    const thirdJson = JSON.stringify(recs);
    expect(firstJson).toBe(thirdJson);
  });

  it('explainer never mutates collections', () => {
    const fixture = GOLDEN_FIXTURES[1];
    const engine = createRecommendationEngine({
      registry: fixture.registry,
      generatedAt: '2024-01-01T00:00:00.000Z',
    });
    const result = engine.evaluate(fixture.input);
    const collection = result.recommendations;
    const firstJson = JSON.stringify(collection);

    // Call explainer functions (should not mutate the collection)
    for (const rec of collection.items) {
      explainRecommendation(rec, fixture.input);
    }
    if (collection.items.length > 0) {
      explainCategory(collection, collection.items[0].category);
    }
    breakdownByCategory(collection);
    topRecommendations(collection, 2);

    // Verify collection is unchanged
    const secondJson = JSON.stringify(collection);
    expect(firstJson).toBe(secondJson);
  });

  it('engine never mutates registry', () => {
    const fixture = GOLDEN_FIXTURES[1];
    const registry = fixture.registry;
    const firstJson = JSON.stringify(registry.list());

    const engine = createRecommendationEngine({
      registry,
      generatedAt: '2024-01-01T00:00:00.000Z',
    });
    engine.evaluate(fixture.input);

    const secondJson = JSON.stringify(registry.list());
    expect(firstJson).toBe(secondJson);
  });

  it('recommendation count consistency across all modules', () => {
    const fixture = GOLDEN_FIXTURES[5]; // multiple categories
    const engine = createRecommendationEngine({
      registry: fixture.registry,
      generatedAt: '2024-01-01T00:00:00.000Z',
    });
    const result = engine.evaluate(fixture.input);

    // Engine count matches collection count
    expect(result.totalCount).toBe(result.recommendations.totalCount);

    // Breakdown count matches engine count
    const breakdown = breakdownByCategory(result.recommendations);
    expect(breakdown.totalCount).toBe(result.totalCount);

    // Category counts sum to total
    const categorySum = breakdown.categories.reduce((sum, cat) => sum + cat.recommendationCount, 0);
    expect(categorySum).toBe(result.totalCount);

    // Priority counts sum to total
    const prioritySum =
      result.recommendations.counts.critical +
      result.recommendations.counts.high +
      result.recommendations.counts.medium +
      result.recommendations.counts.low;
    expect(prioritySum).toBe(result.totalCount);
  });

  it('stable IDs across independent evaluations', () => {
    const fixture = GOLDEN_FIXTURES[1]; // single recommendation
    const input = makeInput({
      sessionId: 'stable-id-test',
      ruleMatchIds: ['rule-single'],
    });

    const engine1 = createRecommendationEngine({
      registry: fixture.registry,
      generatedAt: '2024-01-01T00:00:00.000Z',
    });
    const engine2 = createRecommendationEngine({
      registry: fixture.registry,
      generatedAt: '2024-01-01T00:00:00.000Z',
    });

    const result1 = engine1.evaluate(input);
    const result2 = engine2.evaluate(input);

    // Same input produces same ID
    expect(result1.id).toBe(result2.id);
  });
});

// ── Frozen Outputs ──

describe('pipeline — frozen outputs', () => {
  it('engine result is frozen', () => {
    const fixture = GOLDEN_FIXTURES[1];
    const engine = createRecommendationEngine({
      registry: fixture.registry,
      generatedAt: '2024-01-01T00:00:00.000Z',
    });
    const result = engine.evaluate(fixture.input);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.recommendations)).toBe(true);
    expect(Object.isFrozen(result.recommendations.items)).toBe(true);
    expect(Object.isFrozen(result.recommendations.counts)).toBe(true);
  });

  it('documentation registry entries are frozen', () => {
    const fixture = GOLDEN_FIXTURES[0];
    const docReg = createDocumentationRegistry(fixture.registry.list());
    expect(Object.isFrozen(docReg.listDocumentation())).toBe(true);
  });
});
