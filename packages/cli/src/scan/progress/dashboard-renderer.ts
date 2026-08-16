/**
 * Live Progress Dashboard — stable, minimal scan dashboard.
 *
 * Renders four compact sections using only information already available
 * from the pipeline session:
 *
 *   CURRENT       what is happening now (stage + current file)
 *   PIPELINE      what has completed / what remains (phase visualization)
 *   STATISTICS    how much work has been processed (existing counters)
 *   PERFORMANCE   elapsed time and existing throughput metrics
 *
 * SESSION VS SCAN LIFECYCLE
 * -------------------------
 * The VERIS logo/header is a SESSION-scoped element owned by the
 * {@link SessionHeader}: it is rendered once when the interactive session
 * starts and remains on screen for the whole session. Everything this
 * renderer draws — the startup body, the dashboard, errors, cancellation,
 * and the final summary — renders BELOW the header. The header is never
 * wiped, never re-created, and only stops animating at session close
 * (dispose()).
 *
 * RENDERING MODEL — ALTERNATE SCREEN + FULL-FRAME REDRAW
 * -------------------------------------------------------
 * The interactive session runs on the terminal's alternate screen buffer
 * (entered by the SessionHeader). Every repaint is a FULL FRAME: home +
 * header lines + body lines + erase-below (`\x1b[H` + header + body +
 * `\x1b[0J`). Because every frame starts at row 1 and redraws the header
 * from scratch, the header is re-anchored at the top of every frame and can
 * never scroll away, be erased by the body, or be pushed into scrollback —
 * on any terminal, including Windows Terminal/ConPTY where DECSTBM
 * scroll-region pinning is unreliable (microsoft/terminal#19016, #3673).
 *
 * The body is CLIPPED to the visible screen below the header so a frame
 * never exceeds the terminal height and nothing scrolls mid-frame.
 *
 * CURSOR PROTOCOL
 * ---------------
 * - The SessionHeader owns the header content and its animation and exposes
 *   renderLines(frame); this renderer owns the frame composition.
 * - After any complete write the cursor sits at the bottom of the written
 *   content; both the header animation and this renderer restore that
 *   position, so their timers never corrupt each other.
 * - dispose() leaves the alternate screen and prints the final frame
 *   (header + summary) on the PRIMARY screen so the result persists after
 *   the interactive session ends.
 *
 * Design rules:
 * - Stable row positions — no jumping layouts, no flicker.
 * - Repaints only when the rendered content actually changes.
 * - Non-TTY: prints one deterministic line per phase completion, then the
 *   final summary — no dashboard, no animation, no per-file spam, and no
 *   cursor-control sequences.
 * - All colors from the theme system; all symbols from the symbol system;
 *   adapts to Unicode/ASCII, color/no-color, and narrow/wide terminals.
 *
 * @module @veris/cli/scan/progress
 */

import { getSymbolSet } from '../../ui/renderer/index.js';
import { type TerminalCapabilities, detectTerminal } from '../../ui/terminal/index.js';
import { getResolvedTheme, ansiReset } from '../../ui/theme/index.js';
import { truncateStart } from '../../ui/utilities/index.js';
import { CLI_VERSION } from '../../wirer.js';
import type { ProfilerSnapshot } from '../profiler.js';
import type {
  ScanSession,
  CurrentFile,
  HealthIssue,
  ScanSummary,
  StageStatus,
} from '../scan-session.js';

import { formatError } from './error-presentation.js';
import { renderFinalSummary } from './final-summary.js';
import { PIPELINE_PHASES, phaseStatus, renderPipelineVisualization } from './pipeline-viz.js';
import {
  type ProgressRenderer,
  type ProgressUpdate,
  type ErrorInfo,
  type StageUpdate,
  type StartContext,
} from './renderer.js';
import { SessionHeader } from './session-header.js';
import { renderStartupBody, renderStartupScreen } from './startup-screen.js';

// ── Dashboard Refresh ──

const DASHBOARD_INTERVAL_MS = 200;

/** Cap the dashboard width to keep wide terminals readable. */
const MAX_WIDTH = 100;

/** Below this width, secondary details are dropped (never truncated silently). */
const NARROW_WIDTH = 56;

