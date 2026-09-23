/**
 * VERIS Benchmark Types — stable schema for machine-readable benchmark output.
 *
 * This schema is versioned and must remain backwards-compatible within a
 * major version. CI consumers and regression tooling depend on these shapes.
 *
 * @module @veris/perf
 */

/** Schema version for benchmark result files. */
export const BENCHMARK_SCHEMA_VERSION = '1.0.0';

// ── Environment ──

/** Captured environment metadata for reproducibility. */
export interface BenchmarkEnvironment {
  /** Node.js version string (e.g. "v24.14.0"). */
  readonly nodeVersion: string;
  /** Platform identifier (e.g. "win32", "linux", "darwin"). */
  readonly platform: NodeJS.Platform;
  /** CPU architecture (e.g. "x64", "arm64"). */
  readonly arch: string;
  /** Number of logical CPU cores. */
  readonly cpuCount: number;
  /** CPU model name. */
  readonly cpuModel: string;
  /** Total system memory in bytes. */
  readonly totalMemoryBytes: number;
  /** VERIS package version from veris-cli/package.json. */
  readonly verisVersion: string;
  /** Current git commit SHA (short). */
  readonly gitCommit: string;
  /** Hostname (sanitized — never includes secrets). */
  readonly hostname: string;
}

// ── Timing ──

/** High-resolution timing for a single measured iteration. */
export interface IterationTiming {
  /** Iteration index (0-based). */
  readonly index: number;
  /** Total scan duration in milliseconds (high-resolution). */
  readonly totalMs: number;
  /** Per-stage durations in milliseconds. */
  readonly stages: Readonly<Record<string, number>>;
  /** Heap used at end of iteration in bytes. */
  readonly heapUsedBytes: number;
  /** Heap total at end of iteration in bytes. */
  readonly heapTotalBytes: number;
  /** RSS at end of iteration in bytes. */
  readonly rssBytes: number;
}

/** Aggregated statistics from measured iterations. */
export interface TimingStats {
  /** Number of measured iterations (excludes warmups). */
  readonly iterations: number;
  /** Number of warmup iterations. */
  readonly warmups: number;
  /** Median total duration in ms. */
  readonly medianMs: number;
  /** Minimum total duration in ms. */
  readonly minMs: number;
  /** Maximum total duration in ms. */
  readonly maxMs: number;
  /** Mean total duration in ms. */
  readonly meanMs: number;
  /** Standard deviation of total duration in ms. */
  readonly stddevMs: number;
  /** Coefficient of variation (stddev / mean). */
  readonly cv: number;
  /** Per-stage median durations in ms. */
  readonly stageMedians: Readonly<Record<string, number>>;
  /** Per-stage percentage of total time (based on medians). */
  readonly stagePercentages: Readonly<Record<string, number>>;
  /** Median throughput (files/second). */
  readonly medianThroughput: number;
  /** Median heap used in bytes. */
  readonly medianHeapUsedBytes: number;
  /** Peak RSS across all iterations in bytes. */
  readonly peakRssBytes: number;
}

// ── Determinism ──

/** Result of determinism verification across iterations. */
export interface DeterminismResult {
  /** Whether all iterations produced identical analysis output. */
  readonly passed: boolean;
  /** Number of iterations compared. */
  readonly iterationsCompared: number;
  /** SHA-256 of the canonical analysis payload (runtime metadata stripped). */
  readonly canonicalHash: string;
  /** Fields excluded from comparison (runtime metadata). */
  readonly excludedFields: readonly string[];
  /** Description of any mismatch, if failed. */
  readonly mismatchDetail?: string;
}

// ── Workload ──

/** Workload definition — what the benchmark scans. */
export interface WorkloadDefinition {
  /** Unique workload identifier. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Description of what this workload represents. */
  readonly description: string;
  /** Number of files in the workload. */
  readonly fileCount: number;
  /** Approximate total size in bytes. */
  readonly totalSizeBytes: number;
  /** Category: small, medium, large, mixed, extraction-heavy, rules-heavy. */
  readonly category: string;
  /** Whether this workload uses existing repo fixtures. */
  readonly usesRepoFixtures: boolean;
  /** Source fixture path (relative to repo root) if using repo fixtures. */
  readonly sourceFixturePath?: string;
}

// ── Benchmark Result ──

/** Complete benchmark result for one workload. */
export interface BenchmarkResult {
  /** Schema version for forward compatibility. */
  readonly schemaVersion: string;
  /** Benchmark run timestamp (ISO 8601). */
  readonly timestamp: string;
  /** Environment metadata. */
  readonly environment: BenchmarkEnvironment;
  /** Workload definition. */
  readonly workload: WorkloadDefinition;
  /** Timing statistics. */
  readonly timing: TimingStats;
  /** Raw iteration timings. */
  readonly iterations: readonly IterationTiming[];
  /** Determinism verification result. */
  readonly determinism: DeterminismResult;
}

/** Complete benchmark suite result (all workloads). */
export interface BenchmarkSuiteResult {
  /** Schema version. */
  readonly schemaVersion: string;
  /** Suite-level run timestamp (ISO 8601). */
  readonly timestamp: string;
  /** Environment metadata. */
  readonly environment: BenchmarkEnvironment;
  /** Individual workload results. */
  readonly results: readonly BenchmarkResult[];
  /** Total suite execution time in ms. */
  readonly totalSuiteMs: number;
}
