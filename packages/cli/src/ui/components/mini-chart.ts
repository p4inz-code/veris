/**
 * Mini chart component for VERIS CLI.
 *
 * Renders compact ASCII/Unicode charts:
 * - Severity distribution (horizontal bar chart)
 * - Risk histogram
 * - Pipeline stage usage
 *
 * @module @veris/cli/ui/components
 */

import { getSymbolSet } from '../renderer/index.js';
import { type TerminalCapabilities, detectTerminal } from '../terminal/index.js';
import { getResolvedTheme, type SeverityLevel, SEVERITY_ORDER } from '../theme/index.js';

// ── Types ──

/** A single data point in a chart. */
export interface ChartDataPoint {
  /** Label for this data point. */
  readonly label: string;
  /** Numeric value (0 to max). */
  readonly value: number;
  /** Optional color override (severity level or hex). */
  readonly color?: SeverityLevel | string;
}

/** Options for rendering a chart. */
export interface ChartOptions {
  /** Data points to display. */
  readonly data: readonly ChartDataPoint[];
  /** Maximum width of the chart in characters. */
  readonly maxWidth?: number;
  /** Maximum bar length in characters. */
  readonly barLength?: number;
  /** Chart title (optional). */
  readonly title?: string;
  /** Show numeric values next to bars. */
  readonly showValues?: boolean;
  /** Show percentage instead of raw values. */
  readonly showPercent?: boolean;
  /** Terminal capabilities (auto-detected if not provided). */
  readonly caps?: TerminalCapabilities;
}

// ── Chart Renderers ──

/**
 * Render a horizontal bar chart.
 *
 * Example output:
 *   🔴 Critical  3  ████████████░░░░░░░░░░  12%
 *   🟠 High      8  ████████████████████░░  32%
 *   🟡 Medium   12  ██████████████████████  48%
 *   🟢 Low       2  ████████░░░░░░░░░░░░░░   8%
 */
export function renderHorizontalBarChart(options: ChartOptions): readonly string[] {
  const caps = options.caps ?? detectTerminal();
  const theme = getResolvedTheme();
  const symbols = getSymbolSet();

  const data = options.data;
  if (data.length === 0) return [];

  const totalValue = data.reduce((sum, d) => sum + d.value, 0);
  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const maxWidth = options.maxWidth ?? caps.width;
  const availableBarWidth = options.barLength ?? Math.max(10, maxWidth - 30);
  const showValues = options.showValues !== false;
  const showPercent = options.showPercent ?? true;

  const lines: string[] = [];

  // ── Title ──
  if (options.title) {
    lines.push(`${theme.ui.textDim}${options.title}\x1b[0m`);
    lines.push('');
  }

  // ── Data rows ──
  for (const point of data) {
    const barValue =
      showPercent && totalValue > 0 ? point.value / totalValue : point.value / maxValue;
    const filledWidth = Math.round(barValue * availableBarWidth);
    const emptyWidth = availableBarWidth - filledWidth;

    // Determine color
    let color: string;
    if (point.color && SEVERITY_ORDER.includes(point.color as SeverityLevel)) {
      color = theme.severity[point.color as SeverityLevel];
    } else if (point.color) {
      color = point.color;
    } else {
      color = theme.ui.text;
    }

    const bar = `${color}${symbols.chartFull.repeat(filledWidth)}${symbols.chartEmpty.repeat(emptyWidth)}\x1b[0m`;

    // Label (left-aligned, fixed width)
    const labelWidth = 20;
    const label =
      point.label.length > labelWidth
        ? point.label.slice(0, labelWidth - 1) + '…'
        : point.label.padEnd(labelWidth);

    // Value or percentage
    let valueStr = '';
    if (showValues) {
      if (showPercent && totalValue > 0) {
        valueStr = ` ${((point.value / totalValue) * 100).toFixed(0)}%`;
      } else {
        valueStr = ` ${point.value}`;
      }
    }
    const valuePadded = valueStr.padStart(6);

    lines.push(` ${label} ${bar}${valuePadded}`);
  }

  return lines;
}

/**
 * Render a severity distribution chart (convenience wrapper).
 *
 * @param counts - Record mapping severity level to count.
 * @param options - Additional chart options.
 */
export function renderSeverityDistribution(
  counts: Partial<Record<SeverityLevel, number>>,
  options?: Partial<ChartOptions>,
): readonly string[] {
  const data: ChartDataPoint[] = SEVERITY_ORDER.map((level) => ({
    label: level.charAt(0).toUpperCase() + level.slice(1),
    value: counts[level] ?? 0,
    color: level,
  }));

  return renderHorizontalBarChart({
    data,
    title: options?.title ?? 'Findings by Severity',
    showValues: true,
    showPercent: true,
    maxWidth: options?.maxWidth,
    barLength: options?.barLength,
    caps: options?.caps,
  });
}

/**
 * Render a simple histogram for risk score distribution.
 */
export function renderRiskHistogram(
  score: number,
  maxWidth?: number,
  caps?: TerminalCapabilities,
): readonly string[] {
  const theme = getResolvedTheme();
  const symbols = getSymbolSet();
  const width = Math.max(20, (maxWidth ?? caps?.width ?? 80) - 10);

  // Determine severity level for coloring
  let color: string;
  let level: string;
  if (score >= 9) {
    color = theme.severity.critical;
    level = 'CRITICAL';
  } else if (score >= 7) {
    color = theme.severity.high;
    level = 'HIGH';
  } else if (score >= 4) {
    color = theme.severity.medium;
    level = 'MEDIUM';
  } else if (score >= 1) {
    color = theme.severity.low;
    level = 'LOW';
  } else {
    color = theme.severity.info;
    level = 'INFO';
  }

  const filledWidth = Math.round((score / 10) * width);
  const emptyWidth = width - filledWidth;

  const bar = `${color}${symbols.chartFull.repeat(filledWidth)}${symbols.chartEmpty.repeat(emptyWidth)}\x1b[0m`;

  return [`${theme.ui.textDim}Risk Score: ${score.toFixed(1)} / 10.0 (${level})\x1b[0m`, ` ${bar}`];
}
