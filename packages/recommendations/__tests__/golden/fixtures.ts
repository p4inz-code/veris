/**
 * Golden fixtures for @veris/recommendations pipeline validation.
 *
 * Each fixture contains a pre-built registry, a deterministic input,
 * and the expected output shape. These fixtures lock Phase 10 behavior
 * forever — any change to the pipeline that alters these outputs is a
 * breaking change.
 *
 * ## Invariants
 * - All fixtures are deterministic — same input always produces same output.
 * - All fixtures must pass 1,000 iterations × 10 fixtures = 10,000 executions.
 * - Every fixture includes a short rationale explaining its purpose.
 * - Fixtures are frozen at export to prevent accidental mutation.
 *
 * @module @veris/recommendations/__tests__/golden/fixtures
 */

import {
  createRecommendationRegistry,
  CATEGORIES,
  ACTIONS,
  SOURCE_TYPES,
} from '../../src/index.js';

import type { RecommendationInput } from '../../src/index.js';
import type { RecommendationRegistry } from '../../src/registry.js';
import { makeRec } from '../helpers.js';

// ── Fixture Shape ──

/**
 * A single golden fixture for pipeline testing.
 */
export interface GoldenFixture {
  /** Short name identifying the fixture. */
  readonly name: string;
  /** Rationale explaining what this fixture tests. */
  readonly rationale: string;
  /** Registry populated with deterministic recommendations. */
  readonly registry: RecommendationRegistry;
  /** The deterministic input to evaluate. */
  readonly input: RecommendationInput;
}

// ── Fixture 1: Empty Input ──

/** Verifies the pipeline handles completely empty input gracefully. */
const EMPTY_INPUT: GoldenFixture = {
  name: 'empty-input',
  rationale:
    'Verifies the pipeline produces empty results when no recommendations exist and no input IDs are provided.',
  registry: createRecommendationRegistry(),
  input: {
    riskAssessmentId: 'ra_empty',
    sessionId: 'sess_empty',
    artifactId: null,
    ruleMatchIds: [],
    correlationIds: [],
    evidenceIds: [],
  },
};

// ── Fixture 2: Single Recommendation ──

/** Verifies a single matching recommendation flows through the pipeline. */
const SINGLE_RECOMMENDATION: GoldenFixture = {
  name: 'single-recommendation',
  rationale:
    'Verifies the simplest case: one recommendation, one matching rule ID, full pipeline produces deterministic output.',
  registry: (() => {
    const r = createRecommendationRegistry();
    r.register(
      makeRec({
        id: 'TEST-01',
        priority: 'high',
        references: Object.freeze([
          Object.freeze({
            sourceType: SOURCE_TYPES.RULE,
            sourceId: 'rule-single',
            sourceName: 'Single Rule',
          }),
        ]),
      }),
    );
    return r;
  })(),
  input: {
    riskAssessmentId: 'ra_single',
    sessionId: 'sess_single',
    artifactId: 'artifact-single.exe',
    ruleMatchIds: ['rule-single'],
    correlationIds: [],
    evidenceIds: [],
  },
};

// ── Fixture 3: Multiple Recommendations ──

/** Verifies multiple recommendations with different priorities sort correctly. */
const MULTIPLE_RECOMMENDATIONS: GoldenFixture = {
  name: 'multiple-recommendations',
  rationale:
    'Verifies that multiple recommendations from a single rule match are sorted by priority → category → ID deterministically.',
  registry: (() => {
    const r = createRecommendationRegistry();
    r.register(
      makeRec({
        id: 'Z-REC',
        priority: 'low',
        references: Object.freeze([
          Object.freeze({
            sourceType: SOURCE_TYPES.RULE,
            sourceId: 'rule-multi',
            sourceName: 'Multi Rule',
          }),
        ]),
      }),
    );
    r.register(
      makeRec({
        id: 'A-REC',
        priority: 'critical',
        references: Object.freeze([
          Object.freeze({
            sourceType: SOURCE_TYPES.RULE,
            sourceId: 'rule-multi',
            sourceName: 'Multi Rule',
          }),
        ]),
      }),
    );
    r.register(
      makeRec({
        id: 'M-REC',
        priority: 'medium',
        references: Object.freeze([
          Object.freeze({
            sourceType: SOURCE_TYPES.RULE,
            sourceId: 'rule-multi',
            sourceName: 'Multi Rule',
          }),
        ]),
      }),
    );
    return r;
  })(),
  input: {
    riskAssessmentId: 'ra_multi',
    sessionId: 'sess_multi',
    artifactId: 'artifact-multi.exe',
    ruleMatchIds: ['rule-multi'],
    correlationIds: [],
    evidenceIds: [],
  },
};

