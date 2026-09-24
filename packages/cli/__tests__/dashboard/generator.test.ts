/**
 * Tests for dashboard view model and HTML artifact generator.
 *
 * @module @veris/cli/__tests__/dashboard/generator.test
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { CanonicalReport } from '@veris/core';
import {
  generateDashboard,
  loadReportSafely,
  buildDashboardViewModel,
  MAX_REPORT_SIZE_BYTES,
} from '../../src/dashboard/generator.js';

describe('Dashboard Generator', () => {
  let tmpDir: string;
  let sampleReport: CanonicalReport;
  let reportFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'veris-dashboard-test-'));
    sampleReport = {
      id: 'rep_test_123',
      schemaVersion: '1.0.0',
      computedAt: new Date().toISOString(),
      findings: [
        {
          id: 'fin_1',
          ruleId: 'rule_cred_leak',
          title: 'Hardcoded Secret',
          description: 'A secret key was detected in plaintext.',
          severity: 'critical',
          confidence: 0.95,
          category: 'credential-access',
          cwe: ['CWE-798'],
          mitre: ['T1552'],
          remediation: 'Move secrets to an environment vault.',
          references: ['https://cwe.mitre.org/data/definitions/798.html'],
          evidence: [
            {
              id: 'evi_1',
              type: 'file-content',
              source: 'src/config.json',
              location: { path: 'src/config.json', line: 12 },
              snippet: 'apiKey = "AKIAIOSFODNN7EXAMPLE"',
              relevance: 'Hardcoded AWS credential',
            },
          ],
        },
        {
          id: 'fin_2',
          ruleId: 'rule_eval_call',
          title: 'Dynamic Code Execution',
          description: 'Use of eval is forbidden.',
          severity: 'high',
          confidence: 0.85,
          category: 'execution',
          cwe: ['CWE-95'],
          remediation: 'Use a safe JSON parser instead.',
          evidence: [],
        },
      ],
      artifacts: [
        {
          id: 'art_1',
          path: 'src/config.json',
          type: 'json',
          sizeBytes: 1024,
          sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        },
      ],
      risk: {
        score: 82,
        level: 'CRITICAL',
        confidence: 0.9,
      },
      trust: {
        score: 35,
        level: 'LOW',
      },
      summary: {
        targetPath: '/workspaces/test-app',
        durationMs: 1420,
        totalArtifacts: 1,
        totalFindings: 2,
      },
    } as unknown as CanonicalReport;

    reportFile = path.join(tmpDir, 'report.json');
    fs.writeFileSync(reportFile, JSON.stringify(sampleReport, null, 2), 'utf-8');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe('loadReportSafely', () => {
    it('successfully loads a valid canonical report', () => {
      const loaded = loadReportSafely(reportFile);
      expect(loaded.id).toBe('rep_test_123');
      expect(loaded.findings).toHaveLength(2);
    });

    it('throws error when file does not exist', () => {
      expect(() => loadReportSafely(path.join(tmpDir, 'nonexistent.json'))).toThrow(
        /Report file not found/,
      );
    });

    it('throws error when JSON is invalid', () => {
      const badFile = path.join(tmpDir, 'corrupt.json');
      fs.writeFileSync(badFile, '{ bad json ...', 'utf-8');
      expect(() => loadReportSafely(badFile)).toThrow(/Failed to parse report JSON/);
    });

    it('throws error when report is missing required fields', () => {
      const invalidFile = path.join(tmpDir, 'invalid.json');
      fs.writeFileSync(invalidFile, JSON.stringify({ name: 'not-a-report' }), 'utf-8');
      expect(() => loadReportSafely(invalidFile)).toThrow(/missing required "id" or "findings"/);
    });
  });

  describe('buildDashboardViewModel', () => {
    it('computes correct metric aggregates', () => {
      const vm = buildDashboardViewModel(sampleReport);
      expect(vm.totalFindings).toBe(2);
      expect(vm.severityCounts.critical).toBe(1);
      expect(vm.severityCounts.high).toBe(1);
      expect(vm.severityCounts.medium).toBe(0);
      expect(vm.riskScore).toBe(82);
      expect(vm.riskLevel).toBe('CRITICAL');
      expect(vm.trustScore).toBe(35);
      expect(vm.evidenceCount).toBe(1);
      expect(vm.artifactCount).toBe(1);
      expect(vm.targetPath).toBe('/workspaces/test-app');
      expect(vm.durationFormatted).toBe('1.42s');
    });
  });

  describe('generateDashboard', () => {
    it('generates a complete HTML string with CSP and finding data', async () => {
      const res = await generateDashboard({ reportPath: reportFile });
      expect(res.html).toContain('<!DOCTYPE html>');
      expect(res.html).toContain('Content-Security-Policy');
      expect(res.html).toContain('Hardcoded Secret');
      expect(res.html).toContain('Dynamic Code Execution');
      expect(res.html).toContain('CRITICAL');
      expect(res.html).toContain('82');
      expect(res.outputPath).toBeUndefined();
    });

    it('writes HTML artifact to output path when requested', async () => {
      const outHtml = path.join(tmpDir, 'dashboard.html');
      const res = await generateDashboard({
        reportPath: reportFile,
        output: outHtml,
      });

      expect(res.outputPath).toBe(outHtml);
      expect(fs.existsSync(outHtml)).toBe(true);
      const content = fs.readFileSync(outHtml, 'utf-8');
      expect(content).toContain('VERIS Investigation Dashboard');
      expect(content).toContain('AKIAIOSFODNN7EXAMPLE');
    });
  });
});
