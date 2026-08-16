/**
 * REAL-TERMINAL regression tests for the persistent session header.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The previous lifecycle tests captured `process.stdout.write` bytes and
 * asserted on string content. That models the terminal as an INFINITE-height
 * buffer where `\x1b[nA` always moves up n rows and nothing ever scrolls.
 * Real terminals have a FINITE height: when body output grows past the bottom
 * of the screen, the terminal SCROLLS — top rows move into scrollback and are
 * gone. Cursor-up cannot bring scrolled-off rows back (it is clamped at the
 * top of the screen), so a header written as ordinary output at the top
 * disappears the moment the body is taller than the screen.
 *
 * This file replays the real renderer's byte stream through a faithful
 * finite-height VT model (scroll-on-overflow, alternate screen buffer,
 * clamped cursor movement, CUP/ED/EL) and asserts the header STAYS VISIBLE
 * while the body advances — the assertion the manual Windows recordings
 * proved the old implementations violated.
 *
 * The renderer under test uses the ALTERNATE SCREEN + FULL-FRAME REDRAW
 * model: every repaint is `\x1b[H` + header lines + body lines + `\x1b[0J`,
 * re-anchoring the header at the top of every frame. That is the mechanism
 * that is structurally correct on Windows Terminal/ConPTY, where DECSTBM
 * scroll-region pinning is unreliable (microsoft/terminal#19016, #3673).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSymbolSet, setSymbolSet, type TerminalCapabilities } from '../../src/ui/index.js';
import { DashboardRenderer } from '../../src/scan/progress/dashboard-renderer.js';
import {
  createScanSession,
  type ScanConfig,
  type ScanSession,
  type ScanSummary,
  type StageState,
} from '../../src/scan/scan-session.js';

// ── Test Helpers (mirror real-tty-lifecycle.test.ts) ──

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
    unicode: true,
    isTty: true,
    isCi: false,
    ciEnvironment: 'none',
    isWindows: false,
    os: 'linux',
    emulator: 'xterm',
    isVsCode: false,
    prefersReducedMotion: true,
    nodeVersion: [22, 0],
    ...overrides,
  });
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

// ── Minimal VT Model ──

/**
 * A compact but faithful VT100-model terminal.
 *
 * Faithful behaviors (the ones that matter for the persistent header):
 * - FINITE screen: `rows` × `cols`.
 * - SCROLL on newline when the cursor is at the bottom of the scroll region:
 *   the region shifts up one row; rows above the region never move.
 * - DECSTBM (`\x1b[<top>;<bottom>r`, `\x1b[r`): scroll region, 1-based
 *   (kept for faithfulness; the renderer no longer emits it).
 * - ALTERNATE SCREEN BUFFER: `\x1b[?1049h` enters (clears) it, `\x1b[?1049l`
 *   leaves it — the canvas is blank both ways in this model, matching the
 *   real terminal for a session that starts on a fresh primary screen.
 * - Cursor movement is CLAMPED: CUU cannot go above row 0, CUD/scroll is
 *   confined to the region (matches xterm/ConPTY).
 * - CUP (`\x1b[<row>;<col>H`) is screen-absolute (DECOM off), so it can
 *   reach rows above the scroll region.
 * - ED (`\x1b[0J` erase to end of display), EL (`\x1b[2K` erase line).
 * - LF is CR+LF (terminals translate output LF→CRLF, ONLCR default).
 * - SGR (`\x1b[...m`) and unknown sequences are ignored.
 */
class VtTerminal {
  readonly rows: number;
  readonly cols: number;
  /** screen[row][col]; blank = ' '. */
  private readonly screen: string[][];
  private cursorRow = 0;
  private cursorCol = 0;
  /** Scroll region, 0-indexed inclusive. Defaults to the full screen. */
  private scrollTop = 0;
  private scrollBottom: number;