// ── Fixture 4: Duplicate Recommendation Sources ──

/** Verifies deduplication when multiple source IDs match the same recommendation. */
const DUPLICATE_SOURCES: GoldenFixture = {
  name: 'duplicate-sources',
  rationale:
    'Verifies that a single recommendation matched by multiple input IDs (rule + evidence) appears only once in the output.',
  registry: (() => {
    const r = createRecommendationRegistry();
    r.register(
      makeRec({
        id: 'DUPE-01',
        priority: 'critical',
        references: Object.freeze([
          Object.freeze({
            sourceType: SOURCE_TYPES.RULE,
            sourceId: 'rule-dup',
            sourceName: 'Dup Rule',
          }),
          Object.freeze({
            sourceType: SOURCE_TYPES.EVIDENCE,
            sourceId: 'ev-dup',
            sourceName: 'Dup Evidence',
          }),
        ]),
      }),
    );
    return r;
  })(),
  input: {
    riskAssessmentId: 'ra_dupe',
    sessionId: 'sess_dupe',
    artifactId: null,
    ruleMatchIds: ['rule-dup'],
    correlationIds: [],
    evidenceIds: ['ev-dup'],
  },
};

// ── Fixture 5: Multiple Documentation References ──

/** Verifies documentation references are preserved across the pipeline. */
const MULTIPLE_DOC_REFS: GoldenFixture = {
  name: 'multiple-doc-refs',
  rationale:
    'Verifies recommendations with multiple documentation references flow correctly through registry, engine, and documentation registry.',
  registry: (() => {
    const r = createRecommendationRegistry();
    r.register(
      makeRec({
        id: 'DOC-REC',
        priority: 'high',
        references: Object.freeze([
          Object.freeze({
            sourceType: SOURCE_TYPES.RULE,
            sourceId: 'rule-doc',
            sourceName: 'Doc Rule',
          }),
        ]),
        documentationRefs: Object.freeze([
          Object.freeze({
            documentId: 'doc-001',
            documentTitle: 'Document One',
            section: '2.1',
            url: 'https://docs.example.com/1',
          }),
          Object.freeze({ documentId: 'doc-002', documentTitle: 'Document Two' }),
        ]),
      }),
    );
    return r;
  })(),
  input: {
    riskAssessmentId: 'ra_doc',
    sessionId: 'sess_doc',
    artifactId: null,
    ruleMatchIds: ['rule-doc'],
    correlationIds: [],
    evidenceIds: [],
  },
};

// ── Fixture 6: Multiple Categories ──

/** Verifies category-based grouping produces stable results. */
const MULTIPLE_CATEGORIES: GoldenFixture = {
  name: 'multiple-categories',
  rationale:
    'Verifies that recommendations spanning multiple categories are grouped correctly by the explainer.',
  registry: (() => {
    const r = createRecommendationRegistry();
    r.register(
      makeRec({
        id: 'CAT-A',
        priority: 'critical',
        category: CATEGORIES.REMEDIATION,
        references: Object.freeze([
          Object.freeze({
            sourceType: SOURCE_TYPES.RULE,
            sourceId: 'rule-cat',
            sourceName: 'Cat Rule',
          }),
        ]),
      }),
    );
    r.register(
      makeRec({
        id: 'CAT-B',
        priority: 'high',
        category: CATEGORIES.INVESTIGATION,
        references: Object.freeze([
          Object.freeze({
            sourceType: SOURCE_TYPES.RULE,
            sourceId: 'rule-cat',
            sourceName: 'Cat Rule',
          }),
        ]),
      }),
    );
    r.register(
      makeRec({
        id: 'CAT-C',
        priority: 'medium',
        category: CATEGORIES.PREVENTION,
        references: Object.freeze([
          Object.freeze({
            sourceType: SOURCE_TYPES.RULE,
            sourceId: 'rule-cat',
            sourceName: 'Cat Rule',
          }),
        ]),
      }),
    );
    return r;
  })(),
  input: {
    riskAssessmentId: 'ra_cat',
    sessionId: 'sess_cat',
    artifactId: null,
    ruleMatchIds: ['rule-cat'],
    correlationIds: [],
    evidenceIds: [],
  },
};

// ── Fixture 7: High Priority Recommendations ──

