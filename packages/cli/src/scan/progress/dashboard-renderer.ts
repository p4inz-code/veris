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
 * Design rules:
 * - Minimal, calm, developer-tool aesthetic (Cargo/Git/Bun/pnpm direction).
 * - Stable row positions — no jumping layouts, no flicker.
 * - Repaints only when the rendered content actually changes.
 * - Non-TTY: prints one deterministic line per phase completion, then the
 *   final summary — no dashboard, no animation, no per-file spam.
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
import { renderStartupScreen } from './startup-screen.js';

// ── Dashboard Refresh ──

const DASHBOARD_INTERVAL_MS = 200;

/**
 * Minimum time the startup screen stays visible on an interactive TTY.
 *
 * The startup identity (logo + configuration) must be presented for at
 * least this long before the dashboard or the final summary may replace
 * it. This is a deterministic lifecycle invariant, not a cosmetic delay:
 * without it the first progress event or an instant completion erases the
 * logo within milliseconds (fast scans showed ~30ms of logo visibility).
 */
export const STARTUP_MIN_DISPLAY_MS = 1200;

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
 * In TTY mode the dashboard is redrawn in place (stable rows, no flicker)
 * and only when its content actually changes. In non-TTY mode it prints a
 * single deterministic line per phase completion.
 */
/** Options for the dashboard renderer. */
export interface DashboardRendererOptions {
  /** Injectable clock for deterministic lifecycle tests. Defaults to Date.now. */
  readonly now?: () => number;
}

export class DashboardRenderer implements ProgressRenderer {
  readonly supportsAnimation = true;

  private caps: TerminalCapabilities;
  private readonly injectedCaps: TerminalCapabilities | null;
  private readonly now: () => number;
  private currentSession: ScanSession | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastRenderedLineCount: number = 0;
  private lastRenderedContent: string = '';
  private finalSummaryText: string = '';
  private finalSummaryShown: boolean = false;
  private needsRedraw: boolean = false;
  private knowledgePackCount: number | undefined = undefined;
  private readonly printedPhases: Set<string> = new Set();

  /** When the startup screen was first presented (lifecycle invariant). */
  private startupPresentedAt: number = 0;
  /** Errors raised while the startup screen is still on display. */
  private pendingErrors: string[] = [];
  /** Completion/cancellation output deferred until the startup window ends. */
  private pendingFinalize: boolean = false;
  private finalSummaryLines: readonly string[] = [];

  constructor(caps?: TerminalCapabilities, options?: DashboardRendererOptions) {
    this.injectedCaps = caps ?? null;
    this.caps = caps ?? detectTerminal();
    this.now = options?.now ?? ((): number => Date.now());
  }

