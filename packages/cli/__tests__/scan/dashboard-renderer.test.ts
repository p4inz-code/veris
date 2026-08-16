/**
 * Tests for the DashboardRenderer (Sprint 2 progress dashboard).
 *
 * Covers:
 * - Section-based layout (CURRENT / PIPELINE / STATISTICS / PERFORMANCE)
 * - Stage-state sync via onStageChange (visualization accuracy)
 * - Unicode and ASCII pipeline markers
 * - Narrow terminal handling (secondary info dropped, never truncated silently)
 * - Non-TTY one-shot phase lines (no dashboard spam when piped)
 * - Stability: identical progress does not repaint the dashboard
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DashboardRenderer } from '../../src/scan/progress/dashboard-renderer.js';
import {
  createScanSession,
  type ScanConfig,
  type ScanSession,
  type StageState,
} from '../../src/scan/scan-session.js';
import { setSymbolSet, resetSymbolSet, type TerminalCapabilities } from '../../src/ui/index.js';

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

function ttyCaps(width = 80, height = 24): TerminalCapabilities {
  return makeCaps({ width, height, isTty: true, prefersReducedMotion: true, unicode: true });
}

/**
 * Build a TTY dashboard renderer for deterministic dashboard tests.
 *
 * Reduced-motion caps (see ttyCaps) keep the renderer timer-free: the
 * dashboard paints immediately on progress events instead of on an interval.
 * The `now` option is accepted for compatibility but no longer affects
 * rendering — the header is session-scoped and no startup window remains.
 */
function ttyRenderer(width = 80, height = 24): DashboardRenderer {
  let t = 0;
  return new DashboardRenderer(ttyCaps(width, height), { now: () => (t += 10_000) });
}

/** Strip ANSI escape codes for readable assertions. */
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
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

