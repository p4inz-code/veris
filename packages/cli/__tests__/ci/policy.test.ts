/**
 * Unit tests for CI security policy gate evaluation.
 *
 * Validates Section 6 & Section 7 of ADR-015:
 * - failOn severity threshold checking
 * - failOnNew zero-tolerance gating
 * - maxNew threshold enforcement
 * - failOnRegressions enforcement
 * - maxRisk ceiling checks
 * - Plugin failure and quarantine gating
 * - Deterministic exit code assignments (0, 10, 13)
 *
 * @module @veris/cli/__tests__/ci/policy
 */

import type { CanonicalReport, Finding } from '@veris/core';
import { describe, expect, it } from 'vitest';

import { evaluateCiPolicy } from '../../src/ci/policy.js';
import type { CiPolicy, FindingDiffResult } from '../../src/ci/types.js';
import { ExitCode } from '../../src/wirer.js';

function createMockReport(findings: Finding[], riskScore = 3.0): CanonicalReport {
  return {
    id: 'rep_1',
    session: {} as never,
    artifacts: [],
    findings,
    trustProfile: {} as never,
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
      riskScore,
    } as never,
    generatedAt: '2026-09-23T00:00:00.000Z',
  };
}

function createMockDiffResult(overrides: Partial<FindingDiffResult> = {}): FindingDiffResult {
  return {
    totalCurrent: 1,
    totalBaseline: 1,
    newCount: 0,
    regressedCount: 0,
    evidenceChangedCount: 0,
    unchangedCount: 1,
    resolvedCount: 0,
    currentRiskScore: 3.0,
    baselineRiskScore: 3.0,
    riskScoreDelta: 0,
    diffs: [],
    ...overrides,
  };
}

describe('evaluateCiPolicy', () => {
  const lowFinding: Finding = {
    id: 'f1',
    sessionId: 's',
    ruleId: 'R_LOW',
    behaviorChainId: null,
    title: 'Low Finding',
    description: '',
    severity: { level: 'low', score: 2.0 },
    confidence: 0.8,
    evidenceIds: [],
    affectedArtifacts: [],
    taxonomyIds: [],
    createdAt: '',
  };

  const highFinding: Finding = {
    id: 'f2',
    sessionId: 's',
    ruleId: 'R_HIGH',
    behaviorChainId: null,
    title: 'High Finding',
    description: '',
    severity: { level: 'high', score: 8.0 },
    confidence: 0.9,
    evidenceIds: [],
    affectedArtifacts: [],
    taxonomyIds: [],
    createdAt: '',
  };

  it('passes when no policies are violated (ExitCode 0)', () => {
    const report = createMockReport([lowFinding], 2.0);
    const diff = createMockDiffResult();
    const policy: CiPolicy = {
      failOn: 'high',
      failOnNew: true,
      maxRisk: 5.0,
    };

    const result = evaluateCiPolicy(policy, report, diff);

    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.violations).toHaveLength(0);
    expect(result.evaluations).toHaveLength(3);
  });

  it('fails with GATE_VIOLATION (ExitCode 10) when finding severity meets or exceeds failOn', () => {
    const report = createMockReport([highFinding], 8.0);
    const diff = createMockDiffResult();
    const policy: CiPolicy = { failOn: 'high' };

    const result = evaluateCiPolicy(policy, report, diff);

    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(ExitCode.GATE_VIOLATION);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].gate).toBe('severity_threshold');
    expect(result.violations[0].actual).toBe('high');
  });

  it('fails with GATE_VIOLATION (ExitCode 10) when new findings are introduced with failOnNew', () => {
    const report = createMockReport([lowFinding], 2.0);
    const diff = createMockDiffResult({
      newCount: 1,
      diffs: [
        {
          fingerprint: 'fp_new',
          ruleId: 'R_LOW',
          artifactPath: 'index.ts',
          title: 'Low Finding',
          status: 'new',
          currentSeverity: 'low',
        },
      ],
    });
    const policy: CiPolicy = { failOnNew: true };

    const result = evaluateCiPolicy(policy, report, diff);

    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(ExitCode.GATE_VIOLATION);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].gate).toBe('fail_on_new');
    expect(result.violations[0].details).toContain('1 new finding(s) introduced');
  });

  it('enforces maxNew threshold ceiling', () => {
    const report = createMockReport([], 0.0);
    const diff = createMockDiffResult({ newCount: 3 });

    // Under limit -> pass
    const passPolicy: CiPolicy = { maxNew: 5 };
    expect(evaluateCiPolicy(passPolicy, report, diff).passed).toBe(true);

    // Over limit -> fail
    const failPolicy: CiPolicy = { maxNew: 2 };
    const failResult = evaluateCiPolicy(failPolicy, report, diff);
    expect(failResult.passed).toBe(false);
    expect(failResult.exitCode).toBe(ExitCode.GATE_VIOLATION);
    expect(failResult.violations[0].gate).toBe('max_new');
  });

  it('fails with GATE_VIOLATION (ExitCode 10) on finding or risk regressions', () => {
    const report = createMockReport([], 6.0);
    const diff = createMockDiffResult({
      regressedCount: 1,
      baselineRiskScore: 4.0,
      currentRiskScore: 6.0,
      riskScoreDelta: 2.0,
      diffs: [
        {
          fingerprint: 'fp_regressed',
          ruleId: 'R_REG',
          artifactPath: 'file.js',
          title: 'Regressed',
          status: 'regressed',
          baselineSeverity: 'low',
          currentSeverity: 'high',
        },
      ],
    });
    const policy: CiPolicy = { failOnRegressions: true };

    const result = evaluateCiPolicy(policy, report, diff);

    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(ExitCode.GATE_VIOLATION);
    expect(result.violations[0].gate).toBe('fail_on_regressions');
    expect(result.violations[0].details).toContain('Security regression detected');
  });

  it('fails with GATE_VIOLATION (ExitCode 10) when maxRisk is exceeded', () => {
    const report = createMockReport([], 8.5);
    const diff = createMockDiffResult({ currentRiskScore: 8.5 });
    const policy: CiPolicy = { maxRisk: 7.0 };

    const result = evaluateCiPolicy(policy, report, diff);

    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(ExitCode.GATE_VIOLATION);
    expect(result.violations[0].gate).toBe('max_risk');
  });

  it('fails with PLUGIN_ERROR (ExitCode 13) when plugin is quarantined and failOnPluginQuarantine is set', () => {
    const report = createMockReport([], 2.0);
    const diff = createMockDiffResult();
    const policy: CiPolicy = { failOnPluginQuarantine: true };

    const result = evaluateCiPolicy(policy, report, diff, {
      quarantinedPlugins: ['custom-crasher-plugin'],
    });

    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(ExitCode.PLUGIN_ERROR);
    expect(result.violations[0].gate).toBe('plugin_health');
    expect(result.violations[0].details).toContain('custom-crasher-plugin');
  });
});
