/**
 * Professional help text renderer for VERIS CLI.
 *
 * Replaces raw help strings with a structured, consistently-formatted
 * help system that adapts to terminal capabilities.
 *
 * Hierarchy:
 *   Title → Description → Usage → Arguments → Options → Examples → Exit Codes → Notes
 *
 * @module @veris/cli/ui
 */

import { getSymbolSet } from './renderer/index.js';
import { detectTerminal, contentWidth } from './terminal/index.js';
import { getResolvedTheme, ansiReset } from './theme/index.js';
import { wrapText } from './utilities/index.js';

// ── Types ──

/** A section of help text. */
export interface HelpSection {
  readonly title: string;
  readonly lines: readonly string[];
}

/** A complete help page definition. */
export interface HelpPage {
  readonly title: string;
  readonly description: string;
  readonly usage?: readonly string[];
  readonly arguments?: readonly HelpArgument[];
  readonly options?: readonly HelpOption[];
  readonly examples?: readonly HelpExample[];
  readonly exitCodes?: readonly HelpExitCode[];
  readonly notes?: readonly string[];
  readonly seeAlso?: readonly string[];
}

/** A command argument definition. */
export interface HelpArgument {
  readonly name: string;
  readonly description: string;
  readonly required?: boolean;
  readonly default?: string;
}

/** A command option definition. */
export interface HelpOption {
  readonly flags: string;
  readonly description: string;
  readonly default?: string;
}

/** A usage example. */
export interface HelpExample {
  readonly command: string;
  readonly description: string;
}

/** Exit code definition. */
export interface HelpExitCode {
  readonly code: number;
  readonly description: string;
}

// ── Help Renderer ──

/**
 * Render a complete help page.
 */
export function renderHelpPage(page: HelpPage): string {
  const caps = detectTerminal();
  const theme = getResolvedTheme();
  const symbols = getSymbolSet();
  const R = ansiReset();
  const width = contentWidth(caps);
  const lines: string[] = [];

  // ── Title ──
  lines.push('');
  lines.push(`${theme.ui.brand}${page.title}${R}`);
  lines.push(theme.ui.textDim + symbols.hLine.repeat(Math.min(width, page.title.length + 4)) + R);
  lines.push('');

  // ── Description ──
  if (page.description) {
    const wrapped = wrapText(page.description, width, '  ');
    lines.push(...wrapped);
    lines.push('');
  }

  // ── Usage ──
  if (page.usage && page.usage.length > 0) {
    lines.push(`${theme.ui.accent}USAGE${R}`);
    lines.push('');
    for (const u of page.usage) {
      lines.push(`  ${theme.ui.text}${u}${R}`);
    }
    lines.push('');
  }

  // ── Arguments ──
  if (page.arguments && page.arguments.length > 0) {
    lines.push(`${theme.ui.accent}ARGUMENTS${R}`);
    lines.push('');
    for (const arg of page.arguments) {
      const required = arg.required ? ` ${theme.status.warning}(required)${R}` : '';
      const defaultStr = arg.default ? ` ${theme.ui.textDim}(default: ${arg.default})${R}` : '';
      lines.push(`  ${theme.ui.highlight}${arg.name}${R}${required}${defaultStr}`);
      const wrapped = wrapText(arg.description, width - 4, '    ');
      lines.push(...wrapped);
      lines.push('');
    }
  }

  // ── Options ──
  if (page.options && page.options.length > 0) {
    lines.push(`${theme.ui.accent}OPTIONS${R}`);
    lines.push('');

    // Calculate max flag width for alignment
    const maxFlagWidth = Math.min(30, Math.max(...page.options.map((o) => o.flags.length)));

    for (const opt of page.options) {
      const flags = opt.flags.padEnd(maxFlagWidth);
      const defaultStr = opt.default ? ` ${theme.ui.textDim}(default: ${opt.default})${R}` : '';
      lines.push(`  ${theme.ui.highlight}${flags}${R}  ${opt.description}${defaultStr}`);
    }
    lines.push('');
  }

  // ── Examples ──
  if (page.examples && page.examples.length > 0) {
    lines.push(`${theme.ui.accent}EXAMPLES${R}`);
    lines.push('');
    for (const ex of page.examples) {
      lines.push(`  ${theme.ui.text}${ex.command}${R}`);
      const wrapped = wrapText(ex.description, width - 4, '    ');
      lines.push(...wrapped);
      lines.push('');
    }
  }

  // ── Exit Codes ──
  if (page.exitCodes && page.exitCodes.length > 0) {
    lines.push(`${theme.ui.accent}EXIT CODES${R}`);
    lines.push('');
    const maxCodeWidth = Math.max(...page.exitCodes.map((e) => String(e.code).length));
    for (const ec of page.exitCodes) {
      const codeStr = String(ec.code).padEnd(maxCodeWidth);
      lines.push(`  ${codeStr}  ${ec.description}`);
    }
    lines.push('');
  }

  // ── Notes ──
  if (page.notes && page.notes.length > 0) {
    lines.push(`${theme.ui.accent}NOTES${R}`);
    lines.push('');
    for (const note of page.notes) {
      const wrapped = wrapText(note, width - 2, '  ');
      lines.push(...wrapped);
    }
    lines.push('');
  }

  // ── See Also ──
  if (page.seeAlso && page.seeAlso.length > 0) {
    lines.push(`${theme.ui.accent}SEE ALSO${R}`);
    lines.push('');
    for (const see of page.seeAlso) {
      lines.push(`  ${see}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Render a short one-line usage hint (for errors).
 */
export function renderUsageHint(command: string, usage: string): string {
  const theme = getResolvedTheme();
  const R = ansiReset();
  return `${theme.status.error}Usage:${R} ${command} ${usage}`;
}

/**
 * Render a help page as a JSON object (for --json help output, future use).
 */
export function helpToJson(page: HelpPage): string {
  return JSON.stringify(page, null, 2);
}
