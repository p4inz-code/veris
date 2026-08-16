/**
 * Regression tests for the REAL-TTY session lifecycle.
 *
 * Guards the post-v1.0.0 reliability issue: the VERIS logo was part of the
 * scan-scoped startup screen and was wiped by the first dashboard repaint.
 * The header is now SESSION-scoped — owned by {@link SessionHeader} — and
 * renders exactly once per interactive session. No scan lifecycle event
 * (progress, dashboard repaint, error, cancellation, summary) may erase or
 * re-create it.
 *
 * Invariants covered:
 * - Header initializes exactly once and is never re-created.
 * - Header remains during progress, dashboard repaints, errors, fast scan
 *   completion, normal completion, and cancellation.
 * - The animation timer is active only while the session is active and stops
 *   before process exit (dispose()).
 * - Repeated dispose() produces no duplicate output; no timers leak.
 * - No cursor corruption: all ANSI is well-formed at 40/80/180 columns.
 * - Non-TTY output contains zero cursor-control sequences.
 * - JSON stays byte-valid NDJSON; --silent stays clean.
 * - First Ctrl+C cancels gracefully; a second Ctrl+C forces exit.
 * - No SIGINT listeners leak after a scan completes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { isCancelRequested, isScanActive, runScan } from '../../src/commands/scan.js';
import { DashboardRenderer } from '../../src/scan/progress/dashboard-renderer.js';
import type { TerminalCapabilities } from '../../src/ui/index.js';
import { setSymbolSet, resetSymbolSet } from '../../src/ui/index.js';
import {
  createScanSession,
  type ScanConfig,
  type ScanSession,
  type ScanSummary,
  type StageState,
} from '../../src/scan/scan-session.js';

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

function makeCaps(overrides: Partial<TerminalCapabilities> = {}): TerminalCapabilities {
  return Object.freeze<TerminalCapabilities>({
    width: 80,
    height: 24,
    colorDepth: 'none',
    unicode: false,
    isTty: false,
    isCi: false,
    ciEnvironment: 'none',
    isWindows: false,
    os: 'linux',
    emulator: 'xterm',
    isVsCode: false,
    prefersReducedMotion: false,
    nodeVersion: [22, 0],
    ...overrides,
  });
}

/**
 * Reduced-motion TTY caps: interactive (isTty) but no animation loop, so the
 * renderer repaints deterministically on demand (no timers in tests).
 */
function ttyCaps(width = 80): TerminalCapabilities {
  return makeCaps({ width, isTty: true, prefersReducedMotion: true, unicode: true });
}

/** Fully animated TTY caps: both header and dashboard animation permitted. */
function animatedTtyCaps(width = 80): TerminalCapabilities {
  return makeCaps({ width, isTty: true, prefersReducedMotion: false, unicode: true });
}

function sessionWithStages(): ScanSession {
  const session = createScanSession(createTestConfig(), '2026-07-11T00:00:00.000Z');
  const ids = [
    'discovery',
    'classification',
    'extraction',
    'knowledge',
    'analysis',
    'rules',
    'correlation',
    'risk',
    'reporting',
    'export',
  ];
  const stages = Object.fromEntries(
    ids.map((id) => [
      id,
      Object.freeze<StageState>({
        id,
        status: 'waiting',
        startedAt: null,
        completedAt: null,
        durationMs: 0,
        itemsProcessed: 0,
        itemsFailed: 0,
      }),
    ]),
  ) as Record<string, StageState>;
  return { ...session, stages };
}

function buildTestSummary(): ScanSummary {
  return Object.freeze({
    durationMs: 1000,
    filesScanned: 5,
    artifacts: 5,
    rulesExecuted: 2,
    evidenceCollected: 3,
    findingsBySeverity: { low: 1 },
    riskScore: 2.5,
    confidence: 0.6,
    outputFiles: ['/out/report.json'],
    warnings: 0,
    errors: 0,
    skippedFiles: 0,
    cancelled: false,
    knowledgePacksLoaded: 6,
    knowledgeEnrichments: 0,
  });
}

function captureStdout(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((str: string) => {
    lines.push(str);
    return true;
  }) as typeof process.stdout.write;
  return {
    lines,
    restore: () => {
      process.stdout.write = orig;
    },
  };
}

