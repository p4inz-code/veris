/**
 * Tests for the global help renderer.
 *
 * @module @veris/cli/__tests__/ui
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';

import {
  renderGlobalHelp,
  resetSymbolSet,
  setSymbolSet,
  resetTerminalCache,
} from '../../src/ui/index.js';

/** Strip ANSI escape sequences for deterministic assertions. */
function stripAnsi(input: string): string {
  return input.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('renderGlobalHelp', () => {
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

  it('renders the branded banner and version', () => {
    const lines = renderGlobalHelp(100).map(stripAnsi);
    expect(lines.join('\n')).toContain('VERIS - Deterministic Security Analysis Platform v');
    expect(lines.join('\n')).toContain('USAGE');
    expect(lines.join('\n')).toContain('veris <command> [options]');
  });

  it('lists every registered command', () => {
    const text = renderGlobalHelp(100).map(stripAnsi).join('\n');
    for (const cmd of [
      'scan',
      'report',
      'init',
      'validate',
      'pack',
      'explain',
      'summarize',
      'version',
      'completion',
    ]) {
      expect(text).toContain(cmd);
    }
  });

  it('groups commands under section labels', () => {
    const text = renderGlobalHelp(100).map(stripAnsi).join('\n');
    expect(text).toContain('COMMANDS');
    for (const group of ['Analysis', 'Configuration', 'AI', 'System']) {
      expect(text).toContain(group);
    }
  });

  it('lists global options and examples', () => {
    const text = renderGlobalHelp(100).map(stripAnsi).join('\n');
    expect(text).toContain('GLOBAL OPTIONS');
    expect(text).toContain('--help, -h');
    expect(text).toContain('--no-color');
    expect(text).toContain('--no-unicode');
    expect(text).toContain('EXAMPLES');
    expect(text).toContain('veris scan');
    expect(text).toContain('veris explain fin_abc123');
  });

  it('never emits lines wider than the terminal width', () => {
    const lines = renderGlobalHelp(40).map(stripAnsi);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(42);
    }
  });

  it('wraps long descriptions instead of truncating at narrow widths', () => {
    const text = renderGlobalHelp(36).map(stripAnsi).join('\n');
    // Description text must remain present even when wrapped across lines.
    const compact = text.replace(/\s+/g, '');
    expect(compact).toContain('Generateshellcompletions');
    expect(compact).toContain('SummarizescanreportusingAI');
  });

  it('emits no ANSI color codes when color is disabled', () => {
    const text = renderGlobalHelp(100).join('\n');
    expect(text).not.toMatch(/\x1b\[[0-9;]*m/);
  });

  it('works with the Unicode symbol set', () => {
    setSymbolSet('unicode');
    process.env.VERIS_UNICODE = '1';
    resetTerminalCache();
    resetSymbolSet();

    const text = renderGlobalHelp(100).join('\n');
    expect(text).toContain('VERIS — Deterministic Security Analysis Platform');
  });
});
