/**
 * Global help renderer — the `veris --help` screen.
 *
 * Renders the command list, global options, and examples in the same
 * restrained, professional style as the rest of the CLI design system:
 * themed colors, symbol-aware dividers, aligned columns, and responsive
 * wrapping at narrow widths.
 *
 * Design rules:
 * - All colors come from the theme system (never hardcode ANSI).
 * - All symbols come from the Unicode/ASCII fallback system.
 * - Commands are grouped by purpose; descriptions wrap, never truncate.
 * - When color is disabled, no ANSI sequences are emitted at all.
 * - Flags and commands are aligned; secondary info trims before commands.
 *
 * @module @veris/cli/ui
 */

import { CLI_VERSION } from '../wirer.js';

import { getSymbolSet } from './renderer/index.js';
import { horizontalDivider } from './styles/index.js';
import { detectTerminal } from './terminal/index.js';
import { getResolvedTheme } from './theme/index.js';
import { wrapText } from './utilities/index.js';

/** Maximum help width in characters. */
const MAX_WIDTH = 100;

/** A command row in the COMMANDS section. */
interface HelpCommandRow {
  readonly name: string;
  readonly description: string;
}

/** A global option row. */
interface HelpOptionRow {
  readonly flags: string;
  readonly description: string;
  readonly active?: boolean;
}

/** A usage example row. */
interface HelpExampleRow {
  readonly command: string;
  readonly description: string;
}

/** Command groups — every entry is a real, registered VERIS command. */
const COMMAND_GROUPS: ReadonlyArray<{
  readonly title: string;
  readonly commands: readonly HelpCommandRow[];
}> = Object.freeze([
  {
    title: 'Analysis',
    commands: Object.freeze([
      { name: 'scan', description: 'Run analysis on artifacts' },
      { name: 'report', description: 'Generate and export reports' },
    ]),
  },
  {
    title: 'Configuration',
    commands: Object.freeze([
      { name: 'init', description: 'Initialize VERIS configuration' },
      { name: 'validate', description: 'Validate configuration or rules' },
      { name: 'pack', description: 'Manage knowledge packs' },
    ]),
  },
  {
    title: 'AI',
    commands: Object.freeze([
      { name: 'explain', description: 'Explain findings using AI' },
      { name: 'summarize', description: 'Summarize scan report using AI' },
    ]),
  },
  {
    title: 'System',
    commands: Object.freeze([
      { name: 'version', description: 'Show version information' },
      { name: 'completion', description: 'Generate shell completions' },
    ]),
  },
]);

/** Global options — existing flags only. */
function globalOptions(): HelpOptionRow[] {
  const caps = detectTerminal();
  return [
    { flags: '--help, -h', description: 'Show help for any command' },
    { flags: '--version, -v', description: 'Show version information' },
    {
      flags: '--no-color',
      description: 'Disable color output',
      active: caps.colorDepth === 'none',
    },
    { flags: '--no-unicode', description: 'Use ASCII-only output', active: !caps.unicode },
    {
      flags: '--no-animation',
      description: 'Disable animations',
      active: caps.prefersReducedMotion,
    },
  ];
}

/** Usage examples — existing commands only. */
const EXAMPLES: readonly HelpExampleRow[] = Object.freeze([
  { command: 'veris scan', description: 'Run a scan on the current directory' },
  { command: 'veris scan --format html', description: 'Scan and export an HTML report' },
  { command: 'veris explain fin_abc123', description: 'Explain a finding using AI' },
  { command: 'veris summarize', description: 'Summarize the latest scan' },
]);

/**
 * Render the global help screen as an array of lines.
 *
 * The returned lines are plain strings (theme colors already applied) and
 * can be written to stdout line by line. When the terminal has no color
 * support, no ANSI sequences are emitted.
 *
 * @param widthOverride - Terminal width override (used by tests). Defaults
 *   to the detected terminal width, capped at MAX_WIDTH.
 */
