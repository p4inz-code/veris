/**
 * @veris/cli — VERIS CLI programmatic API.
 *
 * Provides programmatic access to CLI commands for use in scripts and tests.
 *
 * Commands:
 * - scan — Run analysis pipeline and generate reports
 * - report — Export existing reports
 * - explain — Explain findings, chains, and risk dimensions using AI
 * - summarize — Summarize scan reports using AI
 * - validate — Validate configuration or rules
 * - init — Initialize VERIS configuration
 * - completion — Generate shell completions
 *
 * ## Invariants
 * - CLI is the composition root (dependency injection wiring)
 * - CLI never contains analysis logic
 * - CLI commands delegate to domain packages
 *
 * @module @veris/cli
 */

// ── CLI Entry Point ──

export { main as runCli } from './cli.js';

// ── Command Handlers ──

export { runExplain, parseExplainArgs, EXPLAIN_HELP } from './commands/explain.js';
export type { ExplainOptions } from './commands/explain.js';

export { runSummarize, parseSummarizeArgs, SUMMARIZE_HELP } from './commands/summarize.js';
export type { SummarizeOptions } from './commands/summarize.js';

export { runScan, parseScanArgs, SCAN_HELP } from './commands/scan.js';
export type { ScanOptions } from './commands/scan.js';

export { runReport, parseReportArgs, REPORT_HELP } from './commands/report.js';
export type { ReportOptions } from './commands/report.js';

export { runValidate, parseValidateArgs, VALIDATE_HELP } from './commands/validate.js';
export type { ValidateOptions } from './commands/validate.js';

export { runInit, parseInitArgs, INIT_HELP } from './commands/init.js';
export type { InitOptions } from './commands/init.js';

export { runCompletion, parseCompletionArgs, COMPLETION_HELP } from './commands/completion.js';
export type { CompletionOptions } from './commands/completion.js';

// ── Command Registry ──

export { registerCommand, getCommand, getAllCommands, dispatchCommand } from './commands/index.js';
export type { CliCommand } from './commands/index.js';

// ── Wiring ──

export {
  wireCli,
  formatResult,
  resultToExitCode,
  ExitCode,
  CliError,
  CLI_VERSION,
} from './wirer.js';
export type { CliContext, WireOptions, ExitCodeValue } from './wirer.js';
