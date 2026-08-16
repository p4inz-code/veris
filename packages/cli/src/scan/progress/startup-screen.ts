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
 * LAYOUT (session vs scan content)
 * --------------------------------
 * The screen is split into two parts so the VERIS brand block can be owned by
 * the session lifecycle while the scan-scoped configuration renders below it:
 *
 * - Session header lines (logo + identity + status) live in
 *   `session-header.ts` and are rendered once by the interactive SessionHeader
 *   (persistent for the whole session, animated on TTY).
 * - `renderStartupBody()` renders everything below the header: the divider,
 *   configuration, engines, and the "Starting scan" indicator. This body is
 *   scan-scoped and is replaced by the dashboard/summary below the header.
 * - `renderStartupScreen()` composes both for non-TTY / one-shot output
 *   (static, deterministic, no cursor control).
 *
 * Design rules:
 * - All colors come from the theme system (never hardcode ANSI).
 * - All symbols come from the Unicode/ASCII fallback system.
 * - Layout adapts to terminal width; long values wrap with aligned indent.
 *
 * @module @veris/cli/scan/progress
 */

import { getSymbolSet } from '../../ui/renderer/index.js';
import { horizontalDivider } from '../../ui/styles/index.js';
import { detectTerminal } from '../../ui/terminal/index.js';
import { getResolvedTheme, ansiReset, type ResolvedTheme } from '../../ui/theme/index.js';
import { wrapText } from '../../ui/utilities/index.js';
import type { ScanConfig } from '../scan-session.js';

import { renderSessionHeaderLines } from './session-header.js';

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

/**
 * Render the full startup screen: session header lines (logo + identity +
 * status) followed by the scan-scoped body (config + engines + starting).
 *
 * Used for non-TTY / one-shot output where the header is static and the whole
 * screen is written sequentially (no cursor control, no animation).
 */
export function renderStartupScreen(
  config: ScanConfig,
  options: StartupScreenOptions = {},
): readonly string[] {
  const caps = detectTerminal();
  return [
    ...renderSessionHeaderLines(caps, 0, {
      animated: false,
      version: options.version,
      nodeVersion: options.nodeVersion,
      platform: options.platform,
      terminal: options.terminal,
    }),
    ...renderStartupBody(config, options),
  ];
}

/**
 * Render the scan-scoped startup body: divider, configuration, engines, and
 * the "Starting scan" indicator.
 *
 * This is what renders BELOW the persistent session header on interactive
 * TTY sessions. It is replaced by the dashboard and later the final summary —
 * the header itself never moves.
 */
export function renderStartupBody(
  config: ScanConfig,
  options: StartupScreenOptions = {},
): readonly string[] {
  const theme = getResolvedTheme();
  const symbols = getSymbolSet();
  const R = ansiReset();
  const caps = detectTerminal();
  const width = Math.min(caps.width, MAX_WIDTH);

  const lines: string[] = [];
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

/** Deterministic thousands separator (locale-independent). */
function formatNumber(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}