/** True when the stream contains any CSI cursor/erase control sequence. */
function hasCursorControl(text: string): boolean {
  return /\x1b\[[0-9;]*[ABCDEFGHJK]/.test(text);
}

/** Count occurrences of the session header identity line (rendered once). */
function countHeaderRenders(text: string): number {
  return (text.match(/VERIS v1\.0\.0/g) ?? []).length;
}

/** Count body-region wipe operations (`\x1b[<N>A\r` clears the body below). */
function countWipes(text: string): number {
  return (text.match(/\x1b\[\d+A\r/g) ?? []).length;
}

/** All CSI escapes must be well-formed (`\x1b[ ... letter`) and balanced. */
function hasMalformedAnsi(text: string): boolean {
  const stripped = text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
  return stripped.includes('\x1b');
}

afterEach(() => {
  vi.useRealTimers();
  resetSymbolSet();
});

// ── PERSISTENT SESSION HEADER ──

describe('persistent session header (real-TTY)', () => {
  it('initializes exactly once and survives the full lifecycle', () => {
    const caps = captureStdout();
    const renderer = new DashboardRenderer(ttyCaps());
    try {
      const session = sessionWithStages();
      renderer.onStart(session, { knowledgePackCount: 6 });

      // Progress burst + stage changes + errors + repaints.
      for (let i = 0; i < 10; i++) {
        renderer.onProgress({
          stage: 'extraction',
          filesProcessed: i + 1,
          totalFiles: 100,
        });
        renderer.onStageChange('discovery', i === 0 ? 'running' : 'completed');
      }
      renderer.onError({ code: 'FILE_READ_ERROR', message: 'Cannot read file' });
      renderer.onComplete(session, buildTestSummary());
      void renderer.dispose();

      const joined = caps.lines.join('');
      // The header was rendered exactly once — never re-created, never wiped.
      expect(countHeaderRenders(joined)).toBe(1);
      // The summary rendered below the header; the header is still present.
      expect(joined).toContain('Scan Complete');
      expect(joined.indexOf('VERIS v1.0.0')).toBeLessThan(joined.indexOf('Scan Complete'));
    } finally {
      caps.restore();
      void renderer.dispose();
    }
  });

  it('remains visible during progress and dashboard repaints', () => {
    const caps = captureStdout();
    const renderer = new DashboardRenderer(ttyCaps());
    try {
      const session = sessionWithStages();
      renderer.onStart(session);
      for (let i = 0; i < 5; i++) {
        renderer.onProgress({ stage: 'extraction', filesProcessed: i + 1, totalFiles: 100 });
      }
      const joined = caps.lines.join('');
      expect(countHeaderRenders(joined)).toBe(1);
      expect(joined).toContain('STATISTICS');
    } finally {
      caps.restore();
      void renderer.dispose();
    }
  });

  it('remains visible after a fast scan completion (no wipe before exit)', () => {
    const caps = captureStdout();
    const renderer = new DashboardRenderer(ttyCaps());
    try {
      const session = sessionWithStages();
      renderer.onStart(session);
      // Scan completes immediately — the header must not be wiped.
      renderer.onComplete(session, buildTestSummary());
      void renderer.dispose();

      const joined = caps.lines.join('');
      expect(countHeaderRenders(joined)).toBe(1);
      expect(joined).toContain('Scan Complete');
    } finally {
      caps.restore();
      void renderer.dispose();
    }
  });

  it('remains visible during cancellation', () => {
    const caps = captureStdout();
    const renderer = new DashboardRenderer(ttyCaps());
    try {
      const session = sessionWithStages();
      renderer.onStart(session);
      renderer.onProgress({ stage: 'extraction', filesProcessed: 3, totalFiles: 100 });
      renderer.onCancel(session);
      void renderer.dispose();

      const joined = caps.lines.join('');
      expect(countHeaderRenders(joined)).toBe(1);
      expect(joined).toContain('Scan Cancelled');
    } finally {
      caps.restore();
      void renderer.dispose();
    }
  });

  it('remains visible during errors (errors render below the header)', () => {
    const caps = captureStdout();
    const renderer = new DashboardRenderer(ttyCaps());
    try {
      const session = sessionWithStages();
      renderer.onStart(session);
      renderer.onError({ code: 'FILE_READ_ERROR', message: 'Cannot read file' });
      renderer.onProgress({ stage: 'extraction', filesProcessed: 1, totalFiles: 100 });

      const joined = caps.lines.join('');
      expect(countHeaderRenders(joined)).toBe(1);
      expect(joined).toContain('Cannot read file');
      // The header text precedes the error text — nothing was written over it.
      expect(joined.indexOf('VERIS v1.0.0')).toBeLessThan(joined.indexOf('Cannot read file'));
    } finally {
      caps.restore();
      void renderer.dispose();
    }
  });

  it('remains the FIRST content in the stream — nothing is ever written above it', () => {
    const caps = captureStdout();
    const renderer = new DashboardRenderer(ttyCaps());
    try {
      const session = sessionWithStages();
      renderer.onStart(session);
      renderer.onProgress({ stage: 'extraction', filesProcessed: 1, totalFiles: 100 });
      renderer.onError({ code: 'FILE_READ_ERROR', message: 'Cannot read file' });
      renderer.onComplete(session, buildTestSummary());
      void renderer.dispose();

      const joined = caps.lines.join('');
      // The header leads the stream: its identity line precedes every body
      // section (config, dashboard, errors, summary). Nothing is ever written
      // above it.
      const bodyPositions = [
        joined.indexOf('Starting scan'),
        joined.indexOf('STATISTICS'),
        joined.indexOf('Cannot read file'),
        joined.indexOf('Scan Complete'),
      ].filter((p) => p >= 0);
      expect(bodyPositions.length).toBeGreaterThan(0);
      const firstBody = Math.min(...bodyPositions);
      expect(joined.indexOf('VERIS v1.0.0')).toBeGreaterThanOrEqual(0);
      expect(joined.indexOf('VERIS v1.0.0')).toBeLessThan(firstBody);
    } finally {
      caps.restore();
      void renderer.dispose();
    }
  });

  it('animation runs only while the session is active and stops at shutdown', () => {
    vi.useFakeTimers();
    const caps = captureStdout();
    const renderer = new DashboardRenderer(animatedTtyCaps());
    try {
      const session = sessionWithStages();
      renderer.onStart(session);
      const afterStart = caps.lines.length;

      // Header + dashboard animation ticks continue while alive.
      vi.advanceTimersByTime(1000);
      expect(caps.lines.length).toBeGreaterThan(afterStart);

      // Shutdown stops all animation before process exit.
      void renderer.dispose();
      const afterDispose = caps.lines.length;
      vi.advanceTimersByTime(5000);
      expect(caps.lines.length).toBe(afterDispose);
      expect(vi.getTimerCount()).toBe(0); // no leaked timers
    } finally {
      caps.restore();
      void renderer.dispose();
    }
  });

  it('repeated dispose() produces no duplicate ANSI or output', async () => {
    const caps = captureStdout();
    const renderer = new DashboardRenderer(ttyCaps());
    try {
      const session = sessionWithStages();
      renderer.onStart(session);
      renderer.onComplete(session, buildTestSummary());
      await renderer.dispose();
      const afterFirst = caps.lines.length;
      await renderer.dispose();
      await renderer.dispose();
      expect(caps.lines.length).toBe(afterFirst);
      expect(countHeaderRenders(caps.lines.join(''))).toBe(1);
    } finally {
      caps.restore();
      await renderer.dispose();
    }
  });

  it('fast process termination leaves no timer running and no trailing output', () => {
    vi.useFakeTimers();
    const caps = captureStdout();
    const renderer = new DashboardRenderer(animatedTtyCaps());
    try {
      const session = sessionWithStages();
      renderer.onStart(session);
      // Process exits immediately — dispose() must stop animation cleanly.
      void renderer.dispose();
      const afterDispose = caps.lines.length;
      vi.advanceTimersByTime(10_000);
      expect(caps.lines.length).toBe(afterDispose);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      caps.restore();
      void renderer.dispose();
    }
  });
});

// ── ANSI WELL-FORMEDNESS ACROSS WIDTHS ──

describe('terminal-width integrity (real-TTY)', () => {
  it('emits only well-formed ANSI sequences across 40/80/180 columns', () => {
    for (const width of [40, 80, 180]) {
      const caps = captureStdout();
      const renderer = new DashboardRenderer(ttyCaps(width));
      try {
        const session = sessionWithStages();
        renderer.onStart(session);
        renderer.onProgress({
          stage: 'extraction',
          currentFile: {
            filename: 'sample.bin',
            relativePath: '/sample.bin',
            size: 1024,
            fileType: '',
            language: '',
            artifactType: 'file',
            currentAnalyzer: 'extraction',
          },
          filesProcessed: 5,
          totalFiles: 100,
        });
        renderer.onComplete(session, buildTestSummary());
        void renderer.dispose();

        const joined = caps.lines.join('');
        expect(hasMalformedAnsi(joined)).toBe(false);
        expect(countHeaderRenders(joined)).toBe(1);
        expect(joined).toContain('Scan Complete');
      } finally {
        caps.restore();
        void renderer.dispose();
      }
    }
  });

  it('repaints the dashboard in place without ever wiping the header region', () => {
    const caps = captureStdout();
    const renderer = new DashboardRenderer(ttyCaps(80));
    try {
      const session = sessionWithStages();
      renderer.onStart(session);
      renderer.onProgress({ stage: 'extraction', filesProcessed: 1, totalFiles: 100 });
      const afterFirst = countWipes(caps.lines.join(''));

      renderer.onProgress({ stage: 'extraction', filesProcessed: 2, totalFiles: 100 });
      renderer.onProgress({ stage: 'extraction', filesProcessed: 3, totalFiles: 100 });
      const joined = caps.lines.join('');
      // Each dashboard repaint wipes only the body region (below the header).
      expect(countWipes(joined)).toBeGreaterThan(afterFirst);
      expect(countHeaderRenders(joined)).toBe(1);
    } finally {
      caps.restore();
      void renderer.dispose();
    }
  });
});

// ── NON-TTY / MACHINE-READABLE MODES ──

describe('non-TTY and machine-readable modes stay clean', () => {
  it('never emits cursor-control sequences in non-TTY mode', () => {
    const caps = captureStdout();
    const renderer = new DashboardRenderer(makeCaps({ isTty: false }));
    try {
      const session = sessionWithStages();
      renderer.onStart(session);
      renderer.onStageChange('discovery', 'completed');
      renderer.onStageChange('classification', 'completed');
      renderer.onError({ code: 'FILE_READ_ERROR', message: 'Cannot read file' });
      renderer.onComplete(session, buildTestSummary());

      const joined = caps.lines.join('');
      expect(hasCursorControl(joined)).toBe(false);
      expect(joined).not.toMatch(/\x1b\[/);
      // Sequential output: startup header first, summary last.
      expect(joined.indexOf('Starting scan')).toBeGreaterThanOrEqual(0);
      expect(joined.indexOf('Starting scan')).toBeLessThan(joined.indexOf('Scan Complete'));
    } finally {
      caps.restore();
      void renderer.dispose();
    }
  });

  it('--no-unicode renders an ASCII header (no block elements)', () => {
    setSymbolSet('ascii');
    const caps = captureStdout();
    const renderer = new DashboardRenderer(makeCaps({ isTty: false, unicode: false }));
    try {
      const session = sessionWithStages();
      renderer.onStart(session);
      const joined = caps.lines.join('');
      expect(joined).toContain('V E R I S');
      expect(joined).not.toContain('\u2588'); // no block elements
      expect(joined).not.toContain('\u2014'); // no em-dash
    } finally {
      caps.restore();
      void renderer.dispose();
    }
  });

  it('JSON progress output is byte-valid NDJSON', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'veris-json-ndjson-'));
    const out = path.join(dir, 'out');
    const caps = captureStdout();
    try {
      for (let i = 0; i < 5; i++) {
        await fsp.writeFile(path.join(dir, `f${i}.js`), `var v${i} = ${i};\n`);
      }
      const { exitCode } = await runScan({
        target: dir,
        progress: 'json',
        computedAt: '2026-08-09T00:00:00.000Z',
        format: ['json'],
        output: out,
      });
      expect(exitCode).toBe(0);
      // Every stdout line must parse as standalone JSON; no ANSI anywhere.
      const joined = caps.lines.join('');
      expect(joined).not.toMatch(/\x1b\[/);
      const lines = joined.split('\n').filter((l) => l.trim().length > 0);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    } finally {
      caps.restore();
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it('--silent remains clean (summary only, no dashboard, no cursor control)', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'veris-silent-clean-'));
    const out = path.join(dir, 'out');
    const caps = captureStdout();
    try {
      for (let i = 0; i < 5; i++) {
        await fsp.writeFile(path.join(dir, `f${i}.js`), `var v${i} = ${i};\n`);
      }
      const { exitCode } = await runScan({
        target: dir,
        progress: 'silent',
        computedAt: '2026-08-09T00:00:00.000Z',
        format: ['json'],
        output: out,
      });
      expect(exitCode).toBe(0);
      const joined = caps.lines.join('');
      expect(hasCursorControl(joined)).toBe(false);
      expect(joined).toContain('Scan Complete');
      expect(joined).not.toContain('STATISTICS');
      expect(joined).not.toContain('PIPELINE');
    } finally {
      caps.restore();
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});

// ── SIGINT DEFERRAL STATE ──

describe('scan command cancellation state (SIGINT deferral)', () => {
  it('marks the scan active only while a scan is running and removes its SIGINT listener', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'veris-scan-active-'));
    const out = path.join(dir, 'out');
    try {
      for (let i = 0; i < 5; i++) {
        await fsp.writeFile(path.join(dir, `f${i}.js`), `var v${i} = ${i};\n`);
      }
      const caps = captureStdout();
      try {
        const listenersBefore = process.listenerCount('SIGINT');
        const promise = runScan({
          target: dir,
          progress: 'silent',
          computedAt: '2026-08-09T00:00:00.000Z',
          format: ['json'],
          output: out,
        });
        // The flag is set synchronously when runScan starts executing, so the
        // CLI's global SIGINT handler defers shutdown to the scan's own
        // cancellation flow (no duplicate finalization).
        expect(isScanActive()).toBe(true);
        const { exitCode } = await promise;
        expect(exitCode).toBe(0);
        expect(isScanActive()).toBe(false);
        // The scan's own SIGINT listener is removed on completion.
        expect(process.listenerCount('SIGINT')).toBe(listenersBefore);
      } finally {
        caps.restore();
      }
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it('first SIGINT cancels a running scan and renders the cancellation UI exactly once', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'veris-sigint-cancel-'));
    const out = path.join(dir, 'out');
    const caps = captureStdout();
    try {
      for (let i = 0; i < 5; i++) {
        await fsp.writeFile(path.join(dir, `f${i}.js`), `var v${i} = ${i};\n`);
      }
      const promise = runScan({
        target: dir,
        progress: 'silent',
        computedAt: '2026-08-09T00:00:00.000Z',
        format: ['json'],
        output: out,
      });
      // The scan is now mid-flight (pending discovery/extraction awaits). The
      // first Ctrl+C must request a graceful cancellation — never exit.
      process.emit('SIGINT');
      expect(isCancelRequested()).toBe(true);
      const { exitCode } = await promise;
      expect(exitCode).toBe(0);
      const joined = caps.lines.join('');
      // Cancellation screen rendered exactly once, no duplicate finalization.
      expect(joined.match(/Scan cancelled\./g)).toHaveLength(1);
    } finally {
      caps.restore();
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it('second SIGINT during a running scan forces an immediate exit with code 130', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'veris-sigint-force-'));
    const out = path.join(dir, 'out');
    const caps = captureStdout();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    try {
      for (let i = 0; i < 5; i++) {
        await fsp.writeFile(path.join(dir, `f${i}.js`), `var v${i} = ${i};\n`);
      }
      const promise = runScan({
        target: dir,
        progress: 'silent',
        computedAt: '2026-08-09T00:00:00.000Z',
        format: ['json'],
        output: out,
      });
      process.emit('SIGINT'); // first: graceful cancellation request
      expect(exitSpy).not.toHaveBeenCalled();
      process.emit('SIGINT'); // second: force termination
      expect(exitSpy).toHaveBeenCalledWith(130);
      // The mocked exit lets the run finish cleanly; the process would have
      // terminated immediately in production.
      const { exitCode } = await promise;
      expect(exitCode).toBe(0);
    } finally {
      exitSpy.mockRestore();
      caps.restore();
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});