/** Verifies priority ordering places critical recommendations first. */
const HIGH_PRIORITY: GoldenFixture = {
  name: 'high-priority',
  rationale:
    'Verifies that critical and high priority recommendations appear first in the sorted output, regardless of insertion order.',
  registry: (() => {
    const r = createRecommendationRegistry();
    r.register(
      makeRec({
        id: 'L01',
        priority: 'low',
        references: Object.freeze([
          Object.freeze({
            sourceType: SOURCE_TYPES.RULE,
            sourceId: 'rule-pri',
            sourceName: 'Pri Rule',
          }),
        ]),
      }),
    );
    r.register(
      makeRec({
        id: 'M01',
        priority: 'medium',
        references: Object.freeze([
          Object.freeze({
            sourceType: SOURCE_TYPES.RULE,
            sourceId: 'rule-pri',
            sourceName: 'Pri Rule',
          }),
        ]),
      }),
    );
    r.register(
      makeRec({
        id: 'C01',
        priority: 'critical',
        references: Object.freeze([
          Object.freeze({
            sourceType: SOURCE_TYPES.RULE,
            sourceId: 'rule-pri',
            sourceName: 'Pri Rule',
          }),
        ]),
      }),
    );
    r.register(
      makeRec({
        id: 'H01',
        priority: 'high',
        references: Object.freeze([
          Object.freeze({
            sourceType: SOURCE_TYPES.RULE,
            sourceId: 'rule-pri',
            sourceName: 'Pri Rule',
          }),
        ]),
      }),
    );
    return r;
  })(),
  input: {
    riskAssessmentId: 'ra_pri',
    sessionId: 'sess_pri',
    artifactId: null,
    ruleMatchIds: ['rule-pri'],
    correlationIds: [],
    evidenceIds: [],
  },
};

// ── Fixture 8: Recommendation Limit ──

/** Verifies the engine respects maxRecommendations and sets truncated flag. */
const RECOMMENDATION_LIMIT: GoldenFixture = {
  name: 'recommendation-limit',
  rationale:
    'Verifies that when the output exceeds maxRecommendations, only the top N are returned and truncated is set to true.',
  registry: (() => {
    const r = createRecommendationRegistry();
    for (let i = 0; i < 10; i++) {
      r.register(
        makeRec({
          id: `LIMIT-${String(i).padStart(2, '0')}`,
          priority: 'medium',
          references: Object.freeze([
            Object.freeze({
              sourceType: SOURCE_TYPES.RULE,
              sourceId: 'rule-limit',
              sourceName: 'Limit Rule',
            }),
          ]),
        }),
      );
    }
    return r;
  })(),
  input: {
    riskAssessmentId: 'ra_limit',
    sessionId: 'sess_limit',
    artifactId: null,
    ruleMatchIds: ['rule-limit'],
    correlationIds: [],
    evidenceIds: [],
  },
};

// ── Fixture 9: Large Deterministic Set ──

/** Verifies the pipeline handles a large set of recommendations without nondeterminism. */
const LARGE_SET: GoldenFixture = {
  name: 'large-set',
  rationale:
    'Verifies the pipeline produces stable, deterministic output with 50 recommendations across all priority levels.',
  registry: (() => {
    const r = createRecommendationRegistry();
    const priorities: Array<'critical' | 'high' | 'medium' | 'low'> = [
      'critical',
      'high',
      'medium',
      'low',
    ];
    for (let i = 0; i < 50; i++) {
      const priority = priorities[i % priorities.length];
      r.register(
        makeRec({
          id: `LRG-${String(i).padStart(3, '0')}`,
          priority,
          references: Object.freeze([
            Object.freeze({
              sourceType: SOURCE_TYPES.RULE,
              sourceId: 'rule-large',
              sourceName: 'Large Rule',
            }),
          ]),
        }),
      );
    }
    return r;
  })(),
  input: {
    riskAssessmentId: 'ra_large',
    sessionId: 'sess_large',
    artifactId: 'artifact-large.exe',
    ruleMatchIds: ['rule-large'],
    correlationIds: [],
    evidenceIds: [],
  },
};

// ── Fixture 10: Mixed Realistic Assessment ──

