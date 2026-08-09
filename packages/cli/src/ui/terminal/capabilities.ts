/**
 * Terminal capability detection for VERIS CLI.
 *
 * Detects terminal features at startup so renderers can adapt:
 * - Color depth (none, 16, 256, truecolor)
 * - Unicode support
 * - Terminal dimensions
 * - CI/pipe detection
 * - Platform-specific quirks
 *
 * @module @veris/cli/ui/terminal
 */

import { detectOS, type OS } from '@veris/shared';

// ── Types ──

/** Supported color depths. */
export type ColorDepth = 'none' | 'ansi' | 'ansi256' | 'truecolor';

/** Terminal emulator identification. */
export type TerminalEmulator =
  | 'windows-terminal'
  | 'vscode'
  | 'iterm2'
  | 'kitty'
  | 'alacritty'
  | 'wezterm'
  | 'ghostty'
  | 'tmux'
  | 'screen'
  | 'xterm'
  | 'unknown';

/** CI environment identification. */
export type CiEnvironment =
  'github-actions' | 'gitlab-ci' | 'circle-ci' | 'jenkins' | 'azure-devops' | 'none';

/** Complete terminal capabilities snapshot. */
export interface TerminalCapabilities {
  /** Width of terminal in characters. */
  readonly width: number;
  /** Height of terminal in lines. */
  readonly height: number;
  /** Detected color depth. */
  readonly colorDepth: ColorDepth;
  /** Whether the terminal supports Unicode. */
  readonly unicode: boolean;
  /** Whether output is a TTY (vs piped/non-interactive). */
  readonly isTty: boolean;
  /** Whether running inside a CI environment. */
  readonly isCi: boolean;
  /** Detected CI environment. */
  readonly ciEnvironment: CiEnvironment;
  /** Whether running on Windows. */
  readonly isWindows: boolean;
  /** Detected OS. */
  readonly os: OS;
  /** Detected terminal emulator. */
  readonly emulator: TerminalEmulator;
  /** Whether running in VS Code terminal. */
  readonly isVsCode: boolean;
  /** Whether user prefers reduced motion. */
  readonly prefersReducedMotion: boolean;
  /** Node.js version as [major, minor]. */
  readonly nodeVersion: readonly [number, number];
}

// ── Detection ──

let cached: TerminalCapabilities | undefined;

/**
 * Detect terminal capabilities. Results are cached after first call.
 */
export function detectTerminal(): TerminalCapabilities {
  if (cached !== undefined) {
    return cached;
  }

  const os: OS = detectOS();
  const isWindows = os === 'win32';
  const isTty = process.stdout.isTTY === true && process.stdin.isTTY === true;
  const env = process.env;
  const width = env.COLUMNS ? parseInt(env.COLUMNS, 10) : process.stdout.columns || 120;
  const height = env.LINES ? parseInt(env.LINES, 10) : process.stdout.rows || 40;
  const ciEnvironment = detectCiEnvironment(env);
  const isCi = ciEnvironment !== 'none';
  const emulator = detectEmulator(env, isWindows);
  const isVsCode = emulator === 'vscode';
  const colorDepth = detectColorDepth(env, isCi, isTty, emulator);
  const unicode = detectUnicode(env, isCi, isWindows, emulator);
  const prefersReducedMotion =
    env.VERIS_NO_ANIMATION === '1' || env.NO_COLOR === '1' || env.CI === 'true' || !isTty;

  const nodeVersion = parseNodeVersion(process.version);

  cached = Object.freeze({
    width,
    height,
    colorDepth,
    unicode,
    isTty,
    isCi,
    ciEnvironment,
    isWindows,
    os,
    emulator,
    isVsCode,
    prefersReducedMotion,
    nodeVersion,
  });

  return cached;
}

/**
 * Check if the current session is interactive (TTY and not CI).
 */
export function isInteractive(): boolean {
  const caps = detectTerminal();
  return caps.isTty && !caps.isCi;
}

/**
 * Invalidate the cached terminal capabilities (for testing).
 */
export function resetTerminalCache(): void {
  cached = undefined;
}

// ── Internal Detection Helpers ──

