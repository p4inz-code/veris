/**
 * `veris report` command — export an existing report.
 *
 * Usage:
 *   veris report [path] [options]
 *
 * @module @veris/cli/commands/report
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { CanonicalReport } from '@veris/core';
import { exportReport, type ExportOptions } from '@veris/exporters';

import { ExitCode, CliError } from '../wirer.js';

// ── Report Command Options ──

export interface ReportOptions {
  /** Report file path. */
  readonly report?: string;
  /** Output format(s). */
  readonly format?: string[];
  /** Output directory. */
  readonly output?: string;
  /** Pretty-print output. */
  readonly pretty?: boolean;
  /** List available formats. */
  readonly listFormats?: boolean;
}

// ── Help Text ──

export const REPORT_HELP = `
Generate and export reports from existing scan results.

USAGE
  veris report [report-path]              Export report (default formats)
  veris report --format json              Export as JSON only
  veris report --format json,html         Export as JSON and HTML
  veris report --output ./out             Specify output directory
  veris report --list-formats             List available export formats

OPTIONS
  --format, -f <formats>     Output format(s): json, markdown, html, sarif, csv, junit
  --output, -o <dir>         Output directory (default: ./veris-output)
  --pretty                   Pretty-print output (default: true)
  --list-formats             List supported export formats
  --help                     Show this help message

EXAMPLES
  veris report                           Export from default report path
  veris report ./report.json             Export from specific file
  veris report --format html             Export as HTML
  veris report --format json,csv         Export as JSON and CSV

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

// ── Supported Formats ──

const SUPPORTED_FORMATS = ['json', 'markdown', 'html', 'sarif', 'csv', 'junit'];

// ── Command Handler ──

export async function runReport(options: ReportOptions): Promise<{ exitCode: number }> {
  try {
    // List formats mode
    if (options.listFormats) {
      process.stdout.write('Supported export formats:\n');
      for (const fmt of SUPPORTED_FORMATS) {
        process.stdout.write(`  - ${fmt}\n`);
      }
      return { exitCode: ExitCode.SUCCESS };
    }

    // Find and load the report
    const reportPath = options.report ?? findReport();
    const report = loadReport(reportPath);

    // Determine export formats
    const formats = options.format ?? ['json', 'markdown'];

    // Export directory
    const exportDir = options.output ?? path.resolve(process.cwd(), 'veris-output');

    // Export to each format
    for (const format of formats) {
      const fmt = format.trim().toLowerCase();
      const ext = fmt === 'markdown' ? 'md' : fmt;
      const exportOpts: ExportOptions = {
        pretty: options.pretty ?? true,
      };

      const result = exportReport(report, fmt, exportOpts);

      const { mkdir, writeFile } = await import('node:fs/promises');
      await mkdir(exportDir, { recursive: true });

      const filePath = path.join(exportDir, `report.${ext}`);
      await writeFile(filePath, result.content, 'utf-8');

      process.stdout.write(`  Wrote ${filePath}\n`);
    }

    process.stdout.write('Report export complete.\n');
    return { exitCode: ExitCode.SUCCESS };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
    return { exitCode: error instanceof CliError ? error.exitCode : ExitCode.ERROR };
  }
}

// ── Helper Functions ──

function findReport(): string {
  for (const reportPath of DEFAULT_REPORT_PATHS) {
    if (fs.existsSync(reportPath)) {
      return reportPath;
    }
  }
  throw new CliError(
    "No report found. Run 'veris scan' first, or specify a report path.",
    ExitCode.NOT_FOUND,
  );
}

function loadReport(reportPath: string): CanonicalReport {
  const absolutePath = path.resolve(reportPath);

  if (!fs.existsSync(absolutePath)) {
    throw new CliError(`Report file not found: ${absolutePath}`, ExitCode.NOT_FOUND);
  }

  try {
    const content = fs.readFileSync(absolutePath, 'utf-8');
    const report = JSON.parse(content) as CanonicalReport;
    if (!report.id || !report.findings || !report.summary) {
      throw new CliError('Invalid report format.', ExitCode.USAGE_ERROR);
    }
    return report;
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(
      `Failed to load report: ${error instanceof Error ? error.message : String(error)}`,
      ExitCode.ERROR,
    );
  }
}

// ── Parse Function ──

export function parseReportArgs(args: readonly string[]): ReportOptions {
  let reportPath: string | undefined;
  let format: string[] | undefined;
  let output: string | undefined;
  let pretty: boolean | undefined;
  let listFormats = false;

  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    switch (arg) {
      case '--format':
      case '-f': {
        i++;
        if (i >= args.length)
          throw new CliError('Missing value for --format', ExitCode.USAGE_ERROR);
        format = args[i].split(',').map((f) => f.trim());
        break;
      }

      case '--output':
      case '-o': {
        i++;
        if (i >= args.length)
          throw new CliError('Missing value for --output', ExitCode.USAGE_ERROR);
        output = args[i];
        break;
      }

      case '--pretty':
        pretty = true;
        break;

      case '--no-pretty':
        pretty = false;
        break;

      case '--list-formats':
        listFormats = true;
        break;

      case '--help':
        process.stdout.write(REPORT_HELP);
        process.exit(ExitCode.SUCCESS);

      default:
        if (!arg.startsWith('--')) {
          reportPath = arg;
        } else {
          throw new CliError(`Unknown option: ${arg}`, ExitCode.USAGE_ERROR);
        }
    }

    i++;
  }

  return { report: reportPath, format, output, pretty, listFormats };
}
