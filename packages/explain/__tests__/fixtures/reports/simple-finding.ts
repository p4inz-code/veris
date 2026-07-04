/**
 * Fixture: Simple finding report.
 *
 * A minimal CanonicalReport with a single finding, one evidence item,
 * one rule, one artifact, and a basic risk profile.
 *
 * This fixture is frozen and imported by multiple test files.
 *
 * @module @veris/explain/__tests__/fixtures/reports/simple-finding
 */

import type { CanonicalReport, Finding, Evidence, Artifact } from '@veris/core';

/** Simple evidence for the finding. */
export const testEvidence: Evidence = {
  id: 'ev_simple_001',
  ruleId: 'secrets/aws-key',
  behaviorId: 'beh_001',
  findingId: 'fin_simple_001',
  sessionId: 'ses_001',
  matchedProperties: { pattern: 'AKIA[0-9A-Z]{16}', value: 'AKIAIOSFODNN7EXAMPLE' },
  matchDetail: {
    kind: 'regex',
    pattern: 'AKIA[0-9A-Z]{16}',
    severity: { level: 'critical', score: 9.0 },
  },
  confidence: 0.98,
};

/** Simple finding for the fixture. */
export const testFinding: Finding = {
  id: 'fin_simple_001',
  sessionId: 'ses_001',
  ruleId: 'secrets/aws-key',
  behaviorChainId: null,
  title: 'Hardcoded AWS Access Key',
  description: 'A hardcoded AWS access key ID was detected in source code.',
  severity: { level: 'critical', score: 9.5 },
  confidence: 0.95,
  evidenceIds: ['ev_simple_001'],
  affectedArtifacts: [
    {
      artifactId: 'art_simple_001',
      location: {
        startLine: 42,
        startColumn: 5,
        endLine: 42,
        endColumn: 35,
        offset: 1024,
        length: 30,
      },
      relationship: 'primary',
    },
  ],
  taxonomyIds: ['CWE-798', 'OWASP-A2:2021'],
  createdAt: '2026-07-03T10:00:00.000Z',
};

/** Simple artifact for the fixture. */
export const testArtifact: Artifact = {
  id: 'art_simple_001',
  sessionId: 'ses_001',
  parentId: null,
  type: 'script',
  subType: 'TypeScript',
  originalPath: 'src/config.ts',
  normalizedPath: 'src/config.ts',
  size: 2048,
  contentHash: { algorithm: 'sha-256', value: 'abc123def456' },
  mimeType: 'text/typescript',
  extractedAt: '2026-07-03T10:00:01.000Z',
  extractorId: 'ext_file',
};

/** Simple canonical report fixture. */
export const simpleFindingReport: CanonicalReport = Object.freeze({
  id: 'rep_simple_001',
  session: {
    id: 'ses_001',
    startedAt: '2026-07-03T10:00:00.000Z',
    completedAt: '2026-07-03T10:00:05.000Z',
    artifactsDiscovered: 1,
    artifactsAnalyzed: 1,
    exitCode: 0,
  },
  artifacts: [testArtifact],
  findings: [testFinding],
  trustProfile: {
    id: 'tp_001',
    sessionId: 'ses_001',
    artifactId: 'art_simple_001',
    trustScore: 0.3,
    findingDensity: 0.01,
    severityBreakdown: { critical: 1 },
    computedAt: '2026-07-03T10:00:05.000Z',
  },
  riskProfile: {
    id: 'rp_001',
    sessionId: 'ses_001',
    trustProfileId: 'tp_001',
    riskScore: 8.5,
    riskLevel: 'critical',
    maxSeverity: { level: 'critical', score: 9.5 },
    topFindings: ['fin_simple_001'],
    riskDrivers: [
      {
        findingId: 'fin_simple_001',
        contribution: 0.95,
        reason: 'Hardcoded credential with high severity',
      },
    ],
    computedAt: '2026-07-03T10:00:05.000Z',
  },
  summary: {
    totalArtifacts: 1,
    totalFindings: 1,
    findingsBySeverity: { critical: 1 },
    findingsByCategory: { 'CWE-798': 1 },
    riskScore: 8.5,
    trustScore: 0.3,
    scanDurationMs: 5000,
    rulesApplied: 1,
    behaviorsDetected: 1,
  },
  generatedAt: '2026-07-03T10:00:05.000Z',
});
