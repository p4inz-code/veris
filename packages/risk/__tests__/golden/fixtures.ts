/**
 * Golden fixtures for @veris/risk — deterministic regression test inputs.
 *
 * ## Purpose
 *
 * Golden fixtures are immutable, well-documented test inputs that produce
 * known deterministic outputs. They exist to:
 *
 * 1. **Lock behavior** — Future refactors cannot silently change engine output.
 * 2. **Document scenarios** — Each fixture explains WHY it exists.
 * 3. **Enable regression detection** — CI compares current output against
 *    snapshot files to detect unintended changes.
 * 4. **Serve as examples** — New contributors can see realistic inputs and
 *    their expected behavior.
 *
 * ## Determinism Guarantee
 *
 * Each fixture is constructed with frozen arrays and objects. Identical
 * inputs to the RiskEngine must always produce identical RiskAssessment
 * output, including all IDs, scores, verdicts, and contribution metadata.
 *
 * ## How to Update Fixtures
 *
 * If a future milestone intentionally changes engine behavior:
 *
 * 1. Run the full test suite and note which fixture expectations fail.
 * 2. Update this file with the NEW expected output for changed fixtures.
 * 3. Update snapshot files if using snapshot-based testing.
 * 4. Document WHY the change was intentional in the commit message.
 * 5. Never remove a fixture — add new ones for new scenarios.
 *
 * @module @veris/risk/__tests__/golden/fixtures
 */

import type {
  RiskInput,
  RiskRuleMatch,
  RiskCorrelation,
  RiskEvidence,
  Severity,
} from '../../src/types.js';
import { TEST_TIMESTAMP } from './helpers.js';

// ── Severity Helper ──

/**
 * Creates a frozen Severity object.
 *
 * @param score - The severity score [0.0, 10.0].
 * @param level - The severity level string.
 * @returns A frozen Severity.
 */
function sev(score: number, level: string = 'medium'): Severity {
  return Object.freeze({ level: level as any, score });
}

// ── Fixture 1: Empty Input ──

/**
 * Empty input — no matches, no correlations, no evidence.
 *
 * ## Why This Exists
 *
 * Verifies the engine produces a valid zero-assessment for empty input.
 * This is the simplest possible scenario and must always produce:
 * - riskScore: 0
 * - riskLevel: "negligible"
 * - verdict: "unknown"
 * - confidence: 0
 * - 0 contributions
 * - contributionsTruncated: false
 */
export const EMPTY_INPUT: RiskInput = Object.freeze({
  matches: Object.freeze([]),
  correlations: Object.freeze([]),
  evidence: Object.freeze([]),
  artifactId: null,
  sessionId: 'golden-empty',
});

// ── Fixture 2: Single Rule ──

/**
 * Single rule match with moderate severity and confidence.
 *
 * ## Why This Exists
 *
 * Tests the simplest non-empty scenario — one contribution from one rule.
 * Verifies that the contribution builder, aggregator, confidence, and
 * verdict all work correctly with a single atomic input.
 *
 * Expected characteristics:
 * - 1 contribution (rule type)
 * - riskScore > 0 (from effectiveValue)
 * - Confidence reflects single contribution
 * - Verdict is deterministic
 */
export const SINGLE_RULE_INPUT: RiskInput = Object.freeze({
  matches: Object.freeze([
    Object.freeze({
      ruleId: 'GOLDEN-RULE-001',
      severity: sev(7.0, 'high'),
      confidence: 0.85,
      evidenceIds: Object.freeze(['ev-001']),
      taxonomyIds: Object.freeze(['TAX-001']),
    }),
  ]),
  correlations: Object.freeze([]),
  evidence: Object.freeze([
    Object.freeze({ id: 'ev-001', confidence: 0.9, category: 'test', artifactId: 'art-001' }),
  ]),
  artifactId: 'art-001',
  sessionId: 'golden-single-rule',
});

// ── Fixture 3: Multiple Rules ──

/**
 * Multiple rule matches with different severities and confidences.
 *
 * ## Why This Exists
 *
 * Tests that multiple contributions from the same dimension (rule) are
 * correctly accumulated. Verifies that contributions are sorted by
 * effectiveValue descending and that the risk score reflects the
 * combined evidence.
 *
 * Expected characteristics:
 * - 4 rule contributions (no correlations or evidence)
 * - Sorted by effectiveValue descending
 * - riskScore reflects cumulative contributions
 */
