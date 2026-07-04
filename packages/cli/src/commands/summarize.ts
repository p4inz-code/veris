/**
 * `veris summarize` command — generate an AI-powered report summary.
 *
 * Usage:
 *   veris summarize                       Summarize the report (default mode)
 *   veris summarize --mode simple         Simple summary
 *   veris summarize --mode technical      Technical summary
 *   veris summarize --mode expert         Expert summary
 *   veris summarize --json                JSON output
 *   veris summarize --no-audit            Disable audit logging
 *   veris summarize --offline             Force offline mode
 *
 * Exit codes:
 *   0 — Success
 *   1 — General error
 *   2 — Usage error
 *   3 — Report not found
 *   4 — Provider unavailable
 *   5 — Cache error
 *
 * @module @veris/cli/commands/summarize
 */

import type { ExplainResult, ExplanationMode } from '@veris/explain';

import {
  wireCli,
  formatResult,
  resultToExitCode,
  ExitCode,
  CliError,
  type CliContext,
} from '../wirer.js';

// ── Summarize Command Options ──

/** Parsed options for the summarize command. */
export interface SummarizeOptions {
  /** Explanation mode. */
  readonly mode?: ExplanationMode;
  /** Output as JSON. */
  readonly json: boolean;
  /** Report file path. */
  readonly report?: string;
  /** Provider ID override. */
  readonly provider?: string;
  /** Model name override. */
  readonly model?: string;
  /** Disable audit logging. */
  readonly noAudit: boolean;
  /** Force offline mode. */
  readonly offline: boolean;
  /** Verbose output. */
  readonly verbose: boolean;
}

// ── Help Text ──

/** Help text for the summarize command. */
export const SUMMARIZE_HELP = `
Summarize a scan report using AI.

Generates a natural-language summary of the complete scan results,
including top findings, risk assessment, and recommendations.

USAGE
  veris summarize                          Summarize the report
  veris summarize --mode simple            Simple summary
  veris summarize --mode technical         Technical summary (default)
  veris summarize --mode expert            Expert summary
  veris summarize --json                   JSON output
  veris summarize --no-audit               Disable audit logging
  veris summarize --offline                Force offline (local) mode

EXPLANATION MODES
  simple      One-paragraph summary with minimal technical jargon
  technical   Detailed summary with evidence and citations (default)
  expert      Full summary with complete traceability

OPTIONS
  --mode <mode>         Summary mode: simple | technical | expert
  --json                Output as JSON (for programmatic use)
  --report <path>       Path to report JSON file (default: search paths)
  --provider <id>       AI provider ID to use
  --model <name>        Model name to use with the provider
  --no-audit            Disable audit logging for this summary
  --offline             Force offline mode (local providers only)
  --verbose             Enable verbose debug output
  --help                Show this help message

EXAMPLES
  veris summarize                           Default summary
  veris summarize --mode simple             Simple summary
  veris summarize --mode expert             Expert summary
  veris summarize --json                    JSON output
  veris summarize --no-audit                No audit logging

EXIT CODES
  0  Success
  1  General error
  2  Usage error (bad arguments)
  3  Report not found
  4  Provider unavailable
  5  Cache error
`;

// ── Command Handler ──

/**
 * Run the summarize command.
 *
 * @param options - Parsed command options.
 * @returns The explain result and exit code.
 */
export async function runSummarize(
  options: SummarizeOptions,
): Promise<{ result: ExplainResult; exitCode: number }> {
  try {
    // Wire dependencies
    const ctx: CliContext = wireCli({
      reportPath: options.report,
      mode: options.mode,
      provider: options.provider,
      model: options.model,
      noAudit: options.noAudit,
      offline: options.offline,
      verbose: options.verbose,
    });

    // Call the service to summarize
    const result = await ctx.service.explain({ type: 'report' }, ctx.report, options.mode);

    // Output
    const output = formatResult(result, options.json);
    if (output) {
      process.stdout.write(output + '\n');
    }

    return { result, exitCode: resultToExitCode(result) };
  } catch (error) {
    if (error instanceof CliError) {
      const message = options.json
        ? JSON.stringify({
            kind: 'error',
            code: 'CLI_ERROR',
            message: error.message,
            subjectId: 'report-summary',
            subjectType: 'report',
            recoverable: false,
          })
        : `Error: ${error.message}`;

      process.stderr.write(message + '\n');
      return {
        result: {
          kind: 'error',
          code: 'CLI_ERROR',
          message: error.message,
          subjectId: 'report-summary',
          subjectType: 'report',
          recoverable: false,
        },
        exitCode: error.exitCode,
      };
    }

    const message = options.json
      ? JSON.stringify({
          kind: 'error',
          code: 'UNEXPECTED_ERROR',
          message: error instanceof Error ? error.message : String(error),
          subjectId: 'report-summary',
          subjectType: 'report',
          recoverable: false,
        })
      : `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;

    process.stderr.write(message + '\n');
    return {
      result: {
        kind: 'error',
        code: 'UNEXPECTED_ERROR',
        message: error instanceof Error ? error.message : String(error),
        subjectId: 'report-summary',
        subjectType: 'report',
        recoverable: false,
      },
      exitCode: ExitCode.ERROR,
    };
  }
}

// ── Parse Function ──

/**
 * Parse summarize command arguments.
 *
 * @param args - Raw argument array (without "summarize" subcommand).
 * @returns Parsed summarize options.
 * @throws CliError if arguments are invalid.
 */
export function parseSummarizeArgs(args: readonly string[]): SummarizeOptions {
  let mode: ExplanationMode | undefined;
  let json = false;
  let reportPath: string | undefined;
  let provider: string | undefined;
  let model: string | undefined;
  let noAudit = false;
  let offline = false;
  let verbose = false;

  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    switch (arg) {
      case '--mode': {
        i++;
        if (i >= args.length) {
          throw new CliError(
            'Missing value for --mode. Expected: simple | technical | expert',
            ExitCode.USAGE_ERROR,
          );
        }
        const modeValue = args[i].toLowerCase();
        if (modeValue !== 'simple' && modeValue !== 'technical' && modeValue !== 'expert') {
          throw new CliError(
            `Invalid mode: "${args[i]}". Expected: simple | technical | expert`,
            ExitCode.USAGE_ERROR,
          );
        }
        mode = modeValue as ExplanationMode;
        break;
      }

      case '--json':
        json = true;
        break;

      case '--report': {
        i++;
        if (i >= args.length) {
          throw new CliError('Missing value for --report', ExitCode.USAGE_ERROR);
        }
        reportPath = args[i];
        break;
      }

      case '--provider': {
        i++;
        if (i >= args.length) {
          throw new CliError('Missing value for --provider', ExitCode.USAGE_ERROR);
        }
        provider = args[i];
        break;
      }

      case '--model': {
        i++;
        if (i >= args.length) {
          throw new CliError('Missing value for --model', ExitCode.USAGE_ERROR);
        }
        model = args[i];
        break;
      }

      case '--no-audit':
        noAudit = true;
        break;

      case '--offline':
        offline = true;
        break;

      case '--verbose':
        verbose = true;
        break;

      case '--help':
        process.stdout.write(SUMMARIZE_HELP);
        process.exit(ExitCode.SUCCESS);

      default:
        throw new CliError(
          `Unknown option: ${arg}. Run 'veris summarize --help' for usage.`,
          ExitCode.USAGE_ERROR,
        );
    }

    i++;
  }

  return {
    mode,
    json,
    report: reportPath,
    provider,
    model,
    noAudit,
    offline,
    verbose,
  };
}
