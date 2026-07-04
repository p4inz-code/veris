/**
 * Shared helpers for golden tests and pipeline validation.
 *
 * Provides reusable test utilities that reduce duplication across
 * golden fixture tests and pipeline validation tests.
 *
 * @module @veris/risk/__tests__/golden/helpers
 */

import type {
  RiskInput,
  RiskRuleMatch,
  RiskCorrelation,
  RiskEvidence,
  Severity,
} from '../../src/types.js';

/** Deterministic timestamp used for all golden assessments. */
export const TEST_TIMESTAMP = '2026-07-01T00:00:00.000Z';

/**
 * Creates a frozen Severity object.
 *
 * @param score - The severity score [0.0, 10.0].
 * @param level - The severity level string (default: "medium").
 * @returns A frozen Severity.
 */
export function makeSeverity(score: number, level: string = 'medium'): Severity {
  return Object.freeze({ level: level as any, score });
}

/**
 * Creates a frozen RiskRuleMatch with sensible defaults.
 *
 * @param overrides - Partial rule match fields to override defaults.
 * @returns A frozen RiskRuleMatch.
 */
export function makeRuleMatch(
  overrides: Partial<RiskRuleMatch> & { ruleId: string },
): RiskRuleMatch {
  return Object.freeze({
    ruleId: overrides.ruleId,
    severity: overrides.severity ?? makeSeverity(5.0),
    confidence: overrides.confidence ?? 0.8,
    evidenceIds: overrides.evidenceIds ?? Object.freeze(['ev-001']),
    taxonomyIds: overrides.taxonomyIds ?? Object.freeze(['TAX-001']),
  });
}

/**
 * Creates a frozen RiskCorrelation with sensible defaults.
 *
 * @param overrides - Partial correlation fields to override defaults.
 * @returns A frozen RiskCorrelation.
 */
export function makeCorrelation(
  overrides: Partial<RiskCorrelation> & { correlationId: string },
): RiskCorrelation {
  return Object.freeze({
    correlationId: overrides.correlationId,
    chainLength: overrides.chainLength ?? 3,
    confidence: overrides.confidence ?? 0.7,
    evidenceIds: overrides.evidenceIds ?? Object.freeze(['ev-001', 'ev-002']),
  });
}

/**
 * Creates a frozen RiskEvidence with sensible defaults.
 *
 * @param overrides - Partial evidence fields to override defaults.
 * @returns A frozen RiskEvidence.
 */
export function makeEvidence(overrides: Partial<RiskEvidence> & { id: string }): RiskEvidence {
  return Object.freeze({
    id: overrides.id,
    confidence: overrides.confidence ?? 0.9,
    category: overrides.category ?? 'test',
    artifactId: overrides.artifactId ?? 'art-001',
  });
}

/**
 * Creates a frozen RiskInput with sensible defaults.
 *
 * @param overrides - Optional fields to override defaults.
 * @returns A frozen RiskInput.
 */
export function makeInput(overrides?: {
  matches?: RiskRuleMatch[];
  correlations?: RiskCorrelation[];
  evidence?: RiskEvidence[];
  artifactId?: string | null;
  sessionId?: string;
}): RiskInput {
  return Object.freeze({
    matches: overrides?.matches ?? Object.freeze([]),
    correlations: overrides?.correlations ?? Object.freeze([]),
    evidence: overrides?.evidence ?? Object.freeze([]),
    artifactId: overrides?.artifactId ?? null,
    sessionId: overrides?.sessionId ?? 'session-001',
  });
}

/**
 * Serialization helpers for golden test assertions.
 */

/**
 * Serializes a value to JSON and back, verifying round-trip stability.
 *
 * @param value - The value to round-trip.
 * @returns The parsed value after JSON serialization and deserialization.
 */
export function roundTripJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Asserts that a value is frozen (both object and all nested arrays).
 *
 * @param value - The value to check for immutability.
 */
export function expectFrozen(value: Record<string, any>): void {
  expect(Object.isFrozen(value)).toBe(true);
  for (const key of Object.keys(value)) {
    const val = value[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item !== null && typeof item === 'object') {
          expect(Object.isFrozen(item)).toBe(true);
        }
      }
      expect(Object.isFrozen(val)).toBe(true);
    }
  }
}