function allStagesWaiting(): Record<string, StageState> {
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
  return Object.fromEntries(
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
}

function sessionWithStages(): ScanSession {
  const session = createScanSession(createTestConfig(), '2026-07-11T00:00:00.000Z');
  return { ...session, stages: allStagesWaiting() };
}

describe('DashboardRenderer', () => {
  beforeEach(() => {
    resetSymbolSet();
  });

  afterEach(() => {
    resetSymbolSet();
  });

  it('writes the startup screen on start', () => {
    const caps = captureStdout();
    const renderer = ttyRenderer();
    try {
      renderer.onStart(sessionWithStages(), { knowledgePackCount: 3 });
      const joined = caps.lines.join('');
      expect(joined).toContain('VERIS');
      expect(joined).toContain('Starting scan');
    } finally {
      caps.restore();
      renderer.dispose();
    }
  });

  it('renders the four dashboard sections with real counters', () => {
    setSymbolSet('unicode');
    const caps = captureStdout();
    // Tall terminal: the 10-row Unicode header leaves room for the full
    // dashboard body (on short terminals the frame tail is clipped, which
    // is covered by the VT-terminal model tests).
    const renderer = ttyRenderer(80, 40);
    try {
      renderer.onStart(sessionWithStages());
      renderer.onStageChange('discovery', 'completed');
      renderer.onStageChange('classification', 'completed');
      renderer.onProgress({
        stage: 'extraction',
        currentFile: {
          filename: 'main.rs',
          relativePath: '/src/main.rs',
          size: 4096,
          fileType: 'text/rust',
          language: 'utf-8',
          artifactType: 'file',
          currentAnalyzer: 'extraction',
        },
        filesProcessed: 10,
        totalFiles: 100,
        queueSize: 90,
      });

      const joined = stripAnsi(caps.lines.join(''));
      expect(joined).toContain('CURRENT');
      expect(joined).toContain('PIPELINE');
      expect(joined).toContain('STATISTICS');
      expect(joined).toContain('PERFORMANCE');
      // Current stage + file
      expect(joined).toContain('Extract');
      expect(joined).toContain('main.rs');
      // Progress line
      expect(joined).toContain('10 / 100');
      // Real counters
      expect(joined).toContain('discovered');
      expect(joined).toContain('processed');
      expect(joined).toContain('findings');
      expect(joined).toContain('evidence');
      expect(joined).toContain('elapsed');
    } finally {
      caps.restore();
      renderer.dispose();
    }
  });

  it('reflects stage changes in the pipeline visualization', () => {
    setSymbolSet('unicode');
    const caps = captureStdout();
    const renderer = ttyRenderer();
    try {
      renderer.onStart(sessionWithStages());
      // Complete discovery + classification → Discover phase done.
      renderer.onStageChange('discovery', 'completed');
      renderer.onStageChange('classification', 'completed');
      renderer.onProgress({ stage: 'discovery', totalFiles: 100 });

      const joined = stripAnsi(caps.lines.join(''));
      expect(joined).toContain('✓ Discover');
      // Not yet completed: Extract still waiting.
      expect(joined).toContain('○ Extract');
    } finally {
      caps.restore();
      renderer.dispose();
    }
  });

  it('never marks a phase complete before its stages complete', () => {
    setSymbolSet('unicode');
    const caps = captureStdout();
    const renderer = ttyRenderer();
    try {
      renderer.onStart(sessionWithStages());
      // Only discovery completed — classification still waiting.
      renderer.onStageChange('discovery', 'completed');
      renderer.onProgress({ stage: 'discovery', totalFiles: 100 });

      const joined = stripAnsi(caps.lines.join(''));
      expect(joined).not.toContain('✓ Discover');
    } finally {
      caps.restore();
      renderer.dispose();
    }
  });

  it('uses ASCII tags in the dashboard when Unicode is unavailable', () => {
    setSymbolSet('ascii');
    const caps = captureStdout();
    const renderer = ttyRenderer();
    try {
      renderer.onStart(sessionWithStages());
      renderer.onStageChange('discovery', 'completed');
      renderer.onStageChange('classification', 'completed');
      renderer.onProgress({ stage: 'discovery', totalFiles: 100 });

      const joined = stripAnsi(caps.lines.join(''));
      expect(joined).toContain('[done] Discover');
      expect(joined).toContain('[    ] Extract');
    } finally {
      caps.restore();
      renderer.dispose();
    }
  });

  it('drops secondary details on narrow terminals without losing counters', () => {
    setSymbolSet('ascii');
    const caps = captureStdout();
    const renderer = ttyRenderer(40);
    try {
      renderer.onStart(sessionWithStages());
      renderer.onStageChange('discovery', 'completed');
      renderer.onStageChange('classification', 'completed');
      renderer.onProgress({
        stage: 'extraction',
        currentFile: {
          filename: 'a-very-long-filename-that-would-not-fit.exe',
          relativePath: '/src/a-very-long-filename-that-would-not-fit.exe',
          size: 1048576,
          fileType: 'PE32',
          language: '',
          artifactType: 'executable',
          currentAnalyzer: 'extraction',
        },
        filesProcessed: 10,
        totalFiles: 100,
      });

      const joined = stripAnsi(caps.lines.join(''));
      // Secondary size detail is dropped (simplified), never silently garbled.
      expect(joined).not.toContain('1.0 MB');
      // Primary counters remain present.
      expect(joined).toContain('discovered');
      expect(joined).toContain('findings');
      expect(joined).toContain('10 / 100');
    } finally {
      caps.restore();
      renderer.dispose();
    }
  });

  it('does not repaint when the rendered content is unchanged', () => {
    setSymbolSet('ascii');
    const caps = captureStdout();
    const renderer = ttyRenderer();
    try {
      renderer.onStart(sessionWithStages());
      renderer.onProgress({ stage: 'extraction', filesProcessed: 5, totalFiles: 100 });
      const afterFirst = caps.lines
        .join('')
        .split('\n')
        .filter((l) => l.length > 0).length;

      // Identical progress update → no repaint.
      renderer.onProgress({ stage: 'extraction', filesProcessed: 5, totalFiles: 100 });
      const afterSecond = caps.lines
        .join('')
        .split('\n')
        .filter((l) => l.length > 0).length;
      expect(afterSecond).toBe(afterFirst);
    } finally {
      caps.restore();
      renderer.dispose();
    }
  });

  it('repaints after an error even if progress is otherwise unchanged', () => {
    setSymbolSet('ascii');
    const caps = captureStdout();
    const renderer = ttyRenderer();
    try {
      renderer.onStart(sessionWithStages());
      renderer.onProgress({ stage: 'extraction', filesProcessed: 5, totalFiles: 100 });
      renderer.onError({ code: 'FILE_READ_ERROR', message: 'Cannot read file' });
      const afterError = caps.lines
        .join('')
        .split('\n')
        .filter((l) => l.length > 0).length;

      // Identical progress data — but the dashboard was cleared by the error,
      // so it must repaint rather than being skipped by the content cache.
      renderer.onProgress({ stage: 'extraction', filesProcessed: 5, totalFiles: 100 });
      const afterRepaint = caps.lines
        .join('')
        .split('\n')
        .filter((l) => l.length > 0).length;
      expect(afterRepaint).toBeGreaterThan(afterError);
      expect(stripAnsi(caps.lines.join(''))).toContain('STATISTICS');
    } finally {
      caps.restore();
      renderer.dispose();
    }
  });

  it('repaints when progress actually changes', () => {
    setSymbolSet('ascii');
    const caps = captureStdout();
    const renderer = ttyRenderer();
    try {
      renderer.onStart(sessionWithStages());
      renderer.onProgress({ stage: 'extraction', filesProcessed: 5, totalFiles: 100 });
      const afterFirst = caps.lines
        .join('')
        .split('\n')
        .filter((l) => l.length > 0).length;

      renderer.onProgress({ stage: 'extraction', filesProcessed: 6, totalFiles: 100 });
      const afterSecond = caps.lines
        .join('')
        .split('\n')
        .filter((l) => l.length > 0).length;
      expect(afterSecond).toBeGreaterThan(afterFirst);
      expect(caps.lines.join('')).toContain('6 / 100');
    } finally {
      caps.restore();
      renderer.dispose();
    }
  });
});

describe('DashboardRenderer non-TTY mode', () => {
  beforeEach(() => {
    resetSymbolSet();
  });

  afterEach(() => {
    resetSymbolSet();
  });

  it('prints one deterministic line per phase completion when piped', () => {
    // No injected caps → environment detection (non-TTY in test runner).
    const caps = captureStdout();
    const renderer = new DashboardRenderer();
    try {
      renderer.onStart(sessionWithStages());

      // Partial completion prints nothing.
      renderer.onStageChange('discovery', 'completed');
      // Phase fully complete → single line.
      renderer.onStageChange('classification', 'completed');

      const joined = stripAnsi(caps.lines.join(''));
      expect(joined).toContain('[done] Discover');
      // No dashboard sections or per-file spam in non-TTY output.
      expect(joined).not.toContain('STATISTICS');
      expect(joined).not.toContain('PERFORMANCE');
    } finally {
      caps.restore();
      renderer.dispose();
    }
  });

  it('does not print a phase completion line twice', () => {
    const caps = captureStdout();
    const renderer = new DashboardRenderer();
    try {
      renderer.onStart(sessionWithStages());
      renderer.onStageChange('discovery', 'completed');
      renderer.onStageChange('classification', 'completed');
      // A second completed event for a mapped stage must not duplicate the line.
      renderer.onStageChange('classification', 'completed');

      const matches = stripAnsi(caps.lines.join('')).match(/\[done\] Discover/g) ?? [];
      expect(matches).toHaveLength(1);
    } finally {
      caps.restore();
      renderer.dispose();
    }
  });

  it('prints nothing for stages that never complete', () => {
    const caps = captureStdout();
    const renderer = new DashboardRenderer();
    try {
      renderer.onStart(sessionWithStages());
      renderer.onStageChange('extraction', 'running');

      const joined = caps.lines.join('');
      expect(joined).not.toContain('[done]');
      expect(joined).not.toContain('[run ]');
    } finally {
      caps.restore();
      renderer.dispose();
    }
  });
});
