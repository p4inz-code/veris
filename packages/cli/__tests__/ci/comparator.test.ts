/**
 * Unit tests for finding comparator and diff engine.
 *
 * Validates Section 5 of ADR-015:
 * - Deterministic categorization (unchanged, new, regressed, evidence_changed, resolved)
 * - Severity and risk score delta metrics
 * - Deterministic output ordering
 *
 * @module @veris/cli/__tests__/ci/comparator
 */

import type { CanonicalReport, Finding } from '@veris/core';
import { describe, expect, it } from 'vitest';

import { compareFindings } from '../../src/ci/comparator.js';
import { computeFindingFingerprint } from '../../src/ci/fingerprint.js';
import type { BaselineData } from '../../src/ci/types.js';

function createMockReport(findings: Finding[], riskScore = 4.0): CanonicalReport {
  return {
    id: 'rep_test',
    session: {
      id: 'sess_1',
      schemaVersion: '1.0.0',
      engineVersion: '1.0.0',
      startedAt: '2026-09-23T00:00:00.000Z',
      completedAt: '2026-09-23T00:00:00.000Z',
      durationMs: 100,
      config: {},
      environment: { os: 'linux', arch: 'x64', runtimeVersion: '20', engineVersion: '1.0.0' },
      artifactCount: 1,
      findingCount: findings.length,
      status: 'completed',
    },
    artifacts: [
      {
        id: 'art_1',
        sessionId: 'sess_1',
        parentId: null,
        type: 'file',
        normalizedPath: 'src/file.ts',
        size: 500,
        contentHash: { algorithm: 'sha-256', value: '1111' },
        mimeType: 'text/typescript',
      },
    ],
    findings,
    trustProfile: {
      id: 'tp_1',
      sessionId: 'sess_1',
      artifactId: 'art_1',
      trustScore: 0.8,
      findingDensity: 1.0,
      severityBreakdown: {},
      computedAt: '2026-09-23T00:00:00.000Z',
    },
    riskProfile: {
      id: 'rp_1',
      sessionId: 'sess_1',
      trustProfileId: 'tp_1',
      riskScore,
      riskLevel: 'medium',
      maxSeverity: { level: 'medium', score: 5.0 },
      computedAt: '2026-09-23T00:00:00.000Z',
    },
    summary: {
      totalArtifacts: 1,
      totalFindings: findings.length,
      findingsBySeverity: {},
      findingsByCategory: {} as never,
      riskScore,
      trustScore: 0.8,
      scanDurationMs: 100,
      rulesApplied: 5,
      behaviorsDetected: 2,
    },
    generatedAt: '2026-09-23T00:00:00.000Z',
  };
}