export const MULTIPLE_RULES_INPUT: RiskInput = Object.freeze({
  matches: Object.freeze([
    Object.freeze({
      ruleId: 'GOLDEN-RULE-HIGH',
      severity: sev(8.5, 'critical'),
      confidence: 0.95,
      evidenceIds: Object.freeze(['ev-001']),
      taxonomyIds: Object.freeze(['TAX-001']),
    }),
    Object.freeze({
      ruleId: 'GOLDEN-RULE-MED',
      severity: sev(5.0, 'medium'),
      confidence: 0.7,
      evidenceIds: Object.freeze(['ev-002']),
      taxonomyIds: Object.freeze(['TAX-002']),
    }),
    Object.freeze({
      ruleId: 'GOLDEN-RULE-LOW',
      severity: sev(2.0, 'low'),
      confidence: 0.5,
      evidenceIds: Object.freeze(['ev-003']),
      taxonomyIds: Object.freeze(['TAX-003']),
    }),
    Object.freeze({
      ruleId: 'GOLDEN-RULE-NEG',
      severity: sev(0.5, 'negligible'),
      confidence: 0.3,
      evidenceIds: Object.freeze(['ev-004']),
      taxonomyIds: Object.freeze(['TAX-004']),
    }),
  ]),
  correlations: Object.freeze([]),
  evidence: Object.freeze([
    Object.freeze({ id: 'ev-001', confidence: 0.95, category: 'test', artifactId: 'art-001' }),
    Object.freeze({ id: 'ev-002', confidence: 0.85, category: 'test', artifactId: 'art-001' }),
    Object.freeze({ id: 'ev-003', confidence: 0.75, category: 'test', artifactId: 'art-001' }),
    Object.freeze({ id: 'ev-004', confidence: 0.65, category: 'test', artifactId: 'art-001' }),
  ]),
  artifactId: 'art-001',
  sessionId: 'golden-multiple-rules',
});

// ── Fixture 4: Mixed Severities ──

/**
 * Broad spectrum of severities across all five risk levels.
 *
 * ## Why This Exists
 *
 * Verifies that the risk level mapping (resolveRiskLevel) correctly
 * maps scores to levels across the full spectrum. Each severity level
 * is represented, and the aggregate assessment should produce
 * a meaningful risk level.
 *
 * Expected characteristics:
 * - Contributions span all severity levels
 * - Risk score is cumulative
 * - Risk level reflects the aggregate score
 */
export const MIXED_SEVERITIES_INPUT: RiskInput = Object.freeze({
  matches: Object.freeze([
    Object.freeze({
      ruleId: 'GOLDEN-CRITICAL',
      severity: sev(9.0, 'critical'),
      confidence: 0.9,
      evidenceIds: Object.freeze(['ev-crit']),
      taxonomyIds: Object.freeze(['TAX-001']),
    }),
    Object.freeze({
      ruleId: 'GOLDEN-HIGH',
      severity: sev(7.0, 'high'),
      confidence: 0.8,
      evidenceIds: Object.freeze(['ev-high']),
      taxonomyIds: Object.freeze(['TAX-002']),
    }),
    Object.freeze({
      ruleId: 'GOLDEN-MEDIUM',
      severity: sev(5.0, 'medium'),
      confidence: 0.7,
      evidenceIds: Object.freeze(['ev-med']),
      taxonomyIds: Object.freeze(['TAX-003']),
    }),
    Object.freeze({
      ruleId: 'GOLDEN-LOW',
      severity: sev(3.0, 'low'),
      confidence: 0.6,
      evidenceIds: Object.freeze(['ev-low']),
      taxonomyIds: Object.freeze(['TAX-004']),
    }),
    Object.freeze({
      ruleId: 'GOLDEN-NEGLIGIBLE',
      severity: sev(1.0, 'negligible'),
      confidence: 0.5,
      evidenceIds: Object.freeze(['ev-neg']),
      taxonomyIds: Object.freeze(['TAX-005']),
    }),
  ]),
  correlations: Object.freeze([]),
  evidence: Object.freeze([
    Object.freeze({ id: 'ev-crit', confidence: 0.9, category: 'test', artifactId: 'art-001' }),
    Object.freeze({ id: 'ev-high', confidence: 0.8, category: 'test', artifactId: 'art-001' }),
    Object.freeze({ id: 'ev-med', confidence: 0.7, category: 'test', artifactId: 'art-001' }),
    Object.freeze({ id: 'ev-low', confidence: 0.6, category: 'test', artifactId: 'art-001' }),
    Object.freeze({ id: 'ev-neg', confidence: 0.5, category: 'test', artifactId: 'art-001' }),
  ]),
  artifactId: 'art-001',
  sessionId: 'golden-mixed-severities',
});

