/**
 * `veris completion` command — generate shell completion scripts.
 *
 * Usage:
 *   veris completion bash
 *   veris completion zsh
 *   veris completion fish
 *
 * @module @veris/cli/commands/completion
 */

import { ExitCode, CliError } from '../wirer.js';

// ── Completion Command Options ──

export interface CompletionOptions {
  readonly shell: 'bash' | 'zsh' | 'fish';
}

// ── Help Text ──

export const COMPLETION_HELP = [
  '',
  'Generate shell completion scripts for VERIS commands.',
  '',
  'USAGE',
  '  veris completion bash         Generate bash completions',
  '  veris completion zsh          Generate zsh completions',
  '  veris completion fish         Generate fish completions',
  '',
  'EXAMPLES',
  '  veris completion bash > /etc/bash_completion.d/veris',
  '  veris completion zsh > /usr/local/share/zsh/site-functions/_veris',
  '  veris completion fish > ~/.config/fish/completions/veris.fish',
  '',
  'EXIT CODES',
  '  0  Success',
  '  2  Usage error',
].join('\n');

// ── Command Handler ──

export async function runCompletion(options: CompletionOptions): Promise<{ exitCode: number }> {
  try {
    switch (options.shell) {
      case 'bash':
        process.stdout.write(bashCompletion());
        break;
      case 'zsh':
        process.stdout.write(zshCompletion());
        break;
      case 'fish':
        process.stdout.write(fishCompletion());
        break;
    }
    return { exitCode: ExitCode.SUCCESS };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
    return { exitCode: ExitCode.ERROR };
  }
}

// ── Completion Scripts ──

const CMDS = [
  'scan',
  'report',
  'explain',
  'summarize',
  'validate',
  'init',
  'version',
  'completion',
  'help',
];
const GLOB_OPTS = ['--help, -h', '--version, -v'];
const EXPLAIN_OPS = [
  '--mode',
  '--json',
  '--report',
  '--provider',
  '--model',
  '--no-audit',
  '--offline',
  '--verbose',
];
const SCAN_OPS = ['--output', '-o', '--format', '-f', '--max-findings', '--silent', '--verbose'];
const REPORT_OPS = [
  '--format',
  '-f',
  '--output',
  '-o',
  '--pretty',
  '--no-pretty',
  '--list-formats',
];
const INIT_OPS = ['--output', '-o', '--force', '-f'];
const FMTS = ['json', 'markdown', 'html', 'sarif', 'csv', 'junit'];
const MODES = ['simple', 'technical', 'expert'];
const SHLS = ['bash', 'zsh', 'fish'];

function bashCompletion(): string {
  const cmds = CMDS.join(' ');
  const fmts = FMTS.join(' ');
  const modes = MODES.join(' ');
  const shls = SHLS.join(' ');
  const globOpts = GLOB_OPTS.join(' ');
  const scOps = SCAN_OPS.join(' ');
  const rpOps = REPORT_OPS.join(' ');
  const initOps = INIT_OPS.join(' ');
  const expOps = EXPLAIN_OPS.join(' ');
  const sumOps = EXPLAIN_OPS.join(' ');

  return `# veris bash completion
_veris() {
    local cur prev words cword
    _init_completion || return

    if [[ $cword -eq 1 ]]; then
        COMPREPLY=($(compgen -W "${cmds}" -- "$cur"))
        return
    fi

    case $prev in
        explain|summarize)
            COMPREPLY=($(compgen -W "${expOps}" -- "$cur"))
            ;;
        scan)
            COMPREPLY=($(compgen -W "${scOps}" -- "$cur"))
            ;;
        report)
            COMPREPLY=($(compgen -W "${rpOps}" -- "$cur"))
            ;;
        init)
            COMPREPLY=($(compgen -W "${initOps}" -- "$cur"))
            ;;
        completion)
            COMPREPLY=($(compgen -W "${shls}" -- "$cur"))
            ;;
        --mode|-m)
            COMPREPLY=($(compgen -W "${modes}" -- "$cur"))
            ;;
        --format|-f)
            COMPREPLY=($(compgen -W "${fmts}" -- "$cur"))
            ;;
        *)
            COMPREPLY=($(compgen -W "${globOpts}" -- "$cur"))
            ;;
    esac
} && complete -F _veris veris
`;
}

