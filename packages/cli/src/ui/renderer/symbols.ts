/**
 * Symbol set system — Unicode symbols with automatic ASCII fallback.
 *
 * All UI elements use this symbol system rather than hardcoding characters.
 * The system auto-detects terminal Unicode support and selects the appropriate set.
 *
 * @module @veris/cli/ui/renderer
 */

import { detectTerminal } from '../terminal/index.js';

// ── Symbol Set Types ──

/** A symbol with both Unicode and ASCII representations. */
interface SymbolDef {
  /** Unicode character(s). */
  readonly unicode: string;
  /** ASCII fallback character(s). */
  readonly ascii: string;
}

/** Complete symbol set definition. */
export interface SymbolSet {
  // File types
  readonly file: string;
  readonly directory: string;
  readonly executable: string;
  readonly archive: string;
  readonly script: string;
  readonly config: string;
  readonly image: string;
  readonly document: string;
  readonly symlink: string;

  // Severity
  readonly critical: string;
  readonly high: string;
  readonly medium: string;
  readonly low: string;
  readonly info: string;

  // Status
  readonly success: string;
  readonly warning: string;
  readonly error: string;
  readonly pending: string;
  readonly running: string;
  readonly waiting: string;

  // Progress
  readonly progressFull: string;
  readonly progressEmpty: string;
  readonly progressHalf: string;
  readonly progressStart: string;
  readonly progressEnd: string;

  // Spinners
  readonly spinner: readonly string[];

  // UI elements
  readonly bullet: string;
  readonly arrow: string;
  readonly check: string;
  readonly cross: string;
  readonly ellipsis: string;
  readonly star: string;

  // Box drawing
  readonly hLine: string;
  readonly vLine: string;
  readonly tlCorner: string;
  readonly trCorner: string;
  readonly blCorner: string;
  readonly brCorner: string;
  readonly crossPiece: string;
  readonly tPiece: string;
  readonly bPiece: string;
  readonly lPiece: string;
  readonly rPiece: string;

  // Tables
  readonly tableHLine: string;
  readonly tableVLine: string;
  readonly tableCross: string;
  readonly tableTl: string;
  readonly tableTr: string;
  readonly tableBl: string;
  readonly tableBr: string;

  // Mini charts
  readonly chartEmpty: string;
  readonly chartFull: string;
  readonly chartQuarter: string;
  readonly chartHalf: string;
  readonly chartThreeQuarters: string;

  // Misc
  readonly separator: string;
  readonly headerFiller: string;
}

// ── Unicode Symbol Set ──

const UNICODE_SYMBOLS: SymbolSet = {
  // File types
  file: '\u{1F4C4}', // 📄
  directory: '\u{1F4C1}', // 📁
  executable: '\u2699\uFE0F', // ⚙️
  archive: '\u{1F4E6}', // 📦
  script: '\u{1F4DC}', // 📜
  config: '\u2699\uFE0F', // ⚙️
  image: '\u{1F5BC}\uFE0F', // 🖼️
  document: '\u{1F4CB}', // 📋
  symlink: '\u{1F517}', // 🔗

  // Severity
  critical: '\u{1F534}', // 🔴
  high: '\u{1F7E0}', // 🟠
  medium: '\u{1F7E1}', // 🟡
  low: '\u{1F7E2}', // 🟢
  info: '\u{1F535}', // 🔵

  // Status
  success: '\u2705', // ✅
  warning: '\u26A0\uFE0F', // ⚠️
  error: '\u274C', // ❌
  pending: '\u23F3', // ⏳
  running: '\u25CF', // ●
  waiting: '\u25CB', // ○

  // Progress
  progressFull: '\u2588', // █
  progressEmpty: '\u2591', // ░
  progressHalf: '\u2593', // ▓
  progressStart: '\u258C', // ▌
  progressEnd: '\u2590', // ▐

  // Spinner (braille pattern sequence)
  spinner: ['\u280B', '\u2819', '\u2839', '\u2830', '\u2834', '\u2826', '\u2827', '\u2807'],

  // UI elements
  bullet: '\u2022', // •
  arrow: '\u2192', // →
  check: '\u2713', // ✓
  cross: '\u2717', // ✗
  ellipsis: '\u2026', // …
  star: '\u2605', // ★

  // Box drawing
  hLine: '\u2500', // ─
  vLine: '\u2502', // │
  tlCorner: '\u250C', // ┌
  trCorner: '\u2510', // ┐
  blCorner: '\u2514', // └
  brCorner: '\u2518', // ┘
  crossPiece: '\u253C', // ┼
  tPiece: '\u252C', // ┬
  bPiece: '\u2534', // ┴
  lPiece: '\u251C', // ├
  rPiece: '\u2524', // ┤

  // Tables (heavy lines)
  tableHLine: '\u2501', // ━
  tableVLine: '\u2503', // ┃
  tableCross: '\u254B', // ╋
  tableTl: '\u250F', // ┏
  tableTr: '\u2513', // ┓
  tableBl: '\u2517', // ┗
  tableBr: '\u251B', // ┛

  // Mini charts (block elements)
  chartEmpty: '\u2591', // ░
  chartFull: '\u2588', // █
  chartQuarter: '\u258F', // ▏
  chartHalf: '\u2593', // ▓ (approximation for 50%)
  chartThreeQuarters: '\u2592', // ▒ (approximation for 75%)

  // Misc
  separator: '\u2500', // ─
  headerFiller: '\u2500', // ─
};

