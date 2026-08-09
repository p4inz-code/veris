/**
 * Professional Startup Screen — displayed before a scan begins.
 *
 * Renders a minimal, premium developer-tool style banner (in the spirit of
 * Cargo / Git / Bun / Docker CLIs):
 *
 * - VERIS banner (Unicode block logo with automatic ASCII wordmark fallback)
 * - Version, platform, Node.js version, and terminal capabilities
 * - Active configuration summary (target, preset, workers, limits, formats)
 * - Loaded analyzer and knowledge pack counts
 *
 * Design rules:
 * - All colors come from the theme system (never hardcode ANSI).
 * - All symbols come from the Unicode/ASCII fallback system.
 * - Layout adapts to terminal width; long values wrap with aligned indent.
 *
 * @module @veris/cli/scan/progress
 */

import { getSymbolSet, type SymbolSet } from '../../ui/renderer/index.js';
import { horizontalDivider } from '../../ui/styles/index.js';
import { detectTerminal, type TerminalCapabilities } from '../../ui/terminal/index.js';
import { getResolvedTheme, ansiReset, type ResolvedTheme } from '../../ui/theme/index.js';
import { wrapText } from '../../ui/utilities/index.js';
import { CLI_VERSION } from '../../wirer.js';
import type { ScanConfig } from '../scan-session.js';

/** Options for the startup screen. */
export interface StartupScreenOptions {
  /** Node.js version string (e.g. "v22.14.0"). Defaults to `process.version`. */
  readonly nodeVersion?: string;
  /** Platform label (e.g. "win32 (Windows)"). Defaults to the detected OS. */
  readonly platform?: string;
  /** Terminal emulator label. Defaults to the detected emulator. */
  readonly terminal?: string;
  /** VERIS version string. Defaults to `CLI_VERSION`. */
  readonly version?: string;
  /** Number of knowledge packs loaded before the scan (shown under Engines). */
  readonly knowledgePackCount?: number;
}

/** Maximum startup screen width in characters. */
const MAX_WIDTH = 100;

/** Aligned label column width — shared with the other summary screens. */
const LABEL_WIDTH = 14;

/** Indent used for key/value rows (matches the summary screens). */
const ROW_INDENT = '   ';

/** Friendly names for detected terminal emulators. */
const TERMINAL_NAMES: Record<string, string> = Object.freeze({
  'windows-terminal': 'Windows Terminal',
  vscode: 'VS Code',
  iterm2: 'iTerm2',
  kitty: 'Kitty',
  alacritty: 'Alacritty',
  wezterm: 'WezTerm',
  ghostty: 'Ghostty',
  tmux: 'tmux',
  screen: 'screen',
  xterm: 'xterm',
  unknown: 'unknown',
});

/**
 * Render the startup screen as an array of lines.
 *
 * The returned lines are plain strings (theme colors already applied) and
 * can be written to stdout line by line.
 */
export function renderStartupScreen(
  config: ScanConfig,
  options: StartupScreenOptions = {},
): readonly string[] {
  const caps = detectTerminal();
  const theme = getResolvedTheme();
  const symbols = getSymbolSet();
  const R = ansiReset();
  const width = Math.min(caps.width, MAX_WIDTH);
  const unicode = isUnicodeSymbols(symbols);

  const version = options.version ?? CLI_VERSION;
  const nodeVersion = options.nodeVersion ?? process.version;
  const platform = options.platform ?? describePlatform(caps);
  const terminal = options.terminal ?? describeTerminal(caps.emulator);

  const lines: string[] = [];
  lines.push('');

  // ── Banner ──
  lines.push(...renderBanner(theme, symbols, R));

  // ── Identity ──
  const identity = `VERIS v${version}  ${dash(unicode)} Deterministic Security Analysis Platform`;
  lines.push(...wrapText(` ${theme.ui.text}${identity}${R}`, width - 1, ' '));

  const meta = [`Node ${nodeVersion}`, platform, terminal, describeColor(caps)].join(
    separator(unicode),
  );
  lines.push(...wrapText(` ${theme.ui.textDim}${meta}${R}`, width - 1, ' '));
  lines.push('');

  // ── Divider ──
  lines.push(` ${theme.ui.border}${horizontalDivider(width - 2)}${R}`);
  lines.push('');

  // ── Configuration ──
  lines.push(` ${theme.ui.accent}Configuration${R}`);
  const configRows: Array<{ label: string; value: string }> = [
    { label: 'Target', value: config.target },
    { label: 'Preset', value: config.preset },
    { label: 'Workers', value: formatNumber(config.workerCount) },
    { label: 'Max files', value: formatNumber(config.maxFiles) },
    { label: 'Max depth', value: String(config.maxDepth) },
    { label: 'Hidden', value: config.includeHidden ? 'yes' : 'no' },
  ];
  if (config.enabledFormats.length > 0) {
    configRows.push({ label: 'Formats', value: config.enabledFormats.join(', ') });
  }
  lines.push(...renderKeyValueRows(configRows, theme, width - 2));
  lines.push('');

  // ── Engines ──
  lines.push(` ${theme.ui.accent}Engines${R}`);
  const engineRows: Array<{ label: string; value: string }> = [
    {
      label: 'Analyzers',
      value: `${formatNumber(config.enabledAnalyzers.length)} loaded`,
    },
  ];
  if (options.knowledgePackCount !== undefined) {
    engineRows.push({
      label: 'Knowledge',
      value: `${formatNumber(options.knowledgePackCount)} ${pluralize('pack', options.knowledgePackCount)}`,
    });
  }
  lines.push(...renderKeyValueRows(engineRows, theme, width - 2));
  lines.push('');

  // ── Divider + starting indicator ──
  lines.push(` ${theme.ui.border}${horizontalDivider(width - 2)}${R}`);
  lines.push('');
  lines.push(` ${theme.ui.accent}${symbols.arrow}${R} ${theme.ui.text}Starting scan...${R}`);
  lines.push('');

  return lines;
}

