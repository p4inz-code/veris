/**
 * Command registry — registers and dispatches CLI commands.
 *
 * @module @veris/cli/commands
 */

import { ExitCode, CliError } from '../wirer.js';

// ── Command Interface ──

/** A registered CLI command. */
export interface CliCommand {
  readonly name: string;
  readonly description: string;
  readonly usage: string;
  run(args: readonly string[]): Promise<number>;
}

// ── Command Registry ──

const commands = new Map<string, CliCommand>();

/**
 * Register a CLI command.
 *
 * @param command - The command to register.
 */
export function registerCommand(command: CliCommand): void {
  commands.set(command.name, command);
}

/**
 * Get a registered command by name.
 *
 * @param name - The command name.
 * @returns The command, or undefined if not found.
 */
export function getCommand(name: string): CliCommand | undefined {
  return commands.get(name);
}

/**
 * Get all registered commands.
 *
 * @returns Array of all registered commands.
 */
export function getAllCommands(): CliCommand[] {
  return Array.from(commands.values());
}

/**
 * Dispatch a command by name.
 *
 * @param name - The command name.
 * @param args - The command arguments (excluding the command name).
 * @returns The exit code.
 * @throws CliError if the command is not found.
 */
export async function dispatchCommand(name: string, args: readonly string[]): Promise<number> {
  const command = commands.get(name);

  if (!command) {
    throw new CliError(
      `Unknown command: "${name}". Run 'veris --help' for usage.`,
      ExitCode.USAGE_ERROR,
    );
  }

  return command.run(args);
}