function zshCompletion(): string {
  const cmds = CMDS.join(' ');
  const fmts = FMTS.join(' ');
  const modes = MODES.join(' ');
  const shls = SHLS.join(' ');

  return `#compdef veris
_veris() {
    local line
    _arguments -C \\
        "1:command:(${cmds})" \\
        "*::arg:->args"

    case $line[1] in
        scan)
            _arguments \\
                "--output[Output directory]:directory:_files -/" \\
                "--format[Output format]:format:(${fmts})" \\
                "--max-findings[Maximum findings]:number:" \\
                "--silent[Suppress output]" \\
                "--verbose[Verbose output]"
            ;;
        report)
            _arguments \\
                "--format[Output format]:format:(${fmts})" \\
                "--output[Output directory]:directory:_files -/" \\
                "--pretty[Pretty print]" \\
                "--list-formats[List formats]"
            ;;
        explain|summarize)
            _arguments \\
                "--mode[Explanation mode]:mode:(${modes})" \\
                "--json[JSON output]" \\
                "--report[Report path]:file:_files" \\
                "--provider[AI provider]:" \\
                "--model[Model name]:" \\
                "--no-audit[Disable audit]" \\
                "--offline[Force offline]" \\
                "--verbose[Verbose]"
            ;;
        completion)
            _arguments "1:shell:(${shls})"
            ;;
        init)
            _arguments \\
                "--output[Output directory]:directory:_files -/" \\
                "--force[Overwrite existing]"
            ;;
    esac
}
_veris
`;
}

function fishCompletion(): string {
  const cmds = CMDS.join(' ');
  const fmts = FMTS.join(' ');
  const modes = MODES.join(' ');
  const shls = SHLS.join(' ');

  return `# veris fish completion
complete -c veris -f

# Commands
complete -c veris -n "not __fish_seen_subcommand_from ${cmds}" -a scan -d "Run analysis on artifacts"
complete -c veris -n "not __fish_seen_subcommand_from ${cmds}" -a report -d "Generate and export reports"
complete -c veris -n "not __fish_seen_subcommand_from ${cmds}" -a explain -d "Explain findings using AI"
complete -c veris -n "not __fish_seen_subcommand_from ${cmds}" -a summarize -d "Summarize scan report"
complete -c veris -n "not __fish_seen_subcommand_from ${cmds}" -a validate -d "Validate configuration or rules"
complete -c veris -n "not __fish_seen_subcommand_from ${cmds}" -a init -d "Initialize VERIS configuration"
complete -c veris -n "not __fish_seen_subcommand_from ${cmds}" -a version -d "Show version information"
complete -c veris -n "not __fish_seen_subcommand_from ${cmds}" -a completion -d "Generate shell completions"

# Global options
complete -c veris -s h -l help -d "Show help"
complete -c veris -s v -l version -d "Show version"

# Scan options
complete -c veris -n "__fish_seen_subcommand_from scan" -s o -l output -d "Output directory" -r -a "(__fish_complete_directories)"
complete -c veris -n "__fish_seen_subcommand_from scan" -s f -l format -d "Output format" -r -a "${fmts}"
complete -c veris -n "__fish_seen_subcommand_from scan" -l max-findings -d "Maximum findings" -r
complete -c veris -n "__fish_seen_subcommand_from scan" -l silent -d "Suppress output"
complete -c veris -n "__fish_seen_subcommand_from scan" -l verbose -d "Verbose output"

# Report options
complete -c veris -n "__fish_seen_subcommand_from report" -s f -l format -d "Output format" -r -a "${fmts}"
complete -c veris -n "__fish_seen_subcommand_from report" -s o -l output -d "Output directory" -r -a "(__fish_complete_directories)"
complete -c veris -n "__fish_seen_subcommand_from report" -l pretty -d "Pretty print"
complete -c veris -n "__fish_seen_subcommand_from report" -l list-formats -d "List formats"

# Explain/Summarize options
for cmd in explain summarize
    complete -c veris -n "__fish_seen_subcommand_from $cmd" -l mode -d "Explanation mode" -r -a "${modes}"
    complete -c veris -n "__fish_seen_subcommand_from $cmd" -l json -d "JSON output"
    complete -c veris -n "__fish_seen_subcommand_from $cmd" -l report -d "Report path" -r
    complete -c veris -n "__fish_seen_subcommand_from $cmd" -l provider -d "AI provider" -r
    complete -c veris -n "__fish_seen_subcommand_from $cmd" -l model -d "Model" -r
    complete -c veris -n "__fish_seen_subcommand_from $cmd" -l no-audit -d "Disable audit"
    complete -c veris -n "__fish_seen_subcommand_from $cmd" -l offline -d "Force offline"
    complete -c veris -n "__fish_seen_subcommand_from $cmd" -l verbose -d "Verbose"
end

# Init options
complete -c veris -n "__fish_seen_subcommand_from init" -s o -l output -d "Output directory" -r -a "(__fish_complete_directories)"
complete -c veris -n "__fish_seen_subcommand_from init" -s f -l force -d "Overwrite existing"

# Completion options
complete -c veris -n "__fish_seen_subcommand_from completion" -a "${shls}"
`;
}

// ── Parse Function ──

export function parseCompletionArgs(args: readonly string[]): CompletionOptions {
  if (args.length === 0 || args[0] === '--help') {
    process.stdout.write(COMPLETION_HELP);
    process.exit(ExitCode.SUCCESS);
  }

  const shell = args[0].toLowerCase();
  if (shell !== 'bash' && shell !== 'zsh' && shell !== 'fish') {
    throw new CliError(
      `Unsupported shell: "${args[0]}". Supported: bash, zsh, fish`,
      ExitCode.USAGE_ERROR,
    );
  }

  return { shell };
}