// ── Banner ──

/**
 * Generate the VERIS banner.
 *
 * Uses the Unicode block logo when the terminal supports Unicode and falls
 * back to a spaced ASCII wordmark otherwise.
 */
function renderBanner(theme: ResolvedTheme, symbols: SymbolSet, R: string): readonly string[] {
  const brand = theme.ui.brand;

  if (!isUnicodeSymbols(symbols)) {
    // ASCII wordmark — minimal, professional, safe on every terminal.
    // The tagline follows on the identity line below, so keep this clean.
    return [` ${brand}V E R I S${R}`];
  }

  const LOGO = [
    '██╗   ██╗███████╗██████╗ ██╗███████╗',
    '██║   ██║██╔════╝██╔══██╗██║██╔════╝',
    '██║   ██║█████╗  ██████╔╝██║███████╗',
    '╚██╗ ██╔╝██╔══╝  ██╔══██╗██║╚════██║',
    ' ╚████╔╝ ███████╗██║  ██║██║███████║',
    '  ╚═══╝  ╚══════╝╚═╝  ╚═╝╚═╝╚══════╝',
  ];

  return LOGO.map((line) => ` ${brand}${line}${R}`);
}

// ── Key/Value Rows ──

/**
 * Render aligned label/value rows.
 *
 * Labels are dimmed and padded to a fixed column; values start at the same
 * column on every row. Values longer than the available width wrap with a
 * continuation indent aligned to the value column.
 */
function renderKeyValueRows(
  rows: readonly { label: string; value: string }[],
  theme: ResolvedTheme,
  width: number,
): readonly string[] {
  const valueColumn = ROW_INDENT.length + LABEL_WIDTH + 2;
  const valueWidth = Math.max(10, width - valueColumn);
  const continuation = ' '.repeat(valueColumn);

  const lines: string[] = [];
  const R = ansiReset();
  for (const row of rows) {
    const prefix = `${ROW_INDENT}${theme.ui.textDim}${row.label.padEnd(LABEL_WIDTH)}${R}  `;
    if (row.value.length <= valueWidth) {
      lines.push(`${prefix}${row.value}`);
      continue;
    }
    const chunks = wrapText(row.value, valueWidth, '');
    chunks.forEach((chunk, index) => {
      lines.push(index === 0 ? `${prefix}${chunk}` : `${continuation}${chunk}`);
    });
  }
  return lines;
}

// ── Helpers ──

/** Whether the current symbol set is the Unicode variant. */
function isUnicodeSymbols(symbols: SymbolSet): boolean {
  // The ASCII fallback set uses '-' for horizontal lines.
  return symbols.hLine !== '-';
}

/** Deterministic thousands separator (locale-independent). */
function formatNumber(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}

function describePlatform(caps: TerminalCapabilities): string {
  return caps.isWindows ? `${caps.os} (Windows)` : caps.os;
}

function describeTerminal(emulator: TerminalCapabilities['emulator']): string {
  return TERMINAL_NAMES[emulator] ?? emulator;
}

function describeColor(caps: TerminalCapabilities): string {
  switch (caps.colorDepth) {
    case 'none':
      return 'No color';
    case 'ansi':
      return '16 colors';
    case 'ansi256':
      return '256 colors';
    case 'truecolor':
      return 'Truecolor';
  }
}

function dash(unicode: boolean): string {
  return unicode ? '—' : '-';
}

function separator(unicode: boolean): string {
  return unicode ? ' · ' : ' | ';
}
