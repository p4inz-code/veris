#!/usr/bin/env node

/**
 * @veris/cli — VERIS CLI binary entry point.
 *
 * This is the composition root where all dependencies are wired together.
 *
 * Usage:
 *   veris <command> [options]
 *
 * Commands:
 *   scan          Run analysis on artifacts
 *   report        Generate and export reports
 *   init          Initialize VERIS configuration
 *   validate      Validate configuration or rules
 *   explain       Explain a finding, chain, or risk dimension using AI
 *   summarize     Summarize a scan report using AI
 *   version       Show version information
 *   completion    Generate shell completions
 *
 * @module @veris/cli
 */

import { runCompletion, parseCompletionArgs, COMPLETION_HELP } from './commands/completion.js';
import { runExplain, parseExplainArgs, EXPLAIN_HELP } from './commands/explain.js';
import { registerCommand, dispatchCommand, type CliCommand } from './commands/index.js';
import { runInit, parseInitArgs, INIT_HELP } from './commands/init.js';
import { runReport, parseReportArgs, REPORT_HELP } from './commands/report.js';
import { runScan, parseScanArgs, SCAN_HELP } from './commands/scan.js';
import { runSummarize, parseSummarizeArgs, SUMMARIZE_HELP } from './commands/summarize.js';
import { runValidate, parseValidateArgs, VALIDATE_HELP } from './commands/validate.js';
import { ExitCode, CLI_VERSION } from './wirer.js';

// ── Global Help Text ──

const GLOBAL_HELP = `
VERIS — Deterministic Security Analysis Platform v${CLI_VERSION}

USAGE
  veris <command> [options]

COMMANDS
  scan              Run analysis on artifacts
  report            Generate and export reports
  init              Initialize VERIS configuration
  validate          Validate configuration or rules
  explain           Explain findings using AI
  summarize         Summarize scan report using AI
  version           Show version information
  completion        Generate shell completions

GLOBAL OPTIONS
  --help, -h        Show help for any command
  --version, -v     Show version information

EXAMPLES
  veris scan                        Run a scan on the current directory
  veris explain fin_abc123          Explain a finding
  veris explain fin_abc123 --json   Explain as JSON
  veris summarize                   Summarize the latest scan

Run 'veris <command> --help' for command-specific help.
`;

// ── Version Text ──

const VERSION_TEXT = `veris v${CLI_VERSION}`;

// ── Register Commands ──

