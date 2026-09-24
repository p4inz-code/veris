/**
 * Comprehensive Product UX/UI Consistency and Acceptance Tests.
 *
 * Covers:
 * - Terminal width adaptability (40, 60, 80, 120, 160, 180 columns)
 * - Accessibility: Unicode/ASCII symbol degradation, colorlessness (NO_COLOR)
 * - Command-to-command UI consistency across all registered commands
 * - Command dispatch, alias resolution, and predictable error UX
 *
 * @module @veris/cli/__tests__/ui
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  renderGlobalHelp,
  formatCliError,
  resetSymbolSet,
  setSymbolSet,
  resetTerminalCache,
} from '../../src/ui/index.js';
import { getCommand, getAllCommands, dispatchCommand } from '../../src/commands/index.js';
import { registerAllCommands } from '../../src/cli.js';
import { ExitCode, CliError } from '../../src/wirer.js';

/** Helper to strip ANSI codes. */
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('Product UX/UI Consistency & Acceptance', () => {
  beforeEach(() => {
    registerAllCommands();
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

  describe('Terminal Width Adaptability', () => {
    const testWidths = [40, 60, 80, 120, 160, 180];

    for (const width of testWidths) {
      it(`renders global help cleanly at width ${width} without horizontal overflow`, () => {
        const lines = renderGlobalHelp(width).map(stripAnsi);
        expect(lines.length).toBeGreaterThan(10);

        for (const line of lines) {
          // Lines must not significantly overflow target terminal width (allowing small padding margin)
          expect(line.length).toBeLessThanOrEqual(Math.max(width + 2, 42));
        }

        const fullText = lines.join('\n');
        // Essential brand and section indicators must always be present
        expect(fullText).toContain('VERIS');
        expect(fullText).toContain('USAGE');
        expect(fullText).toContain('COMMANDS');
        expect(fullText).toContain('GLOBAL OPTIONS');
      });

      it(`formats CLI errors cleanly at width ${width}`, () => {
        const error = new CliError(
          'Target artifact directory was not found: /missing/path',
          ExitCode.USAGE_ERROR,
        );
        const formatted = formatCliError(error, ExitCode.USAGE_ERROR, { command: 'scan' });
        const plain = stripAnsi(formatted);

        expect(plain).toContain('Target artifact directory was not found');
        expect(plain.length).toBeGreaterThan(0);
      });
    }
  });

  describe('Accessibility & Non-TTY / Compatibility Modes', () => {
    it('renders pure ASCII with zero non-ASCII characters when unicode is disabled', () => {
      setSymbolSet('ascii');
      const lines = renderGlobalHelp(80).map(stripAnsi);
      const combined = lines.join('\n');

      // Ensure every character is in standard printable ASCII range (0x20 to 0x7E) or newline/tab
      for (let i = 0; i < combined.length; i++) {
        const code = combined.charCodeAt(i);
        const isAsciiPrintable =
          (code >= 32 && code <= 126) || code === 10 || code === 13 || code === 9;
        expect(isAsciiPrintable, `Char '${combined[i]}' (code ${code}) must be ASCII`).toBe(true);
      }
    });

    it('emits zero ANSI escape codes when color is disabled', () => {
      process.env.VERIS_COLOR = '0';
      resetTerminalCache();
      const lines = renderGlobalHelp(80);
      for (const line of lines) {
        expect(line).not.toMatch(/\x1b\[[0-9;]*m/);
      }
    });

    it('renders semantic indicators in error UX independently of color', () => {
      const err = new CliError(
        'Security gate failed: critical vulnerability detected',
        ExitCode.GATE_VIOLATION,
      );
      const output = stripAnsi(formatCliError(err, ExitCode.GATE_VIOLATION, { command: 'ci' }));

      // Textual prefix ensures color-blind accessibility
      expect(output).toMatch(/(Error|GATE_VIOLATION|Security gate)/i);
    });
  });

  describe('Command-to-Command Consistency & Public Surface', () => {
    const expectedCommands = [
      'scan',
      'ci',
      'report',
      'dashboard',
      'init',
      'validate',
      'pack',
      'plugins',
      'plugin',
      'rule',
      'rules',
      'explain',
      'summarize',
      'version',
      'completion',
    ];

    it('registers all documented public commands and aliases', () => {
      const registered = getAllCommands().map((c) => c.name);
      for (const cmd of expectedCommands) {
        expect(registered, `Command '${cmd}' must be registered`).toContain(cmd);
      }
    });

    it('provides standardized --help handling for each command', async () => {
      for (const cmdName of expectedCommands) {
        const cmd = getCommand(cmdName);
        expect(cmd, `Command '${cmdName}' must exist`).toBeDefined();

        let output = '';
        const originalStdoutWrite = process.stdout.write.bind(process.stdout);
        process.stdout.write = ((chunk: unknown) => {
          output += String(chunk);
          return true;
        }) as typeof process.stdout.write;

        try {
          const exitCode = await cmd!.run(['--help']);
          expect(exitCode, `Command '${cmdName} --help' must return SUCCESS`).toBe(
            ExitCode.SUCCESS,
          );
          expect(output.length, `Command '${cmdName} --help' must produce output`).toBeGreaterThan(
            10,
          );
        } finally {
          process.stdout.write = originalStdoutWrite;
        }
      }
    });

    it('rejects unknown commands with a clear CliError and exit code', async () => {
      await expect(dispatchCommand('unsupported-command-xyz', [])).rejects.toThrow(CliError);
    });
  });
});