/** Label for a raw pipeline stage id, mapped to its display phase. */
const PHASE_LABEL_BY_STAGE: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    PIPELINE_PHASES.flatMap((phase) => phase.stages.map((stage) => [stage, phase.label])),
  ) as Record<string, string>,
);

// ── Dashboard Renderer ──

/**
 * Live updating TTY dashboard for scan progress.
 *
 * In TTY mode the header is persistent (session-scoped) and the dashboard is
 * redrawn in place below it (stable rows, no flicker) only when its content
 * actually changes. In non-TTY mode it prints a single deterministic line per
 * phase completion.
 */
/** Options for the dashboard renderer. */
export interface DashboardRendererOptions {
  /**
   * Injectable clock for deterministic tests. Defaults to Date.now.
   * Reserved for compatibility; no startup-window timing remains.
   */
  readonly now?: () => number;
}

export class DashboardRenderer implements ProgressRenderer {
  readonly supportsAnimation = true;

  private caps: TerminalCapabilities;
  private readonly injectedCaps: TerminalCapabilities | null;
  private header: SessionHeader | null = null;
  private currentSession: ScanSession | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastRenderedLineCount: number = 0;
  private lastRenderedContent: string = '';
  private finalSummaryText: string = '';
  private needsRedraw: boolean = false;
  private knowledgePackCount: number | undefined = undefined;
  private readonly printedPhases: Set<string> = new Set();
  /** Errors raised during the session; rendered below the header. */
  private pendingErrors: string[] = [];
  /** Phase of the body region (below the header). */
  private bodyPhase: 'config' | 'dashboard' | 'summary' = 'config';
  /** Cached startup body lines (rendered until the first dashboard paint). */
  private configBodyLines: readonly string[] = [];
  /** Whether the summary/cancellation screen has been written. */
  private finalized: boolean = false;
  /** Terminal resize handler (TTY only; bound in onStart, removed in dispose). */
  private readonly handleResize = (): void => {
    const columns =
      typeof process.stdout.columns === 'number' && process.stdout.columns > 0
        ? process.stdout.columns
        : this.caps.width;
    const rows =
      typeof process.stdout.rows === 'number' && process.stdout.rows > 0
        ? process.stdout.rows
        : this.caps.height;
    this.caps = { ...this.caps, width: columns, height: rows };
    this.header?.setSize(columns, rows);
    if (!this.caps.isTty) return;
    if (this.finalized) {
      // Repaint the final summary frame at the new size.
      this.renderBody(this.finalSummaryText.split('\n'));
      return;
    }
    if (this.bodyPhase === 'config') {
      // Re-render the startup body at the new width and repaint the frame.
      if (this.currentSession !== null) {
        this.configBodyLines = renderStartupBody(this.currentSession.config, {
          version: CLI_VERSION,
          knowledgePackCount: this.knowledgePackCount,
        });
      }
      this.renderBody(this.configBodyLines);
    } else {
      // A resize can change line wrapping even when the content string is
      // unchanged, so force a repaint rather than trusting the cache.
      this.lastRenderedContent = '';
      this.renderDashboard();
    }
  };

  constructor(caps?: TerminalCapabilities, _options?: DashboardRendererOptions) {
    this.injectedCaps = caps ?? null;
    this.caps = caps ?? detectTerminal();
  }

