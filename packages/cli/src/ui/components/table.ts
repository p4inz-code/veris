/**
 * Table component for VERIS CLI.
 *
 * Professional table renderer supporting:
 * - Column alignment (left, right, center)
 * - Text wrapping
 * - Terminal resize adaptation
 * - Padding
 * - Headers with separators
 * - Multi-line cells
 * - No external table library dependency
 *
 * @module @veris/cli/ui/components
 */

import { getSymbolSet } from '../renderer/index.js';
import { type TerminalCapabilities, detectTerminal } from '../terminal/index.js';
import { getResolvedTheme } from '../theme/index.js';

// ── Types ──

/** Column alignment. */
export type ColumnAlignment = 'left' | 'right' | 'center';

/** A single column definition. */
export interface TableColumn {
  /** Column header text. */
  readonly header: string;
  /** Column alignment. */
  readonly align?: ColumnAlignment;
  /** Minimum width in characters. */
  readonly minWidth?: number;
  /** Maximum width in characters. */
  readonly maxWidth?: number;
  /** Whether this column should take remaining space. */
  readonly flex?: boolean;
}

/** A single row of cell values (strings or arrays for multi-line). */
export type TableRow = readonly (string | readonly string[])[];

/** Table options. */
export interface TableOptions {
  /** Column definitions. */
  readonly columns: readonly TableColumn[];
  /** Rows of data. */
  readonly rows: readonly TableRow[];
  /** Maximum table width (default: terminal width - 4). */
  readonly maxWidth?: number;
  /** Whether to show header. */
  readonly showHeader?: boolean;
  /** Whether to show row separator lines. */
  readonly showSeparators?: boolean;
  /** Whether to number rows. */
  readonly numbered?: boolean;
  /** Padding on left and right of cell content. */
  readonly cellPadding?: number;
  /** Terminal capabilities (auto-detected if not provided). */
  readonly caps?: TerminalCapabilities;
  /** Maximum number of rows to display (0 = all). */
  readonly maxRows?: number;
}

// ── Internal Helpers ──

function measureString(str: string): number {
  // Simple width measurement (doesn't account for full-width chars)
  return str.length;
}

function padString(str: string, width: number, align: ColumnAlignment): string {
  const len = measureString(str);
  if (len >= width) return str.slice(0, width);

  const padding = width - len;
  switch (align) {
    case 'right':
      return ' '.repeat(padding) + str;
    case 'center':
      return ' '.repeat(Math.floor(padding / 2)) + str + ' '.repeat(Math.ceil(padding / 2));
    case 'left':
    default:
      return str + ' '.repeat(padding);
  }
}

function wrapString(str: string, width: number): readonly string[] {
  if (str.length <= width) return [str];

  const lines: string[] = [];
  let remaining = str;

  while (remaining.length > 0) {
    if (remaining.length <= width) {
      lines.push(remaining);
      break;
    }

    // Try to break at a space
    let breakIndex = remaining.lastIndexOf(' ', width);
    if (breakIndex <= 0) {
      breakIndex = width;
    }

    lines.push(remaining.slice(0, breakIndex));
    remaining = remaining.slice(breakIndex).trimStart();
  }

  return lines;
}

// ── Table Renderer ──

/**
 * Render a table as an array of strings.
 *
 * Each string is a single line of the table. The caller can
 * join with '\n' for output or display line by line.
 */