// ── ASCII Fallback Symbol Set ──

const ASCII_SYMBOLS: SymbolSet = {
  // File types
  file: '[FILE]',
  directory: '[DIR] ',
  executable: '[EXE] ',
  archive: '[ARC] ',
  script: '[SCR] ',
  config: '[CFG] ',
  image: '[IMG] ',
  document: '[DOC] ',
  symlink: '[LNK] ',

  // Severity
  critical: '[CRIT]',
  high: '[HIGH]',
  medium: '[MED] ',
  low: '[LOW] ',
  info: '[INFO]',

  // Status
  success: '[OK]  ',
  warning: '[WARN]',
  error: '[ERR] ',
  pending: '[WAIT]',
  running: '*',
  waiting: '.',

  // Progress
  progressFull: '#',
  progressEmpty: '-',
  progressHalf: '=',
  progressStart: '[',
  progressEnd: ']',

  // Spinner
  spinner: ['-', '\\', '|', '/'],

  // UI elements
  bullet: '*',
  arrow: '->',
  check: '+',
  cross: 'x',
  ellipsis: '...',
  star: '*',

  // Box drawing
  hLine: '-',
  vLine: '|',
  tlCorner: '+',
  trCorner: '+',
  blCorner: '+',
  brCorner: '+',
  crossPiece: '+',
  tPiece: '+',
  bPiece: '+',
  lPiece: '+',
  rPiece: '+',

  // Tables
  tableHLine: '=',
  tableVLine: '|',
  tableCross: '+',
  tableTl: '+',
  tableTr: '+',
  tableBl: '+',
  tableBr: '+',

  // Mini charts
  chartEmpty: '-',
  chartFull: '#',
  chartQuarter: '.',
  chartHalf: '*',
  chartThreeQuarters: 'o',

  // Misc
  separator: '-',
  headerFiller: '-',
};

// ── Symbol Selector ──

let cachedSet: SymbolSet | undefined;

/**
 * Get the appropriate symbol set based on terminal capabilities.
 */
export function getSymbolSet(): SymbolSet {
  if (cachedSet !== undefined) {
    return cachedSet;
  }
  const caps = detectTerminal();
  cachedSet = caps.unicode ? UNICODE_SYMBOLS : ASCII_SYMBOLS;
  return cachedSet;
}

/**
 * Get a single symbol by key, respecting terminal capabilities.
 *
 * Only returns keys that have string values (not arrays like spinner).
 */
export function symbol(key: keyof SymbolSet): string {
  const value = getSymbolSet()[key];
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value as string;
}

/**
 * Reset the cached symbol set (for testing or when terminal changes).
 */
export function resetSymbolSet(): void {
  cachedSet = undefined;
}

/**
 * Force a specific symbol set (for testing).
 */
export function setSymbolSet(set: 'unicode' | 'ascii'): void {
  cachedSet = set === 'unicode' ? UNICODE_SYMBOLS : ASCII_SYMBOLS;
}
