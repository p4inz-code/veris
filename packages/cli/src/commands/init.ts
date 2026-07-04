/**
 * `veris init` command — initialize VERIS configuration.
 *
 * Usage:
 *   veris init [options]
 *
 * Creates a default veris.config.json in the current directory.
 *
 * @module @veris/cli/commands/init
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { ExitCode, CliError } from '../wirer.js';

// ── Init Command Options ──

export interface InitOptions {
  /** Output path for the config file. */
  readonly output?: string;
  /** Force overwrite existing config. */
  readonly force?: boolean;
}

// ── Help Text ──

export const INIT_HELP = `
Initialize VERIS configuration in the current directory.

Creates a default veris.config.json file with recommended settings.

USAGE
  veris init                         Create config in current directory
  veris init --output ./custom       Create config in custom directory
  veris init --force                 Overwrite existing config

OPTIONS
  --output, -o <dir>    Output directory for config (default: .)
  --force, -f           Overwrite existing configuration without prompting
  --help                Show this help message

EXAMPLES
  veris init                          Create default config
  veris init --output ./project       Create config in ./project
  veris init --force                  Overwrite existing config

EXIT CODES
  0  Success
  1  Error
  2  Usage error
`;

// ── Default Configuration Template ──

const DEFAULT_CONFIG = {
  $schema: 'https://raw.githubusercontent.com/veris/veris/main/schemas/config.json',
  version: '0.1.0',
  scan: {
    target: '.',
    maxFindings: 1000,
    severityThreshold: 'low',
    extractors: {
      enabled: ['string', 'hash', 'entropy', 'binary', 'document', 'archive'],
      disabled: [],
    },
    rules: {
      enabledPacks: ['default'],
      disabledPacks: [],
    },
  },
  output: {
    formats: ['json', 'markdown'],
    directory: './veris-output',
    pretty: true,
  },
  limits: {
    maxFileSize: 104857600,
    maxFilesPerScan: 100000,
    maxArchiveDepth: 10,
    maxFindings: 100000,
    maxRecommendations: 1000,
  },
  telemetry: {
    enabled: false,
  },
};

// ── Command Handler ──

export async function runInit(options: InitOptions): Promise<{ exitCode: number }> {
  try {
    const outputDir = options.output ?? process.cwd();
    const configPath = path.join(outputDir, 'veris.config.json');

    // Check if config already exists
    if (fs.existsSync(configPath) && !options.force) {
      process.stderr.write(`Config already exists: ${configPath}\n`);
      process.stderr.write('Use --force to overwrite.\n');
      return { exitCode: ExitCode.ERROR };
    }

    // Create output directory if needed
    fs.mkdirSync(outputDir, { recursive: true });

    // Write default config
    const content = JSON.stringify(DEFAULT_CONFIG, null, 2);
    fs.writeFileSync(configPath, content, 'utf-8');

    process.stdout.write(`✅ Created configuration: ${configPath}\n`);
    process.stdout.write('\nNext steps:\n');
    process.stdout.write('  1. Edit veris.config.json to customize settings\n');
    process.stdout.write("  2. Run 'veris scan' to start analysis\n");
    process.stdout.write("  3. Run 'veris scan --help' for more options\n");

    return { exitCode: ExitCode.SUCCESS };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
    return { exitCode: ExitCode.ERROR };
  }
}

// ── Parse Function ──

export function parseInitArgs(args: readonly string[]): InitOptions {
  let output: string | undefined;
  let force = false;

  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    switch (arg) {
      case '--output':
      case '-o': {
        i++;
        if (i >= args.length)
          throw new CliError('Missing value for --output', ExitCode.USAGE_ERROR);
        output = args[i];
        break;
      }

      case '--force':
      case '-f':
        force = true;
        break;

      case '--help':
        process.stdout.write(INIT_HELP);
        process.exit(ExitCode.SUCCESS);

      default:
        throw new CliError(`Unknown option: ${arg}`, ExitCode.USAGE_ERROR);
    }

    i++;
  }

  return { output, force };
}