  onStart(session: ScanSession, context?: StartContext): void {
    this.currentSession = session;
    if (!this.injectedCaps) {
      this.caps = detectTerminal();
    }
    this.knowledgePackCount = context?.knowledgePackCount;
    this.printedPhases.clear();
    this.pendingErrors = [];
    this.bodyPhase = 'config';
    this.finalized = false;

    if (this.caps.isTty) {
      // Persistent session header — created exactly once per interactive
      // session and owned by the session lifecycle (disposed in dispose()).
      // It enters the alternate screen buffer; every repaint below redraws
      // header + body together as one frame, so the header is re-anchored at
      // the top of every frame and can never scroll away.
      if (this.header === null) {
        this.header = new SessionHeader({ caps: this.caps });
        this.header.start();
      }

      // Render the scan-scoped startup body BELOW the header. This region is
      // replaced by the dashboard and later the final summary; the header
      // itself never moves.
      this.configBodyLines = renderStartupBody(session.config, {
        version: CLI_VERSION,
        knowledgePackCount: this.knowledgePackCount,
      });
      this.renderBody(this.configBodyLines);

      // Follow terminal resizes so the pinned region tracks the new height.
      process.stdout.on('resize', this.handleResize);

      // Start the body repaint loop for interactive TTY.
      if (!this.caps.prefersReducedMotion) {
        this.startAnimation();
      }
    } else {
      // Non-TTY: deterministic sequential output — full startup screen once,
      // no cursor control, no animation.
      const startupLines = renderStartupScreen(session.config, {
        version: CLI_VERSION,
        knowledgePackCount: this.knowledgePackCount,
      });
      for (const line of startupLines) {
        process.stdout.write(line + '\n');
      }
    }
  }

  onProgress(update: ProgressUpdate): void {
    if (!this.currentSession) return;

    // Apply update to current session immediately
    this.currentSession = {
      ...this.currentSession,
      ...(update.currentFile !== undefined ? { currentFile: update.currentFile } : {}),
      ...(update.filesProcessed !== undefined ? { filesProcessed: update.filesProcessed } : {}),
      ...(update.totalFiles !== undefined ? { totalFiles: update.totalFiles } : {}),
      ...(update.queueSize !== undefined ? { queueSize: update.queueSize } : {}),
      ...(update.workerUtilization !== undefined
        ? { workerUtilization: update.workerUtilization }
        : {}),
      currentStage: update.stage,
    };

    this.needsRedraw = true;

    // Non-TTY: never render the full dashboard (progress events are too noisy).
    if (!this.caps.isTty) return;

    // Reduced-motion TTY: render immediately, no animation loop.
    if (this.caps.prefersReducedMotion) {
      this.renderDashboard();
    }
  }

  onStageChange(stage: string, status: StageStatus, timing?: StageUpdate): void {
    if (!this.currentSession) return;

    // Keep the session's stage state in sync so the visualization is accurate.
    const stages = { ...this.currentSession.stages };
    const existing = stages[stage];
    const now = Date.now();
    stages[stage] = Object.freeze({
      id: stage,
      status,
      startedAt: existing?.startedAt ?? (status === 'running' ? now : null),
      completedAt: status === 'completed' || status === 'failed' ? now : null,
      durationMs: timing?.durationMs ?? existing?.durationMs ?? 0,
      itemsProcessed: timing?.itemsProcessed ?? existing?.itemsProcessed ?? 0,
      itemsFailed: timing?.itemsFailed ?? existing?.itemsFailed ?? 0,
    });
    this.currentSession = { ...this.currentSession, stages };

    // Non-TTY: print one deterministic line per phase completion.
    if (!this.caps.isTty) {
      this.printPhaseTransitions();
      return;
    }

    this.needsRedraw = true;
  }

  onFileStart(file: CurrentFile): void {
    if (!this.currentSession) return;
    this.currentSession = { ...this.currentSession, currentFile: file };
    this.needsRedraw = true;
  }

  onFileComplete(_file: CurrentFile, _durationMs: number, _success: boolean): void {
    this.needsRedraw = true;
  }

  onHealthIssue(_issue: HealthIssue): void {
    this.needsRedraw = true;
  }

  onError(error: ErrorInfo): void {
    if (!this.currentSession) return;

    if (!this.caps.isTty) return;

    this.pendingErrors.push(formatError(error));

    if (this.bodyPhase === 'config') {
      // Keep the startup body visible; append the error below it so the
      // header is never touched.
      this.renderBody(this.configBodyLines);
      return;
    }

    if (this.finalized) return;

    // Show errors below the header immediately and invalidate the content
    // cache so the next repaint redraws the dashboard below the errors.
    this.renderBody([]);
    this.needsRedraw = true;
  }

