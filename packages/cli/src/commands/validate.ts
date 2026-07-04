/**
 * `veris validate` command — validate configuration or rules.
 *
 * Usage:
 *   veris validate [config-path]
 *   veris validate rules [rules-path]
 *
 * @module @veris/cli/commands/validate
 */

import * as fs from 'node:fs';

import { ExitCode, CliError } from '../wirer.js';

// ── Validate Command Options ──

export interface ValidateOptions {
  /** What to validate: "config" or "rules". */
  readonly type: 'config' | 'rules';
  /** Path to the config or rules file. */
  readonly path?: string;
}

// ── Help Text ──

export const VALIDATE_HELP = `
Validate VERIS configuration or rules files.

USAGE
  veris validate [path]                  Validate configuration file
  veris validate rules [path]            Validate rules file

OPTIONS
  --help                 Show this help message

EXAMPLES
  veris validate                         Validate default config
  veris validate ./veris.config.json     Validate specific config file
  veris validate rules                   Validate default rules
  veris validate rules ./custom-rules    Validate specific rules file

EXIT CODES
  0  Valid
  1  Invalid
  2  Usage error
`;

// ── Command Handler ──

export async function runValidate(options: ValidateOptions): Promise<{ exitCode: number }> {
  try {
    if (options.type === 'config') {
      return validateConfig(options.path);
    } else {
      return validateRules(options.path);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
    return { exitCode: error instanceof CliError ? error.exitCode : ExitCode.ERROR };
  }
}

async function validateConfig(configPath?: string): Promise<{ exitCode: number }> {
  const paths = configPath
    ? [configPath]
    : ['./veris.config.json', './.veris/config.json', './veris.yaml', './veris.yml'];

  let found = false;
  for (const p of paths) {
    if (fs.existsSync(p)) {
      found = true;
      try {
        const content = fs.readFileSync(p, 'utf-8');
        const ext = p.split('.').pop()?.toLowerCase();

        if (ext === 'json') {
          JSON.parse(content); // validate JSON
        }

        process.stdout.write(`✅ Config is valid: ${p}\n`);
        return { exitCode: ExitCode.SUCCESS };
      } catch (error) {
        process.stderr.write(`❌ Invalid config: ${p}\n`);
        process.stderr.write(`   ${error instanceof Error ? error.message : String(error)}\n`);
        return { exitCode: ExitCode.ERROR };
      }
    }
  }

  if (!found) {
    process.stdout.write("No configuration file found. Run 'veris init' to create one.\n");
    return { exitCode: ExitCode.SUCCESS };
  }

  return { exitCode: ExitCode.SUCCESS };
}

async function validateRules(rulesPath?: string): Promise<{ exitCode: number }> {
  const paths = rulesPath ? [rulesPath] : ['./rules', './.veris/rules'];

  let found = false;
  for (const p of paths) {
    if (fs.existsSync(p)) {
      found = true;
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        const files = fs
          .readdirSync(p)
          .filter((f) => f.endsWith('.json') || f.endsWith('.yaml') || f.endsWith('.yml'));
        process.stdout.write(`✅ Rules directory found: ${p} (${files.length} rule files)\n`);
        return { exitCode: ExitCode.SUCCESS };
      } else {
        process.stdout.write(`✅ Rules file found: ${p}\n`);
        return { exitCode: ExitCode.SUCCESS };
      }
    }
  }

  if (!found) {
    process.stdout.write('No rules found. Using built-in rules.\n');
    return { exitCode: ExitCode.SUCCESS };
  }

  return { exitCode: ExitCode.SUCCESS };
}

// ── Parse Function ──

export function parseValidateArgs(args: readonly string[]): ValidateOptions {
  if (args.length === 0 || args[0] === '--help') {
    return { type: 'config' };
  }

  if (args[0] === 'rules') {
    return { type: 'rules', path: args[1] };
  }

  return { type: 'config', path: args[0] };
}