  onStart(session: ScanSession, context?: StartContext): void {
    this.currentSession = session;
    if (!this.injectedCaps) {
      this.caps = detectTerminal();
    }
    this.knowledgePackCount = context?.knowledgePackCount;
    this.printedPhases.clear();

    // Render startup screen (shared component)
    const startupLines = renderStartupScreen(session.config, {
      version: CLI_VERSION,
      knowledgePackCount: this.knowledgePackCount,
    });

    // Write startup screen
    for (const line of startupLines) {
      process.stdout.write(line + '\n');
    }
    this.lastRenderedLineCount = startupLines.length;
    this.lastRenderedContent = '';
    this.startupPresentedAt = this.now();
    this.pendingErrors = [];
    this.pendingFinalize = false;
    this.finalSummaryLines = [];

    // Start animation loop for interactive TTY
    if (this.caps.isTty && !this.caps.prefersReducedMotion) {
      this.startAnimation();
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

    if (this.caps.isTty) {
      // During the startup presentation window the logo must not be wiped by
      // an error. Queue the error text; it is flushed together with the first
      // transition (dashboard paint or final summary).
      if (!this.startupWindowElapsed()) {
        this.pendingErrors.push(formatError(error));
        this.lastRenderedContent = '';
        return;
      }

      // Show error immediately below dashboard
      this.clearDashboard();
      this.flushPendingErrors();
      process.stdout.write(formatError(error) + '\n');
      // The dashboard was cleared; force the next render to repaint even if
      // the session content is unchanged (otherwise the dashboard could stay
      // hidden behind the error message).
      this.lastRenderedContent = '';
    }
  }

  onComplete(session: ScanSession, summary: ScanSummary): void {
    this.stopAnimation();
    this.currentSession = session;

    // Render final summary (text is captured immediately so getFinalSummary
    // stays available; the screen write may be deferred below).
    const summaryLines = renderFinalSummary(session, summary, {
      outputFiles: summary.outputFiles,
    });
    this.finalSummaryText = summaryLines.join('\n');
    this.finalSummaryShown = true;
    this.lastRenderedContent = '';
    this.finalSummaryLines = summaryLines;

    // Non-TTY: stable sequential output, never deferred.
    if (!this.caps.isTty) {
      for (const line of summaryLines) {
        process.stdout.write(line + '\n');
      }
      return;
    }

    // Interactive TTY: guarantee the startup identity was actually visible
    // before transitioning to the final summary. If the scan finished before
    // the presentation window elapsed, defer the wipe + summary to dispose().
    if (!this.startupWindowElapsed()) {
      this.pendingFinalize = true;
      return;
    }

    this.clearDashboard();
    this.flushPendingErrors();
    for (const line of summaryLines) {
      process.stdout.write(line + '\n');
    }
  }

  onCancel(session: ScanSession): void {
    this.stopAnimation();
    this.currentSession = session;

    // Show cancellation info
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
    this.finalSummaryShown = true;
    this.lastRenderedContent = '';
    this.finalSummaryLines = lines;

    if (!this.caps.isTty) {
      for (const line of lines) {
        process.stdout.write(line + '\n');
      }
      return;
    }

    if (!this.startupWindowElapsed()) {
      this.pendingFinalize = true;
      return;
    }

    this.clearDashboard();
    this.flushPendingErrors();
    for (const line of lines) {
      process.stdout.write(line + '\n');
    }
  }

  onProfilerSnapshot(_snapshot: ProfilerSnapshot): void {
    // Profiler data is included in the session
  }

  getFinalSummary(): string {
    return this.finalSummaryText;
  }

  async dispose(): Promise<void> {
    this.stopAnimation();

    // If the scan finished before the startup presentation window elapsed,
    // onComplete/onCancel deferred the final transition. Finish it here so
    // the startup identity is seen for the full window before the summary
    // (or cancellation screen) replaces it. runScan awaits dispose(), so the
    // process does not exit before this output is flushed.
    if (!this.pendingFinalize) return;

    // Claim the deferred finalization up front so repeated or concurrent
    // dispose() calls can never double-write the summary (idempotency
    // invariant: exactly one finalization per scan).
    this.pendingFinalize = false;

    const remaining = STARTUP_MIN_DISPLAY_MS - (this.now() - this.startupPresentedAt);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }

    this.clearDashboard();
    this.flushPendingErrors();
    for (const line of this.finalSummaryLines) {
      process.stdout.write(line + '\n');
    }
  }

  // ── Animation ──

  private startAnimation(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      if (this.needsRedraw) {
        // Keep the startup screen on display until its minimum presentation
        // window has elapsed; the redraw flag stays set so the first tick
        // after the window performs the transition exactly once.
        if (this.caps.isTty && !this.startupWindowElapsed()) {
          return;
        }
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

  // ── Rendering ──

  private clearDashboard(): void {
    if (this.lastRenderedLineCount > 0 && this.caps.isTty) {
      // Move cursor up and clear lines
      process.stdout.write(`\x1b[${this.lastRenderedLineCount}A`);
      for (let i = 0; i < this.lastRenderedLineCount; i++) {
        process.stdout.write('\x1b[2K');
        if (i < this.lastRenderedLineCount - 1) {
          process.stdout.write('\x1b[1B');
        }
      }
      // Move cursor back to top
      process.stdout.write(`\x1b[${this.lastRenderedLineCount}A`);
      this.lastRenderedLineCount = 0;
    }
  }

  private renderDashboard(): void {
    if (!this.currentSession) return;

    // Never replace the startup screen before its presentation window ends.
    if (this.caps.isTty && !this.startupWindowElapsed()) {
      return;
    }

    const session = this.currentSession;
    const caps = this.caps;
    const width = Math.min(caps.width, MAX_WIDTH);
    const narrow = width < NARROW_WIDTH;

    const dashboardLines = this.buildDashboardLines(session, width, narrow);

    // Only repaint when the content actually changed (stability).
    const content = dashboardLines.join('\n');
    if (content === this.lastRenderedContent) {
      return;
    }

    this.clearDashboard();
    this.flushPendingErrors();
    for (const line of dashboardLines) {
      process.stdout.write(line + '\n');
    }
    this.lastRenderedLineCount = dashboardLines.length;
    this.lastRenderedContent = content;
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

  /** Whether the startup screen has been displayed for its minimum window. */
  private startupWindowElapsed(): boolean {
    return this.now() - this.startupPresentedAt >= STARTUP_MIN_DISPLAY_MS;
  }

  /** Write errors that arrived while the startup screen was on display. */
  private flushPendingErrors(): void {
    if (this.pendingErrors.length === 0) return;
    for (const text of this.pendingErrors) {
      process.stdout.write(text + '\n');
    }
    this.pendingErrors = [];
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
