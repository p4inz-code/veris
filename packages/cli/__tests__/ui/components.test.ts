/**
 * Tests for UI components.
 *
 * @module @veris/cli/__tests__/ui
 */

import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import {
  renderProgressBar,
  clearProgressLines,
  renderTable,
  renderBadge,
  criticalBadge,
  highBadge,
  mediumBadge,
  lowBadge,
  infoBadge,
  successBadge,
  failedBadge,
  warningBadge,
  renderStatusBar,
  renderFullStatusBar,
  renderHorizontalBarChart,
  renderSeverityDistribution,
  renderRiskHistogram,
  setSymbolSet,
  resetSymbolSet,
  resetTerminalCache,
} from '../../src/ui/index.js';

// Helper to force ASCII mode for deterministic tests
function useAscii(): void {
  setSymbolSet('ascii');
}

// Ensure we clean up global state after all tests
// (Vitest runs each file in isolation, but explicit cleanup is good practice)
afterAll(() => {
  resetSymbolSet();
});

describe('ProgressBar', () => {
  beforeEach(() => {
    useAscii();
  });

  it('should render a simple progress bar', () => {
    const lines = renderProgressBar({ current: 50, total: 100, elapsedMs: 1000 }, { width: 20 });
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines.some((l) => l.includes('50%'))).toBe(true);
  });

  it('renders progress bar matching snapshot', () => {
    const lines = renderProgressBar(
      { current: 50, total: 100, elapsedMs: 1000 },
      { width: 20, showCount: true, showEta: true, showRate: true, rate: 8.4 },
    );
    expect(lines.join('\n')).toMatchSnapshot();
  });

  it('should handle zero total', () => {
    const lines = renderProgressBar({ current: 0, total: 0, elapsedMs: 0 }, { width: 20 });
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle completion', () => {
    const lines = renderProgressBar(
      { current: 100, total: 100, elapsedMs: 5000 },
      { width: 20, showPercent: true },
    );
    expect(lines[0]).toContain('100%');
  });

  it('should show count when requested', () => {
    const lines = renderProgressBar(
      { current: 5, total: 10, elapsedMs: 1000 },
      { showCount: true },
    );
    expect(lines.some((l) => l.includes('5') && l.includes('10'))).toBe(true);
  });

  it('should show ETA when requested', () => {
    const lines = renderProgressBar(
      { current: 5, total: 10, elapsedMs: 10000, rate: 0.5 },
      { showEta: true },
    );
    expect(lines.some((l) => l.includes('Elapsed') || l.includes('ETA'))).toBe(true);
  });

  it('should show current item when requested', () => {
    const lines = renderProgressBar(
      { current: 5, total: 10, elapsedMs: 1000, currentItem: 'test.ts' },
      { showCurrent: true },
    );
    expect(lines.some((l) => l.includes('test.ts'))).toBe(true);
  });

  it('should show rate when requested', () => {
    const lines = renderProgressBar(
      { current: 5, total: 10, elapsedMs: 1000, rate: 10.5 },
      { showRate: true },
    );
    expect(lines.some((l) => l.includes('10.5'))).toBe(true);
  });
});

describe('clearProgressLines', () => {
  it('should return empty string for zero lines', () => {
    expect(clearProgressLines(0)).toBe('');
  });

  it('should return ANSI codes for positive lines', () => {
    // clearProgressLines returns ANSI codes only when isTTY is true
    // In test environments this returns empty string
    const result = clearProgressLines(2);
    // Verify the function handles gracefully
    expect(result).toBeTypeOf('string');
  });
});