export function renderGlobalHelp(widthOverride?: number): readonly string[] {
  const caps = detectTerminal();
  const theme = getResolvedTheme();
  const symbols = getSymbolSet();
  const width = Math.min(widthOverride ?? caps.width, MAX_WIDTH);
  const color = theme.ui.brand !== ''; // colors resolve to '' only when disabled
  const R = color ? '\x1b[0m' : ''; // reset — only emitted when color is active
  const separator = symbols.separator === '-' ? '-' : '—';

  const lines: string[] = [];
  lines.push('');
  // Banner wraps at narrow widths — never truncated.
  lines.push(
    ...wrapText(
      ` ${theme.ui.brand}VERIS ${separator} Deterministic Security Analysis Platform v${CLI_VERSION}${R}`,
      width - 1,
      ' ',
    ),
  );
  lines.push(` ${theme.ui.border}${horizontalDivider(width - 2)}${R}`);
  lines.push('');

  // ── Usage ──
  lines.push(` ${theme.ui.accent}USAGE${R}`);
  lines.push('');
  lines.push(`  ${theme.ui.text}veris <command> [options]${R}`);
  lines.push('');

  // ── Commands (grouped) ──
  lines.push(` ${theme.ui.accent}COMMANDS${R}`);
  lines.push('');
  const commands = COMMAND_GROUPS.flatMap((g) => g.commands);
  const commandColumn = Math.max(...commands.map((c) => c.name.length));
  const commandIndent = '    ';
  const commandValueWidth = Math.max(12, width - 2 - commandColumn - 3 - commandIndent.length);
  const continuationIndent = ' '.repeat(commandIndent.length + commandColumn + 3);

  for (const group of COMMAND_GROUPS) {
    lines.push(`   ${theme.ui.textDim}${group.title}${R}`);
    for (const cmd of group.commands) {
      const name = cmd.name.padEnd(commandColumn);
      const wrapped = wrapText(cmd.description, commandValueWidth, '');
      lines.push(`${commandIndent}${theme.ui.highlight}${name}${R} ${wrapped[0]}`);
      for (const contLine of wrapped.slice(1)) {
        lines.push(`${continuationIndent}${contLine}`);
      }
    }
    lines.push('');
  }

  // ── Global Options ──
  lines.push(` ${theme.ui.accent}GLOBAL OPTIONS${R}`);
  lines.push('');
  const options = globalOptions();
  const flagColumn = Math.max(...options.map((o) => o.flags.length));
  // Reserve room for the optional "(active)" marker so the first line
  // always fits — the marker is secondary, dropped before any overflow.
  const activeMarkers = options.map((o) => (o.active ? ` (active)`.length : 0));
  const activeReserve = Math.max(...activeMarkers);
  const optionValueWidth = Math.max(12, width - 2 - flagColumn - 3 - activeReserve);
  const optionContinuation = ' '.repeat(2 + flagColumn + 3);

  for (const opt of options) {
    const flags = opt.flags.padEnd(flagColumn);
    const wrapped = wrapText(opt.description, optionValueWidth, '');
    lines.push(
      `  ${theme.ui.highlight}${flags}${R} ${wrapped[0]}${opt.active ? ` ${theme.status.success}(active)${R}` : ''}`,
    );
    for (const contLine of wrapped.slice(1)) {
      lines.push(`${optionContinuation}${contLine}`);
    }
  }
  lines.push('');

  // ── Examples ──
  lines.push(` ${theme.ui.accent}EXAMPLES${R}`);
  lines.push('');
  const exampleColumn = Math.min(30, Math.max(...EXAMPLES.map((e) => e.command.length)));
  const exampleValueWidth = Math.max(12, width - 2 - exampleColumn - 3);
  const exampleContinuation = ' '.repeat(2 + exampleColumn + 3);

  for (const ex of EXAMPLES) {
    const command = ex.command.padEnd(exampleColumn);
    const wrapped = wrapText(ex.description, exampleValueWidth, '');
    lines.push(`  ${theme.ui.text}${command}${R} ${theme.ui.textDim}${wrapped[0]}${R}`);
    for (const contLine of wrapped.slice(1)) {
      lines.push(`${exampleContinuation}${theme.ui.textDim}${contLine}${R}`);
    }
  }
  lines.push('');

  // ── Footer ──
  lines.push(
    ...wrapText(
      ` ${theme.ui.textDim}Run 'veris <command> --help' for command-specific help.${R}`,
      width - 1,
      ' ',
    ),
  );
  lines.push(` ${theme.ui.border}${horizontalDivider(width - 2)}${R}`);
  lines.push('');

  return lines;
}
