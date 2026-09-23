/**
 * `veris ci` command — deterministic CI runner and automated security gates.
 *
 * Implements ADR-015:
 *   veris ci [target] [options]
 *
 * Coordinates:
 *   1. Baseline ingestion and adversarial validation
 *   2. Target execution via the deterministic scan pipeline
 *   3. Location-aware finding fingerprinting and differential comparison
 *   4. Configurable security policy gate evaluation
 *   5. Emission of machine-readable `ci-summary.json` and `$GITHUB_STEP_SUMMARY`
 *   6. Deterministic CI exit code contract
 *
 * @module @veris/cli/commands/ci
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

import { createSeverity, type CanonicalReport } from '@veris/core';
import { deterministicId } from '@veris/shared';

import {
  type BaselineData,
  type CiPolicy,
  type CiRunnerOptions,
  type CiSummary,
  type SeverityLevel,
  compareFindings,
  createCiSummary,
  evaluateCiPolicy,
  loadBaseline,
  renderCiStepSummaryMarkdown,
  renderCiTerminalOutput,
  writeCiSummary,
  writeGitHubStepSummary,
} from '../ci/index.js';
import { CliError, ExitCode } from '../wirer.js';

import { runScan } from './scan.js';

// ── Help Text ──

export const CI_HELP = `
Run deterministic security gates and CI policy enforcement.

USAGE
  veris ci [target] [options]

OPTIONS
  --baseline <path>              Path to baseline report.json or ci-summary.json
  --fail-on <severity>           Fail if any finding has severity >= threshold
                                 (critical, high, medium, low, info)
  --fail-on-new                  Fail if ANY new findings are introduced vs baseline
  --fail-on-regressions          Fail on severity regressions or risk score increase
  --max-risk <score>             Fail if overall risk score exceeds threshold [0.0 - 10.0]
  --max-new <count>              Maximum allowed newly introduced findings (default: 0)
  --fail-on-plugin-quarantine    Fail if any plugin crashes or is quarantined
  --output, -o <dir>             Output directory for artifacts (default: ./veris-output)
  --format, -f <formats>         Export formats: json, markdown, sarif, junit
  --summary-file <path>          Custom path for ci-summary.json
  --github-step-summary          Force writing GitHub Actions Step Summary markdown
  --silent                       Suppress interactive display; emit exit status only
  --verbose                      Enable verbose diagnostic logging
  --plugin-dir <dir>             Explicit directory to search for plugins
  --disable-plugin <id>          Disable specific plugin by ID (repeatable)
  --no-plugins                   Disable plugin discovery and loading
  --help, -h                     Show this help message

EXAMPLES
  veris ci                                   Run gates on current directory (default policy)
  veris ci ./src --fail-on high              Fail if any high or critical finding exists
  veris ci . --baseline ./baseline.json      Diff against baseline, report changes
  veris ci . --baseline base.json --fail-on-new
                                             Fail if pull request introduces any new finding
  veris ci . --baseline base.json --fail-on-regressions --max-risk 5.0
                                             Enforce regression prevention and risk ceiling

EXIT CODES
  0   Success (all gates passed)
  1   Scan execution error
  2   Usage error (invalid CLI arguments)
  10  Security gate violation
  11  Invalid, missing, or malformed baseline file
  12  Invalid CI configuration or policy parameter
  13  Plugin error or quarantine violation
  130 Interrupted (SIGINT/SIGTERM)
`;

// ── Argument Parser ──

const VALID_SEVERITIES = new Set<string>(['critical', 'high', 'medium', 'low', 'info']);

/**
 * Parse CLI arguments into strongly typed CiRunnerOptions.
 *
 * @param args - CLI arguments array (excluding 'ci' command name).
 * @returns Parsed CiRunnerOptions.
 * @throws CliError with ExitCode.USAGE_ERROR or ExitCode.INVALID_CONFIG on parse failures.
 */
