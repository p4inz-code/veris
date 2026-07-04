/**
 * Shared test helpers for @veris/recommendations tests.
 *
 * Provides deterministic factory functions for creating test
 * recommendations and inputs. Used across all test files to
 * eliminate duplicated helper code.
 *
 * @module @veris/recommendations/__tests__/helpers
 */

import { SCHEMA_VERSION, ENGINE_VERSION, CATEGORIES, ACTIONS, SOURCE_TYPES } from '../src/index.js';

import type { Recommendation, RecommendationInput } from '../src/index.js';

// ── makeRec ──

/**
 * Create a minimal valid recommendation for testing.
 *
 * All fields are frozen. Overrides are spread on top of sensible defaults.
 * Every recommendation gets at least one RULE reference unless overridden.
 */
export function makeRec(overrides: Partial<Recommendation> & { id: string }): Recommendation {
  return Object.freeze<Recommendation>({
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    id: overrides.id,
    priority: overrides.priority ?? 'medium',
    category: overrides.category ?? CATEGORIES.INVESTIGATION,
    action: overrides.action ?? ACTIONS.REVIEW,
    title: overrides.title ?? `Test ${overrides.id}`,
    description: overrides.description ?? 'Test description',
    references:
      overrides.references ??
      Object.freeze([
        Object.freeze({
          sourceType: SOURCE_TYPES.RULE,
          sourceId: `rule_${overrides.id}`,
          sourceName: 'Test Rule',
        }),
      ]),
    documentationRefs: overrides.documentationRefs ?? Object.freeze([]),
    assessment: overrides.assessment ?? null,
    rationale: overrides.rationale ?? 'Test rationale',
    metadata: overrides.metadata ?? Object.freeze({}),
  });
}

// ── makeInput ──

/**
 * Create a minimal valid recommendation input for testing.
 */
export function makeInput(overrides?: Partial<RecommendationInput>): RecommendationInput {
  return {
    riskAssessmentId: overrides?.riskAssessmentId ?? 'ra_test',
    sessionId: overrides?.sessionId ?? 'session-test',
    artifactId: overrides?.artifactId ?? 'artifact-test.exe',
    ruleMatchIds: overrides?.ruleMatchIds ?? [],
    correlationIds: overrides?.correlationIds ?? [],
    evidenceIds: overrides?.evidenceIds ?? [],
  };
}

// ── makeCollection ──

/**
 * Create a RecommendationCollection from an array of recommendations.
 * Pre-computes priority counts automatically.
 */
export function makeCollection(
  items: readonly Recommendation[],
): import('../src/index.js').RecommendationCollection {
  const allItems = [...items];
  let critical = 0,
    high = 0,
    medium = 0,
    low = 0;
  for (const rec of allItems) {
    switch (rec.priority) {
      case 'critical':
        critical++;
        break;
      case 'high':
        high++;
        break;
      case 'medium':
        medium++;
        break;
      case 'low':
        low++;
        break;
    }
  }
  return Object.freeze({
    items: Object.freeze(allItems),
    totalCount: allItems.length,
    truncated: false,
    counts: Object.freeze({ critical, high, medium, low }),
  });
}
