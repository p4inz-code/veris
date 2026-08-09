/**
 * Spinner component for VERIS CLI.
 *
 * Provides animated spinners that adapt to Unicode/ASCII support.
 * Supports pause, resume, stop, and multiple spinner styles.
 *
 * @module @veris/cli/ui/components
 */

import { getSymbolSet } from '../renderer/index.js';
import { type TerminalCapabilities, detectTerminal, isInteractive } from '../terminal/index.js';
import { getResolvedTheme } from '../theme/index.js';

// ── Spinner Styles ──

/** Available spinner visual styles. */
export type SpinnerStyle = 'dots' | 'line' | 'braille' | 'arrows' | 'clock';

/** Definition of a spinner style with its frames. */
export interface SpinnerDefinition {
  readonly frames: readonly string[];
  /** Interval between frames in ms. */
  readonly interval: number;
}

// ── Spinner Definitions ──

const SPINNER_DEFINITIONS: Record<SpinnerStyle, SpinnerDefinition> = {
  dots: {
    frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
    interval: 80,
  },
  line: {
    frames: ['|', '/', '-', '\\'],
    interval: 100,
  },
  braille: {
    frames: ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'],
    interval: 80,
  },
  arrows: {
    frames: ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'],
    interval: 100,
  },
  clock: {
    frames: ['🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛'],
    interval: 100,
  },
};

// ── ASCII Fallback Frames ──

const ASCII_FRAMES: readonly string[] = ['|', '/', '-', '\\'];

// ── Spinner Instance ──

/**
 * A single spinner instance that can be started, stopped, and updated.
 */
export class Spinner {
  private readonly options: SpinnerOptions;
  private readonly frames: readonly string[];
  private readonly interval: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private frameIndex: number = 0;
  private _text: string = '';
  private _running: boolean = false;

  constructor(options: SpinnerOptions = {}) {
    this.options = options;
    const caps = options.caps ?? detectTerminal();
    const symbols = getSymbolSet();

    // Determine frames based on Unicode support and style
    if (!caps.unicode || options.noAnimation) {
      this.frames = ASCII_FRAMES;
      this.interval = 150;
    } else {
      const style = options.style ?? 'dots';
      const def = SPINNER_DEFINITIONS[style] ?? SPINNER_DEFINITIONS.dots;
      this.frames = caps.unicode ? def.frames : ASCII_FRAMES;
      this.interval = options.interval ?? def.interval;
    }

    this._text = options.text ?? '';
  }

  /** Whether the spinner is currently running. */
  get running(): boolean {
    return this._running;
  }

  /** The current text displayed alongside the spinner. */
  get text(): string {
    return this._text;
  }

  set text(value: string) {
    this._text = value;
  }

  /**
   * Start the spinner animation.
   */
  start(text?: string): void {
    if (this._running) return;
    if (text !== undefined) this._text = text;

    const caps = this.options.caps ?? detectTerminal();
    if (!caps.isTty || this.options.noAnimation) {
      // Non-TTY: just write the text once
      if (this._text) {
        process.stdout.write(`${this._text}\n`);
      }
      return;
    }

    this._running = true;
    this.frameIndex = 0;

    this.timer = setInterval(() => {
      const frame = this.frames[this.frameIndex % this.frames.length];
      const color = getResolvedTheme().ui.accent;
      const line = this._text ? `${frame} ${color}${this._text}\x1b[0m` : frame;

      // Clear previous line and write new one
      process.stdout.write(`\r\x1b[2K${line}`);
      this.frameIndex++;
    }, this.interval);
  }

  /**
   * Update the spinner text.
   */
  update(text: string): void {
    this._text = text;
  }

  /**
   * Pause the spinner animation (freezes current frame).
   */
  pause(): void {
    if (!this._running || this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Resume the spinner animation.
   */
  resume(): void {
    if (this._running || this.timer !== null) return;
    this._running = true;

    this.timer = setInterval(() => {
      const frame = this.frames[this.frameIndex % this.frames.length];
      const line = this._text ? `${frame} ${this._text}` : frame;
      process.stdout.write(`\r\x1b[2K${line}`);
      this.frameIndex++;
    }, this.interval);
  }

  /**
   * Stop the spinner and optionally write a final message.
   */
  stop(finalText?: string): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this._running = false;

    // Clear spinner line
    process.stdout.write('\r\x1b[2K');

    if (finalText !== undefined) {
      process.stdout.write(`${finalText}\n`);
    }
  }

  /**
   * Stop the spinner with a success message.
   */
  succeed(message: string): void {
    const symbols = getSymbolSet();
    const color = getResolvedTheme().status.success;
    this.stop(`${color}${symbols.success}\x1b[0m ${message}`);
  }

  /**
   * Stop the spinner with a failure message.
   */
  fail(message: string): void {
    const symbols = getSymbolSet();
    const color = getResolvedTheme().status.error;
    this.stop(`${color}${symbols.error}\x1b[0m ${message}`);
  }

  /**
   * Stop the spinner with a warning message.
   */
  warn(message: string): void {
    const symbols = getSymbolSet();
    const color = getResolvedTheme().status.warning;
    this.stop(`${color}${symbols.warning}\x1b[0m ${message}`);
  }

  /**
   * Stop the spinner with an info message.
   */
  info(message: string): void {
    const symbols = getSymbolSet();
    const color = getResolvedTheme().status.success;
    this.stop(`${color}${symbols.info}\x1b[0m ${message}`);
  }

  /**
   * Render a single frame (for non-animated use).
   */
  frame(): string {
    const frame = this.frames[this.frameIndex % this.frames.length];
    this.frameIndex++;
    return `${frame} ${this._text}`;
  }
}

// ── Spinner Options ──

/** Options for creating a spinner. */
export interface SpinnerOptions {
  /** Initial text to display alongside the spinner. */
  readonly text?: string;
  /** Spinner visual style. */
  readonly style?: SpinnerStyle;
  /** Frame interval in milliseconds. */
  readonly interval?: number;
  /** Disable animation (show static text only). */
  readonly noAnimation?: boolean;
  /** Terminal capabilities (auto-detected if not provided). */
  readonly caps?: TerminalCapabilities;
}

/**
 * Create a new Spinner instance.
 */
export function createSpinner(options: SpinnerOptions = {}): Spinner {
  return new Spinner(options);
}
