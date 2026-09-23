/**
 * VERIS Benchmark Harness — deterministic benchmark runner.
 *
 * Runs the real VERIS scan pipeline against prepared workloads, measuring
 * high-resolution timing for each pipeline stage, verifying determinism
 * across repeated iterations, and producing machine-readable JSON results.
 *
 * Design decisions:
 * - Uses the real `runScan` function from @veris/cli (not mocked)
 * - Uses `performance.now()` for high-resolution timing (consistent with
 *   the rest of the VERIS codebase which uses performance.now)
 * - Determinism verification strips runtime metadata and compares canonical
 *   analysis payloads (same approach as scan-determinism.test.ts)
 * - Memory is sampled via `process.memoryUsage()` at iteration boundaries
 * - No external dependencies beyond the VERIS workspace
 *
 * @module @veris/perf
 */

import { createHash } from 'node:crypto';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import type {
  BenchmarkEnvironment,
  BenchmarkResult,
  BenchmarkSuiteResult,
  DeterminismResult,
  IterationTiming,
  TimingStats,
} from './types.js';
import { BENCHMARK_SCHEMA_VERSION } from './types.js';
import type { PreparedWorkload, WorkloadId } from './workloads.js';
import { prepareWorkload, WORKLOAD_IDS } from './workloads.js';
import { measureStageTimings } from './stages.js';

// ── Constants ──

/** Fixed timestamp for deterministic scan output (same as scan-determinism.test.ts). */
const DETERMINISTIC_TIMESTAMP = '2026-08-09T00:00:00.000Z';

/** Runtime metadata fields to exclude from determinism comparison. */
const RUNTIME_METADATA_FIELDS = new Set(['scanDurationMs', 'startedAt', 'completedAt']);

/** Default number of warmup iterations. */
const DEFAULT_WARMUPS = 1;

/** Default number of measured iterations. */
const DEFAULT_ITERATIONS = 3;

// ── Environment Capture ──

// Pre-import child_process at module level for sync usage
import { execSync as nodeExecSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

function getScanModuleUrl(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = path.dirname(thisFile);
  const scanPath = path.resolve(thisDir, '../../../packages/cli/src/commands/scan.js');
  return pathToFileURL(scanPath).href;
}

function execSyncCmd(cmd: string): string {
  try {
    return (nodeExecSync(cmd, { encoding: 'utf-8', timeout: 5000 }) as string).trim();
  } catch {
    return 'unknown';
  }
}

export function captureEnvironment(): BenchmarkEnvironment {
  const cpus = os.cpus();
  return {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cpuCount: cpus.length,
    cpuModel: cpus[0]?.model ?? 'unknown',
    totalMemoryBytes: os.totalmem(),
    verisVersion: getVerisVersion(),
    gitCommit: execSyncCmd('git rev-parse --short HEAD'),
    hostname: os.hostname(),
  };
}

function getVerisVersion(): string {
  try {
    const thisFile = fileURLToPath(import.meta.url);
    const thisDir = path.dirname(thisFile);
    // Try multiple possible relative paths from tools/perf/src/ to packages/cli/
    const candidates = [
      path.resolve(thisDir, '../../../packages/cli/package.json'),
      path.resolve(thisDir, '../../packages/cli/package.json'),
    ];
    for (const p of candidates) {
      try {
        const content = readFileSync(p, 'utf-8');
        return JSON.parse(content).version ?? 'unknown';
      } catch {
        continue;
      }
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

// ── Determinism Verification ──

/**
 * Recursively strip runtime metadata from a parsed report.
 * Identical to the function in scan-determinism.test.ts.
 */
function withoutRuntimeMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutRuntimeMetadata);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (RUNTIME_METADATA_FIELDS.has(key)) continue;
      out[key] = withoutRuntimeMetadata(child);
    }
    return out;
  }
  return value;
}

function hashCanonicalPayload(report: unknown): string {
  const canonical = withoutRuntimeMetadata(report);
  const json = JSON.stringify(canonical, null, 0);
  return createHash('sha256').update(json).digest('hex');
}

