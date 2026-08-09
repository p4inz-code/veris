/**
 * Tests for the Final Scan Summary (Sprint 3 completion screen).
 *
 * Covers:
 * - Section structure (SUMMARY / PERFORMANCE / ANALYSIS / OUTPUT / NEXT)
 * - Result states (complete, warnings, failed, cancelled)
 * - Zero-findings state
 * - Severity hierarchy (symbol + level, never color alone)
 * - Knowledge enrichments / packs when reported
 * - Narrow and wide terminal widths
 * - Unicode and ASCII fallbacks
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderFinalSummary } from '../../src/scan/progress/final-summary.js';
import {
  createScanSession,
  type ScanConfig,
  type ScanSession,
  type ScanSummary,
} from '../../src/scan/scan-session.js';
import { setSymbolSet, resetSymbolSet, resetTerminalCache } from '../../src/ui/index.js';

// ── Test Helpers ──

function createTestConfig(): ScanConfig {
  return Object.freeze({
    target: '/test/path',
    preset: 'default',
    enabledAnalyzers: ['PE', 'String'],
    enabledFormats: ['json', 'markdown'],
    workerCount: 1,
    maxFindings: 1000,
    maxFiles: 10000,
    maxDepth: 20,
    includeHidden: false,
  });
}

function makeSession(overrides: Partial<ScanSession> = {}): ScanSession {
  const session = createScanSession(createTestConfig(), '2026-07-11T00:00:00.000Z');
  return { ...session, ...overrides };
}

function makeSummary(overrides: Partial<ScanSummary> = {}): ScanSummary {
  return Object.freeze<ScanSummary>({
    durationMs: 1200,
    filesScanned: 48,
    artifacts: 48,
    rulesExecuted: 12,
    evidenceCollected: 212,
    findingsBySeverity: {},
    riskScore: 2.4,
    confidence: 0.85,
    outputFiles: ['/tmp/out/report.json'],
    warnings: 0,
    errors: 0,
    skippedFiles: 0,
    cancelled: false,
    ...overrides,
  });
}

/** Strip ANSI escape codes for readable assertions. */
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function render(
  session: ScanSession,
  summary: ScanSummary,
  options?: Parameters<typeof renderFinalSummary>[2],
): string {
  return stripAnsi(renderFinalSummary(session, summary, options).join('\n'));
}

