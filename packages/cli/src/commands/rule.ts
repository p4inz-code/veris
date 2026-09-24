/**
 * `veris rule` command — AI-assisted rule authoring and declarative rule pack management.
 *
 * Implements Phase 12 & ADR-016:
 *   veris rule author [options]
 *   veris rule author --promote <candidate-path> --target-dir <plugins-dir>
 *
 * @module @veris/cli/commands/rule
 */

import {
  type PropertyMatcherOperator,
  type RuleAuthoringRequest,
  type SeverityLevel,
  promoteCandidateRule,
  runRuleAuthor,
} from '../authoring/index.js';
import { CliError, ExitCode } from '../wirer.js';

export const RULE_HELP = `
AI-assisted rule authoring and declarative rule pack management.

USAGE
  veris rule author [options]
  veris rule author --promote <candidate-path> --target-dir <plugins-dir>

OPTIONS
  --intent <text>            Threat or condition description to detect (required)
  --name <title>             Human-readable rule name
  --pack-id <id>             Custom rule pack identifier
  --category <category>      Rule category (execution, persistence, credential-access, etc.)
  --evidence-type <type>     Target evidence type (e.g. pe-import, configuration, script-pattern)
  --property <path>          JSON property path to inspect (e.g. metadata.commandLine, value)
  --matcher <operator>       Matcher operator (equals, contains, regex, gt, lt, exists, in)
  --value <val>              Expected value or regex pattern
  --cwe <id>                 Associated CWE identifier (e.g. CWE-78, CWE-798)
  --taxonomy-id <id>         Custom taxonomy ID to monitor
  --severity <level>         Target severity (critical, high, medium, low, info)
  --provider <name>          LLM provider (offline, ollama, openai, anthropic)
  --offline                  Force 100% offline rule template generator (no network)
  --output, -o <file>        Output path for candidate artifact (default: candidate-<id>.json)
  --format <json|markdown>   Output presentation format (default: json)
  --dry-run                  Validate and test without writing files to disk
  --promote <file>           Promote an approved candidate rule pack to an active plugin
  --target-dir <dir>         Target plugin directory for promotion
  --help, -h                 Show this help message

EXAMPLES
  veris rule author --intent "Detect cleartext AWS keys in config files"
  veris rule author --intent "Detect PowerShell encoded execution" --category execution --severity high
  veris rule author --intent "Flag excessive file entropy" --matcher gt --value 7.5 --severity high
  veris rule author --intent "Detect debug flags" --dry-run
  veris rule author --promote ./candidate-pack.json --target-dir ./.veris/plugins

EXIT CODES
  0  Success (candidate generated and tested, or candidate promoted)
  1  Validation or test failure
  2  Usage error
`;

/**
 * Parse CLI arguments for `veris rule` command.
 */
