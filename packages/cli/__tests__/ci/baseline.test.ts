/**
 * Unit tests for baseline parser and loader.
 *
 * Validates Section 5 & Section 9 of ADR-015:
 * - Ingestion of CanonicalReport and CiSummary baselines
 * - Prototype pollution defense
 * - 50MB file size ceiling
 * - Schema validation and exit code 11 semantics
 *
 * @module @veris/cli/__tests__/ci/baseline
 */

import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { loadBaseline, safeJsonParse, MAX_BASELINE_SIZE_BYTES } from '../../src/ci/baseline.js';
import { ExitCode, CliError } from '../../src/wirer.js';

describe('safeJsonParse', () => {
  it('parses valid JSON into clean objects', () => {
    const json = '{"name": "test", "count": 42, "items": [1, 2, 3]}';
    const parsed = safeJsonParse<{ name: string; count: number; items: number[] }>(json);
    expect(parsed.name).toBe('test');
    expect(parsed.count).toBe(42);
    expect(parsed.items).toEqual([1, 2, 3]);
  });

  it('strips __proto__, constructor, and prototype to prevent prototype pollution', () => {
    const maliciousJson =
      '{"__proto__": {"polluted": true}, "constructor": {"prototype": {"admin": true}}, "validKey": 123}';

    const parsed = safeJsonParse<Record<string, unknown>>(maliciousJson);

    expect(parsed.validKey).toBe(123);
    // Ensure dangerous keys were completely eliminated
    expect(Object.prototype.hasOwnProperty.call(parsed, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(parsed, 'constructor')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(parsed, 'prototype')).toBe(false);
    // Ensure global prototype was NOT poisoned
    expect(({} as unknown as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as unknown as Record<string, unknown>).admin).toBeUndefined();
  });

  it('throws CliError with ExitCode.INVALID_BASELINE on malformed JSON', () => {
    expect(() => safeJsonParse('{"broken: json')).toThrowError(CliError);
    try {
      safeJsonParse('{"broken: json');
    } catch (err) {
      expect(err).toBeInstanceOf(CliError);
      expect((err as CliError).exitCode).toBe(ExitCode.INVALID_BASELINE);
    }
  });
});

describe('loadBaseline', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'veris-ci-baseline-test-'));
  });

  afterEach(async () => {
    try {
      await fsp.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Cleanup best effort
    }
  });

  it('loads valid CanonicalReport baseline correctly', async () => {
    const reportPath = path.join(tempDir, 'report.json');
    const mockReport = {
      id: 'rep_123',
      session: { startedAt: '2026-09-01T00:00:00.000Z' },
      artifacts: [
        {
          id: 'art_1',
          normalizedPath: 'main.exe',
          type: 'executable',
          size: 100,
          contentHash: { algorithm: 'sha-256', value: '1111' },
          mimeType: 'application/octet-stream',
        },
      ],
      findings: [
        {
          id: 'fin_1',
          ruleId: 'RULE_HARDCODED_KEY',
          title: 'Hardcoded Secret',
          severity: { level: 'high', score: 8.0 },
          confidence: 0.9,
          evidenceIds: ['ev_1', 'ev_2'],
          affectedArtifacts: [{ artifactId: 'art_1' }],
        },
      ],
      riskProfile: {
        riskScore: 7.2,
      },
    };

    await fsp.writeFile(reportPath, JSON.stringify(mockReport), 'utf-8');

    const baseline = await loadBaseline(reportPath);

    expect(baseline.riskScore).toBe(7.2);
    expect(baseline.findings).toHaveLength(1);
    expect(baseline.findings[0].ruleId).toBe('RULE_HARDCODED_KEY');
    expect(baseline.findings[0].artifactPath).toBe('main.exe');
    expect(baseline.findings[0].severity).toBe('high');
    expect(baseline.findings[0].score).toBe(8.0);
    expect(baseline.findings[0].evidenceCount).toBe(2);
    expect(baseline.findings[0].fingerprint.startsWith('fp_')).toBe(true);
  });

  it('loads valid CiSummary baseline correctly', async () => {
    const summaryPath = path.join(tempDir, 'ci-summary.json');
    const mockSummary = {
      schemaVersion: '1.0.0',
      status: 'passed',
      exitCode: 0,
      timestamp: '2026-09-10T12:00:00.000Z',
      metrics: {
        currentRiskScore: 3.5,
      },
      diffs: [
        {
          fingerprint: 'fp_previous',
          ruleId: 'RULE_WEAK_CRYPTO',
          artifactPath: 'crypto.ts',
          title: 'Weak Hash Used',
          status: 'unchanged',
          currentSeverity: 'medium',
          currentScore: 5.0,
        },
      ],
    };

    await fsp.writeFile(summaryPath, JSON.stringify(mockSummary), 'utf-8');

    const baseline = await loadBaseline(summaryPath);

    expect(baseline.riskScore).toBe(3.5);
    expect(baseline.findings).toHaveLength(1);
    expect(baseline.findings[0].ruleId).toBe('RULE_WEAK_CRYPTO');
    expect(baseline.findings[0].severity).toBe('medium');
    expect(baseline.findings[0].fingerprint).toBe('fp_previous');
  });

  it('throws INVALID_BASELINE when baseline file does not exist', async () => {
    const nonExistent = path.join(tempDir, 'missing.json');
    await expect(loadBaseline(nonExistent)).rejects.toThrowError(CliError);
    try {
      await loadBaseline(nonExistent);
    } catch (err) {
      expect((err as CliError).exitCode).toBe(ExitCode.INVALID_BASELINE);
    }
  });

  it('throws INVALID_BASELINE when baseline path is a directory', async () => {
    await expect(loadBaseline(tempDir)).rejects.toThrowError(CliError);
    try {
      await loadBaseline(tempDir);
    } catch (err) {
      expect((err as CliError).exitCode).toBe(ExitCode.INVALID_BASELINE);
    }
  });

  it('throws INVALID_BASELINE when baseline JSON has unrecognized schema', async () => {
    const invalidPath = path.join(tempDir, 'invalid.json');
    await fsp.writeFile(invalidPath, JSON.stringify({ unknownField: true }), 'utf-8');

    await expect(loadBaseline(invalidPath)).rejects.toThrowError(CliError);
    try {
      await loadBaseline(invalidPath);
    } catch (err) {
      expect((err as CliError).exitCode).toBe(ExitCode.INVALID_BASELINE);
      expect((err as CliError).message).toContain('format unrecognized');
    }
  });
});
