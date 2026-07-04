/**
 * Tests for @veris/cli.
 */

import { describe, it, expect } from 'vitest';
import {
  registerCommand,
  getCommand,
  getAllCommands,
  dispatchCommand,
  type CliCommand,
} from '../src/commands/index.js';
import { ExitCode, CliError } from '../src/wirer.js';
import { EXPLAIN_HELP } from '../src/commands/explain.js';
import { SUMMARIZE_HELP } from '../src/commands/summarize.js';

describe('@veris/cli', () => {
  describe('command registry', () => {
    it('registers and retrieves commands', () => {
      const testCommand: CliCommand = {
        name: 'test-cmd',
        description: 'A test command',
        usage: 'veris test-cmd',
        async run() {
          return 0;
        },
      };

      registerCommand(testCommand);
      const retrieved = getCommand('test-cmd');
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe('test-cmd');
    });

    it('returns undefined for unknown commands', () => {
      const cmd = getCommand('nonexistent');
      expect(cmd).toBeUndefined();
    });

    it('lists all registered commands', () => {
      const commands = getAllCommands();
      expect(Array.isArray(commands)).toBe(true);
    });

    it('dispatchCommand runs the command handler', async () => {
      let ran = false;
      const testCommand: CliCommand = {
        name: 'dispatch-test',
        description: 'A test command',
        usage: 'veris dispatch-test',
        async run() {
          ran = true;
          return 42;
        },
      };

      registerCommand(testCommand);
      const exitCode = await dispatchCommand('dispatch-test', []);
      expect(ran).toBe(true);
      expect(exitCode).toBe(42);
    });

    it('dispatchCommand throws for unknown commands', async () => {
      await expect(dispatchCommand('unknown-cmd', [])).rejects.toThrow(CliError);
    });
  });

  describe('help text', () => {
    it('EXPLAIN_HELP contains expected command usage', () => {
      expect(EXPLAIN_HELP).toContain('veris explain');
      expect(EXPLAIN_HELP).toContain('--mode');
      expect(EXPLAIN_HELP).toContain('--json');
      expect(EXPLAIN_HELP).toContain('--no-audit');
      expect(EXPLAIN_HELP).toContain('--offline');
      expect(EXPLAIN_HELP).toContain('--provider');
      expect(EXPLAIN_HELP).toContain('--model');
      expect(EXPLAIN_HELP).toContain('simple');
      expect(EXPLAIN_HELP).toContain('technical');
      expect(EXPLAIN_HELP).toContain('expert');
    });

    it('EXPLAIN_HELP documents exit codes', () => {
      expect(EXPLAIN_HELP).toContain('EXIT CODES');
      expect(EXPLAIN_HELP).toContain('0');
      expect(EXPLAIN_HELP).toContain('1');
      expect(EXPLAIN_HELP).toContain('2');
      expect(EXPLAIN_HELP).toContain('3');
      expect(EXPLAIN_HELP).toContain('4');
      expect(EXPLAIN_HELP).toContain('5');
    });

    it('SUMMARIZE_HELP contains expected command usage', () => {
      expect(SUMMARIZE_HELP).toContain('veris summarize');
      expect(SUMMARIZE_HELP).toContain('--mode');
      expect(SUMMARIZE_HELP).toContain('--json');
      expect(SUMMARIZE_HELP).toContain('--no-audit');
      expect(SUMMARIZE_HELP).toContain('--offline');
    });

    it('SUMMARIZE_HELP documents exit codes', () => {
      expect(SUMMARIZE_HELP).toContain('EXIT CODES');
      expect(SUMMARIZE_HELP).toContain('0');
      expect(SUMMARIZE_HELP).toContain('1');
      expect(SUMMARIZE_HELP).toContain('2');
      expect(SUMMARIZE_HELP).toContain('3');
      expect(SUMMARIZE_HELP).toContain('4');
      expect(SUMMARIZE_HELP).toContain('5');
    });
  });

  describe('ExitCode', () => {
    it('has all expected exit codes', () => {
      expect(ExitCode.SUCCESS).toBe(0);
      expect(ExitCode.ERROR).toBe(1);
      expect(ExitCode.USAGE_ERROR).toBe(2);
      expect(ExitCode.NOT_FOUND).toBe(3);
      expect(ExitCode.PROVIDER_UNAVAILABLE).toBe(4);
      expect(ExitCode.CACHE_ERROR).toBe(5);
    });
  });

  describe('CliError', () => {
    it('creates an error with an exit code', () => {
      const error = new CliError('Test error', ExitCode.USAGE_ERROR);
      expect(error.message).toBe('Test error');
      expect(error.exitCode).toBe(2);
      expect(error.name).toBe('CliError');
    });

    it('defaults to ERROR exit code', () => {
      const error = new CliError('Default error');
      expect(error.exitCode).toBe(1);
    });
  });
});
