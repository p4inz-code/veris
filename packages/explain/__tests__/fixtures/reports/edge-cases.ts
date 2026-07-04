/**
 * Fixture: Edge-case reports.
 *
 * Reports with edge cases:
 * - Zero evidence finding
 * - Finding with null optional fields
 * - Finding with NaN confidence
 * - Finding with 101+ evidence items (truncation test)
 * - Empty report (no findings)
 *
 * @module @veris/explain/__tests__/fixtures/reports/edge-cases
 */

import type { CanonicalReport, Finding, Evidence, Artifact } from '@veris/core';

// ── Zero Evidence Finding ──

export const zeroEvidenceFinding: Finding = {
  id: 'fin_zero_ev_001',
  sessionId: 'ses_edge_001',
  ruleId: 'best-practices/no-eval',
  behaviorChainId: null,
  title: 'Eval Usage',
  description: 'Uses eval() which is dangerous.',
  severity: { level: 'medium', score: 5.0 },
  confidence: 0.8,
  evidenceIds: [],
  affectedArtifacts: [],
  taxonomyIds: ['CWE-95'],
  createdAt: '2026-07-03T10:00:00.000Z',
};

export const zeroEvidenceReport: CanonicalReport = Object.freeze({
  id: 'rep_zero_ev_001',
  session: {
    id: 'ses_edge_001',
    startedAt: '2026-07-03T10:00:00.000Z',
    completedAt: '2026-07-03T10:00:01.000Z',
    artifactsDiscovered: 0,
    artifactsAnalyzed: 0,
    exitCode: 0,
  },
  artifacts: [],
  findings: [zeroEvidenceFinding],
  trustProfile: {
    id: 'tp_zero_001',
    sessionId: 'ses_edge_001',
    artifactId: 'art_none',
    trustScore: 0.5,
    findingDensity: 0,
    severityBreakdown: {},
    computedAt: '2026-07-03T10:00:01.000Z',
  },
  riskProfile: {
    id: 'rp_zero_001',
    sessionId: 'ses_edge_001',
    trustProfileId: 'tp_zero_001',
    riskScore: 5.0,
    riskLevel: 'medium',
    maxSeverity: { level: 'medium', score: 5.0 },
    computedAt: '2026-07-03T10:00:01.000Z',
  },
  summary: {
    totalArtifacts: 0,
    totalFindings: 1,
    findingsBySeverity: { medium: 1 },
    findingsByCategory: { 'CWE-95': 1 },
    riskScore: 5.0,
    trustScore: 0.5,
    scanDurationMs: 1000,
    rulesApplied: 1,
    behaviorsDetected: 0,
  },
  generatedAt: '2026-07-03T10:00:01.000Z',
});

// ── Null Fields Finding ──

export const nullFieldsFinding: Finding = {
  id: 'fin_null_001',
  sessionId: 'ses_edge_002',
  ruleId: 'injection/sql',
  behaviorChainId: null,
  title: 'SQL Injection',
  description: '',
  severity: { level: 'high', score: 7.0 },
  confidence: 0.75,
  evidenceIds: [],
  affectedArtifacts: [],
  taxonomyIds: [],
  createdAt: '2026-07-03T10:00:00.000Z',
};

export const nullFieldsReport: CanonicalReport = Object.freeze({
  id: 'rep_null_001',
  session: {
    id: 'ses_edge_002',
    startedAt: '2026-07-03T10:00:00.000Z',
    completedAt: '2026-07-03T10:00:01.000Z',
    artifactsDiscovered: 0,
    artifactsAnalyzed: 0,
    exitCode: 0,
  },
  artifacts: [],
  findings: [nullFieldsFinding],
  trustProfile: {
    id: 'tp_null_001',
    sessionId: 'ses_edge_002',
    artifactId: 'art_none',
    trustScore: 0.5,
    findingDensity: 0,
    severityBreakdown: {},
    computedAt: '2026-07-03T10:00:01.000Z',
  },
  riskProfile: {
    id: 'rp_null_001',
    sessionId: 'ses_edge_002',
    trustProfileId: 'tp_null_001',
    riskScore: 7.0,
    riskLevel: 'high',
    maxSeverity: { level: 'high', score: 7.0 },
    computedAt: '2026-07-03T10:00:01.000Z',
  },
  summary: {
    totalArtifacts: 0,
    totalFindings: 1,
    findingsBySeverity: { high: 1 },
    findingsByCategory: {},
    riskScore: 7.0,
    trustScore: 0.5,
    scanDurationMs: 1000,
    rulesApplied: 1,
    behaviorsDetected: 0,
  },
  generatedAt: '2026-07-03T10:00:01.000Z',
});