/** Register all CLI commands. */
function registerAllCommands(): void {
  // Explain command
  const explainCommand: CliCommand = {
    name: 'explain',
    description: 'Explain a finding, chain, or risk dimension using AI',
    usage:
      'veris explain <finding-id> [options] || veris explain chain <chain-id> [options] || veris explain risk <dimension-id> [options]',
    async run(args: readonly string[]): Promise<number> {
      if (args.length === 0 || args[0] === '--help') {
        process.stdout.write(EXPLAIN_HELP);
        return ExitCode.SUCCESS;
      }
      const options = parseExplainArgs(args);
      const { exitCode } = await runExplain(options);
      return exitCode;
    },
  };

  // Summarize command
  const summarizeCommand: CliCommand = {
    name: 'summarize',
    description: 'Summarize a scan report using AI',
    usage: 'veris summarize [options]',
    async run(args: readonly string[]): Promise<number> {
      if (args[0] === '--help') {
        process.stdout.write(SUMMARIZE_HELP);
        return ExitCode.SUCCESS;
      }
      const options = parseSummarizeArgs(args);
      const { exitCode } = await runSummarize(options);
      return exitCode;
    },
  };

  // Scan command
  const scanCommand: CliCommand = {
    name: 'scan',
    description: 'Run analysis on artifacts',
    usage: 'veris scan [target] [options]',
    async run(args: readonly string[]): Promise<number> {
      if (args[0] === '--help' || args[0] === '-h') {
        process.stdout.write(SCAN_HELP);
        return ExitCode.SUCCESS;
      }
      const options = parseScanArgs(args);
      const { exitCode } = await runScan({
        ...options,
        computedAt: new Date().toISOString(),
      });
      return exitCode;
    },
  };

  // Report command
  const reportCommand: CliCommand = {
    name: 'report',
    description: 'Generate and export reports',
    usage: 'veris report [path] [options]',
    async run(args: readonly string[]): Promise<number> {
      if (args[0] === '--help' || args[0] === '-h') {
        process.stdout.write(REPORT_HELP);
        return ExitCode.SUCCESS;
      }
      const options = parseReportArgs(args);
      const { exitCode } = await runReport(options);
      return exitCode;
    },
  };

  // Validate command
  const validateCommand: CliCommand = {
    name: 'validate',
    description: 'Validate configuration or rules',
    usage: 'veris validate [path] || veris validate rules [path]',
    async run(args: readonly string[]): Promise<number> {
      if (args[0] === '--help' || args[0] === '-h') {
        process.stdout.write(VALIDATE_HELP);
        return ExitCode.SUCCESS;
      }
      const options = parseValidateArgs(args);
      const { exitCode } = await runValidate(options);
      return exitCode;
    },
  };

  // Init command
  const initCommand: CliCommand = {
    name: 'init',
    description: 'Initialize VERIS configuration',
    usage: 'veris init [options]',
    async run(args: readonly string[]): Promise<number> {
      if (args[0] === '--help' || args[0] === '-h') {
        process.stdout.write(INIT_HELP);
        return ExitCode.SUCCESS;
      }
      const options = parseInitArgs(args);
      const { exitCode } = await runInit(options);
      return exitCode;
    },
  };

  // Version command
  const versionCommand: CliCommand = {
    name: 'version',
    description: 'Show version information',
    usage: 'veris version',
    async run(_args: readonly string[]): Promise<number> {
      process.stdout.write(VERSION_TEXT + '\n');
      return ExitCode.SUCCESS;
    },
  };

  // Completion command
  const completionCommand: CliCommand = {
    name: 'completion',
    description: 'Generate shell completions',
    usage: 'veris completion <bash|zsh|fish>',
    async run(args: readonly string[]): Promise<number> {
      if (args[0] === '--help' || args[0] === '-h') {
        process.stdout.write(COMPLETION_HELP);
        return ExitCode.SUCCESS;
      }
      const options = parseCompletionArgs(args);
      const { exitCode } = await runCompletion(options);
      return exitCode;
    },
  };

  // Register all commands
  registerCommand(explainCommand);
  registerCommand(summarizeCommand);
  registerCommand(scanCommand);
  registerCommand(reportCommand);
  registerCommand(validateCommand);
  registerCommand(initCommand);
  registerCommand(versionCommand);
  registerCommand(completionCommand);
}

// ── Main Entry Point ──

/**
 * Main CLI entry point.
 *
 * Parses the command from argv and dispatches to the appropriate handler.
 *
 * @param argv - The raw process.argv array.
 */
export async function main(argv: string[]): Promise<void> {
  // Skip node binary and script path
  const args = argv.slice(2);

  registerAllCommands();

  // No arguments — show global help
  if (args.length === 0) {
    process.stdout.write(GLOBAL_HELP);
    process.exit(ExitCode.SUCCESS);
  }

  const firstArg = args[0];

  // Handle global flags
  switch (firstArg) {
    case '--help':
    case '-h':
      process.stdout.write(GLOBAL_HELP);
      process.exit(ExitCode.SUCCESS);
      return;

    case '--version':
    case '-v':
      process.stdout.write(VERSION_TEXT + '\n');
      process.exit(ExitCode.SUCCESS);
      return;
  }

  // Dispatch to command handler
  try {
    const exitCode = await dispatchCommand(firstArg, args.slice(1));
    process.exit(exitCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(
      error instanceof Object && 'exitCode' in (error as object)
        ? (error as { exitCode: number }).exitCode
        : ExitCode.ERROR,
    );
  }
}

/**
 * Registered cleanup handlers to run on shutdown.
 * Each handler is called once on SIGINT/SIGTERM.
 */
const shutdownHandlers: Array<() => void | Promise<void>> = [];

/**
 * Register a cleanup handler to run on graceful shutdown.
 */
export function onShutdown(handler: () => void | Promise<void>): void {
  shutdownHandlers.push(handler);
}

/**
 * Handle graceful shutdown on SIGINT/SIGTERM.
 * Cancels the running pipeline, flushes diagnostics, and exits cleanly.
 */
function handleShutdown(signal: string): void {
  const runCleanup = async (): Promise<void> => {
    process.stderr.write(`\nReceived ${signal}. Shutting down gracefully...\n`);

    for (const handler of shutdownHandlers) {
      try {
        await handler();
      } catch {
        // Swallow individual handler errors during shutdown
      }
    }

    process.exit(ExitCode.SUCCESS);
  };

  runCleanup();
}

// Register signal handlers
process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

// Bootstrap
main(process.argv).catch((error) => {
  process.stderr.write(`Fatal error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(ExitCode.ERROR);
});