export function parseRuleArgs(args: readonly string[]): {
  readonly mode: 'author' | 'promote';
  readonly authorRequest?: RuleAuthoringRequest;
  readonly promoteCandidate?: string;
  readonly promoteTarget?: string;
} {
  let subCommand = '';
  const remainingArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (i === 0 && !a.startsWith('-')) {
      subCommand = a;
    } else {
      remainingArgs.push(a);
    }
  }

  // Handle help
  if (
    remainingArgs.includes('--help') ||
    remainingArgs.includes('-h') ||
    subCommand === '--help' ||
    subCommand === '-h'
  ) {
    process.stdout.write(RULE_HELP);
    process.exit(ExitCode.SUCCESS);
  }

  let promoteCandidate: string | undefined;
  let promoteTarget: string | undefined;

  let intent = '';
  let name: string | undefined;
  let packId: string | undefined;
  let category: string | undefined;
  let evidenceType: string | undefined;
  let propertyPath: string | undefined;
  let matcherOperator: PropertyMatcherOperator | undefined;
  let expectedValue: unknown;
  let cweId: string | undefined;
  let taxonomyId: string | undefined;
  let severity: SeverityLevel | undefined;
  let provider: string | undefined;
  let offline = false;
  let output: string | undefined;
  let format: 'json' | 'markdown' | undefined;
  let dryRun = false;

  let i = 0;
  while (i < remainingArgs.length) {
    const arg = remainingArgs[i];

    switch (arg) {
      case '--promote': {
        i++;
        if (i >= remainingArgs.length)
          throw new CliError('Missing value for --promote', ExitCode.USAGE_ERROR);
        promoteCandidate = remainingArgs[i];
        break;
      }

      case '--target-dir': {
        i++;
        if (i >= remainingArgs.length)
          throw new CliError('Missing value for --target-dir', ExitCode.USAGE_ERROR);
        promoteTarget = remainingArgs[i];
        break;
      }

      case '--intent': {
        i++;
        if (i >= remainingArgs.length)
          throw new CliError('Missing value for --intent', ExitCode.USAGE_ERROR);
        intent = remainingArgs[i];
        break;
      }

      case '--name': {
        i++;
        if (i >= remainingArgs.length)
          throw new CliError('Missing value for --name', ExitCode.USAGE_ERROR);
        name = remainingArgs[i];
        break;
      }

      case '--pack-id': {
        i++;
        if (i >= remainingArgs.length)
          throw new CliError('Missing value for --pack-id', ExitCode.USAGE_ERROR);
        packId = remainingArgs[i];
        break;
      }

      case '--category': {
        i++;
        if (i >= remainingArgs.length)
          throw new CliError('Missing value for --category', ExitCode.USAGE_ERROR);
        category = remainingArgs[i];
        break;
      }

      case '--evidence-type': {
        i++;
        if (i >= remainingArgs.length)
          throw new CliError('Missing value for --evidence-type', ExitCode.USAGE_ERROR);
        evidenceType = remainingArgs[i];
        break;
      }

      case '--property': {
        i++;
        if (i >= remainingArgs.length)
          throw new CliError('Missing value for --property', ExitCode.USAGE_ERROR);
        propertyPath = remainingArgs[i];
        break;
      }

      case '--matcher': {
        i++;
        if (i >= remainingArgs.length)
          throw new CliError('Missing value for --matcher', ExitCode.USAGE_ERROR);
        matcherOperator = remainingArgs[i] as PropertyMatcherOperator;
        break;
      }

      case '--value': {
        i++;
        if (i >= remainingArgs.length)
          throw new CliError('Missing value for --value', ExitCode.USAGE_ERROR);
        const raw = remainingArgs[i];
        // Parse numbers or booleans if applicable
        if (raw === 'true') expectedValue = true;
        else if (raw === 'false') expectedValue = false;
        else if (!isNaN(Number(raw)) && raw.trim() !== '') expectedValue = Number(raw);
        else expectedValue = raw;
        break;
      }

      case '--cwe': {
        i++;
        if (i >= remainingArgs.length)
          throw new CliError('Missing value for --cwe', ExitCode.USAGE_ERROR);
        cweId = remainingArgs[i];
        break;
      }

      case '--taxonomy-id': {
        i++;
        if (i >= remainingArgs.length)
          throw new CliError('Missing value for --taxonomy-id', ExitCode.USAGE_ERROR);
        taxonomyId = remainingArgs[i];
        break;
      }

      case '--severity': {
        i++;
        if (i >= remainingArgs.length)
          throw new CliError('Missing value for --severity', ExitCode.USAGE_ERROR);
        severity = remainingArgs[i].toLowerCase() as SeverityLevel;
        break;
      }

      case '--provider': {
        i++;
        if (i >= remainingArgs.length)
          throw new CliError('Missing value for --provider', ExitCode.USAGE_ERROR);
        provider = remainingArgs[i];
        break;
      }

      case '--offline':
        offline = true;
        break;

      case '--output':
      case '-o': {
        i++;
        if (i >= remainingArgs.length)
          throw new CliError('Missing value for --output', ExitCode.USAGE_ERROR);
        output = remainingArgs[i];
        break;
      }

      case '--format': {
        i++;
        if (i >= remainingArgs.length)
          throw new CliError('Missing value for --format', ExitCode.USAGE_ERROR);
        const fmt = remainingArgs[i].toLowerCase();
        if (fmt === 'json' || fmt === 'markdown') format = fmt;
        break;
      }

      case '--dry-run':
        dryRun = true;
        break;

      default:
        if (!arg.startsWith('-') && !intent) {
          intent = arg;
        } else {
          throw new CliError(`Unknown option for rule command: "${arg}"`, ExitCode.USAGE_ERROR);
        }
    }

    i++;
  }

  if (promoteCandidate) {
    if (!promoteTarget) {
      throw new CliError('Promotion requires --target-dir <directory>.', ExitCode.USAGE_ERROR);
    }
    return {
      mode: 'promote',
      promoteCandidate,
      promoteTarget,
    };
  }

  if (!intent) {
    throw new CliError(
      'Rule authoring requires --intent <description> or an intent statement.',
      ExitCode.USAGE_ERROR,
    );
  }

  const authorRequest: RuleAuthoringRequest = Object.freeze({
    intent,
    name,
    packId,
    category: category as import('@veris/rules').RuleCategory,
    evidenceType,
    propertyPath,
    matcherOperator,
    expectedValue,
    cweId,
    taxonomyId,
    severity,
    provider,
    offline,
    output,
    format,
    dryRun,
  });

  return {
    mode: 'author',
    authorRequest,
  };
}

/**
 * Execute `veris rule` command.
 */
export async function runRule(args: readonly string[]): Promise<{ exitCode: number }> {
  const parsed = parseRuleArgs(args);

  if (parsed.mode === 'promote') {
    if (!parsed.promoteCandidate || !parsed.promoteTarget) {
      throw new CliError('Missing candidate or target for promotion.', ExitCode.USAGE_ERROR);
    }
    const res = await promoteCandidateRule(parsed.promoteCandidate, parsed.promoteTarget);
    return { exitCode: res.exitCode };
  }

  if (!parsed.authorRequest) {
    throw new CliError('Missing author request parameters.', ExitCode.USAGE_ERROR);
  }
  const res = await runRuleAuthor(parsed.authorRequest);
  return { exitCode: res.exitCode };
}