function detectColorDepth(
  env: NodeJS.ProcessEnv,
  isCi: boolean,
  isTty: boolean,
  emulator: TerminalEmulator,
): ColorDepth {
  // Explicit override via environment
  if (env.VERIS_COLOR === '0' || env.NO_COLOR !== undefined) {
    return 'none';
  }
  if (env.VERIS_COLOR === '8' || env.VERIS_COLOR === 'ansi') {
    return 'ansi';
  }
  if (env.VERIS_COLOR === '256') {
    return 'ansi256';
  }
  if (env.VERIS_COLOR === '16m' || env.VERIS_COLOR === 'truecolor') {
    return 'truecolor';
  }

  // CI environments often support truecolor
  if (isCi) {
    if (env.GITHUB_ACTIONS) return 'truecolor';
    if (env.GITLAB_CI) return 'truecolor';
    if (env.CIRCLECI) return 'truecolor';
    return 'ansi256';
  }

  // Non-TTY gets no color
  if (!isTty) {
    return 'none';
  }

  // Terminal emulator-specific detection
  switch (emulator) {
    case 'windows-terminal':
    case 'vscode':
    case 'iterm2':
    case 'kitty':
    case 'alacritty':
    case 'wezterm':
    case 'ghostty':
      return 'truecolor';
    case 'tmux':
    case 'screen':
      // tmux can do truecolor with proper config, but default is 256
      return env.TERM?.includes('truecolor') ? 'truecolor' : 'ansi256';
    default: {
      // Check TERM environment variable
      const term = (env.TERM || '').toLowerCase();
      if (term.includes('truecolor') || term.includes('24bit')) return 'truecolor';
      if (term.includes('256')) return 'ansi256';
      if (term.includes('color') || term.includes('xterm')) return 'ansi';
      return 'none';
    }
  }
}

function detectUnicode(
  env: NodeJS.ProcessEnv,
  isCi: boolean,
  isWindows: boolean,
  emulator: TerminalEmulator,
): boolean {
  // Explicit override
  if (env.VERIS_UNICODE === '0') return false;
  if (env.VERIS_UNICODE === '1') return true;

  // CI environments: Unicode depends on platform
  if (isCi) {
    // GitHub Actions on Windows has limited Unicode support
    if (isWindows) return false;
    return true;
  }

  // Non-TTY: ASCII only
  if (!process.stdout.isTTY) return false;

  // Windows: modern terminals support Unicode
  if (isWindows) {
    return emulator === 'windows-terminal' || emulator === 'vscode' || emulator === 'wezterm';
  }

  // Unix/macOS: almost all modern terminals support Unicode
  return true;
}

function detectEmulator(env: NodeJS.ProcessEnv, isWindows: boolean): TerminalEmulator {
  // Check TERM_PROGRAM (common on macOS/Unix)
  const termProgram = env.TERM_PROGRAM || '';
  switch (termProgram.toLowerCase()) {
    case 'vscode':
      return 'vscode';
    case 'iterm2':
      return 'iterm2';
    case 'kitty':
      return 'kitty';
    case 'alacritty':
      return 'alacritty';
    case 'wezterm':
      return 'wezterm';
    case 'ghostty':
      return 'ghostty';
    case 'tmux':
      return 'tmux';
    case 'screen':
      return 'screen';
  }

  // Check TERM
  const term = (env.TERM || '').toLowerCase();
  if (term.includes('tmux')) return 'tmux';
  if (term.includes('screen')) return 'screen';
  if (term.includes('xterm')) return 'xterm';
  if (term.includes('vt100')) return 'xterm';

  // Windows-specific detection
  if (isWindows) {
    if (env.TERM_PROGRAM === undefined && env.ConEmuANSI === 'ON') return 'windows-terminal';
    if (env.WT_SESSION !== undefined) return 'windows-terminal'; // Windows Terminal
    if (env.VSCODE_PID !== undefined) return 'vscode';
    return 'windows-terminal';
  }

  return 'unknown';
}

function detectCiEnvironment(env: NodeJS.ProcessEnv): CiEnvironment {
  if (env.GITHUB_ACTIONS === 'true') return 'github-actions';
  if (env.GITLAB_CI === 'true') return 'gitlab-ci';
  if (env.CIRCLECI === 'true') return 'circle-ci';
  if (env.JENKINS_URL !== undefined) return 'jenkins';
  if (env.AZURE_DEVOPS_EXT_PAT !== undefined || env.TF_BUILD === 'True') return 'azure-devops';
  return 'none';
}

function parseNodeVersion(version: string): readonly [number, number] {
  const match = version.match(/^v?(\d+)\.(\d+)/);
  if (match) {
    return [parseInt(match[1], 10), parseInt(match[2], 10)] as const;
  }
  return [0, 0] as const;
}