describe('renderFinalSummary', () => {
  beforeEach(() => {
    resetSymbolSet();
    resetTerminalCache();
  });

  afterEach(() => {
    delete process.env.COLUMNS;
    resetSymbolSet();
    resetTerminalCache();
  });

  it('renders the section structure for a successful scan', () => {
    const out = render(makeSession(), makeSummary({ filesScanned: 48, evidenceCollected: 212 }));

    expect(out).toContain('Scan Complete');
    expect(out).toContain('SUMMARY');
    expect(out).toContain('PERFORMANCE');
    expect(out).toContain('NEXT');
    // Key values present
    expect(out).toContain('files');
    expect(out).toContain('48');
    expect(out).toContain('evidence');
    expect(out).toContain('212');
    expect(out).toContain('elapsed');
  });

  it('shows the risk level and score with confidence', () => {
    const out = render(makeSession(), makeSummary({ riskScore: 4.5, confidence: 0.85 }));

    // Level precedes the score so it survives narrow-terminal truncation.
    expect(out).toContain('medium  4.5 / 10.0');
    expect(out).toContain('confidence');
    expect(out).toContain('85.0%');
  });

  it('reports completion with warnings without burying the result', () => {
    const out = render(makeSession(), makeSummary({ warnings: 2, errors: 0 }));

    expect(out).toContain('Scan Complete');
    expect(out).toContain('Completed with 2 warnings');
    expect(out).toContain('warnings');
  });

  it('reports a failed scan when errors exist', () => {
    const out = render(makeSession(), makeSummary({ errors: 1, warnings: 0 }));

    expect(out).toContain('Scan Failed');
    expect(out).toContain('errors');
  });

  it('reports cancellation', () => {
    const out = render(makeSession(), makeSummary({ cancelled: true }), { cancelled: true });

    expect(out).toContain('Scan Cancelled');
  });

  it('presents a professional zero-findings state', () => {
    const out = render(makeSession(), makeSummary({ findingsBySeverity: {} }));

    expect(out).toMatch(/findings\s+0/);
    expect(out).not.toContain('FINDINGS');
  });

  it('shows per-severity finding counts only for non-zero buckets', () => {
    const out = render(
      makeSession(),
      makeSummary({
        findingsBySeverity: { critical: 0, high: 2, medium: 0, low: 5 },
      }),
    );

    expect(out).toContain('FINDINGS');
    expect(out).toContain('high');
    expect(out).toContain('low');
    // Severity is indicated by the level word, not color alone.
    expect(out).not.toMatch(/critical\s+0/);
  });

  it('uses Unicode severity symbols when available', () => {
    setSymbolSet('unicode');
    const out = render(makeSession(), makeSummary({ findingsBySeverity: { medium: 3 } }));

    expect(out).toContain('\u{1F7E1}'); // 🟡 medium
    expect(out).toContain('medium');
  });

  it('falls back to ASCII severity tags', () => {
    setSymbolSet('ascii');
    const out = render(makeSession(), makeSummary({ findingsBySeverity: { low: 1 } }));

    expect(out).toContain('[LOW]');
    expect(out).toContain('low');
  });

  it('shows knowledge enrichments and packs when reported', () => {
    const out = render(
      makeSession(),
      makeSummary({
        knowledgeEnrichments: 12,
        knowledgePacksLoaded: 6,
      }),
    );

    expect(out).toContain('ANALYSIS');
    expect(out).toContain('enrichments');
    expect(out).toContain('12');
    expect(out).toContain('packs');
  });

  it('omits the ANALYSIS section when no enrichment data exists', () => {
    const out = render(makeSession(), makeSummary());

    expect(out).not.toContain('ANALYSIS');
  });

  it('shows throughput when the session has it', () => {
    const session = makeSession({ throughput: 33.7 });
    const out = render(session, makeSummary());

    expect(out).toContain('throughput');
    expect(out).toContain('33.7 files/s');
  });

  it('lists output files', () => {
    const out = render(
      makeSession(),
      makeSummary({
        outputFiles: ['/tmp/out/report.json', '/tmp/out/report.md'],
      }),
    );

    expect(out).toContain('OUTPUT');
    expect(out).toContain('/tmp/out/report.json');
    expect(out).toContain('/tmp/out/report.md');
  });

  it('suggests only real existing VERIS commands', () => {
    const out = render(makeSession(), makeSummary());

    expect(out).toContain('NEXT');
    expect(out).toContain('veris report');
    expect(out).toContain('veris summarize');
    expect(out).toContain('veris scan --help');
  });

  it('keeps every line within a narrow terminal width without losing key data', () => {
    process.env.COLUMNS = '40';
    resetTerminalCache();
    const session = makeSession({ throughput: 33.7 });
    const summary = makeSummary({
      filesScanned: 48,
      evidenceCollected: 212,
      findingsBySeverity: { high: 2, low: 5 },
      warnings: 1,
      outputFiles: ['/tmp/very/long/output/directory/report.json'],
    });

    const visible = (line: string): string => line.replace(/\x1b\[[0-9;]*m/g, '');
    for (const line of renderFinalSummary(session, summary)) {
      expect(visible(line).length, `Line exceeds width 40: "${visible(line)}"`).toBeLessThanOrEqual(
        40,
      );
    }

    const out = render(session, summary);
    // Core data preserved (wrapped, not truncated): files, evidence, findings, risk.
    expect(out).toContain('48');
    expect(out).toContain('212');
    expect(out).toMatch(/findings\s+7/);
    // The long path is wrapped, not silently truncated — its parts survive.
    expect(out).toContain('/tmp/very');
    expect(out).toContain('report.json');
  });

  it('renders a wide terminal without unbounded line length', () => {
    process.env.COLUMNS = '200';
    resetTerminalCache();
    const session = makeSession();
    const visible = (line: string): string => line.replace(/\x1b\[[0-9;]*m/g, '');
    for (const line of renderFinalSummary(session, makeSummary())) {
      expect(visible(line).length).toBeLessThanOrEqual(100);
    }
  });
});