function verifyDeterminism(reports: unknown[]): DeterminismResult {
  if (reports.length < 2) {
    const hash = reports.length === 1 ? hashCanonicalPayload(reports[0]) : '';
    return {
      passed: true,
      iterationsCompared: reports.length,
      canonicalHash: hash,
      excludedFields: [...RUNTIME_METADATA_FIELDS],
    };
  }

  const baselineHash = hashCanonicalPayload(reports[0]);
  for (let i = 1; i < reports.length; i++) {
    const iterHash = hashCanonicalPayload(reports[i]);
    if (iterHash !== baselineHash) {
      return {
        passed: false,
        iterationsCompared: reports.length,
        canonicalHash: baselineHash,
        excludedFields: [...RUNTIME_METADATA_FIELDS],
        mismatchDetail: `Iteration ${i} hash ${iterHash} differs from baseline ${baselineHash}`,
      };
    }
  }

  return {
    passed: true,
    iterationsCompared: reports.length,
    canonicalHash: baselineHash,
    excludedFields: [...RUNTIME_METADATA_FIELDS],
  };
}

// ── Statistics ──

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1));
}

function computeTimingStats(
  iterations: IterationTiming[],
  warmups: number,
  fileCount: number,
): TimingStats {
  const totals = iterations.map((it) => it.totalMs);
  const medianTotal = median(totals);

  // Compute per-stage medians
  const stageNames = new Set<string>();
  for (const it of iterations) {
    for (const name of Object.keys(it.stages)) {
      stageNames.add(name);
    }
  }

  const stageMedians: Record<string, number> = {};
  const stagePercentages: Record<string, number> = {};
  for (const name of stageNames) {
    const values = iterations.map((it) => it.stages[name] ?? 0);
    const med = median(values);
    stageMedians[name] = Math.round(med * 100) / 100;
    stagePercentages[name] = medianTotal > 0 ? Math.round((med / medianTotal) * 10000) / 100 : 0;
  }

  const heapValues = iterations.map((it) => it.heapUsedBytes);
  const rssValues = iterations.map((it) => it.rssBytes);
  const sd = stddev(totals);
  const mn = mean(totals);

  return {
    iterations: iterations.length,
    warmups,
    medianMs: Math.round(medianTotal * 100) / 100,
    minMs: Math.round(Math.min(...totals) * 100) / 100,
    maxMs: Math.round(Math.max(...totals) * 100) / 100,
    meanMs: Math.round(mn * 100) / 100,
    stddevMs: Math.round(sd * 100) / 100,
    cv: mn > 0 ? Math.round((sd / mn) * 10000) / 10000 : 0,
    stageMedians,
    stagePercentages,
    medianThroughput:
      medianTotal > 0 ? Math.round((fileCount / (medianTotal / 1000)) * 100) / 100 : 0,
    medianHeapUsedBytes: median(heapValues),
    peakRssBytes: Math.max(...rssValues),
  };
}

// ── Single Iteration Runner ──

interface IterationResult {
  timing: IterationTiming;
  report: unknown;
}

async function runSingleIteration(
  targetDir: string,
  outputDir: string,
  index: number,
): Promise<IterationResult> {
  // Dynamic import to avoid loading the full CLI at module parse time
  const { runScan } = await import(/* webpackIgnore: true */ getScanModuleUrl());

  // Clean output directory
  await fsp.rm(outputDir, { recursive: true, force: true }).catch(() => {});
  await fsp.mkdir(outputDir, { recursive: true });

  // Force GC if available to reduce noise
  if (typeof globalThis.gc === 'function') {
    globalThis.gc();
  }

  // Silence stdout during runScan to prevent summary output from polluting benchmark report
  const origStdoutWrite = process.stdout.write;
  process.stdout.write = (() => true) as typeof process.stdout.write;

  let exitCode = 0;
  const startTime = performance.now();
  try {
    const result = await runScan({
      target: targetDir,
      progress: 'silent',
      computedAt: DETERMINISTIC_TIMESTAMP,
      format: ['json'],
      output: outputDir,
      silent: true,
    });
    exitCode = result.exitCode;
  } finally {
    process.stdout.write = origStdoutWrite;
  }

  const totalMs = performance.now() - startTime;

  if (exitCode !== 0) {
    throw new Error(`Scan failed with exit code ${exitCode}`);
  }

  // Read generated report
  const reportPath = path.join(outputDir, 'report.json');
  const reportContent = await fsp.readFile(reportPath, 'utf-8');
  const report = JSON.parse(reportContent) as unknown;

  // Measure granular stage timings
  let stages: Record<string, number> = {};
  try {
    stages = await measureStageTimings(targetDir, DETERMINISTIC_TIMESTAMP);
  } catch {
    // Stage timings are best-effort
  }

  // Memory snapshot
  const mem = process.memoryUsage();

  return {
    timing: {
      index,
      totalMs: Math.round(totalMs * 100) / 100,
      stages,
      heapUsedBytes: mem.heapUsed,
      heapTotalBytes: mem.heapTotal,
      rssBytes: mem.rss,
    },
    report,
  };
}