  constructor(rows: number, cols: number) {
    this.rows = rows;
    this.cols = cols;
    this.scrollBottom = rows - 1;
    this.screen = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ' '));
  }

  /** Feed raw output bytes into the terminal. */
  feed(text: string): void {
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (ch === '\x1b') {
        i = this.consumeEscape(text, i);
        continue;
      }
      if (ch === '\r') {
        this.cursorCol = 0;
        i++;
        continue;
      }
      if (ch === '\n') {
        this.newline();
        i++;
        continue;
      }
      // Printable character (may be a multi-byte UTF-8 char — consume runes).
      const rune = /^./su.exec(text.slice(i))![0];
      this.put(rune);
      i += rune.length;
    }
  }

  /** Text currently visible on a row (right-trimmed). */
  line(row: number): string {
    if (row < 0 || row >= this.rows) return '';
    return this.screen[row].join('').replace(/\s+$/, '');
  }

  /** All visible rows (right-trimmed). */
  visible(): string[] {
    return Array.from({ length: this.rows }, (_, r) => this.line(r));
  }

  /** True when `needle` appears in any visible row. */
  visibleContains(needle: string): boolean {
    return this.visible().some((line) => line.includes(needle));
  }

  /** Rows that contain the given text, top to bottom. */
  rowsContaining(needle: string): number[] {
    const hits: number[] = [];
    for (let r = 0; r < this.rows; r++) {
      if (this.line(r).includes(needle)) hits.push(r);
    }
    return hits;
  }

  // ── Internal ──

  private put(ch: string): void {
    if (this.cursorCol < this.cols) {
      this.screen[this.cursorRow][this.cursorCol] = ch;
    }
    this.cursorCol++;
  }

  private newline(): void {
    this.cursorCol = 0;
    if (this.cursorRow === this.scrollBottom) {
      // Scroll the region up: rows above the region stay put.
      for (let r = this.scrollTop; r < this.scrollBottom; r++) {
        this.screen[r] = this.screen[r + 1];
      }
      this.screen[this.scrollBottom] = Array.from({ length: this.cols }, () => ' ');
      // Cursor stays on the bottom row of the region.
    } else {
      this.cursorRow++;
    }
  }

  private consumeEscape(text: string, at: number): number {
    let i = at + 1;
    if (text[i] === '[') {
      i++;
      // Private-mode sequences (`\x1b[?...`) carry a '?' prefix.
      if (text[i] === '?') i++;
      const params: number[] = [];
      let num = '';
      while (i < text.length && /[0-9;]/.test(text[i])) {
        if (text[i] === ';') {
          params.push(num === '' ? 0 : Number(num));
          num = '';
        } else {
          num += text[i];
        }
        i++;
      }
      if (num !== '') params.push(Number(num));
      const final = text[i];
      i++;
      this.control(params, final);
      return i;
    }
    // Unknown escape (e.g. \x1b7/\x1b8) — skip one char.
    return i + 1;
  }

  private control(params: number[], final: string): void {
    const p = (k: number, dflt: number): number => (params[k] === undefined ? dflt : params[k]);
    switch (final) {
      case 'H': // CUP — absolute, 1-based, screen-absolute (DECOM off)
        this.cursorRow = Math.max(0, Math.min(this.rows - 1, p(0, 1) - 1));
        this.cursorCol = Math.max(0, Math.min(this.cols - 1, p(1, 1) - 1));
        break;
      case 'A': // CUU — clamped at the top of the screen
        this.cursorRow = Math.max(0, this.cursorRow - Math.max(1, p(0, 1)));
        break;
      case 'B': // CUD — clamped at the bottom of the scroll region
        this.cursorRow = Math.min(this.scrollBottom, this.cursorRow + Math.max(1, p(0, 1)));
        break;
      case 'J': // ED
        if (p(0, 0) === 2) {
          for (let r = 0; r < this.rows; r++)
            this.screen[r] = Array.from({ length: this.cols }, () => ' ');
        } else if (p(0, 0) === 0) {
          // Erase from cursor to end of display.
          for (let c = this.cursorCol; c < this.cols; c++) this.screen[this.cursorRow][c] = ' ';
          for (let r = this.cursorRow + 1; r < this.rows; r++) {
            this.screen[r] = Array.from({ length: this.cols }, () => ' ');
          }
        }
        break;
      case 'K': // EL
        if (p(0, 0) === 2) {
          for (let c = 0; c < this.cols; c++) this.screen[this.cursorRow][c] = ' ';
        }
        break;
      case 'h': // SM — enter alternate screen buffer (?1049h)
        if (p(0, 0) === 1049) {
          for (let r = 0; r < this.rows; r++)
            this.screen[r] = Array.from({ length: this.cols }, () => ' ');
          this.cursorRow = 0;
          this.cursorCol = 0;
        }
        break;
      case 'l': // RM — leave alternate screen buffer (?1049l)
        if (p(0, 0) === 1049) {
          for (let r = 0; r < this.rows; r++)
            this.screen[r] = Array.from({ length: this.cols }, () => ' ');
          this.cursorRow = 0;
          this.cursorCol = 0;
        }
        break;
      case 'r': // DECSTBM — 1-based; `\x1b[r` resets to full screen.
        if (params.length === 0 || (params.length === 1 && params[0] === 0)) {
          this.scrollTop = 0;
          this.scrollBottom = this.rows - 1;
        } else {
          const top = Math.max(0, Math.min(this.rows - 1, p(0, 1) - 1));
          const bottom = Math.max(top, Math.min(this.rows - 1, p(1, this.rows) - 1));
          this.scrollTop = top;
          this.scrollBottom = bottom;
        }
        break;
      default:
        break; // SGR and everything else are visual-only; ignore.
    }
  }
}

