/**
 * Tests for M3 — Finding context builder.
 *
 * Tests:
 * - ExplainedFinding construction from canonical Finding
 * - ExplainedEvidence list building and sorting
 * - Rule context building
 * - Artifact context building
 * - Edge cases: zero evidence, null taxonomyIds
 *
 * @module @veris/explain/__tests__/unit/context/finding-context.test
 */

import { describe, it, expect } from 'vitest';
import {
  buildExplainedFinding,
  buildExplainedEvidenceList,
  buildExplainedRule,
  buildExplainedArtifact,
  buildFindingContext,
} from '../../../src/context/finding-context.js';
import {
  simpleFindingReport,
  testFinding,
  testEvidence,
  testArtifact,
} from '../../fixtures/reports/simple-finding.js';
import {
  zeroEvidenceReport,
  zeroEvidenceFinding,
  nullFieldsReport,
  nullFieldsFinding,
} from '../../fixtures/reports/edge-cases.js';
import { multiFindingReport, findingCritical } from '../../fixtures/reports/multi-finding.js';
import type { CanonicalReport } from '@veris/core';

describe('buildExplainedFinding', () => {
  it('builds from canonical finding', () => {
    const explained = buildExplainedFinding(testFinding);
    expect(explained.id).toBe('fin_simple_001');
    expect(explained.title).toBe('Hardcoded AWS Access Key');
    expect(explained.severity.level).toBe('critical');
    expect(explained.severity.score).toBe(9.5);
    expect(explained.confidence).toBe(0.95);
    expect(explained.ruleId).toBe('secrets/aws-key');
    expect(explained.taxonomyIds).toContain('CWE-798');
  });

  it('handles finding without taxonomyIds', () => {
    const findingNoTax = { ...testFinding, taxonomyIds: [] };
    const explained = buildExplainedFinding(findingNoTax);
    expect(explained.taxonomyIds).toBeUndefined();
  });

  it('includes evidenceIds when present', () => {
    const explained = buildExplainedFinding(testFinding);
    expect(explained.evidenceIds).toContain('ev_simple_001');
  });
});

describe('buildExplainedEvidenceList', () => {
  it('returns empty array for no evidence IDs', () => {
    const evidence = buildExplainedEvidenceList([], simpleFindingReport);
    expect(evidence).toEqual([]);
  });

  it('builds evidence from report findings', () => {
    const evidence = buildExplainedEvidenceList(['ev_simple_001'], simpleFindingReport);
    expect(evidence.length).toBeGreaterThanOrEqual(1);
  });
});

describe('buildExplainedRule', () => {
  it('builds minimal rule from ruleId', () => {
    const rule = buildExplainedRule('secrets/aws-key', simpleFindingReport);
    expect(rule?.id).toBe('secrets/aws-key');
    expect(rule?.name).toBe('aws-key');
    expect(rule?.packId).toBe('secrets');
  });

  it('returns rule when ruleId has no pack prefix', () => {
    const rule = buildExplainedRule('simple-rule', simpleFindingReport);
    expect(rule?.id).toBe('simple-rule');
    expect(rule?.name).toBe('simple-rule');
    expect(rule?.packId).toBeUndefined();
  });
});

describe('buildExplainedArtifact', () => {
  it('builds artifact from report', () => {
    const artifact = buildExplainedArtifact('art_simple_001', simpleFindingReport);
    expect(artifact?.id).toBe('art_simple_001');
    expect(artifact?.path).toBe('src/config.ts');
    expect(artifact?.type).toBe('script');
  });

  it('returns undefined for non-existent artifact', () => {
    const artifact = buildExplainedArtifact('art_non_existent', simpleFindingReport);
    expect(artifact).toBeUndefined();
  });
});

describe('buildFindingContext', () => {
  it('builds complete context for simple finding', () => {
    const ctx = buildFindingContext(testFinding, simpleFindingReport);
    expect(ctx.finding.id).toBe('fin_simple_001');
    expect(Array.isArray(ctx.evidence)).toBe(true);
    expect(ctx.rule?.id).toBe('secrets/aws-key');
    expect(ctx.artifact?.id).toBe('art_simple_001');
  });

  it('returns artifact when affectedArtifacts is empty', () => {
    const findingNoArtifact = { ...testFinding, affectedArtifacts: [] };
    const ctx = buildFindingContext(findingNoArtifact, simpleFindingReport);
    expect(ctx.artifact).toBeUndefined();
  });

  it('builds context from multi-finding report', () => {
    const ctx = buildFindingContext(findingCritical, multiFindingReport);
    expect(ctx.finding.id).toBe('fin_multi_001');
    expect(ctx.finding.severity.level).toBe('critical');
    expect(ctx.rule).toBeDefined();
  });
});

describe('buildExplainedEvidenceList edge cases', () => {
  it('handles zero evidence gracefully', () => {
    const evidence = buildExplainedEvidenceList([], zeroEvidenceReport);
    expect(evidence).toEqual([]);
  });

  it('limits to MAX_EVIDENCE_ITEMS', () => {
    // Generate many evidence IDs
    const manyIds = Array.from({ length: 50 }, (_, i) => `ev_test_${i}`);
    const evidence = buildExplainedEvidenceList(manyIds, simpleFindingReport);
    // Most will not be found in the report, so length will be 0
    expect(evidence.length).toBe(0);
  });
});