/** Simulates a realistic assessment with rule matches, correlations, and evidence IDs. */
const MIXED_ASSESSMENT: GoldenFixture = {
  name: 'mixed-assessment',
  rationale:
    'Simulates a realistic security assessment with multiple rule matches, correlation chains, and evidence indicators producing recommendations from different sources.',
  registry: (() => {
    const r = createRecommendationRegistry();
    // A trojan detection recommendation (from rule match)
    r.register(
      makeRec({
        id: 'TR-01',
        priority: 'critical',
        category: CATEGORIES.REMEDIATION,
        action: ACTIONS.REMOVE,
        title: 'Trojan Removal',
        description: 'Remove confirmed trojan from the system.',
        rationale: 'Multiple rule matches indicate trojan behavior.',
        references: Object.freeze([
          Object.freeze({
            sourceType: SOURCE_TYPES.RULE,
            sourceId: 'rule-trojan-001',
            sourceName: 'Trojan Detection Rule',
          }),
          Object.freeze({
            sourceType: SOURCE_TYPES.EVIDENCE,
            sourceId: 'ev-suspicious-file',
            sourceName: 'Suspicious File Evidence',
          }),
        ]),
      }),
    );
    // A credential exposure recommendation (from evidence + correlation)
    r.register(
      makeRec({
        id: 'CR-01',
        priority: 'critical',
        category: CATEGORIES.REMEDIATION,
        action: ACTIONS.REMOVE,
        title: 'Credential Exposure',
        description: 'Review and remove exposed credentials.',
        rationale: 'Hardcoded credentials detected in source code.',
        references: Object.freeze([
          Object.freeze({
            sourceType: SOURCE_TYPES.CORRELATION,
            sourceId: 'corr-cred-chain',
            sourceName: 'Credential Correlation',
          }),
          Object.freeze({
            sourceType: SOURCE_TYPES.EVIDENCE,
            sourceId: 'ev-hc-cred',
            sourceName: 'Hardcoded Credential Evidence',
          }),
        ]),
      }),
    );
    // An obfuscation analysis recommendation (from evidence only)
    r.register(
      makeRec({
        id: 'OB-01',
        priority: 'high',
        category: CATEGORIES.INVESTIGATION,
        action: ACTIONS.REVIEW,
        title: 'Obfuscated Code Analysis',
        description: 'Analyze obfuscated code patterns.',
        rationale: 'Suspicious obfuscation patterns detected.',
        references: Object.freeze([
          Object.freeze({
            sourceType: SOURCE_TYPES.EVIDENCE,
            sourceId: 'ev-obfuscated',
            sourceName: 'Obfuscation Evidence',
          }),
        ]),
      }),
    );
    // A network config recommendation (from rule match)
    r.register(
      makeRec({
        id: 'NET-01',
        priority: 'low',
        category: CATEGORIES.PREVENTION,
        action: ACTIONS.REVIEW,
        title: 'Network Configuration Review',
        description: 'Review network configuration for security issues.',
        rationale: 'Network configuration issues detected.',
        references: Object.freeze([
          Object.freeze({
            sourceType: SOURCE_TYPES.RULE,
            sourceId: 'rule-net-001',
            sourceName: 'Network Security Rule',
          }),
        ]),
      }),
    );
    // A monitoring recommendation (from correlation)
    r.register(
      makeRec({
        id: 'MON-01',
        priority: 'medium',
        category: CATEGORIES.MONITORING,
        action: ACTIONS.MONITOR,
        title: 'Enhanced Monitoring',
        description: 'Enable enhanced monitoring for persistence mechanisms.',
        rationale: 'Persistence correlation suggests ongoing threat activity.',
        references: Object.freeze([
          Object.freeze({
            sourceType: SOURCE_TYPES.CORRELATION,
            sourceId: 'corr-persistence',
            sourceName: 'Persistence Correlation',
          }),
        ]),
      }),
    );
    return r;
  })(),
  input: {
    riskAssessmentId: 'ra_mixed',
    sessionId: 'sess_mixed',
    artifactId: 'artifact-mixed.exe',
    ruleMatchIds: ['rule-trojan-001', 'rule-net-001'],
    correlationIds: ['corr-cred-chain', 'corr-persistence'],
    evidenceIds: ['ev-suspicious-file', 'ev-hc-cred', 'ev-obfuscated'],
  },
};

// ── All Fixtures ──

/**
 * All golden fixtures for pipeline validation.
 * Frozen to prevent accidental mutation during testing.
 */
export const GOLDEN_FIXTURES: readonly GoldenFixture[] = Object.freeze([
  EMPTY_INPUT,
  SINGLE_RECOMMENDATION,
  MULTIPLE_RECOMMENDATIONS,
  DUPLICATE_SOURCES,
  MULTIPLE_DOC_REFS,
  MULTIPLE_CATEGORIES,
  HIGH_PRIORITY,
  RECOMMENDATION_LIMIT,
  LARGE_SET,
  MIXED_ASSESSMENT,
]);