// ── Fixture 5: Correlation Amplification ──

/**
 * Correlation chain amplifying rule match contributions.
 *
 * ## Why This Exists
 *
 * Verifies that the correlation dimension correctly amplifies risk
 * through the chain multiplier mechanism. The correlation contribution
 * has metadata (chainLength) that influences the dimension weight
 * during aggregation.
 *
 * Expected characteristics:
 * - 2 rule + 1 correlation + 1 evidence = 4 contributions
 * - Correlation has chainLength metadata
 * - Dimension weights reflect chain amplification
 * - All three dimensions populated
 */
export const CORRELATION_AMPLIFICATION_INPUT: RiskInput = Object.freeze({
  matches: Object.freeze([
    Object.freeze({
      ruleId: 'GOLDEN-CORR-RULE-1',
      severity: sev(7.0, 'high'),
      confidence: 0.85,
      evidenceIds: Object.freeze(['ev-corr-a']),
      taxonomyIds: Object.freeze(['TAX-001']),
    }),
    Object.freeze({
      ruleId: 'GOLDEN-CORR-RULE-2',
      severity: sev(6.0, 'high'),
      confidence: 0.75,
      evidenceIds: Object.freeze(['ev-corr-b']),
      taxonomyIds: Object.freeze(['TAX-002']),
    }),
  ]),
  correlations: Object.freeze([
    Object.freeze({
      correlationId: 'GOLDEN-CORR-001',
      chainLength: 5,
      confidence: 0.8,
      evidenceIds: Object.freeze(['ev-corr-a', 'ev-corr-b']),
    }),
  ]),
  evidence: Object.freeze([
    Object.freeze({
      id: 'ev-corr-a',
      confidence: 0.9,
      category: 'correlated',
      artifactId: 'art-001',
    }),
    Object.freeze({
      id: 'ev-corr-b',
      confidence: 0.8,
      category: 'correlated',
      artifactId: 'art-001',
    }),
  ]),
  artifactId: 'art-001',
  sessionId: 'golden-correlation',
});

// ── Fixture 6: High Confidence Assessment ──

/**
 * Input with maximum confidence across all three dimensions.
 *
 * ## Why This Exists
 *
 * Verifies that the confidence computation produces the highest possible
 * confidence (1.0) when all contributions, evidence diversity, and
 * dimension coverage are perfect. This is the upper bound test for
 * the confidence model.
 *
 * Expected characteristics:
 * - All confidences = 1.0
 * - All evidence IDs unique
 * - All three dimensions populated
 * - confidence = 1.0
 * - hasSufficientEvidence = true
 */
export const HIGH_CONFIDENCE_INPUT: RiskInput = Object.freeze({
  matches: Object.freeze([
    Object.freeze({
      ruleId: 'GOLDEN-HIGH-CONF',
      severity: sev(8.0, 'high'),
      confidence: 1.0,
      evidenceIds: Object.freeze(['ev-conf-rule']),
      taxonomyIds: Object.freeze(['TAX-001']),
    }),
  ]),
  correlations: Object.freeze([
    Object.freeze({
      correlationId: 'GOLDEN-HIGH-CONF-CORR',
      chainLength: 3,
      confidence: 1.0,
      evidenceIds: Object.freeze(['ev-conf-corr']),
    }),
  ]),
  evidence: Object.freeze([
    Object.freeze({
      id: 'ev-conf-rule',
      confidence: 1.0,
      category: 'rule-evidence',
      artifactId: 'art-001',
    }),
    Object.freeze({
      id: 'ev-conf-corr',
      confidence: 1.0,
      category: 'corr-evidence',
      artifactId: 'art-001',
    }),
    Object.freeze({
      id: 'ev-conf-direct',
      confidence: 1.0,
      category: 'direct-evidence',
      artifactId: 'art-001',
    }),
  ]),
  artifactId: 'art-high-conf',
  sessionId: 'golden-high-confidence',
});

// ── Fixture 7: Low Confidence Assessment ──