export function parseCiArgs(args: readonly string[]): CiRunnerOptions {
  let target = '.';
  let baseline: string | undefined;
  let outputDir = './veris-output';
  let format: string[] | undefined;
  let summaryFile: string | undefined;
  let githubStepSummary = false;
  let silent = false;
  let verbose = false;
  let pluginDir: string | undefined;
  let disabledPlugins: string[] | undefined;
  let enablePlugins: boolean | undefined;

  // Policy options
  let failOn: SeverityLevel | undefined;
  let failOnNew = false;
  let failOnRegressions = false;
  let maxRisk: number | undefined;
  let maxNew: number | undefined;
  let failOnPluginQuarantine = false;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    switch (arg) {
      case '--baseline': {
        i++;
        if (i >= args.length) {
          throw new CliError('Missing value for --baseline', ExitCode.USAGE_ERROR);
        }
        baseline = args[i];
        break;
      }

      case '--fail-on': {
        i++;
        if (i >= args.length) {
          throw new CliError('Missing value for --fail-on', ExitCode.USAGE_ERROR);
        }
        const val = args[i].toLowerCase();
        if (!VALID_SEVERITIES.has(val)) {
          throw new CliError(
            `Invalid severity for --fail-on: "${args[i]}". Expected: critical, high, medium, low, or info.`,
            ExitCode.INVALID_CONFIG,
          );
        }
        failOn = val as SeverityLevel;
        break;
      }

      case '--fail-on-new':
        failOnNew = true;
        break;

      case '--fail-on-regressions':
        failOnRegressions = true;
        break;

      case '--max-risk': {
        i++;
        if (i >= args.length) {
          throw new CliError('Missing value for --max-risk', ExitCode.USAGE_ERROR);
        }
        const score = parseFloat(args[i]);
        if (isNaN(score) || score < 0 || score > 10) {
          throw new CliError(
            `Invalid value for --max-risk: "${args[i]}". Expected a number between 0.0 and 10.0.`,
            ExitCode.INVALID_CONFIG,
          );
        }
        maxRisk = score;
        break;
      }

      case '--max-new': {
        i++;
        if (i >= args.length) {
          throw new CliError('Missing value for --max-new', ExitCode.USAGE_ERROR);
        }
        const count = parseInt(args[i], 10);
        if (isNaN(count) || count < 0) {
          throw new CliError(
            `Invalid value for --max-new: "${args[i]}". Expected a non-negative integer.`,
            ExitCode.INVALID_CONFIG,
          );
        }
        maxNew = count;
        break;
      }

      case '--fail-on-plugin-quarantine':
      case '--fail-on-plugin-error':
        failOnPluginQuarantine = true;
        break;

      case '--output':
      case '-o': {
        i++;
        if (i >= args.length) {
          throw new CliError('Missing value for --output', ExitCode.USAGE_ERROR);
        }
        outputDir = args[i];
        break;
      }

      case '--format':
      case '-f': {
        i++;
        if (i >= args.length) {
          throw new CliError('Missing value for --format', ExitCode.USAGE_ERROR);
        }
        format = args[i].split(',').map((f) => f.trim().toLowerCase());
        break;
      }

      case '--summary-file': {
        i++;
        if (i >= args.length) {
          throw new CliError('Missing value for --summary-file', ExitCode.USAGE_ERROR);
        }
        summaryFile = args[i];
        break;
      }

      case '--github-step-summary':
        githubStepSummary = true;
        break;

      case '--silent':
        silent = true;
        break;

      case '--verbose':
        verbose = true;
        break;

      case '--plugin-dir': {
        i++;
        if (i >= args.length) {
          throw new CliError('Missing value for --plugin-dir', ExitCode.USAGE_ERROR);
        }
        pluginDir = args[i];
        break;
      }

      case '--disable-plugin': {
        i++;
        if (i >= args.length) {
          throw new CliError('Missing value for --disable-plugin', ExitCode.USAGE_ERROR);
        }
        if (!disabledPlugins) disabledPlugins = [];
        disabledPlugins.push(args[i]);
        break;
      }

      case '--no-plugins':
        enablePlugins = false;
        break;

      case '--help':
      case '-h':
        process.stdout.write(CI_HELP);
        process.exit(ExitCode.SUCCESS);

      default:
        if (!arg.startsWith('--') && !arg.startsWith('-') && i === 0) {
          target = arg;
        } else {
          throw new CliError(`Unknown option: ${arg}`, ExitCode.USAGE_ERROR);
        }
    }

    i++;
  }

  const policy: CiPolicy = Object.freeze({
    failOn,
    failOnNew,
    failOnRegressions,
    maxRisk,
    maxNew,
    failOnPluginQuarantine,
  });

  return Object.freeze({
    target,
    baseline,
    policy,
    outputDir,
    format: format ?? ['json', 'markdown'],
    summaryFile,
    githubStepSummary,
    silent,
    verbose,
    pluginDir,
    disabledPlugins,
    enablePlugins,
  });
}

// ── Command Executor ──

/**
 * Execute the `veris ci` runner workflow.
 *
 * @param options - Execution options.
 * @returns Object containing process exit code and summary.
 */