// ── Many Evidence Finding (for truncation testing) ──

function createManyEvidence(baseId: string, count: number): Evidence[] {
  const items: Evidence[] = [];
  for (let i = 0; i < count; i++) {
    items.push({
      id: `ev_many_${i.toString().padStart(4, '0')}`,
      ruleId: 'test/rule',
      behaviorId: 'beh_many',
      findingId: 'fin_many_001',
      sessionId: 'ses_edge_003',
      matchedProperties: {},
      matchDetail: {
        kind: 'regex',
        pattern: `pattern_${i}`,
        severity: { level: 'medium', score: 5.0 },
      },
      confidence: 0.5 + (i / count) * 0.5, // increasing confidence
    });
  }
  return items;
}

const manyEvidenceItems = createManyEvidence('ev_many', 101);

export const manyEvidenceFinding: Finding = {
  id: 'fin_many_001',
  sessionId: 'ses_edge_003',
  ruleId: 'test/rule',
  behaviorChainId: null,
  title: 'Many Evidence Finding',
  description: 'A finding with 101 evidence items.',
  severity: { level: 'medium', score: 5.0 },
  confidence: 0.8,
  evidenceIds: manyEvidenceItems.map((e) => e.id),
  affectedArtifacts: [],
  taxonomyIds: [],
  createdAt: '2026-07-03T10:00:00.000Z',
};

export const manyEvidenceArtifact: Artifact = {
  id: 'art_many_001',
  sessionId: 'ses_edge_003',
  parentId: null,
  type: 'script',
  subType: 'TypeScript',
  originalPath: 'src/many.ts',
  normalizedPath: 'src/many.ts',
  size: 4096,
  contentHash: { algorithm: 'sha-256', value: 'ghi' },
  mimeType: 'text/typescript',
  extractedAt: '2026-07-03T10:00:00.000Z',
  extractorId: 'ext_file',
};

export const manyEvidenceReport: CanonicalReport = Object.freeze({
  id: 'rep_many_001',
  session: {
    id: 'ses_edge_003',
    startedAt: '2026-07-03T10:00:00.000Z',
    completedAt: '2026-07-03T10:00:02.000Z',
    artifactsDiscovered: 1,
    artifactsAnalyzed: 1,
    exitCode: 0,
  },
  artifacts: [manyEvidenceArtifact],
  findings: [manyEvidenceFinding],
  trustProfile: {
    id: 'tp_many_001',
    sessionId: 'ses_edge_003',
    artifactId: 'art_many_001',
    trustScore: 0.4,
    findingDensity: 0.1,
    severityBreakdown: { medium: 1 },
    computedAt: '2026-07-03T10:00:02.000Z',
  },
  riskProfile: {
    id: 'rp_many_001',
    sessionId: 'ses_edge_003',
    trustProfileId: 'tp_many_001',
    riskScore: 5.0,
    riskLevel: 'medium',
    maxSeverity: { level: 'medium', score: 5.0 },
    computedAt: '2026-07-03T10:00:02.000Z',
  },
  summary: {
    totalArtifacts: 1,
    totalFindings: 1,
    findingsBySeverity: { medium: 1 },
    findingsByCategory: {},
    riskScore: 5.0,
    trustScore: 0.4,
    scanDurationMs: 2000,
    rulesApplied: 1,
    behaviorsDetected: 101,
  },
  generatedAt: '2026-07-03T10:00:02.000Z',
});

// Export the evidence items so tests can reference them
export { createManyEvidence };
export const manyEvidenceItemsList = manyEvidenceItems;