export function renderTable(options: TableOptions): readonly string[] {
  const caps = options.caps ?? detectTerminal();
  const theme = getResolvedTheme();
  const symbols = getSymbolSet();
  const padding = options.cellPadding ?? 1;
  const maxWidth = options.maxWidth ?? Math.max(40, caps.width - 4);
  const maxRows = options.maxRows ?? 0;

  const columns = options.columns;
  const colCount = columns.length;
  if (colCount === 0) return [];

  // Calculate column widths
  const availableWidth =
    maxWidth -
    (colCount + 1) - // borders
    padding * 2 * colCount; // cell padding

  const minWidths = columns.map((c) =>
    Math.max(c.minWidth ?? 3, options.showHeader !== false ? measureString(c.header) + 2 : 3),
  );
  const totalMinWidth = minWidths.reduce((a, b) => a + b, 0);

  // Distribute remaining width
  const remaining = Math.max(0, availableWidth - totalMinWidth);
  const flexColumns = columns.map((c, i) => ({ index: i, flex: c.flex ?? false }));
  const flexCount = flexColumns.filter((c) => c.flex).length;

  const colWidths = columns.map((c, i) => {
    let w = minWidths[i];

    if (c.flex && flexCount > 0) {
      w += Math.floor(remaining / flexCount);
    }

    if (c.maxWidth) {
      w = Math.min(w, c.maxWidth);
    }

    return w;
  });

  const lines: string[] = [];

  // ── Header ──
  if (options.showHeader !== false) {
    // Top border
    const topBorder =
      symbols.tableTl +
      columns
        .map((_, i) => symbols.tableHLine.repeat(colWidths[i] + padding * 2))
        .join(symbols.tableCross) +
      symbols.tableTr;
    lines.push(topBorder);

    // Header text
    const headerLine =
      symbols.tableVLine +
      columns
        .map((c, i) => {
          const content = padString(
            ` ${c.header}${' '.repeat(padding * 2 - 1)}`,
            colWidths[i] + padding * 2,
            c.align ?? 'left',
          );
          return content;
        })
        .join(symbols.tableVLine) +
      symbols.tableVLine;
    lines.push(headerLine);

    // Header separator
    const sepLine =
      symbols.tableVLine +
      columns
        .map((_, i) => symbols.tableHLine.repeat(colWidths[i] + padding * 2))
        .join(symbols.tableCross) +
      symbols.tableVLine;
    lines.push(sepLine);
  }

  // ── Rows ──
  const displayRows = maxRows > 0 ? options.rows.slice(0, maxRows) : options.rows;

  for (let r = 0; r < displayRows.length; r++) {
    const row = displayRows[r];
    const cells: (readonly string[])[] = [];
    let maxCellLines = 1;

    for (let c = 0; c < colCount; c++) {
      const cellValue = c < row.length ? row[c] : '';
      const cellLines =
        typeof cellValue === 'string' ? [cellValue] : (cellValue as readonly string[]);
      const wrapped = cellLines.flatMap((line) => wrapString(String(line), colWidths[c]));
      cells.push(wrapped);
      maxCellLines = Math.max(maxCellLines, wrapped.length);
    }

    for (let line = 0; line < maxCellLines; line++) {
      const rowLine =
        symbols.tableVLine +
        columns
          .map((c, ci) => {
            const cell = ci < cells.length ? cells[ci] : [];
            const cellText = line < cell.length ? cell[line] : '';
            const padded = ` ${cellText}${' '.repeat(padding * 2 - 1)}`;
            return padString(
              padded.slice(0, colWidths[ci] + padding * 2),
              colWidths[ci] + padding * 2,
              c.align ?? 'left',
            );
          })
          .join(symbols.tableVLine) +
        symbols.tableVLine;
      lines.push(rowLine);
    }

    // Row separator
    if (options.showSeparators && r < displayRows.length - 1) {
      const sepLine =
        symbols.tableVLine +
        columns
          .map((_, i) => symbols.tableHLine.repeat(colWidths[i] + padding * 2))
          .join(symbols.tableCross) +
        symbols.tableVLine;
      lines.push(sepLine);
    }
  }

  // ── Bottom border ──
  const bottomBorder =
    symbols.tableBl +
    columns
      .map((_, i) => symbols.tableHLine.repeat(colWidths[i] + padding * 2))
      .join(symbols.tableCross) +
    symbols.tableBr;
  lines.push(bottomBorder);

  return lines;
}
