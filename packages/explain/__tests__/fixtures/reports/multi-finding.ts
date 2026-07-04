/**
 * Fixture: Multi-finding report.
 *
 * A CanonicalReport with 3 findings, multiple evidence items across
 * different files, a behavior chain, and a full risk profile.
 *
 * This fixture is frozen and used to test:
 * - Evidence ordering by confidence DESC, severity DESC, path ASC, line ASC, ID ASC
 * - Token budget trimming
 * - Chain context building
 * - Risk context building
 *
 * @module @veris/explain/__tests__/fixtures/reports/multi-finding
 */

import type { CanonicalReport, Finding, Evidence, Artifact, BehaviorChain } from '@veris/core';

// ── Evidence Items (designed to test ordering) ──

export const evHighConfA: Evidence = {
  id: 'ev_high_conf_a',
  ruleId: 'secrets/aws-key',
  behaviorId: 'beh_001',
  findingId: 'fin_multi_001',
  sessionId: 'ses_multi_001',
  matchedProperties: {},
  matchDetail: { kind: 'regex', pattern: 'AKIA', severity: { level: 'critical', score: 9.0 } },
  confidence: 0.99,
};

export const evHighConfB: Evidence = {
  id: 'ev_high_conf_b',
  ruleId: 'secrets/aws-key',
  behaviorId: 'beh_001',
  findingId: 'fin_multi_001',
  sessionId: 'ses_multi_001',
  matchedProperties: {},
  matchDetail: { kind: 'regex', pattern: 'AKIA', severity: { level: 'critical', score: 9.0 } },
  confidence: 0.99,
};

export const evMedConf: Evidence = {
  id: 'ev_med_conf',
  ruleId: 'secrets/github-token',
  behaviorId: 'beh_002',
  findingId: 'fin_multi_002',
  sessionId: 'ses_multi_001',
  matchedProperties: {},
  matchDetail: { kind: 'regex', pattern: 'ghp_', severity: { level: 'high', score: 7.0 } },
  confidence: 0.85,
};

export const evLowConf: Evidence = {
  id: 'ev_low_conf',
  ruleId: 'misconfig/debug-enabled',
  behaviorId: 'beh_003',
  findingId: 'fin_multi_003',
  sessionId: 'ses_multi_001',
  matchedProperties: {},
  matchDetail: {
    kind: 'pattern',
    pattern: 'debug: true',
    severity: { level: 'medium', score: 5.0 },
  },
  confidence: 0.7,
};

export const evSameScoreDiffPath: Evidence = {
  id: 'ev_same_score_diff_path',
  ruleId: 'secrets/generic-key',
  behaviorId: 'beh_002',
  findingId: 'fin_multi_002',
  sessionId: 'ses_multi_001',
  matchedProperties: {},
  matchDetail: { kind: 'regex', pattern: 'key=', severity: { level: 'high', score: 7.0 } },
  confidence: 0.85,
};

// ── Findings ──

export const findingCritical: Finding = {
  id: 'fin_multi_001',
  sessionId: 'ses_multi_001',
  ruleId: 'secrets/aws-key',
  behaviorChainId: null,
  title: 'Hardcoded AWS Key',
  description: 'Found hardcoded AWS key.',
  severity: { level: 'critical', score: 9.5 },
  confidence: 0.95,
  evidenceIds: ['ev_high_conf_a', 'ev_high_conf_b'],
  affectedArtifacts: [
    {
      artifactId: 'art_multi_a',
      location: {
        startLine: 10,
        startColumn: 1,
        endLine: 10,
        endColumn: 30,
        offset: 100,
        length: 29,
      },
      relationship: 'primary',
    },
    {
      artifactId: 'art_multi_b',
      location: {
        startLine: 20,
        startColumn: 1,
        endLine: 20,
        endColumn: 30,
        offset: 200,
        length: 29,
      },
      relationship: 'primary',
    },
  ],
  taxonomyIds: ['CWE-798'],
  createdAt: '2026-07-03T10:00:00.000Z',
};

export const findingHigh: Finding = {
  id: 'fin_multi_002',
  sessionId: 'ses_multi_001',
  ruleId: 'secrets/github-token',
  behaviorChainId: 'bc_multi_001',
  title: 'Hardcoded GitHub Token',
  description: 'Found hardcoded GitHub token.',
  severity: { level: 'high', score: 7.0 },
  confidence: 0.85,
  evidenceIds: ['ev_med_conf', 'ev_same_score_diff_path'],
  affectedArtifacts: [
    {
      artifactId: 'art_multi_b',
      location: { startLine: 5, startColumn: 1, endLine: 5, endColumn: 45, offset: 50, length: 44 },
      relationship: 'primary',
    },
  ],
  taxonomyIds: ['CWE-798'],
  createdAt: '2026-07-03T10:00:01.000Z',
};