/**
 * Input with minimal confidence — single dimension, single evidence.
 *
 * ## Why This Exists
 *
 * Verifies the lower bound of the confidence model. A single rule match
 * with moderate confidence, a single evidence reference, and only one
 * dimension populated should produce low but non-zero confidence.
 *
 * Expected characteristics:
 * - 1 contribution (rule)
 * - evidenceCompleteness = 1.0 (1/1)
 * - aggregationQuality = 0.333... (1/3 dimensions)
 * - Overall confidence < 0.3 (insufficient evidence)
 */
export const LOW_CONFIDENCE_INPUT: RiskInput = Object.freeze({
  matches: Object.freeze([
    Object.freeze({
      ruleId: 'GOLDEN-LOW-CONF',
      severity: sev(5.0, 'medium'),
      confidence: 0.4,
      evidenceIds: Object.freeze(['ev-low']),
      taxonomyIds: Object.freeze(['TAX-001']),
    }),
  ]),
  correlations: Object.freeze([]),
  evidence: Object.freeze([
    Object.freeze({ id: 'ev-low', confidence: 0.55, category: 'test', artifactId: 'art-001' }),
  ]),
  artifactId: 'art-low-conf',
  sessionId: 'golden-low-confidence',
});

// ── Fixture 8: Truncated Contributions ──

/**
 * Input with more contributions than the maxContributions limit.
 *
 * ## Why This Exists
 *
 * Verifies that the engine correctly truncates contributions when
 * the count exceeds maxContributions. The highest-value contributions
 * should be kept, and the contributionsTruncated flag should be true.
 *
 * Expected characteristics:
 * - 10 rule match contributions
 * - maxContributions = 3
 * - Only top 3 by effectiveValue retained
 * - contributionsTruncated = true
 * - totalContributionCount = 10
 */
export const TRUNCATED_INPUT: RiskInput = Object.freeze({
  matches: Object.freeze([
    Object.freeze({
      ruleId: 'GOLDEN-TRUNC-01',
      severity: sev(1.0),
      confidence: 0.5,
      evidenceIds: Object.freeze(['ev-t01']),
      taxonomyIds: Object.freeze(['TAX-001']),
    }),
    Object.freeze({
      ruleId: 'GOLDEN-TRUNC-02',
      severity: sev(2.0),
      confidence: 0.5,
      evidenceIds: Object.freeze(['ev-t02']),
      taxonomyIds: Object.freeze(['TAX-001']),
    }),
    Object.freeze({
      ruleId: 'GOLDEN-TRUNC-03',
      severity: sev(3.0),
      confidence: 0.5,
      evidenceIds: Object.freeze(['ev-t03']),
      taxonomyIds: Object.freeze(['TAX-001']),
    }),
    Object.freeze({
      ruleId: 'GOLDEN-TRUNC-04',
      severity: sev(4.0),
      confidence: 0.5,
      evidenceIds: Object.freeze(['ev-t04']),
      taxonomyIds: Object.freeze(['TAX-001']),
    }),
    Object.freeze({
      ruleId: 'GOLDEN-TRUNC-05',
      severity: sev(5.0),
      confidence: 0.5,
      evidenceIds: Object.freeze(['ev-t05']),
      taxonomyIds: Object.freeze(['TAX-001']),
    }),
    Object.freeze({
      ruleId: 'GOLDEN-TRUNC-06',
      severity: sev(6.0),
      confidence: 0.5,
      evidenceIds: Object.freeze(['ev-t06']),
      taxonomyIds: Object.freeze(['TAX-001']),
    }),
    Object.freeze({
      ruleId: 'GOLDEN-TRUNC-07',
      severity: sev(7.0),
      confidence: 0.5,
      evidenceIds: Object.freeze(['ev-t07']),
      taxonomyIds: Object.freeze(['TAX-001']),
    }),
    Object.freeze({
      ruleId: 'GOLDEN-TRUNC-08',
      severity: sev(8.0),
      confidence: 0.5,
      evidenceIds: Object.freeze(['ev-t08']),
      taxonomyIds: Object.freeze(['TAX-001']),
    }),
    Object.freeze({
      ruleId: 'GOLDEN-TRUNC-09',
      severity: sev(9.0),
      confidence: 0.5,
      evidenceIds: Object.freeze(['ev-t09']),
      taxonomyIds: Object.freeze(['TAX-001']),
    }),
    Object.freeze({
      ruleId: 'GOLDEN-TRUNC-10',
      severity: sev(10.0),
      confidence: 0.5,
      evidenceIds: Object.freeze(['ev-t10']),
      taxonomyIds: Object.freeze(['TAX-001']),
    }),
  ]),
  correlations: Object.freeze([]),
  evidence: Object.freeze([
    Object.freeze({ id: 'ev-t01', confidence: 0.6, category: 'test', artifactId: 'art-001' }),
    Object.freeze({ id: 'ev-t02', confidence: 0.6, category: 'test', artifactId: 'art-001' }),
    Object.freeze({ id: 'ev-t03', confidence: 0.6, category: 'test', artifactId: 'art-001' }),
    Object.freeze({ id: 'ev-t04', confidence: 0.6, category: 'test', artifactId: 'art-001' }),
    Object.freeze({ id: 'ev-t05', confidence: 0.6, category: 'test', artifactId: 'art-001' }),
    Object.freeze({ id: 'ev-t06', confidence: 0.6, category: 'test', artifactId: 'art-001' }),
    Object.freeze({ id: 'ev-t07', confidence: 0.6, category: 'test', artifactId: 'art-001' }),
    Object.freeze({ id: 'ev-t08', confidence: 0.6, category: 'test', artifactId: 'art-001' }),
    Object.freeze({ id: 'ev-t09', confidence: 0.6, category: 'test', artifactId: 'art-001' }),
    Object.freeze({ id: 'ev-t10', confidence: 0.6, category: 'test', artifactId: 'art-001' }),
  ]),
  artifactId: 'art-trunc',
  sessionId: 'golden-truncated',
});

