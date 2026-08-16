/**
 * Regression tests for the REAL-TTY startup/runtime lifecycle.
 *
 * Guards the two post-v1.0.0 reliability issues:
 *
 * 1. STARTUP — the logo/startup screen disappeared within ~30-200ms (wiped by
 *    the first dashboard repaint or by instant completion). The renderer now
 *    guarantees a deterministic minimum presentation window
 *    (STARTUP_MIN_DISPLAY_MS) before any transition may replace the logo.
 *
 * 2. TRANSITIONS — startup → dashboard → summary must be exactly-once,
 *    well-formed ANSI, stable in non-TTY mode, and free of duplicate
 *    finalization.
 *
 * The DashboardRenderer accepts an injectable clock so the presentation
 * window is tested deterministically without real sleeps.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { isCancelRequested, isScanActive, runScan } from '../../src/commands/scan.js';
import {
  DashboardRenderer,
  STARTUP_MIN_DISPLAY_MS,
} from '../../src/scan/progress/dashboard-renderer.js';
import type { TerminalCapabilities } from '../../src/ui/index.js';
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

function ttyCaps(width = 80): TerminalCapabilities {
  return makeCaps({ width, isTty: true, prefersReducedMotion: true, unicode: true });
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

/** Mutable fake clock so the presentation window can be advanced deterministically. */
function fakeClock(initial = 0): { now: () => number; advance: (ms: number) => void } {
  let t = initial;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
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

/**
 * Count clearDashboard() invocations. Each one emits a cursor-up + erase-line
 * run, i.e. `\x1b[<N>A\x1b[2K` marks the start of a single wipe.
 */
function countWipes(text: string): number {
  return (text.match(/\x1b\[\d+A\x1b\[2K/g) ?? []).length;
}

afterEach(() => {
  vi.useRealTimers();
});

// ── STARTUP PRESENTATION WINDOW ──

describe('real-TTY startup presentation window', () => {
  it('keeps the startup screen (logo) visible despite rapid progress events', () => {
    const clock = fakeClock();
    const caps = captureStdout();
    const renderer = new DashboardRenderer(ttyCaps(), { now: clock.now });
    try {
      renderer.onStart(sessionWithStages());

      // A burst of progress/stage events well within the presentation window.
      for (let i = 0; i < 10; i++) {
        renderer.onProgress({ stage: 'extraction', filesProcessed: i + 1, totalFiles: 100 });
        renderer.onStageChange('discovery', i === 0 ? 'running' : 'completed');
        clock.advance(100);
      }

      const joined = caps.lines.join('');
      // Logo still on screen — nothing was wiped or overwritten.
      expect(joined).toContain('VERIS');
      expect(joined).toContain('Starting scan');
      // No cursor movement / erase sequences reached the terminal.
      expect(hasCursorControl(joined)).toBe(false);
      // The dashboard must not leak in while the startup screen is displayed.
      expect(joined).not.toContain('STATISTICS');
    } finally {
      caps.restore();
      void renderer.dispose();
    }
  });

  it('does not erase the logo on an error raised during the window', () => {
    const clock = fakeClock();
    const caps = captureStdout();
    const renderer = new DashboardRenderer(ttyCaps(), { now: clock.now });
    try {
      renderer.onStart(sessionWithStages());
      renderer.onError({ code: 'FILE_READ_ERROR', message: 'Cannot read file' });

      const duringWindow = caps.lines.join('');
      expect(hasCursorControl(duringWindow)).toBe(false);
      expect(duringWindow).toContain('VERIS');
      // Error text is queued, not painted over the logo.
      expect(duringWindow).not.toContain('Cannot read file');

      // After the window the transition flushes the queued error below the
      // wiped startup region, then paints the dashboard.
      clock.advance(STARTUP_MIN_DISPLAY_MS + 50);
      renderer.onProgress({ stage: 'extraction', filesProcessed: 1, totalFiles: 100 });

      const after = caps.lines.join('');
      expect(after).toContain('Cannot read file');
      expect(after).toContain('STATISTICS');
      expect(after).toMatch(/\x1b\[\d+A/);
    } finally {
      caps.restore();
      void renderer.dispose();
    }
  });

  it('defers the dashboard paint in the animation loop until the window elapses', () => {
    vi.useFakeTimers();
    const caps = captureStdout();
    const renderer = new DashboardRenderer(makeCaps({ width: 80, isTty: true, unicode: true }));
    try {
      renderer.onStart(sessionWithStages());
      renderer.onProgress({ stage: 'extraction', filesProcessed: 1, totalFiles: 100 });

      // Ticks before the window must not repaint (logo preserved).
      vi.advanceTimersByTime(STARTUP_MIN_DISPLAY_MS - 100);
      expect(hasCursorControl(caps.lines.join(''))).toBe(false);
      expect(caps.lines.join('')).not.toContain('STATISTICS');

      // First tick after the window performs the single transition.
      vi.advanceTimersByTime(300);
      const joined = caps.lines.join('');
      expect(joined).toContain('STATISTICS');
      expect(countWipes(joined)).toBe(1);
    } finally {
      caps.restore();
      void renderer.dispose();
    }
  });
});

// ── STARTUP → DASHBOARD TRANSITION ──

describe('real-TTY startup → dashboard transition', () => {
  it('transitions to the dashboard exactly once after the window', () => {
    const clock = fakeClock();
    const caps = captureStdout();
    const renderer = new DashboardRenderer(ttyCaps(), { now: clock.now });
    try {
      renderer.onStart(sessionWithStages());
      renderer.onProgress({ stage: 'extraction', filesProcessed: 1, totalFiles: 100 });
      clock.advance(STARTUP_MIN_DISPLAY_MS + 50);

      renderer.onProgress({ stage: 'extraction', filesProcessed: 2, totalFiles: 100 });
      const first = caps.lines.join('');
      expect(countWipes(first)).toBe(1);
      expect(first).toContain('STATISTICS');
      expect(first).toContain('2 / 100');

      // Later repaints erase only the dashboard region (incremental, stable).
      renderer.onProgress({ stage: 'extraction', filesProcessed: 3, totalFiles: 100 });
      const second = caps.lines.join('');
      expect(countWipes(second)).toBe(2);
    } finally {
      caps.restore();
      void renderer.dispose();
    }
  });

  it('writes the final summary immediately once the window has elapsed', () => {
    const clock = fakeClock();
    const caps = captureStdout();
    const renderer = new DashboardRenderer(ttyCaps(), { now: clock.now });
    try {
      const session = sessionWithStages();
      renderer.onStart(session);
      clock.advance(STARTUP_MIN_DISPLAY_MS + 50);
      renderer.onComplete(session, buildTestSummary());

      const joined = caps.lines.join('');
      expect(joined).toContain('Scan Complete');
      // The wipe + summary happened without needing dispose().
      expect(joined).toMatch(/\x1b\[\d+A/);
    } finally {
      caps.restore();
      void renderer.dispose();
    }
  });

  it('emits only well-formed ANSI sequences across narrow/wide terminals', () => {
    for (const width of [40, 80, 180]) {
      const clock = fakeClock();
      const caps = captureStdout();
      const renderer = new DashboardRenderer(ttyCaps(width), { now: clock.now });
      try {
        const session = sessionWithStages();
        renderer.onStart(session);
        clock.advance(STARTUP_MIN_DISPLAY_MS + 50);
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

        const joined = caps.lines.join('');
        // Every escape is a well-formed CSI sequence (\x1b[ ... letter).
        expect(joined.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')).not.toContain('\x1b');
        expect(joined).toContain('Scan Complete');
      } finally {
        caps.restore();
        void renderer.dispose();
      }
    }
  });
});

// ── FAST-SCAN COMPLETION / CLEANUP ──

describe('real-TTY completion and cleanup', () => {
  it('defers the final summary until the startup window elapses on fast scans', async () => {
    const clock = fakeClock();
    const caps = captureStdout();
    const renderer = new DashboardRenderer(ttyCaps(), { now: clock.now });
    try {
      const session = sessionWithStages();
      renderer.onStart(session);
      // Scan completes immediately — well before the presentation window.
      renderer.onComplete(session, buildTestSummary());

      const beforeDispose = caps.lines.join('');
      // Logo untouched, no summary yet, no wipe sequences.
      expect(beforeDispose).toContain('VERIS');
      expect(beforeDispose).not.toContain('Scan Complete');
      expect(hasCursorControl(beforeDispose)).toBe(false);

      clock.advance(STARTUP_MIN_DISPLAY_MS + 50);
      await renderer.dispose();

      const after = caps.lines.join('');
      expect(after).toContain('Scan Complete');
      expect(after).toMatch(/\x1b\[\d+A/);
    } finally {
      caps.restore();
      await renderer.dispose();
    }
  });

  it('finalizes exactly once across onComplete + repeated dispose', async () => {
    const clock = fakeClock();
    const caps = captureStdout();
    const renderer = new DashboardRenderer(ttyCaps(), { now: clock.now });
    try {
      const session = sessionWithStages();
      renderer.onStart(session);
      renderer.onComplete(session, buildTestSummary()); // deferred
      expect(caps.lines.join('')).not.toContain('Scan Complete');

      clock.advance(STARTUP_MIN_DISPLAY_MS + 50);
      await renderer.dispose();
      await renderer.dispose(); // second call must be a no-op
      await renderer.dispose();

      const joined = caps.lines.join('');
      const matches = joined.match(/Scan Complete/g) ?? [];
      expect(matches).toHaveLength(1);
    } finally {
      caps.restore();
      await renderer.dispose();
    }
  });
});

// ── SIGINT DEFERRAL STATE ──

describe('scan command cancellation state (SIGINT deferral)', () => {
  it('marks the scan active only while a scan is running', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'veris-scan-active-'));
    const out = path.join(dir, 'out');
    try {
      for (let i = 0; i < 5; i++) {
        await fsp.writeFile(path.join(dir, `f${i}.js`), `var v${i} = ${i};\n`);
      }
      const caps = captureStdout();
      try {
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

// ── NON-TTY STABILITY ──

describe('real-TTY regression: non-TTY output stays clean', () => {
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
      expect(joined).not.toMatch(/\x1b\[/);
      // Sequential output: startup first, summary last.
      expect(joined.indexOf('Starting scan')).toBeGreaterThanOrEqual(0);
      expect(joined.indexOf('Starting scan')).toBeLessThan(joined.indexOf('Scan Complete'));
    } finally {
      caps.restore();
      void renderer.dispose();
    }
  });
});
