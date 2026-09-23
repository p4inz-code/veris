# VERIS Benchmark Suite

> **Status**: Foundation established — baseline measurements available.  
> No optimizations have been applied; the suite captures the current state.

## Overview

The VERIS benchmark suite (`tools/perf`) provides deterministic, repeatable
performance measurements of the VERIS scan pipeline. It runs real scans
against synthesized workloads and verifies that analysis results are
deterministic across iterations.

## Quick Start

```bash
# Run all benchmarks (default: 1 warmup, 3 measured iterations)
pnpm --filter @veris/perf bench

# Quick single-workload check
pnpm --filter @veris/perf bench:quick

# Machine-readable JSON output only
pnpm --filter @veris/perf bench:json

# Custom options
pnpm --filter @veris/perf bench -- --workload small,medium --iterations 5 --warmups 2
```

## What Is Measured

### Pipeline Stages

- Discovery — filesystem traversal and artifact graph construction
- Classification — MIME type, magic bytes, extension analysis
- Extraction — feature extraction (JS, TS, JSON, YAML, Shell, etc.)
- Knowledge — feature normalization and enrichment
- Analysis — analyzer execution and evidence generation
- Rules — rule engine evaluation
- Correlation — behavioral chain detection
- Risk — risk score computation
- Reporting — report construction
- Export — output serialization (JSON, Markdown, etc.)

### Metrics Per Workload

| Metric          | Source                            | Unit    |
| :-------------- | :-------------------------------- | :------ |
| Total scan time | `performance.now()`               | ms      |
| Per-stage time  | Profiler stage records            | ms      |
| Throughput      | Files / (total time)              | files/s |
| Heap used       | `process.memoryUsage().heapUsed`  | bytes   |
| Heap total      | `process.memoryUsage().heapTotal` | bytes   |
| RSS             | `process.memoryUsage().rss`       | bytes   |

### Aggregates (across measured iterations)

- Median, mean, min, max, standard deviation, coefficient of variation
- Per-stage median durations and percentage breakdowns
- Determinism hash (SHA-256 of canonical analysis payload)

## Workload Matrix

| ID               | Name                | Files | Category | Purpose                                         |
| :--------------- | :------------------ | :---: | :------- | :---------------------------------------------- |
| `small`          | 5 JS files          |   5   | small    | Baseline startup/pipeline overhead              |
| `medium`         | 25 mixed files      |  25   | medium   | Multi-extractor, multi-type classification      |
| `large`          | 100 mixed files     |  100  | large    | Scaling, throughput, memory pressure            |
| `security-mixed` | 8 safe + suspicious |   8   | mixed    | Rule matching, finding generation, risk scoring |

Workloads are synthesized in temporary directories and cleaned up automatically.
No machine-specific paths are used.

## Determinism Contract

For every workload, the suite runs N iterations with an identical fixed
timestamp (`2026-08-09T00:00:00.000Z`) and compares the canonical analysis
payload across runs. The comparison:

- **Includes**: Findings, evidence, severity, risk scores, confidence values,
  ordering, rule matches, behavioral chains, report structure
- **Excludes**: `scanDurationMs`, `startedAt`, `completedAt` (runtime metadata
  that legitimately varies per-run)

This is the same determinism contract enforced by the existing
`scan-determinism.test.ts` test. If determinism verification fails, the
benchmark exits with a non-zero exit code.

## Output Schema

Results are written to `benchmark-results/benchmark-results.json` with the
following stable schema (version `1.0.0`):

```typescript
interface BenchmarkSuiteResult {
  schemaVersion: string; // "1.0.0"
  timestamp: string; // ISO 8601
  environment: {
    nodeVersion: string;
    platform: string;
    arch: string;
    cpuCount: number;
    cpuModel: string;
    totalMemoryBytes: number;
    verisVersion: string;
    gitCommit: string;
    hostname: string;
  };
  results: Array<{
    workload: WorkloadDefinition;
    timing: TimingStats;
    iterations: IterationTiming[];
    determinism: DeterminismResult;
  }>;
  totalSuiteMs: number;
}
```

A human-readable report is also written to `benchmark-results/benchmark-report.txt`.

## CI Integration

The benchmark suite is designed for CI consumption:

1. **Machine-readable output**: `--json` flag outputs JSON to stdout
2. **Exit codes**: Non-zero on determinism failure
3. **No network dependency**: Fully offline
4. **Stable schema**: Schema version for backward compatibility
5. **Environment capture**: Records Node version, commit SHA, platform

A future CI step can:

- Run benchmarks on each push/nightly
- Compare results against a stored baseline
- Flag regressions exceeding a threshold
- Archive results as artifacts

The nightly workflow (`.github/workflows/nightly.yml`) is the natural
integration point for benchmark execution.

## What This Suite Does NOT Do

- **No optimization**: The suite measures reality, not aspirations
- **No flaky timing assertions**: No hard-coded "must be under X ms" gates
- **No false precision**: Coefficient of variation is reported to help assess
  measurement reliability
- **No network access**: Fully offline
- **No modification of production code**: The harness calls `runScan` as-is

## Architecture

```
tools/perf/
  src/
    types.ts          — Stable result schema types
    workloads.ts      — Workload matrix definitions and synthesis
    harness.ts        — Benchmark runner, timing, determinism verification
    run-benchmarks.ts — CLI entry point
    index.ts          — Barrel export
  package.json        — Workspace package config
  tsconfig.json       — TypeScript config
```

The harness uses `tsx` for direct TypeScript execution (no build step needed
for benchmarks). It imports `runScan` from `packages/cli/src/commands/scan.js`
directly, running the real production pipeline.
