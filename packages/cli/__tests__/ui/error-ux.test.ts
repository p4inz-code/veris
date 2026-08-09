/**
 * Tests for the top-level error UX formatter.
 *
 * @module @veris/cli/__tests__/ui
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';

import {
  formatCliError,
  resetSymbolSet,
  setSymbolSet,
  resetTerminalCache,
} from '../../src/ui/index.js';
import { ExitCode, CliError } from '../../src/wirer.js';

describe('formatCliError', () => {
  beforeEach(() => {
    setSymbolSet('ascii');
    process.env.VERIS_COLOR = '0';
    process.env.VERIS_UNICODE = '0';
    resetTerminalCache();
    resetSymbolSet();
  });

  afterAll(() => {
    delete process.env.VERIS_COLOR;
    delete process.env.VERIS_UNICODE;
    resetTerminalCache();
    resetSymbolSet();
  });

  it('renders the error message with a severity symbol', () => {
    const text = formatCliError(new Error('Something broke'), ExitCode.ERROR);
    expect(text).toContain('Something broke');
    expect(text).not.toMatch(/\x1b\[[0-9;]*m/);
  });

  it('adds a usage hint for usage errors with the command name', () => {
    const text = formatCliError(
      new CliError('Unknown option: --wat', ExitCode.USAGE_ERROR),
      ExitCode.USAGE_ERROR,
      { command: 'scan' },
    );
    expect(text).toContain("Run 'veris scan --help' for usage");
  });

  it('maps NOT_FOUND to a report hint', () => {
    const text = formatCliError(
      new CliError('No report found', ExitCode.NOT_FOUND),
      ExitCode.NOT_FOUND,
    );
    expect(text).toContain("Run 'veris scan' first, or specify the report path");
  });

  it('maps PROVIDER_UNAVAILABLE and CACHE_ERROR to their hints', () => {
    const provider = formatCliError(
      new CliError('Provider unavailable', ExitCode.PROVIDER_UNAVAILABLE),
      ExitCode.PROVIDER_UNAVAILABLE,
    );
    expect(provider).toContain('provider configuration');

    const cache = formatCliError(
      new CliError('Cache error', ExitCode.CACHE_ERROR),
      ExitCode.CACHE_ERROR,
    );
    expect(cache).toContain('Clear the explanation cache');
  });

  it('does not duplicate guidance already present in the message', () => {
    const text = formatCliError(
      new CliError(
        "Unknown option: --wat. Run 'veris scan --help' for usage.",
        ExitCode.USAGE_ERROR,
      ),
      ExitCode.USAGE_ERROR,
      { command: 'scan' },
    );
    const occurrences = text.split("Run 'veris scan --help' for usage").length - 1;
    expect(occurrences).toBe(1);
  });

  it('includes the stack trace only in verbose mode', () => {
    const error = new Error('Boom');
    error.stack = 'Error: Boom\n    at test (file.ts:1:1)';

    const quiet = formatCliError(error, ExitCode.ERROR);
    expect(quiet).not.toContain('file.ts');

    const verbose = formatCliError(error, ExitCode.ERROR, { verbose: true });
    expect(verbose).toContain('file.ts');
    expect(verbose).toContain('Stack');
  });

  it('falls back to string coercion for non-Error throws', () => {
    const text = formatCliError('plain string failure', ExitCode.ERROR);
    expect(text).toContain('plain string failure');
  });

  it('renders color codes when the terminal supports color', () => {
    // Simulate a color-capable terminal: force TTY so detection picks up
    // the color depth override.
    const originalIsTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    setSymbolSet('ascii');
    process.env.VERIS_COLOR = 'ansi';
    resetTerminalCache();
    resetSymbolSet();

    try {
      const text = formatCliError(new Error('Colored'), ExitCode.ERROR);
      expect(text).toMatch(/\x1b\[[0-9;]*m/);
    } finally {
      delete process.env.VERIS_COLOR;
      if (originalIsTty) {
        Object.defineProperty(process.stdout, 'isTTY', originalIsTty);
      } else {
        delete (process.stdout as { isTTY?: boolean }).isTTY;
      }
      resetTerminalCache();
      resetSymbolSet();
    }
  });
});