// ── Harness ──

/** Run the real renderer lifecycle and capture bytes into a VtTerminal. */
function runInTerminal(
  height: number,
  width: number,
  run: (renderer: DashboardRenderer, session: ScanSession) => void,
): { vt: VtTerminal; bytes: string } {
  const caps = makeCaps({ height, width });
  const renderer = new DashboardRenderer(caps);
  const vt = new VtTerminal(height, width);
  const session = sessionWithStages();
  const bytes: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((str: unknown) => {
    const s = String(str);
    bytes.push(s);
    vt.feed(s);
    return true;
  }) as typeof process.stdout.write;
  try {
    run(renderer, session);
  } finally {
    process.stdout.write = orig;
    void renderer.dispose();
  }
  return { vt, bytes: bytes.join('') };
}

/** A full scan lifecycle: startup → heavy progress → completion. */
function fullLifecycle(
  renderer: DashboardRenderer,
  session: ScanSession,
  progressEvents = 60,
): void {
  renderer.onStart(session, { knowledgePackCount: 6 });
  for (let i = 0; i < progressEvents; i++) {
    renderer.onProgress({
      stage: 'extraction',
      filesProcessed: i + 1,
      totalFiles: 200,
      currentFile: {
        filename: `module_${(i % 10) + 1}.js`,
        size: 1024 + i,
        extension: 'js',
        path: `/src/module_${(i % 10) + 1}.js`,
        currentAnalyzer: 'String',
        stage: 'extraction',
      },
    });
    if (i % 20 === 0) {
      renderer.onStageChange('discovery', 'completed');
    }
  }
  renderer.onComplete(session, buildTestSummary());
}

// ── THE KEY REGRESSION: HEADER STAYS PINNED WHILE THE BODY SCROLLS ──