export const findingMedium: Finding = {
  id: 'fin_multi_003',
  sessionId: 'ses_multi_001',
  ruleId: 'misconfig/debug-enabled',
  behaviorChainId: null,
  title: 'Debug Mode Enabled',
  description: 'Debug mode enabled in production config.',
  severity: { level: 'medium', score: 5.0 },
  confidence: 0.7,
  evidenceIds: ['ev_low_conf'],
  affectedArtifacts: [
    {
      artifactId: 'art_multi_a',
      location: {
        startLine: 42,
        startColumn: 1,
        endLine: 42,
        endColumn: 20,
        offset: 500,
        length: 19,
      },
      relationship: 'primary',
    },
  ],
  taxonomyIds: ['CWE-489'],
  createdAt: '2026-07-03T10:00:02.000Z',
};

// ── Artifacts ──

export const artifactA: Artifact = {
  id: 'art_multi_a',
  sessionId: 'ses_multi_001',
  parentId: null,
  type: 'script',
  subType: 'TypeScript',
  originalPath: 'src/config.ts',
  normalizedPath: 'src/config.ts',
  size: 2048,
  contentHash: { algorithm: 'sha-256', value: 'abc' },
  mimeType: 'text/typescript',
  extractedAt: '2026-07-03T10:00:00.000Z',
  extractorId: 'ext_file',
};

export const artifactB: Artifact = {
  id: 'art_multi_b',
  sessionId: 'ses_multi_001',
  parentId: null,
  type: 'script',
  subType: 'TypeScript',
  originalPath: 'src/secrets.ts',
  normalizedPath: 'src/secrets.ts',
  size: 1024,
  contentHash: { algorithm: 'sha-256', value: 'def' },
  mimeType: 'text/typescript',
  extractedAt: '2026-07-03T10:00:00.000Z',
  extractorId: 'ext_file',
};

// ── Behavior Chain ──

export const testChain: BehaviorChain = {
  id: 'bc_multi_001',
  sessionId: 'ses_multi_001',
  relationshipType: 'sequential',
  behaviorIds: ['beh_001', 'beh_002'],
  findingIds: ['fin_multi_001', 'fin_multi_002'],
  description: 'Credentials found in multiple files indicating broader key leakage.',
  trustImpact: -0.4,
};

// ── Report ──

export const multiFindingReport: CanonicalReport = Object.freeze({
  id: 'rep_multi_001',
  session: {
    id: 'ses_multi_001',
    startedAt: '2026-07-03T10:00:00.000Z',
    completedAt: '2026-07-03T10:00:10.000Z',
    artifactsDiscovered: 2,
    artifactsAnalyzed: 2,
    exitCode: 0,
  },
  artifacts: [artifactA, artifactB],
  findings: [findingCritical, findingHigh, findingMedium],
  behaviorChains: [testChain],
  trustProfile: {
    id: 'tp_multi_001',
    sessionId: 'ses_multi_001',
    artifactId: 'art_multi_a',
    trustScore: 0.2,
    findingDensity: 0.05,
    severityBreakdown: { critical: 1, high: 1, medium: 1 },
    chainImpact: -0.4,
    computedAt: '2026-07-03T10:00:10.000Z',
  },
  riskProfile: {
    id: 'rp_multi_001',
    sessionId: 'ses_multi_001',
    trustProfileId: 'tp_multi_001',
    riskScore: 9.0,
    riskLevel: 'critical',
    maxSeverity: { level: 'critical', score: 9.5 },
    topFindings: ['fin_multi_001', 'fin_multi_002'],
    riskDrivers: [
      { findingId: 'fin_multi_001', contribution: 0.7, reason: 'AWS key exposure' },
      { findingId: 'fin_multi_002', contribution: 0.3, reason: 'GitHub token exposure' },
    ],
    computedAt: '2026-07-03T10:00:10.000Z',
  },
  summary: {
    totalArtifacts: 2,
    totalFindings: 3,
    findingsBySeverity: { critical: 1, high: 1, medium: 1 },
    findingsByCategory: { 'CWE-798': 2, 'CWE-489': 1 },
    riskScore: 9.0,
    trustScore: 0.2,
    scanDurationMs: 10000,
    rulesApplied: 3,
    behaviorsDetected: 3,
  },
  generatedAt: '2026-07-03T10:00:10.000Z',
});