// ── Fixture 9: Multi-Dimension Assessment ──

/**
 * Input with contributions across all three dimensions (rule, correlation, evidence).
 *
 * ## Why This Exists
 *
 * Tests that the engine correctly processes inputs from all three analytical
 * dimensions. This is the most comprehensive single-input scenario, exercising
 * the full pipeline from contribution building through dimension aggregation
 * to final assessment construction.
 *
 * Expected characteristics:
 * - 6 contributions (2 rule + 1 correlation + 3 evidence)
 * - All three dimensions populated
 * - Full aggregation pipeline exercised
 * - High confidence (good coverage)
 * - Deterministic verdict
 */
export const MULTI_DIMENSION_INPUT: RiskInput = Object.freeze({
  matches: Object.freeze([
    Object.freeze({
      ruleId: 'GOLDEN-MD-RULE-1',
      severity: sev(8.0, 'critical'),
      confidence: 0.9,
      evidenceIds: Object.freeze(['ev-md-r1']),
      taxonomyIds: Object.freeze(['TAX-001']),
    }),
    Object.freeze({
      ruleId: 'GOLDEN-MD-RULE-2',
      severity: sev(5.0, 'medium'),
      confidence: 0.7,
      evidenceIds: Object.freeze(['ev-md-r2']),
      taxonomyIds: Object.freeze(['TAX-002']),
    }),
  ]),
  correlations: Object.freeze([
    Object.freeze({
      correlationId: 'GOLDEN-MD-CORR',
      chainLength: 4,
      confidence: 0.8,
      evidenceIds: Object.freeze(['ev-md-r1', 'ev-md-r2', 'ev-md-corr']),
    }),
  ]),
  evidence: Object.freeze([
    Object.freeze({
      id: 'ev-md-r1',
      confidence: 0.9,
      category: 'rule-match',
      artifactId: 'art-001',
    }),
    Object.freeze({
      id: 'ev-md-r2',
      confidence: 0.8,
      category: 'rule-match',
      artifactId: 'art-001',
    }),
    Object.freeze({
      id: 'ev-md-corr',
      confidence: 0.85,
      category: 'correlation',
      artifactId: 'art-001',
    }),
    Object.freeze({
      id: 'ev-md-direct',
      confidence: 0.7,
      category: 'direct',
      artifactId: 'art-001',
    }),
  ]),
  artifactId: 'art-md',
  sessionId: 'golden-multi-dimension',
});

// ── Fixture 10: Large Deterministic Assessment ──

/**
 * Large input with 20 rule matches, 5 correlations, and 10 evidence references.
 *
 * ## Why This Exists
 *
 * Tests that the engine scales correctly with larger inputs. Verifies that
 * sorting, truncation, and aggregation remain correct as input size grows.
 * This is the stress-test fixture for the pipeline.
 *
 * Expected characteristics:
 * - 35 total contributions
 * - Large sorting exercise
 * - Maximum dimension coverage
 * - Fully deterministic despite size
 */
