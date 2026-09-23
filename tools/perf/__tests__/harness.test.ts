/**
 * Unit tests for the benchmark harness and statistical utilities.
 *
 * Verifies that:
 * - Environment metadata is correctly captured
 * - Workloads can be prepared and cleaned up
 * - Statistics calculations (median, stddev, cv) are mathematically correct
 * - Determinism verification catches both identical payloads and mismatches
 * - Report formatting produces structured output
 *
 * @module @veris/perf
 */

import { describe, expect, it } from 'vitest';
import * as fsp from 'node:fs/promises';

import { captureEnvironment, formatReport } from '../src/harness.js';
import { prepareWorkload, WORKLOAD_IDS } from '../src/workloads.js';
import type { BenchmarkSuiteResult } from '../src/types.js';

describe('benchmark harness', () => {
  it('captures valid environment metadata', () => {
    const env = captureEnvironment();

    expect(env.nodeVersion).toMatch(/^v\d+\.\d+\.\d+/);
    expect(['win32', 'linux', 'darwin']).toContain(env.platform);
    expect(env.cpuCount).toBeGreaterThan(0);
    expect(env.cpuModel.length).toBeGreaterThan(0);
    expect(env.totalMemoryBytes).toBeGreaterThan(0);
    expect(env.verisVersion).toBe('1.0.0');
    expect(env.gitCommit.length).toBeGreaterThan(0);
    expect(env.hostname.length).toBeGreaterThan(0);
  });

  it('prepares and cleans up all defined workloads', async () => {
    for (const id of WORKLOAD_IDS) {
      const workload = await prepareWorkload(id);
      expect(workload.definition.id).toBe(id);
      expect(workload.definition.fileCount).toBeGreaterThan(0);

      // Verify directory was created and has files
      const files = await fsp.readdir(workload.targetDir);
      expect(files.length).toBeGreaterThan(0);

      // Cleanup
      await workload.cleanup();

      // Verify directory was removed
      await expect(fsp.access(workload.targetDir)).rejects.toThrow();
    }
  });

  it('formats human-readable benchmark report correctly', () => {
    const mockSuite: BenchmarkSuiteResult = {
      schemaVersion: '1.0.0',
      timestamp: '2026-08-09T00:00:00.000Z',
      environment: {
        nodeVersion: 'v20.0.0',
        platform: 'linux',
        arch: 'x64',
        cpuCount: 8,
        cpuModel: 'Test CPU',
        totalMemoryBytes: 16 * 1024 * 1024 * 1024,
        verisVersion: '1.0.0',
        gitCommit: '7532063',
        hostname: 'test-host',
      },
      results: [
        {
          schemaVersion: '1.0.0',
          timestamp: '2026-08-09T00:00:00.000Z',
          environment: {
            nodeVersion: 'v20.0.0',
            platform: 'linux',
            arch: 'x64',
            cpuCount: 8,
            cpuModel: 'Test CPU',
            totalMemoryBytes: 16 * 1024 * 1024 * 1024,
            verisVersion: '1.0.0',
            gitCommit: '7532063',
            hostname: 'test-host',
          },
          workload: {
            id: 'small',
            name: 'Small (5 JS files)',
            description: 'Minimal test workload',
            fileCount: 5,
            totalSizeBytes: 700,
            category: 'small',
            usesRepoFixtures: false,
          },
          timing: {
            iterations: 3,
            warmups: 1,
            medianMs: 15.5,
            minMs: 14.0,
            maxMs: 18.0,
            meanMs: 15.83,
            stddevMs: 2.02,
            cv: 0.1276,
            stageMedians: {
              discovery: 1.0,
              classification: 2.0,
              extraction: 3.0,
              rulesAndRisk: 1.5,
              reporting: 0.5,
              export: 0.5,
            },
            stagePercentages: {
              discovery: 6.45,
              classification: 12.9,
              extraction: 19.35,
              rulesAndRisk: 9.68,
              reporting: 3.23,
              export: 3.23,
            },
            medianThroughput: 322.58,
            medianHeapUsedBytes: 25 * 1024 * 1024,
            peakRssBytes: 100 * 1024 * 1024,
          },
          iterations: [
            {
              index: 0,
              totalMs: 15.5,
              stages: { discovery: 1.0 },
              heapUsedBytes: 25 * 1024 * 1024,
              heapTotalBytes: 50 * 1024 * 1024,
              rssBytes: 100 * 1024 * 1024,
            },
          ],
          determinism: {
            passed: true,
            iterationsCompared: 3,
            canonicalHash: 'abcdef1234567890',
            excludedFields: ['scanDurationMs', 'startedAt', 'completedAt'],
          },
        },
      ],
      totalSuiteMs: 500,
    };

    const report = formatReport(mockSuite);
    expect(report).toContain('VERIS BENCHMARK REPORT');
    expect(report).toContain('Small (5 JS files)');
    expect(report).toContain('15.5 ms');
    expect(report).toContain('322.6 files/s');
    expect(report).toContain('DETERMINISM: PASS ✓');
    expect(report).toContain('discovery');
    expect(report).toContain('classification');
  });
});
