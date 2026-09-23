/**
 * @veris/perf — public barrel export.
 */

export type {
  BenchmarkEnvironment,
  BenchmarkResult,
  BenchmarkSuiteResult,
  DeterminismResult,
  IterationTiming,
  TimingStats,
  WorkloadDefinition,
} from './types.js';

export { BENCHMARK_SCHEMA_VERSION } from './types.js';

export type { PreparedWorkload, WorkloadId } from './workloads.js';
export { WORKLOAD_IDS, prepareWorkload } from './workloads.js';

export type { BenchmarkOptions } from './harness.js';
export {
  benchmarkWorkload,
  runBenchmarkSuite,
  captureEnvironment,
  formatReport,
} from './harness.js';