  onComplete(session: ScanSession, summary: ScanSummary): void {
    this.stopAnimation();
    this.currentSession = session;
    this.finalized = true;

    // Render final summary (text is captured immediately so getFinalSummary
    // stays available).
    const summaryLines = renderFinalSummary(session, summary, {
      outputFiles: summary.outputFiles,
    });
    this.finalSummaryText = summaryLines.join('\n');

    // Non-TTY: stable sequential output.
    if (!this.caps.isTty) {
      for (const line of summaryLines) {
        process.stdout.write(line + '\n');
      }
      return;
    }

    // Interactive TTY: the persistent header stays; the body region is
    // replaced by the summary below it.
    this.renderBody(summaryLines);
  }

  onCancel(session: ScanSession): void {
    this.stopAnimation();
    this.currentSession = session;
    this.finalized = true;

    const theme = getResolvedTheme();
    const symbols = getSymbolSet();
    const R = ansiReset();
    const lines: string[] = [
      '',
      ` ${theme.status.warning}${symbols.warning}${R} ${theme.ui.text}Scan Cancelled${R}`,
      `   ${theme.ui.textDim}Files processed: ${session.filesProcessed}${R}`,
      `   ${theme.ui.textDim}Elapsed: ${formatDuration(session.elapsedMs)}${R}`,
      `   ${theme.ui.textDim}Progress: ${(session.progress * 100).toFixed(1)}%${R}`,
      '',
    ];
    this.finalSummaryText = lines.join('\n');

    if (!this.caps.isTty) {
      for (const line of lines) {
        process.stdout.write(line + '\n');
      }
      return;
    }

    this.renderBody(lines);
  }

  onProfilerSnapshot(_snapshot: ProfilerSnapshot): void {
    // Profiler data is included in the session
  }

  getFinalSummary(): string {
    return this.finalSummaryText;
  }

  async dispose(): Promise<void> {
    this.stopAnimation();
    process.stdout.removeListener('resize', this.handleResize);
    if (this.header !== null) {
      const wasTty = this.caps.isTty;
      // Stop the header animation and leave the alternate screen buffer
      // (restores the primary screen) exactly once (idempotent).
      this.header.dispose();
      if (wasTty && this.finalSummaryText.length > 0) {
        // Print the final frame on the PRIMARY screen so the result persists
        // after the interactive session ends (the alternate screen canvas is
        // discarded on exit). Clipped to the screen so the header stays
        // visible at the top of the result. finalLines() renders the
        // COMPLETED header (full logo + identity) even when the session
        // ended mid-reveal.
        const headerLines = this.header.finalLines();
        const R = this.caps.height > 0 ? this.caps.height : 24;
        const body = this.finalSummaryText
          .split('\n')
          .slice(0, Math.max(0, R - headerLines.length));
        const frame = [...headerLines, ...body];
        for (let i = 0; i < frame.length; i++) {
          const isLast = i === frame.length - 1;
          process.stdout.write(frame[i] + (isLast && frame.length >= R ? '' : '\n'));
        }
        process.stdout.write('\x1b[0J');
      }
      this.header = null;
    }
  }

  // ── Animation (body repaint loop) ──