export const LARGE_INPUT: RiskInput = Object.freeze({
  matches: Object.freeze(
    Array.from({ length: 20 }, (_, i) =>
      Object.freeze({
        ruleId: `GOLDEN-LARGE-RULE-${String(i).padStart(2, '0')}`,
        severity: sev(3.0 + (i % 7), i % 2 === 0 ? 'high' : 'medium'),
        confidence: 0.5 + (i % 5) * 0.1,
        evidenceIds: Object.freeze([`ev-large-${i}`]),
        taxonomyIds: Object.freeze([`TAX-${String(i).padStart(3, '0')}`]),
      }),
    ),
  ),
  correlations: Object.freeze(
    Array.from({ length: 5 }, (_, i) =>
      Object.freeze({
        correlationId: `GOLDEN-LARGE-CORR-${i}`,
        chainLength: 2 + i,
        confidence: 0.6 + i * 0.05,
        evidenceIds: Object.freeze([`ev-large-c${i}`]),
      }),
    ),
  ),
  evidence: Object.freeze(
    Array.from({ length: 10 }, (_, i) =>
      Object.freeze({
        id: `ev-large-${i}`,
        confidence: 0.65 + i * 0.03,
        category: i % 2 === 0 ? 'static' : 'dynamic',
        artifactId: 'art-large',
      }),
    ),
  ),
  artifactId: 'art-large',
  sessionId: 'golden-large',
});

// ── Fixture Collection ──

/**
 * All golden fixtures with their metadata.
 *
 * Each entry includes the fixture name, the input, a human-readable
 * description, and the session ID for traceability.
 */
export interface GoldenFixtureEntry {
  /** Name of the fixture (e.g., "empty-input"). */
  readonly name: string;
  /** The deterministic risk engine input. */
  readonly input: RiskInput;
  /** Human-readable description of what this fixture tests. */
  readonly description: string;
}

/**
 * The complete collection of golden fixtures.
 *
 * Each fixture is a named entry with its input and a description.
 * Consumers should iterate over this array for regression testing.
 */
export const GOLDEN_FIXTURES: readonly GoldenFixtureEntry[] = Object.freeze([
  Object.freeze({
    name: 'empty-input',
    input: EMPTY_INPUT,
    description: 'Empty input — no matches, correlations, or evidence. Verifies zero-assessment.',
  }),
  Object.freeze({
    name: 'single-rule',
    input: SINGLE_RULE_INPUT,
    description: 'Single rule match with moderate severity. Verifies atomic contribution pipeline.',
  }),
  Object.freeze({
    name: 'multiple-rules',
    input: MULTIPLE_RULES_INPUT,
    description:
      'Multiple rule matches with varying severities. Verifies accumulation and sorting.',
  }),
  Object.freeze({
    name: 'mixed-severities',
    input: MIXED_SEVERITIES_INPUT,
    description: 'Full severity spectrum across all five levels. Verifies risk level mapping.',
  }),
  Object.freeze({
    name: 'correlation-amplification',
    input: CORRELATION_AMPLIFICATION_INPUT,
    description:
      'Correlation chain amplifying rule match contributions. Verifies chain multiplier.',
  }),
  Object.freeze({
    name: 'high-confidence',
    input: HIGH_CONFIDENCE_INPUT,
    description: 'Maximum confidence across all dimensions. Verifies upper confidence bound.',
  }),
  Object.freeze({
    name: 'low-confidence',
    input: LOW_CONFIDENCE_INPUT,
    description: 'Minimal confidence — single dimension, single evidence. Verifies lower bound.',
  }),
  Object.freeze({
    name: 'truncated',
    input: TRUNCATED_INPUT,
    description: '10 contributions with maxContributions=3. Verifies truncation behavior.',
  }),
  Object.freeze({
    name: 'multi-dimension',
    input: MULTI_DIMENSION_INPUT,
    description: 'All three dimensions populated. Verifies full pipeline aggregation.',
  }),
  Object.freeze({
    name: 'large',
    input: LARGE_INPUT,
    description:
      '35 contributions (20 rule + 5 correlation + 10 evidence). Stress tests the pipeline.',
  }),
]);
