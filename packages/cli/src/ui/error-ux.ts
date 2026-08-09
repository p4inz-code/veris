/**
 * Error UX — top-level CLI error presentation.
 *
 * Presents command failures in a calm, actionable way without exposing
 * raw stack traces to normal users:
 *
 *   error: <message>
 *   hint:  Run 'veris <command> --help' for usage
 *
 * Hints are derived ONLY from the error's exit code and the command that
 * was invoked. When the message already contains the guidance, no hint is
 * duplicated. Stack traces appear only with --verbose.
 *
 * Exit codes, machine-readable (JSON) output, and diagnostic semantics
 * are never changed — this is presentation only.
 *
 * @module @veris/cli/ui
 */

import { ExitCode, type ExitCodeValue } from '../wirer.js';

import { getSymbolSet } from './renderer/index.js';
import { getResolvedTheme, ansiReset } from './theme/index.js';

/** Context available when formatting a top-level error. */
export interface CliErrorContext {
  /** The command that was invoked (for targeted hints). */
  readonly command?: string;
  /** Whether --verbose was passed (enables stack traces). */
  readonly verbose?: boolean;
}

/** Hint mapped from the error's exit code — never invented, always grounded. */
function hintForExitCode(exitCode: number, command?: string): string | undefined {
  switch (exitCode) {
    case ExitCode.USAGE_ERROR:
      return `Run 'veris ${command ?? '<command>'} --help' for usage`;
    case ExitCode.NOT_FOUND:
      return "Run 'veris scan' first, or specify the report path";
    case ExitCode.PROVIDER_UNAVAILABLE:
      return 'Check your AI provider configuration, or use --offline for local mode';
    case ExitCode.CACHE_ERROR:
      return 'Clear the explanation cache and retry';
    default:
      return 'Run with --verbose for more details';
  }
}

/**
 * Format a top-level CLI error for display.
 *
 * @param error - The thrown error.
 * @param exitCode - The exit code the process will use.
 * @param context - Optional command context.
 * @returns The formatted error text (theme colors already applied).
 */
export function formatCliError(
  error: unknown,
  exitCode: ExitCodeValue,
  context: CliErrorContext = {},
): string {
  const theme = getResolvedTheme();
  const symbols = getSymbolSet();
  const message = error instanceof Error ? error.message : String(error);
  // Reset is only emitted when color is active — no-color output is clean.
  const R = ansiReset();

  const lines: string[] = [];
  lines.push(`${theme.status.error}${symbols.error}${R} ${theme.ui.text}${message}${R}`);

  // Only offer a hint when the message doesn't already contain its own
  // guidance (usage or resolution text). Avoids duplicate hints.
  const hint = hintForExitCode(exitCode, context.command);
  if (
    hint &&
    !message.includes("--help'") &&
    !message.includes('for usage') &&
    !message.includes('veris scan')
  ) {
    lines.push(` ${theme.ui.textDim}${symbols.arrow}${R} ${theme.ui.textDim}${hint}${R}`);
  }

  if (context.verbose && error instanceof Error && error.stack) {
    lines.push(` ${theme.ui.textDim}${symbols.bullet} Stack:${R}`);
    for (const stackLine of error.stack.split('\n')) {
      lines.push(`   ${stackLine}`);
    }
  }

  return lines.join('\n');
}
