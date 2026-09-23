/**
 * Unit tests for CI summary and GitHub Step Summary formatting.
 *
 * Validates Section 8 of ADR-015:
 * - ci-summary.json schema conformity
 * - GitHub Actions Markdown formatting
 * - Step summary emission
 *
 * @module @veris/cli/__tests__/ci/summary
 */

import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import type { CanonicalReport } from '@veris/core';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import {
  createCiSummary,
  renderCiStepSummaryMarkdown,
  writeCiSummary,
  writeGitHubStepSummary,
} from '../../src/ci/summary.js';
import type { CiGateResult, CiPolicy, FindingDiffResult } from '../../src/ci/types.js';

describe('createCiSummary & renderCiStepSummaryMarkdown', () => {
  const mockReport: CanonicalReport = {
    id: 'rep_test',
    session: {} as never,
    artifacts: [],
    findings: [
      {
        id: 'f1',
        sessionId: 's',
        ruleId: 'RULE_HARDCODED_KEY',
        behaviorChainId: null,
        title: 'Hardcoded API Key',
        description: 'Exposed secret',
        severity: { level: 'high', score: 8.0 },
        confidence: 0.9,
        evidenceIds: [],
        affectedArtifacts: [],
        taxonomyIds: [],
        createdAt: '2026-09-23T00:00:00.000Z',
      },
    ],
    trustProfile: {} as never,
    riskProfile: {
      id: 'rp_1',
      sessionId: 'sess_1',
      trustProfileId: 'tp_1',
      riskScore: 7.5,
      riskLevel: 'high',
      maxSeverity: { level: 'high', score: 8.0 },
      computedAt: '2026-09-23T00:00:00.000Z',
    },
    summary: { riskScore: 7.5 } as never,
    generatedAt: '2026-09-23T12:00:00.000Z',
  };

  const mockPolicy: CiPolicy = {
    failOn: 'high',
    failOnNew: true,
  };

  const mockGateResult: CiGateResult = {
    passed: false,
    exitCode: 10,
    evaluations: [
      {
        gate: 'severity_threshold',
        name: 'Severity Threshold (>= high)',
        passed: false,
        threshold: 'high',
        actual: 'high',
        details: '1 finding(s) met or exceeded severity threshold high',
        violatingItems: ['[high] RULE_HARDCODED_KEY: Hardcoded API Key'],
      },
    ],
    violations: [
      {
        gate: 'severity_threshold',
        name: 'Severity Threshold (>= high)',
        passed: false,
        threshold: 'high',
        actual: 'high',
        details: '1 finding(s) met or exceeded severity threshold high',
        violatingItems: ['[high] RULE_HARDCODED_KEY: Hardcoded API Key'],
      },
    ],
  };

  const mockDiffResult: FindingDiffResult = {
    totalCurrent: 1,
    totalBaseline: 0,
    newCount: 1,
    regressedCount: 0,
    evidenceChangedCount: 0,
    unchangedCount: 0,
    resolvedCount: 0,
    currentRiskScore: 7.5,
    baselineRiskScore: undefined,
    riskScoreDelta: 0,
    diffs: [
      {
        fingerprint: 'fp_123',
        ruleId: 'RULE_HARDCODED_KEY',
        artifactPath: 'config.ts',
        title: 'Hardcoded API Key',
        status: 'new',
        currentSeverity: 'high',
        currentScore: 8.0,
      },
    ],
  };

  it('builds canonical CiSummary with correct schemaVersion and metrics', () => {
    const summary = createCiSummary({
      target: './src',
      baselinePath: './baseline.json',
      policy: mockPolicy,
      gateResult: mockGateResult,
      diffResult: mockDiffResult,
      currentReport: mockReport,
      outputFiles: ['report.json', 'ci-summary.json'],
    });

    expect(summary.schemaVersion).toBe('1.0.0');
    expect(summary.status).toBe('failed');
    expect(summary.exitCode).toBe(10);
    expect(summary.target).toBe('./src');
    expect(summary.baselinePath).toBe('./baseline.json');
    expect(summary.metrics.currentRiskScore).toBe(7.5);
    expect(summary.metrics.newFindingCount).toBe(1);
    expect(summary.metrics.findingsBySeverity.high).toBe(1);
    expect(summary.outputFiles).toContain('ci-summary.json');
  });

  it('renders GitHub Actions markdown with status, tables, and violating findings', () => {
    const summary = createCiSummary({
      target: './src',
      baselinePath: './baseline.json',
      policy: mockPolicy,
      gateResult: mockGateResult,
      diffResult: mockDiffResult,
      currentReport: mockReport,
    });

    const markdown = renderCiStepSummaryMarkdown(summary);

    expect(markdown).toContain('## ❌ VERIS Security Gate Violation');
    expect(markdown).toContain('**Target:** `./src`');
    expect(markdown).toContain('| **Risk Score** | **7.5** |');
    expect(markdown).toContain('Severity Threshold (>= high)');
    expect(markdown).toContain('❌ Failed');
    expect(markdown).toContain('### 🆕 New Findings Introduced (1)');
    expect(markdown).toContain('RULE_HARDCODED_KEY');
    expect(markdown).toContain('Hardcoded API Key');
    expect(markdown).toContain('Offline-First Deterministic Security Engine');
  });
});

describe('writeCiSummary & writeGitHubStepSummary', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'veris-ci-summary-test-'));
  });

  afterEach(async () => {
    try {
      await fsp.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  });

  it('writes and validates ci-summary.json to target file path', async () => {
    const filePath = path.join(tempDir, 'sub', 'ci-summary.json');
    const mockSummary = {
      schemaVersion: '1.0.0',
      status: 'passed' as const,
      exitCode: 0,
      timestamp: '2026-09-23T00:00:00.000Z',
      target: '.',
      policy: {},
      gateResult: { passed: true, exitCode: 0, evaluations: [], violations: [] },
      metrics: {
        currentRiskScore: 0,
        riskScoreDelta: 0,
        currentFindingCount: 0,
        newFindingCount: 0,
        regressedFindingCount: 0,
        evidenceChangedFindingCount: 0,
        unchangedFindingCount: 0,
        resolvedFindingCount: 0,
        findingsBySeverity: {},
      },
      diffs: [],
      outputFiles: [],
    };

    await writeCiSummary(mockSummary, filePath);

    const content = await fsp.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.schemaVersion).toBe('1.0.0');
    expect(parsed.status).toBe('passed');
    expect(parsed.exitCode).toBe(0);
  });

  it('appends markdown summary to step summary file', async () => {
    const summaryFile = path.join(tempDir, 'step-summary.md');

    const result = await writeGitHubStepSummary('## First Summary', summaryFile);
    expect(result).toBe(true);

    await writeGitHubStepSummary('## Second Summary', summaryFile);

    const content = await fsp.readFile(summaryFile, 'utf-8');
    expect(content).toContain('## First Summary');
    expect(content).toContain('## Second Summary');
  });
});