  private startAnimation(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      if (this.needsRedraw) {
        this.renderDashboard();
        this.needsRedraw = false;
      }
    }, DASHBOARD_INTERVAL_MS);
  }

  private stopAnimation(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // ── Body Region Management ──

  /**
   * Paint the full interactive frame: header + body, anchored at the top.
   *
   * THE REDRAW MODEL: every paint positions at the home position and
   * rewrites the ENTIRE frame — header lines first, then the body — and
   * erases anything left below (`\x1b[0J`). The header is therefore
   * re-anchored at the top of every frame: it can never scroll away, be
   * erased by the body, or be pushed into scrollback, no matter how the
   * terminal handles scrolling (this is the mechanism that is structurally
   * correct on Windows Terminal/ConPTY, where DECSTBM scroll-region pinning
   * is unreliable).
   *
   * The body is clipped to the visible screen below the header so a frame
   * never exceeds the terminal height and nothing scrolls mid-frame.
   */
  private renderBody(contentLines: readonly string[]): void {
    if (this.caps.isTty && this.header !== null) {
      const headerLines = this.header.renderLines(this.header.frameIndex);
      const H = headerLines.length;
      const R = this.header.height;
      const body = [...this.pendingErrors, ...contentLines].slice(0, Math.max(0, R - H));
      const frame = [...headerLines, ...body];

      process.stdout.write('\x1b[H'); // home — re-anchor the frame at row 1
      for (let i = 0; i < frame.length; i++) {
        const isLast = i === frame.length - 1;
        // Never emit a newline on the bottom row: when the frame fills the
        // screen exactly, a trailing newline would scroll the whole frame up
        // one row (pushing the header off the top of the screen).
        process.stdout.write(frame[i] + (isLast && frame.length >= R ? '' : '\n'));
      }
      process.stdout.write('\x1b[0J'); // erase leftover rows below the frame

      this.lastRenderedLineCount = body.length;
      this.lastRenderedContent = [...this.pendingErrors, ...contentLines].join('\n');
      this.header.setBodyLineCount(body.length);
    } else {
      // Defensive: non-TTY callers write sequentially (no cursor control).
      for (const line of this.pendingErrors) {
        process.stdout.write(line + '\n');
      }
      for (const line of contentLines) {
        process.stdout.write(line + '\n');
      }
    }
  }

  /** Total lines occupied by pending error text. */
  private errorLineCount(): number {
    return this.pendingErrors.reduce((sum, text) => sum + text.split('\n').length, 0);
  }

  private renderDashboard(): void {
    if (!this.currentSession || this.finalized) return;

    const session = this.currentSession;
    const caps = this.caps;
    const width = Math.min(caps.width, MAX_WIDTH);
    const narrow = width < NARROW_WIDTH;

    const dashboardLines = this.buildDashboardLines(session, width, narrow);

    // Only repaint when the content actually changed (stability).
    const content = [...this.pendingErrors, ...dashboardLines].join('\n');
    if (content === this.lastRenderedContent) {
      return;
    }

    this.renderBody(dashboardLines);
    this.bodyPhase = 'dashboard';
  }

  private buildDashboardLines(session: ScanSession, width: number, narrow: boolean): string[] {
    const theme = getResolvedTheme();
    const symbols = getSymbolSet();
    const R = ansiReset();
    const lines: string[] = [];

    // ── CURRENT ──
    lines.push(` ${theme.ui.accent}CURRENT${R}`);
    lines.push(this.renderCurrentLine(session, width, narrow));

    // ── Progress (how much work processed) ──
    if (session.totalFiles > 0) {
      lines.push(this.renderProgressLine(session, width, narrow, theme, symbols));
    }

    // ── PIPELINE ──
    lines.push(` ${theme.ui.accent}PIPELINE${R}`);
    lines.push(...renderPipelineVisualization(session.stages, { width }));

    // ── STATISTICS ──
    lines.push(` ${theme.ui.accent}STATISTICS${R}`);
    lines.push(...this.renderStatisticsLines(session, theme, R));

    // ── PERFORMANCE ──
    lines.push(` ${theme.ui.accent}PERFORMANCE${R}`);
    lines.push(...this.renderPerformanceLines(session, theme, R));

    return lines;
  }

  /** CURRENT — current phase + file being processed. */
  private renderCurrentLine(session: ScanSession, width: number, narrow: boolean): string {
    const theme = getResolvedTheme();
    const symbols = getSymbolSet();
    const phaseLabel = PHASE_LABEL_BY_STAGE[session.currentStage] ?? session.currentStage;

    const R = ansiReset();
    if (!session.currentFile) {
      return `    ${theme.ui.text}${phaseLabel}${R}  ${theme.ui.textDim}-${R}`;
    }

    const file = session.currentFile;
    const sizeSuffix = narrow ? '' : `  (${formatSize(file.size)})`;
    const maxFileWidth = Math.max(10, width - 6 - phaseLabel.length - sizeSuffix.length);
    const filename = truncateStart(file.filename, maxFileWidth, symbols.ellipsis);

    return `    ${theme.ui.text}${phaseLabel}${R}  ${theme.ui.text}${filename}${R}${theme.ui.textDim}${sizeSuffix}${R}`;
  }

  /** Single-line compact progress bar with count and percentage. */
  private renderProgressLine(
    session: ScanSession,
    width: number,
    narrow: boolean,
    theme: ReturnType<typeof getResolvedTheme>,
    symbols: ReturnType<typeof getSymbolSet>,
  ): string {
    const pct = Math.min(session.filesProcessed / session.totalFiles, 1);
    const count = `${session.filesProcessed} / ${session.totalFiles}`;
    const percent = `${(pct * 100).toFixed(0)}%`;

    const R = ansiReset();

    // Extremely narrow terminals: keep the count, drop the bar.
    if (width < 24) {
      return `    ${theme.ui.text}${count}${R}`;
    }

    const barWidth = Math.max(6, Math.min(28, width - (narrow ? 14 : 26)));
    const filled = Math.round(pct * barWidth);
    const bar = `${symbols.progressStart}${symbols.progressFull.repeat(filled)}${symbols.progressEmpty.repeat(barWidth - filled)}${symbols.progressEnd}`;

    const text = narrow
      ? `    ${bar}  ${count}`
      : `    ${bar}  ${count}  ${theme.ui.textDim}${percent}${R}`;
    return ` ${theme.ui.text}${text}${R}`;
  }

  /** STATISTICS — existing pipeline counters only. */
  private renderStatisticsLines(
    session: ScanSession,
    theme: ReturnType<typeof getResolvedTheme>,
    R: string,
  ): string[] {
    const stats = session.statistics;
    const rows: Array<{ label: string; value: number; color?: string }> = [
      { label: 'discovered', value: session.totalFiles },
      { label: 'processed', value: session.filesProcessed },
      { label: 'findings', value: stats.findings, color: findingsColor(stats.findings, theme) },
      { label: 'evidence', value: stats.evidenceCollected },
    ];
    if (stats.warnings > 0)
      rows.push({ label: 'warnings', value: stats.warnings, color: theme.status.warning });
    if (stats.errors > 0)
      rows.push({ label: 'errors', value: stats.errors, color: theme.status.error });
    if (stats.skippedFiles > 0)
      rows.push({ label: 'skipped', value: stats.skippedFiles, color: theme.ui.textDim });

    const labelWidth = Math.max(...rows.map((r) => r.label.length));
    return rows.map((row) => {
      const color = row.color ?? theme.ui.text;
      return `    ${theme.ui.textDim}${row.label.padEnd(labelWidth)}${R}  ${color}${formatNumber(row.value)}${R}`;
    });
  }

  /** PERFORMANCE — elapsed time and existing throughput metrics only. */
  private renderPerformanceLines(
    session: ScanSession,
    theme: ReturnType<typeof getResolvedTheme>,
    R: string,
  ): string[] {
    const rows: Array<{ label: string; value: string }> = [
      { label: 'elapsed', value: formatDuration(session.elapsedMs) },
    ];
    if (session.throughput > 0) {
      rows.push({ label: 'throughput', value: `${session.throughput.toFixed(1)} files/s` });
    }

    const labelWidth = Math.max(...rows.map((r) => r.label.length));
    return rows.map(
      (row) =>
        `    ${theme.ui.textDim}${row.label.padEnd(labelWidth)}${R}  ${theme.ui.text}${row.value}${R}`,
    );
  }

  /** Non-TTY: print one line per phase as it completes. */
  private printPhaseTransitions(): void {
    if (!this.currentSession) return;

    for (const phase of PIPELINE_PHASES) {
      if (this.printedPhases.has(phase.id)) continue;
      const status = phaseStatus(this.currentSession.stages, phase);
      if (status === 'completed' || status === 'failed') {
        const lines = renderPipelineVisualization(this.currentSession.stages, {
          width: this.caps.width,
        });
        const row = lines.find((line) => line.includes(phase.label));
        if (row !== undefined) {
          process.stdout.write(row + '\n');
        }
        this.printedPhases.add(phase.id);
      }
    }
  }
}

/** Color for the findings counter based on count (existing behavior). */
function findingsColor(count: number, theme: ReturnType<typeof getResolvedTheme>): string {
  if (count > 50) return theme.severity.critical;
  if (count > 20) return theme.severity.high;
  if (count > 5) return theme.severity.medium;
  return theme.ui.text;
}

/** Format file size in human-readable form. */
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Deterministic thousands separator (locale-independent). */
function formatNumber(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
