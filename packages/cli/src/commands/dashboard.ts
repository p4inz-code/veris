/**
 * `veris dashboard` command — Visual investigation dashboard generator and viewer.
 *
 * Implements Phase 13 & ADR-017:
 *   veris dashboard [report-path] [options]
 *
 * @module @veris/cli/commands/dashboard
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  generateDashboard,
  startDashboardServer,
  type DashboardServerInstance,
} from '../dashboard/index.js';
import { CliError, ExitCode } from '../wirer.js';

// ── Help Text ──

export const DASHBOARD_HELP = `
Launch or export the visual investigation dashboard from a scan report.

USAGE
  veris dashboard [report-path] [options]
  veris dashboard --output ./dashboard.html
  veris dashboard --port 3000 --no-open

OPTIONS
  --output, -o <file>        Generate standalone HTML file without running a server
  --port, -p <number>        Port for local HTTP server (default: random available port)
  --no-open                  Do not launch system web browser automatically
  --serve                    Serve dashboard via local HTTP server even when --output is set
  --help, -h                 Show this help message

EXAMPLES
  veris dashboard                            Serve latest report on local loopback
  veris dashboard ./veris-output/report.json Serve specific canonical report
  veris dashboard --output ./dashboard.html  Export standalone zero-dependency HTML file
  veris dashboard -p 8080 --no-open          Serve on port 8080 without opening browser

EXIT CODES
  0  Success
  1  General error
  2  Usage error
  3  Report not found
`;

// ── Default Report Paths ──

const DEFAULT_REPORT_PATHS = [
  './veris-output/report.json',
  './.veris/report.json',
  './report.json',
];

export interface DashboardCommandOptions {
  /** Path to canonical report.json. */
  readonly report?: string;
  /** Output HTML file path. */
  readonly output?: string;
  /** Server port. */
  readonly port?: number;
  /** Disable automatic browser launch. */
  readonly noOpen?: boolean;
  /** Force HTTP server mode. */
  readonly serve?: boolean;
}

export function parseDashboardArgs(args: readonly string[]): DashboardCommandOptions {
  let report: string | undefined;
  let output: string | undefined;
  let port: number | undefined;
  let noOpen = false;
  let serve = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      return { report: '--help' };
    }

    if (arg === '--output' || arg === '-o') {
      output = args[++i];
      if (!output || output.startsWith('-')) {
        throw new CliError('Missing argument for --output', ExitCode.USAGE_ERROR);
      }
    } else if (arg === '--port' || arg === '-p') {
      const val = args[++i];
      const parsed = parseInt(val, 10);
      if (Number.isNaN(parsed) || parsed < 0 || parsed > 65535) {
        throw new CliError(`Invalid port number: ${val}`, ExitCode.USAGE_ERROR);
      }
      port = parsed;
    } else if (arg === '--no-open') {
      noOpen = true;
    } else if (arg === '--serve') {
      serve = true;
    } else if (!arg.startsWith('-')) {
      if (!report) {
        report = arg;
      } else {
        throw new CliError(`Unexpected positional argument: ${arg}`, ExitCode.USAGE_ERROR);
      }
    } else {
      throw new CliError(`Unknown option: ${arg}`, ExitCode.USAGE_ERROR);
    }
  }

  return { report, output, port, noOpen, serve };
}

function resolveReportPath(explicitPath?: string): string {
  if (explicitPath) {
    const resolved = path.resolve(explicitPath);
    if (!fs.existsSync(resolved)) {
      throw new CliError(`Report file not found: ${resolved}`, ExitCode.NOT_FOUND);
    }
    return resolved;
  }

  for (const candidate of DEFAULT_REPORT_PATHS) {
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }

  throw new CliError(
    "No report found. Run 'veris scan' first, or specify a report path.",
    ExitCode.NOT_FOUND,
  );
}

export async function runDashboard(
  options: DashboardCommandOptions,
): Promise<{ exitCode: number; server?: DashboardServerInstance; outputPath?: string }> {
  if (options.report === '--help') {
    process.stdout.write(DASHBOARD_HELP);
    return { exitCode: ExitCode.SUCCESS };
  }

  try {
    const reportPath = resolveReportPath(options.report);

    // Mode determination:
    // If output is specified and --serve is NOT explicitly passed, we only export the HTML file.
    // Otherwise, we launch the server.
    const isExportOnly = Boolean(options.output && !options.serve);

    const generated = await generateDashboard({
      reportPath,
      output: options.output,
    });

    if (isExportOnly) {
      process.stdout.write(`Exported visual investigation dashboard to: ${generated.outputPath}\n`);
      return { exitCode: ExitCode.SUCCESS, outputPath: generated.outputPath };
    }

    const server = await startDashboardServer({
      html: generated.html,
      port: options.port,
      noOpen: options.noOpen,
    });

    const vm = generated.viewModel;
    process.stdout.write(`\n  VERIS Visual Investigation Dashboard\n`);
    process.stdout.write(`  ====================================\n`);
    process.stdout.write(`  Server URL:    ${server.url}\n`);
    process.stdout.write(`  Target:        ${vm.targetPath}\n`);
    process.stdout.write(`  Risk Score:    ${vm.riskScore}/100 (${vm.riskLevel})\n`);
    process.stdout.write(
      `  Findings:      ${vm.totalFindings} (Critical: ${vm.severityCounts.critical}, High: ${vm.severityCounts.high})\n`,
    );
    if (generated.outputPath) {
      process.stdout.write(`  HTML File:     ${generated.outputPath}\n`);
    }
    process.stdout.write(`\n  Press Ctrl+C to stop server.\n\n`);

    // In non-interactive or testing environments (or if signal arrives), handle graceful exit
    const cleanup = async (): Promise<void> => {
      try {
        await server.close();
      } catch {
        // Ignore close error during teardown
      }
    };

    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);

    return { exitCode: ExitCode.SUCCESS, server, outputPath: generated.outputPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
    const exitCode = error instanceof CliError ? error.exitCode : ExitCode.ERROR;
    return { exitCode };
  }
}