describe('persistent header against a REAL finite-height terminal (VT model)', () => {
  beforeEach(() => {
    // The Unicode block logo only renders when the Unicode symbol set is
    // active (mirrors session-header.test.ts).
    setSymbolSet('unicode');
  });

  afterEach(() => {
    resetSymbolSet();
  });

  /** Layout of the rendered header (see renderSessionHeaderLines):
   *  row 0 blank spacer, rows 1-6 block logo, row 7 identity, row 8 meta,
   *  row 9 animated status. */
  const IDENTITY_ROW = 7;

  it('keeps the VERIS header visible while the body grows past the terminal height', () => {
    // 50 rows: the body (config + dashboard + summary) exceeds even this and
    // the summary head ("Scan Complete") stays visible below the pinned
    // header without scrolling out of the region.
    const { vt } = runInTerminal(50, 80, (renderer, session) => fullLifecycle(renderer, session));

    // The header must still be on screen at the TOP rows (identity row 7).
    const headerHits = vt.rowsContaining('VERIS v1.0.0');
    expect(headerHits.length).toBeGreaterThan(0);
    expect(headerHits[0]).toBe(IDENTITY_ROW);
    // The logo must still occupy the first rows (not scrolled away).
    for (let r = 1; r <= 5; r++) {
      expect(vt.line(r).includes('\u2588'), `logo row ${r}`).toBe(true);
    }
    // Nothing but the logo block sits above the identity line.
    expect(vt.line(0).trim()).toBe('');
    // The summary rendered BELOW the header and sits strictly below it.
    const summaryRow = vt.rowsContaining('Scan Complete')[0] ?? -1;
    expect(summaryRow).toBeGreaterThan(headerHits[0]);
  });

  it('keeps the header visible across many dashboard repaints (body ≫ screen)', () => {
    const { vt, bytes } = runInTerminal(24, 80, (renderer, session) =>
      fullLifecycle(renderer, session, 200),
    );

    const identity = vt.rowsContaining('VERIS v1.0.0');
    // The final screen shows exactly one header instance: every frame
    // overwrites the previous one, so the header is always re-anchored at
    // the top rows (0..H-1) — it never accumulates or scrolls away.
    expect(identity.length).toBe(1);
    expect(identity[0]).toBe(IDENTITY_ROW);
    expect(vt.visibleContains('\u2588')).toBe(true); // logo still visible
    // The dashboard was rendered (present in the byte stream) and the body
    // (clipped summary head on a 24-row screen) is visible below the header.
    expect(bytes).toContain('STATISTICS');
    expect(vt.visibleContains('Scan Complete')).toBe(true);
    expect(bytes).toContain('Scan Complete'); // summary rendered
  });

  it('keeps the header pinned on every usable terminal height', () => {
    // Height 10 is deliberately excluded: the 10-row header fills the whole
    // screen, leaving no room for a body region (nothing can be pinned there).
    // The body is clipped to the visible rows below the header on short
    // terminals; the header must stay pinned in every case.
    for (const height of [12, 24, 30, 50]) {
      const { vt, bytes } = runInTerminal(height, 80, (renderer, session) =>
        fullLifecycle(renderer, session, 120),
      );
      const identity = vt.rowsContaining('VERIS v1.0.0');
      expect(identity.length, `height ${height}`).toBe(1);
      expect(identity[0], `height ${height}`).toBe(IDENTITY_ROW);
      expect(vt.line(1).includes('\u2588'), `height ${height}`).toBe(true);
      // The body rendered even though it scrolled inside its region.
      expect(bytes, `height ${height}`).toContain('Scan Complete');
    }
  });

  it('keeps the header pinned during errors and cancellation', () => {
    const { vt } = runInTerminal(24, 80, (renderer, session) => {
      renderer.onStart(session);
      for (let i = 0; i < 80; i++) {
        renderer.onProgress({ stage: 'extraction', filesProcessed: i + 1, totalFiles: 200 });
      }
      renderer.onError({ code: 'FILE_READ_ERROR', message: 'Cannot read file' });
      renderer.onProgress({ stage: 'extraction', filesProcessed: 90, totalFiles: 200 });
      renderer.onCancel(session);
    });

    expect(vt.rowsContaining('VERIS v1.0.0').length).toBe(1);
    expect(vt.line(1).includes('\u2588')).toBe(true);
    expect(vt.visibleContains('Cannot read file')).toBe(true);
    expect(vt.visibleContains('Scan Cancelled')).toBe(true);
  });

  it('keeps the header pinned on a fast scan (no body in between)', () => {
    const { vt } = runInTerminal(50, 80, (renderer, session) => {
      renderer.onStart(session);
      renderer.onComplete(session, buildTestSummary());
    });

    expect(vt.rowsContaining('VERIS v1.0.0').length).toBe(1);
    expect(vt.line(1).includes('\u2588')).toBe(true);
    // The summary head is visible below the pinned header on a tall screen.
    const summaryRow = vt.rowsContaining('Scan Complete')[0] ?? -1;
    expect(summaryRow).toBeGreaterThan(IDENTITY_ROW);
  });

  it('leaves the alternate screen on dispose so the shell prompt returns', () => {
    // dispose() must leave the alternate screen buffer — the byte stream must
    // end by restoring the primary screen, otherwise the terminal is left in
    // the interactive canvas after the process exits.
    const bytes: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((str: unknown) => {
      bytes.push(String(str));
      return true;
    }) as typeof process.stdout.write;
    const renderer = new DashboardRenderer(makeCaps({ height: 24 }));
    try {
      renderer.onStart(sessionWithStages());
      renderer.onProgress({ stage: 'extraction', filesProcessed: 1, totalFiles: 10 });
      void renderer.dispose();
    } finally {
      process.stdout.write = orig;
    }
    const joined = bytes.join('');
    // The interactive session opened on the alternate screen buffer.
    expect(joined.startsWith('\x1b[?1049h')).toBe(true);
    // And left it on dispose (no final summary was rendered, so nothing is
    // dumped to the primary screen).
    expect(joined.endsWith('\x1b[?1049l')).toBe(true);
  });

  it('prints the final header + summary on the primary screen when the session completes', () => {
    const bytes: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((str: unknown) => {
      bytes.push(String(str));
      return true;
    }) as typeof process.stdout.write;
    const renderer = new DashboardRenderer(makeCaps({ height: 50 }));
    try {
      renderer.onStart(sessionWithStages());
      renderer.onComplete(sessionWithStages(), buildTestSummary());
      void renderer.dispose();
    } finally {
      process.stdout.write = orig;
    }
    const joined = bytes.join('');
    // Alternate screen entered at start, left on dispose.
    expect(joined.indexOf('\x1b[?1049h')).toBe(0);
    expect(joined.lastIndexOf('\x1b[?1049l')).toBeGreaterThan(joined.indexOf('\x1b[?1049h'));
    // After leaving the alternate screen, the final frame (header + summary)
    // is printed on the PRIMARY screen so the result persists after exit.
    const tail = joined.slice(joined.lastIndexOf('\x1b[?1049l'));
    expect(tail).toContain('VERIS v1.0.0');
    expect(tail).toContain('Scan Complete');
  });
});