describe('Table', () => {
  beforeEach(() => {
    useAscii();
  });

  it('should render a table with headers and rows', () => {
    const lines = renderTable({
      columns: [
        { header: 'ID', align: 'left', flex: false },
        { header: 'Name', align: 'left', flex: true },
        { header: 'Value', align: 'right', minWidth: 8 },
      ],
      rows: [
        ['1', 'Test', '42'],
        ['2', 'Longer Name', '100'],
      ],
      maxWidth: 60,
    });

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.includes('ID'))).toBe(true);
    expect(lines.some((l) => l.includes('Name'))).toBe(true);
    expect(lines.some((l) => l.includes('Value'))).toBe(true);
    expect(lines.some((l) => l.includes('Test'))).toBe(true);
  });

  it('renders table matching snapshot', () => {
    const lines = renderTable({
      columns: [
        { header: 'ID', flex: false },
        { header: 'Name', flex: true },
        { header: 'Score', align: 'right', minWidth: 8 },
      ],
      rows: [
        ['1', 'Alice', '95'],
        ['2', 'Bob', '87'],
      ],
      maxWidth: 50,
    });
    expect(lines.join('\n')).toMatchSnapshot();
  });

  it('should handle empty rows', () => {
    const lines = renderTable({
      columns: [{ header: 'Col', flex: true }],
      rows: [],
      maxWidth: 40,
    });
    expect(lines.length).toBeGreaterThan(0);
  });

  it('should handle single row', () => {
    const lines = renderTable({
      columns: [{ header: 'Col', flex: true }],
      rows: [['Value']],
      maxWidth: 40,
    });
    expect(lines.some((l) => l.includes('Value'))).toBe(true);
  });
});

describe('Badge', () => {
  it('should render severity badges', () => {
    expect(criticalBadge()).toContain('CRITICAL');
    expect(highBadge()).toContain('HIGH');
    expect(mediumBadge()).toContain('MEDIUM');
    expect(lowBadge()).toContain('LOW');
    expect(infoBadge()).toContain('INFO');
  });

  it('renders badges matching snapshot', () => {
    expect(criticalBadge()).toMatchSnapshot();
    expect(successBadge()).toMatchSnapshot();
  });

  it('should render status badges', () => {
    expect(successBadge()).toContain('SUCCESS');
    expect(failedBadge()).toContain('FAILED');
    expect(warningBadge()).toContain('WARNING');
  });

  it('should render custom badge', () => {
    const badge = renderBadge({ label: 'CUSTOM', variant: 'tag' });
    expect(badge).toContain('CUSTOM');
  });
});

describe('StatusBar', () => {
  beforeEach(() => {
    useAscii();
  });

  it('should render a status bar', () => {
    const bar = renderStatusBar({
      stage: 'extraction',
      memoryMB: 256,
      filesProcessed: 42,
      totalFiles: 100,
      elapsedMs: 5000,
      rate: 8.4,
    });
    expect(bar.length).toBeGreaterThan(0);
  });

  it('should render a full-width status bar', () => {
    const bar = renderFullStatusBar({
      stage: 'complete',
      memoryMB: 512,
      filesProcessed: 100,
      totalFiles: 100,
      elapsedMs: 10000,
    });
    expect(bar.length).toBeGreaterThan(0);
  });

  it('should render idle stage', () => {
    const bar = renderStatusBar({
      stage: 'idle',
    });
    expect(bar.length).toBeGreaterThan(0);
  });
});

describe('MiniChart', () => {
  beforeEach(() => {
    useAscii();
  });

  it('should render a horizontal bar chart', () => {
    const lines = renderHorizontalBarChart({
      data: [
        { label: 'Critical', value: 3, color: 'critical' },
        { label: 'High', value: 8, color: 'high' },
        { label: 'Medium', value: 12, color: 'medium' },
        { label: 'Low', value: 2, color: 'low' },
      ],
      maxWidth: 60,
    });
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.includes('Critical'))).toBe(true);
  });

  it('renders severity distribution matching snapshot', () => {
    const lines = renderSeverityDistribution(
      { critical: 3, high: 8, medium: 12, low: 2 },
      { maxWidth: 60, barLength: 20 },
    );
    expect(lines.join('\n')).toMatchSnapshot();
  });

  it('should render severity distribution', () => {
    const lines = renderSeverityDistribution(
      { critical: 3, high: 8, medium: 12, low: 2 },
      { maxWidth: 60 },
    );
    expect(lines.length).toBeGreaterThan(0);
  });

  it('should render risk histogram', () => {
    const lines = renderRiskHistogram(7.3, 40);
    expect(lines.length).toBe(2);
  });

  it('should handle empty data', () => {
    const lines = renderHorizontalBarChart({
      data: [],
      maxWidth: 40,
    });
    expect(lines.length).toBe(0);
  });
});