// ── Benchmark Runner ──

export interface BenchmarkOptions {
  /** Workload IDs to benchmark. Defaults to all. */
  workloads?: WorkloadId[];
  /** Number of warmup iterations (default: 1). */
  warmups?: number;
  /** Number of measured iterations (default: 3). */
  iterations?: number;
  /** Output directory for results. */
  outputDir?: string;
  /** Whether to print progress to stderr. */
  verbose?: boolean;
}

/**
 * Run a benchmark for a single workload.
 */
export async function benchmarkWorkload(
  workload: PreparedWorkload,
  options: BenchmarkOptions = {},
): Promise<BenchmarkResult> {
  const warmups = options.warmups ?? DEFAULT_WARMUPS;
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const verbose = options.verbose ?? false;

  const outputRoot = await fsp.mkdtemp(
    path.join(os.tmpdir(), `veris-bench-out-${workload.definition.id}-`),
  );

  try {
    // Warmup runs (discarded)
    for (let w = 0; w < warmups; w++) {
      if (verbose) {
        process.stderr.write(`  [warmup ${w + 1}/${warmups}] ${workload.definition.name}...\n`);
      }
      const warmupOut = path.join(outputRoot, `warmup-${w}`);
      await runSingleIteration(workload.targetDir, warmupOut, w);
    }

    // Measured iterations
    const measuredTimings: IterationTiming[] = [];
    const reports: unknown[] = [];

    for (let i = 0; i < iterations; i++) {
      if (verbose) {
        process.stderr.write(
          `  [iteration ${i + 1}/${iterations}] ${workload.definition.name}...\n`,
        );
      }
      const iterOut = path.join(outputRoot, `iter-${i}`);
      const result = await runSingleIteration(workload.targetDir, iterOut, i);
      measuredTimings.push(result.timing);
      reports.push(result.report);
    }

    // Compute statistics
    const timing = computeTimingStats(measuredTimings, warmups, workload.definition.fileCount);

    // Verify determinism
    const determinism = verifyDeterminism(reports);

    return {
      schemaVersion: BENCHMARK_SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
      environment: captureEnvironment(),
      workload: workload.definition,
      timing,
      iterations: measuredTimings,
      determinism,
    };
  } finally {
    await fsp.rm(outputRoot, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Run the full benchmark suite.
 */
export async function runBenchmarkSuite(
  options: BenchmarkOptions = {},
): Promise<BenchmarkSuiteResult> {
  const workloadIds = options.workloads ?? [...WORKLOAD_IDS];
  const verbose = options.verbose ?? false;
  const suiteStart = performance.now();

  if (verbose) {
    process.stderr.write(`\nVERIS Benchmark Suite\n`);
    process.stderr.write(`${'='.repeat(40)}\n`);
    process.stderr.write(`Workloads: ${workloadIds.join(', ')}\n`);
    process.stderr.write(
      `Warmups: ${options.warmups ?? DEFAULT_WARMUPS}, Iterations: ${options.iterations ?? DEFAULT_ITERATIONS}\n\n`,
    );
  }

  const environment = captureEnvironment();
  const results: BenchmarkResult[] = [];

  for (const id of workloadIds) {
    if (verbose) {
      process.stderr.write(`▸ Benchmarking: ${id}\n`);
    }

    const workload = await prepareWorkload(id);
    try {
      const result = await benchmarkWorkload(workload, options);
      results.push(result);

      if (verbose) {
        const d = result.determinism.passed ? '✓ deterministic' : '✗ NON-DETERMINISTIC';
        process.stderr.write(`  → ${result.timing.medianMs.toFixed(1)} ms median (${d})\n\n`);
      }
    } finally {
      await workload.cleanup();
    }
  }

  const totalSuiteMs = Math.round((performance.now() - suiteStart) * 100) / 100;

  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
    environment,
    results,
    totalSuiteMs,
  };
}

// ── Human-Readable Report ──

/**
 * Format a benchmark suite result as a human-readable report string.
 */
export function formatReport(suite: BenchmarkSuiteResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('VERIS BENCHMARK REPORT');
  lines.push('='.repeat(60));
  lines.push(`Date:       ${suite.timestamp}`);
  lines.push(`Node:       ${suite.environment.nodeVersion}`);
  lines.push(`Platform:   ${suite.environment.platform} ${suite.environment.arch}`);
  lines.push(`CPU:        ${suite.environment.cpuModel} (${suite.environment.cpuCount} cores)`);
  lines.push(
    `Memory:     ${Math.round(suite.environment.totalMemoryBytes / 1024 / 1024 / 1024)} GB`,
  );
  lines.push(`VERIS:      ${suite.environment.verisVersion}`);
  lines.push(`Commit:     ${suite.environment.gitCommit}`);
  lines.push(`Suite Time: ${(suite.totalSuiteMs / 1000).toFixed(1)}s`);
  lines.push('');

  for (const result of suite.results) {
    lines.push('-'.repeat(60));
    lines.push(`WORKLOAD: ${result.workload.name}`);
    lines.push(`  ${result.workload.description}`);
    lines.push(`  Files: ${result.workload.fileCount}  |  Category: ${result.workload.category}`);
    lines.push('');

    // Timing
    const t = result.timing;
    lines.push(`  TIMING (${t.iterations} iterations, ${t.warmups} warmups):`);
    lines.push(`    Median:     ${t.medianMs.toFixed(1)} ms`);
    lines.push(`    Mean:       ${t.meanMs.toFixed(1)} ms`);
    lines.push(`    Min/Max:    ${t.minMs.toFixed(1)} / ${t.maxMs.toFixed(1)} ms`);
    lines.push(`    Stddev:     ${t.stddevMs.toFixed(1)} ms (CV: ${(t.cv * 100).toFixed(1)}%)`);
    lines.push(`    Throughput: ${t.medianThroughput.toFixed(1)} files/s`);
    lines.push(
      `    Memory:     ${Math.round(t.medianHeapUsedBytes / 1024 / 1024)} MB heap, ${Math.round(t.peakRssBytes / 1024 / 1024)} MB RSS peak`,
    );
    lines.push('');

    // Stage breakdown
    if (Object.keys(t.stageMedians).length > 0) {
      lines.push('  STAGE BREAKDOWN (median):');
      const stages = Object.entries(t.stageMedians).sort(([, a], [, b]) => b - a);
      for (const [name, ms] of stages) {
        const pct = t.stagePercentages[name] ?? 0;
        const bar = '█'.repeat(Math.max(1, Math.round(pct / 5)));
        lines.push(
          `    ${name.padEnd(16)} ${String(ms.toFixed(1)).padStart(8)} ms  ${String(pct.toFixed(1)).padStart(5)}%  ${bar}`,
        );
      }
      lines.push('');
    }

    // Determinism
    const d = result.determinism;
    lines.push(
      `  DETERMINISM: ${d.passed ? 'PASS ✓' : 'FAIL ✗'} (${d.iterationsCompared} iterations compared)`,
    );
    lines.push(`    Canonical hash: ${d.canonicalHash.slice(0, 16)}...`);
    if (d.mismatchDetail) {
      lines.push(`    MISMATCH: ${d.mismatchDetail}`);
    }
    lines.push('');
  }

  lines.push('='.repeat(60));
  lines.push('');

  return lines.join('\n');
}
