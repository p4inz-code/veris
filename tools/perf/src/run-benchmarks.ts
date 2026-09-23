#!/usr/bin/env node
/**
 * VERIS Benchmark CLI — `pnpm --filter @veris/perf bench`
 *
 * Runs the deterministic benchmark suite and produces both machine-readable
 * JSON and a human-readable report.
 *
 * Usage:
 *   pnpm --filter @veris/perf bench                     Run all workloads
 *   pnpm --filter @veris/perf bench -- --workload small  Run single workload
 *   pnpm --filter @veris/perf bench -- --iterations 5    Custom iteration count
 *   pnpm --filter @veris/perf bench -- --output ./results  Custom output dir
 *
 * @module @veris/perf
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

import { runBenchmarkSuite, formatReport } from './harness.js';
import type { WorkloadId } from './workloads.js';
import { WORKLOAD_IDS } from './workloads.js';

// ── Argument Parsing ──

interface CliArgs {
  workloads: WorkloadId[];
  warmups: number;
  iterations: number;
  outputDir: string;
  verbose: boolean;
  jsonOnly: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    workloads: [...WORKLOAD_IDS],
    warmups: 1,
    iterations: 3,
    outputDir: path.resolve(process.cwd(), 'benchmark-results'),
    verbose: true,
    jsonOnly: false,
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    switch (arg) {
      case '--workload':
      case '-w':
        i++;
        if (i >= argv.length) {
          process.stderr.write('Error: Missing value for --workload\n');
          process.exit(1);
        }
        {
          const ids = argv[i].split(',').map((s) => s.trim()) as WorkloadId[];
          for (const id of ids) {
            if (!WORKLOAD_IDS.includes(id)) {
              process.stderr.write(
                `Error: Unknown workload "${id}". Available: ${WORKLOAD_IDS.join(', ')}\n`,
              );
              process.exit(1);
            }
          }
          args.workloads = ids;
        }
        break;

      case '--warmups':
        i++;
        if (i >= argv.length) {
          process.stderr.write('Error: Missing value for --warmups\n');
          process.exit(1);
        }
        args.warmups = parseInt(argv[i], 10);
        break;

      case '--iterations':
      case '-n':
        i++;
        if (i >= argv.length) {
          process.stderr.write('Error: Missing value for --iterations\n');
          process.exit(1);
        }
        args.iterations = parseInt(argv[i], 10);
        break;

      case '--output':
      case '-o':
        i++;
        if (i >= argv.length) {
          process.stderr.write('Error: Missing value for --output\n');
          process.exit(1);
        }
        args.outputDir = path.resolve(argv[i]);
        break;

      case '--json':
        args.jsonOnly = true;
        args.verbose = false;
        break;

      case '--quiet':
      case '-q':
        args.verbose = false;
        break;

      case '--help':
      case '-h':
        process.stdout.write(
          [
            'VERIS Benchmark Suite',
            '',
            'Usage:',
            '  pnpm --filter @veris/perf bench [options]',
            '',
            'Options:',
            `  --workload, -w <ids>   Workloads to run (comma-separated). Available: ${WORKLOAD_IDS.join(', ')}`,
            '  --warmups <n>          Number of warmup iterations (default: 1)',
            '  --iterations, -n <n>   Number of measured iterations (default: 3)',
            '  --output, -o <dir>     Output directory for results (default: ./benchmark-results)',
            '  --json                 Output JSON only (no human-readable report)',
            '  --quiet, -q            Suppress progress output',
            '  --help, -h             Show this help message',
            '',
          ].join('\n'),
        );
        process.exit(0);
        break;

      default:
        process.stderr.write(`Unknown argument: ${arg}\n`);
        process.exit(1);
    }
    i++;
  }

  return args;
}

// ── Main ──

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  try {
    const suite = await runBenchmarkSuite({
      workloads: args.workloads,
      warmups: args.warmups,
      iterations: args.iterations,
      verbose: args.verbose,
    });

    // Write JSON result
    await fsp.mkdir(args.outputDir, { recursive: true });
    const jsonPath = path.join(args.outputDir, 'benchmark-results.json');
    await fsp.writeFile(jsonPath, JSON.stringify(suite, null, 2) + '\n', 'utf-8');

    if (args.jsonOnly) {
      // In JSON mode, write to stdout
      process.stdout.write(JSON.stringify(suite, null, 2) + '\n');
    } else {
      // Human-readable report
      const report = formatReport(suite);
      process.stderr.write(report);

      // Write report to file
      const reportPath = path.join(args.outputDir, 'benchmark-report.txt');
      await fsp.writeFile(reportPath, report, 'utf-8');

      process.stderr.write(`\nResults saved to:\n`);
      process.stderr.write(`  JSON:   ${jsonPath}\n`);
      process.stderr.write(`  Report: ${reportPath}\n`);
    }

    // Check determinism across all workloads
    const allDeterministic = suite.results.every((r) => r.determinism.passed);
    if (!allDeterministic) {
      process.stderr.write('\n⚠ WARNING: Determinism check FAILED for one or more workloads!\n');
      process.exit(1);
    }
  } catch (error) {
    process.stderr.write(
      `\nBenchmark failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }
}

main();