describe('compareFindings', () => {
  const findingA: Finding = {
    id: 'fin_a',
    sessionId: 'sess_1',
    ruleId: 'RULE_A',
    behaviorChainId: null,
    title: 'Finding A',
    description: 'Description A',
    severity: { level: 'low', score: 2.0 },
    confidence: 0.8,
    evidenceIds: ['ev_1'],
    affectedArtifacts: [
      {
        artifactId: 'art_1',
        location: { startLine: 1, startColumn: 0, endLine: 1, endColumn: 0, offset: 0, length: 0 },
      },
    ],
    taxonomyIds: [],
    createdAt: '2026-09-23T00:00:00.000Z',
  };

  const findingB: Finding = {
    id: 'fin_b',
    sessionId: 'sess_1',
    ruleId: 'RULE_B',
    behaviorChainId: null,
    title: 'Finding B',
    description: 'Description B',
    severity: { level: 'medium', score: 5.0 },
    confidence: 0.8,
    evidenceIds: ['ev_2'],
    affectedArtifacts: [
      {
        artifactId: 'art_1',
        location: { startLine: 1, startColumn: 0, endLine: 1, endColumn: 0, offset: 0, length: 0 },
      },
    ],
    taxonomyIds: [],
    createdAt: '2026-09-23T00:00:00.000Z',
  };

  it('handles null baseline by treating findings as initial inventory', () => {
    const report = createMockReport([findingA, findingB], 3.0);
    const result = compareFindings(report, null);

    expect(result.totalCurrent).toBe(2);
    expect(result.totalBaseline).toBe(0);
    expect(result.newCount).toBe(0);
    expect(result.unchangedCount).toBe(2);
    expect(result.regressedCount).toBe(0);
    expect(result.resolvedCount).toBe(0);
    expect(result.riskScoreDelta).toBe(0);
  });

  it('detects new findings introduced in current scan', () => {
    const report = createMockReport([findingA, findingB], 4.5);

    // Baseline only had findingA
    const artifactsMap = new Map(report.artifacts.map((a) => [a.id, a]));
    const fpA = computeFindingFingerprint(findingA, artifactsMap);
    const baseline: BaselineData = {
      sourcePath: 'baseline.json',
      riskScore: 2.0,
      findings: [
        {
          fingerprint: fpA.hash,
          ruleId: findingA.ruleId,
          artifactPath: fpA.artifactPath,
          title: findingA.title,
          severity: 'low',
          score: 2.0,
          confidence: 0.8,
          evidenceCount: 1,
        },
      ],
    };

    const result = compareFindings(report, baseline);

    expect(result.totalCurrent).toBe(2);
    expect(result.totalBaseline).toBe(1);
    expect(result.newCount).toBe(1);
    expect(result.unchangedCount).toBe(1);
    expect(result.resolvedCount).toBe(0);
    expect(result.riskScoreDelta).toBe(2.5); // 4.5 - 2.0

    const newEntry = result.diffs.find((d) => d.status === 'new');
    expect(newEntry).toBeDefined();
    expect(newEntry?.ruleId).toBe('RULE_B');
  });

  it('detects severity regressions when a finding worsens', () => {
    // Current finding has regressed from medium to high
    const regressedFinding: Finding = {
      ...findingA,
      severity: { level: 'high', score: 8.5 },
    };

    const report = createMockReport([regressedFinding], 8.5);

    const artifactsMap = new Map(report.artifacts.map((a) => [a.id, a]));
    const fpA = computeFindingFingerprint(findingA, artifactsMap);
    const baseline: BaselineData = {
      sourcePath: 'baseline.json',
      riskScore: 2.0,
      findings: [
        {
          fingerprint: fpA.hash,
          ruleId: findingA.ruleId,
          artifactPath: fpA.artifactPath,
          title: findingA.title,
          severity: 'low',
          score: 2.0,
          confidence: 0.8,
          evidenceCount: 1,
        },
      ],
    };

    const result = compareFindings(report, baseline);

    expect(result.regressedCount).toBe(1);
    expect(result.unchangedCount).toBe(0);
    expect(result.newCount).toBe(0);

    const regressedEntry = result.diffs.find((d) => d.status === 'regressed');
    expect(regressedEntry?.baselineSeverity).toBe('low');
    expect(regressedEntry?.currentSeverity).toBe('high');
    expect(regressedEntry?.changeDetails).toContain('Severity regressed from low');
  });

  it('detects resolved findings that no longer appear in current scan', () => {
    // Current scan has zero findings!
    const report = createMockReport([], 0.0);

    const fpA = computeFindingFingerprint(findingA);
    const baseline: BaselineData = {
      sourcePath: 'baseline.json',
      riskScore: 2.0,
      findings: [
        {
          fingerprint: fpA.hash,
          ruleId: findingA.ruleId,
          artifactPath: fpA.artifactPath,
          title: findingA.title,
          severity: 'low',
          score: 2.0,
          confidence: 0.8,
          evidenceCount: 1,
        },
      ],
    };

    const result = compareFindings(report, baseline);

    expect(result.totalCurrent).toBe(0);
    expect(result.totalBaseline).toBe(1);
    expect(result.resolvedCount).toBe(1);
    expect(result.newCount).toBe(0);
    expect(result.riskScoreDelta).toBe(-2.0); // 0.0 - 2.0

    const resolvedEntry = result.diffs.find((d) => d.status === 'resolved');
    expect(resolvedEntry).toBeDefined();
    expect(resolvedEntry?.ruleId).toBe('RULE_A');
    expect(resolvedEntry?.status).toBe('resolved');
  });
});
