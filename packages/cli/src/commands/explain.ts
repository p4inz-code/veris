/**
 * `veris explain` command — explain findings, chains, risk dimensions.
 *
 * Usage:
 *   veris explain <finding-id>               Explain a finding (default mode)
 *   veris explain <finding-id> --mode simple Explain a finding (simple mode)
 *   veris explain <finding-id> --mode technical
 *   veris explain <finding-id> --mode expert
 *   veris explain <finding-id> --json        JSON output
 *   veris explain chain <chain-id>           Explain a behavior chain
 *   veris explain risk <dimension-id>        Explain a risk dimension
 *   veris explain <finding-id> --no-audit    Disable audit logging
 *   veris explain <finding-id> --offline     Force offline mode
 *   veris explain <finding-id> --provider ollama
 *   veris explain <finding-id> --model llama3.1
 *
 * Exit codes:
 *   0 — Success
 *   1 — General error
 *   2 — Usage error (bad arguments, missing required options)
 *   3 — Not found (finding, chain, or report not found)
 *   4 — Provider unavailable
 *   5 — Cache error
 *
 * @module @veris/cli/commands/explain
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

// ── Explain Command Options ──

/** Parsed options for the explain command. */
export interface ExplainOptions {
  /** Subject type: finding, chain, or risk. */
  readonly subjectType: 'finding' | 'chain' | 'risk';
  /** Subject ID (finding ID, chain ID, or risk dimension ID). */
  readonly subjectId: string;
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

/** Help text for the explain command. */
export const EXPLAIN_HELP = `
Explain a security finding, behavior chain, or risk dimension using AI.

The AI explanation layer provides natural-language explanations of
deterministic analysis results. It is always read-only and optional.

USAGE
  veris explain <finding-id>                     Explain a finding
  veris explain <finding-id> --mode <mode>        With specific explanation mode
  veris explain chain <chain-id>                  Explain a behavior chain
  veris explain risk <dimension-id>               Explain a risk dimension
  veris explain <finding-id> --json               JSON output
  veris explain <finding-id> --no-audit           Disable audit logging
  veris explain <finding-id> --offline            Force offline (local) mode

EXPLANATION MODES
  simple      One-paragraph explanation with minimal technical jargon
  technical   Detailed explanation with evidence and citations (default)
  expert      Full traceability chain with all evidence and source locations

OPTIONS
  --mode <mode>         Explanation mode: simple | technical | expert
  --json                Output as JSON (for programmatic use)
  --report <path>       Path to report JSON file (default: search paths)
  --provider <id>       AI provider ID to use
  --model <name>        Model name to use with the provider
  --no-audit            Disable audit logging for this explanation
  --offline             Force offline mode (local providers only)
  --verbose             Enable verbose debug output
  --help                Show this help message

EXAMPLES
  veris explain fin_abc123                          Basic explanation
  veris explain fin_abc123 --mode simple            Simple explanation
  veris explain fin_abc123 --mode expert            Expert explanation
  veris explain fin_abc123 --json                   JSON output
  veris explain chain bc_def456                     Chain explanation
  veris explain risk D500                           Risk dimension explanation
  veris explain fin_abc123 --no-audit               No audit logging
  veris explain fin_abc123 --offline                Force offline mode
  veris explain fin_abc123 --provider ollama        Use Ollama provider
  veris explain fin_abc123 --model llama3.1:8b      Use specific model

EXIT CODES
  0  Success
  1  General error
  2  Usage error (bad arguments)
  3  Not found (finding, chain, report)
  4  Provider unavailable
  5  Cache error
`;

// ── Command Handler ──

/**
 * Run the explain command.
 *
 * @param options - Parsed command options.
 * @returns The explain result and exit code.
 */
export async function runExplain(
  options: ExplainOptions,
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

    // Call the service
    const result = await ctx.service.explain(
      { type: options.subjectType, id: options.subjectId },
      ctx.report,
      options.mode,
    );

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
            subjectId: options.subjectId,
            subjectType: options.subjectType,
            recoverable: false,
          })
        : `Error: ${error.message}`;

      process.stderr.write(message + '\n');
      return {
        result: {
          kind: 'error',
          code: 'CLI_ERROR',
          message: error.message,
          subjectId: options.subjectId,
          subjectType: options.subjectType,
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
          subjectId: options.subjectId,
          subjectType: options.subjectType,
          recoverable: false,
        })
      : `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;

    process.stderr.write(message + '\n');
    return {
      result: {
        kind: 'error',
        code: 'UNEXPECTED_ERROR',
        message: error instanceof Error ? error.message : String(error),
        subjectId: options.subjectId,
        subjectType: options.subjectType,
        recoverable: false,
      },
      exitCode: ExitCode.ERROR,
    };
  }
}

// ─── Parse Function ───

/**
 * Parse explain command arguments.
 *
 * @param args - Raw argument array (without "explain" subcommand).
 * @returns Parsed explain options.
 * @throws CliError if arguments are invalid.
 */
export function parseExplainArgs(args: readonly string[]): ExplainOptions {
  // Defaults
  let subjectType: 'finding' | 'chain' | 'risk' = 'finding';
  let subjectId = '';
  let mode: ExplanationMode | undefined;
  let json = false;
  let reportPath: string | undefined;
  let provider: string | undefined;
  let model: string | undefined;
  let noAudit = false;
  let offline = false;
  let verbose = false;

  // Parse positional arguments
  let i = 0;

  // Check for subject type keyword
  if (i < args.length && (args[i] === 'chain' || args[i] === 'risk')) {
    subjectType = args[i] as 'chain' | 'risk';
    i++;
  }

  // Subject ID is required
  if (i >= args.length || args[i].startsWith('--')) {
    throw new CliError(
      "Missing required argument: <subject-id>. Run 'veris explain --help' for usage.",
      ExitCode.USAGE_ERROR,
    );
  }

  subjectId = args[i];
  i++;

  // Parse remaining flags
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
        process.stdout.write(EXPLAIN_HELP);
        process.exit(ExitCode.SUCCESS);

      default:
        throw new CliError(
          `Unknown option: ${arg}. Run 'veris explain --help' for usage.`,
          ExitCode.USAGE_ERROR,
        );
    }

    i++;
  }

  return {
    subjectType,
    subjectId,
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