export async function runCi(
  options: CiRunnerOptions,
): Promise<{ exitCode: number; summary?: CiSummary }> {
  const computedAt = options.computedAt ?? new Date().toISOString();
  const outputDir = path.resolve(options.outputDir);
  const summaryFilePath = options.summaryFile
    ? path.resolve(options.summaryFile)
    : path.resolve(outputDir, 'ci-summary.json');
  const stepSummaryMdPath = path.resolve(outputDir, 'ci-step-summary.md');

  // ── Step 1: Ingest Baseline (if specified) ──
  let baselineData: BaselineData | null = null;
  if (options.baseline) {
    if (options.verbose) {
      process.stderr.write(`Loading baseline from: ${options.baseline}\n`);
    }
    baselineData = await loadBaseline(options.baseline);
    if (options.verbose) {
      process.stderr.write(
        `Baseline loaded: ${baselineData.findings.length} findings, risk score: ${baselineData.riskScore.toFixed(1)}\n`,
      );
    }
  }

  // ── Step 2: Run Scan Pipeline ──
  if (options.verbose) {
    process.stderr.write(`Executing security scan on target: ${options.target}\n`);
  }

  const scanResult = await runScan({
    target: options.target,
    output: outputDir,
    format: options.format ? [...options.format] : ['json', 'markdown'],
    progress: 'silent', // CI runner uses structured terminal renderer at end
    silent: true,
    verbose: options.verbose,
    computedAt,
    pluginDir: options.pluginDir,
    disabledPlugins: options.disabledPlugins,
    enablePlugins: options.enablePlugins,
  });

  if (scanResult.exitCode !== ExitCode.SUCCESS) {
    return { exitCode: scanResult.exitCode };
  }

  const sessionId = deterministicId('sess', computedAt, options.target);
  const tpId = deterministicId('tp', sessionId);
  const rpId = deterministicId('rp', sessionId);

  const currentReport: CanonicalReport =
    scanResult.report ??
    Object.freeze({
      id: deterministicId('rep', computedAt, options.target),
      session: Object.freeze({
        id: sessionId,
        schemaVersion: '1.0.0',
        engineVersion: '1.0.0',
        startedAt: computedAt,
        completedAt: computedAt,
        durationMs: 0,
        config: Object.freeze({ target: options.target }),
        environment: Object.freeze({
          os: process.platform,
          arch: process.arch,
          runtimeVersion: process.version,
          engineVersion: '1.0.0',
        }),
        artifactCount: 0,
        findingCount: 0,
        status: 'completed' as const,
      }),
      artifacts: Object.freeze([]),
      findings: Object.freeze([]),
      trustProfile: Object.freeze({
        id: tpId,
        sessionId,
        artifactId: 'none',
        trustScore: 1.0,
        findingDensity: 0.0,
        severityBreakdown: Object.freeze({}),
        computedAt,
      }),
      riskProfile: Object.freeze({
        id: rpId,
        sessionId,
        trustProfileId: tpId,
        riskScore: 0.0,
        riskLevel: 'negligible' as const,
        maxSeverity: createSeverity('info', 0),
        computedAt,
      }),
      summary: Object.freeze({
        totalArtifacts: 0,
        totalFindings: 0,
        totalEvidence: 0,
        findingsBySeverity: Object.freeze({}),
        findingsByCategory: Object.freeze({}),
        riskScore: 0.0,
        trustScore: 1.0,
        scanDurationMs: 0,
        rulesApplied: 0,
        behaviorsDetected: 0,
      }),
      generatedAt: computedAt,
    });

  // ── Step 3: Compare Current Findings to Baseline ──
  const diffResult = compareFindings(currentReport, baselineData);

  // ── Step 4: Evaluate Security Policy Gates ──
  const gateResult = evaluateCiPolicy(options.policy, currentReport, diffResult, {
    quarantinedPlugins: scanResult.quarantinedPlugins,
  });

  // ── Step 5: Construct Canonical Summary ──
  const emittedArtifacts = [
    ...(scanResult.savedOutputFiles ?? []),
    summaryFilePath,
    stepSummaryMdPath,
  ];

  const summary = createCiSummary({
    target: options.target,
    baselinePath: options.baseline,
    policy: options.policy,
    gateResult,
    diffResult,
    currentReport,
    timestamp: computedAt,
    outputFiles: emittedArtifacts,
  });

  // ── Step 6: Write Artifacts ──
  await writeCiSummary(summary, summaryFilePath);

  const markdownSummary = renderCiStepSummaryMarkdown(summary);
  await fsp.mkdir(outputDir, { recursive: true });
  await fsp.writeFile(stepSummaryMdPath, markdownSummary, 'utf-8');

  // Write to GitHub Actions step summary if running in GHA or explicitly requested
  if (options.githubStepSummary || process.env.GITHUB_STEP_SUMMARY) {
    await writeGitHubStepSummary(markdownSummary);
  }

  // ── Step 7: Terminal UX Presentation ──
  renderCiTerminalOutput(summary, {
    silent: options.silent,
    verbose: options.verbose,
  });

  return { exitCode: gateResult.exitCode, summary };
}
