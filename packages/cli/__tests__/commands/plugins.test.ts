/**
 * Tests for `veris plugins` CLI command.
 *
 * Verifies plugin listing, info, validation, json output, and error handling.
 */

import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parsePluginsArgs, runPlugins, PLUGINS_HELP } from '../../src/commands/plugins.js';
import { CliError, ExitCode } from '../../src/wirer.js';

describe('veris plugins command', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'veris-cli-plugins-test-'));
  });

  afterEach(async () => {
    await fsp.rm(tempDir, { recursive: true, force: true });
  });

  describe('help and argument parsing', () => {
    it('provides comprehensive help text', () => {
      expect(PLUGINS_HELP).toContain('veris plugins');
      expect(PLUGINS_HELP).toContain('--plugin-dir');
      expect(PLUGINS_HELP).toContain('--disable-plugin');
      expect(PLUGINS_HELP).toContain('--json');
      expect(PLUGINS_HELP).toContain('EXIT CODES');
    });

    it('parses list subcommand by default', () => {
      const opts = parsePluginsArgs([]);
      expect(opts.subcommand).toBe('list');
      expect(opts.json).toBe(false);
    });

    it('parses info subcommand with target argument', () => {
      const opts = parsePluginsArgs(['info', 'my-plugin', '--json']);
      expect(opts.subcommand).toBe('info');
      expect(opts.targetArg).toBe('my-plugin');
      expect(opts.json).toBe(true);
    });

    it('parses validate subcommand with path argument', () => {
      const opts = parsePluginsArgs(['validate', './custom-plugin']);
      expect(opts.subcommand).toBe('validate');
      expect(opts.targetArg).toBe('./custom-plugin');
    });

    it('parses repeatable --disable-plugin flags', () => {
      const opts = parsePluginsArgs([
        '--disable-plugin',
        'plugin-a',
        '--disable-plugin',
        'plugin-b',
      ]);
      expect(opts.disabledPlugins).toEqual(['plugin-a', 'plugin-b']);
    });

    it('throws CliError on unknown option', () => {
      expect(() => parsePluginsArgs(['--invalid-flag'])).toThrow(CliError);
    });
  });

  describe('list subcommand execution', () => {
    it('returns success and empty json array when no plugins are found', async () => {
      const stdoutWrites: string[] = [];
      const origWrite = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        stdoutWrites.push(chunk);
        return true;
      }) as unknown as typeof process.stdout.write;

      try {
        const { exitCode } = await runPlugins(['list', '--plugin-dir', tempDir, '--json']);
        expect(exitCode).toBe(ExitCode.SUCCESS);
        const output = stdoutWrites.join('');
        const parsed = JSON.parse(output);
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed.length).toBe(0);
      } finally {
        process.stdout.write = origWrite;
      }
    });

    it('discovers and lists valid plugins in human-readable table format', async () => {
      // Create a test plugin
      const pluginDir = path.join(tempDir, 'sample-extractor');
      await fsp.mkdir(pluginDir, { recursive: true });
      await fsp.writeFile(
        path.join(pluginDir, 'veris-plugin.json'),
        JSON.stringify(
          {
            schemaVersion: '1.0.0',
            id: 'sample-extractor',
            name: 'Sample Extractor',
            version: '1.0.0',
            description: 'Test extractor plugin for unit tests',
            author: 'VERIS Test',
            license: 'Apache-2.0',
            engines: { veris: '>=1.0.0' },
            type: 'extractor',
            entryPoint: './index.js',
            capabilities: ['core-types-read', 'target-read'],
            supportedArtifactTypes: ['file'],
          },
          null,
          2,
        ),
      );
      await fsp.writeFile(
        path.join(pluginDir, 'index.js'),
        'export default { manifest: {}, extract: async () => [] };\n',
      );

      const stdoutWrites: string[] = [];
      const origWrite = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        stdoutWrites.push(chunk);
        return true;
      }) as unknown as typeof process.stdout.write;

      try {
        const { exitCode } = await runPlugins(['list', '--plugin-dir', tempDir]);
        expect(exitCode).toBe(ExitCode.SUCCESS);
        const output = stdoutWrites.join('');
        expect(output).toContain('sample-extractor');
        expect(output).toContain('1.0.0');
        expect(output).toContain('extractor');
      } finally {
        process.stdout.write = origWrite;
      }
    });

    it('respects --disable-plugin in listing', async () => {
      const pluginDir = path.join(tempDir, 'disabled-plugin');
      await fsp.mkdir(pluginDir, { recursive: true });
      await fsp.writeFile(
        path.join(pluginDir, 'veris-plugin.json'),
        JSON.stringify(
          {
            schemaVersion: '1.0.0',
            id: 'disabled-plugin',
            name: 'Disabled Plugin',
            version: '1.0.0',
            description: 'Test disabled plugin',
            author: 'VERIS Test',
            license: 'Apache-2.0',
            engines: { veris: '>=1.0.0' },
            type: 'extractor',
            entryPoint: './index.js',
            capabilities: ['core-types-read'],
          },
          null,
          2,
        ),
      );
      await fsp.writeFile(
        path.join(pluginDir, 'index.js'),
        'export default { manifest: {}, extract: async () => [] };\n',
      );

      const stdoutWrites: string[] = [];
      const origWrite = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        stdoutWrites.push(chunk);
        return true;
      }) as unknown as typeof process.stdout.write;

      try {
        const { exitCode } = await runPlugins([
          'list',
          '--plugin-dir',
          tempDir,
          '--disable-plugin',
          'disabled-plugin',
          '--json',
        ]);
        expect(exitCode).toBe(ExitCode.SUCCESS);
        const parsed = JSON.parse(stdoutWrites.join(''));
        expect(parsed.length).toBe(1);
        expect(parsed[0].status).toBe('disabled');
      } finally {
        process.stdout.write = origWrite;
      }
    });
  });

  describe('info subcommand execution', () => {
    it('returns error when plugin is not found', async () => {
      const stderrWrites: string[] = [];
      const origStderr = process.stderr.write;
      process.stderr.write = ((chunk: string) => {
        stderrWrites.push(chunk);
        return true;
      }) as unknown as typeof process.stderr.write;

      try {
        const { exitCode } = await runPlugins([
          'info',
          'non-existent-plugin',
          '--plugin-dir',
          tempDir,
        ]);
        expect(exitCode).toBe(ExitCode.ERROR);
        expect(stderrWrites.join('')).toContain('Plugin "non-existent-plugin" not found');
      } finally {
        process.stderr.write = origStderr;
      }
    });

    it('returns detailed metadata for discovered plugin in json mode', async () => {
      const pluginDir = path.join(tempDir, 'info-plugin');
      await fsp.mkdir(pluginDir, { recursive: true });
      await fsp.writeFile(
        path.join(pluginDir, 'veris-plugin.json'),
        JSON.stringify(
          {
            schemaVersion: '1.0.0',
            id: 'info-plugin',
            name: 'Info Plugin',
            version: '2.3.4',
            description: 'Plugin for info testing',
            author: 'VERIS Security',
            license: 'MIT',
            engines: { veris: '>=1.0.0' },
            type: 'rule-pack',
            entryPoint: './rules.js',
            capabilities: ['core-types-read'],
          },
          null,
          2,
        ),
      );
      await fsp.writeFile(
        path.join(pluginDir, 'rules.js'),
        'export default { manifest: {}, rulePack: { id: "test-pack", name: "Test Pack", version: "1.0.0", rules: [] } };\n',
      );

      const stdoutWrites: string[] = [];
      const origWrite = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        stdoutWrites.push(chunk);
        return true;
      }) as unknown as typeof process.stdout.write;

      try {
        const { exitCode } = await runPlugins([
          'info',
          'info-plugin',
          '--plugin-dir',
          tempDir,
          '--json',
        ]);
        expect(exitCode).toBe(ExitCode.SUCCESS);
        const parsed = JSON.parse(stdoutWrites.join(''));
        expect(parsed.id).toBe('info-plugin');
        expect(parsed.name).toBe('Info Plugin');
        expect(parsed.version).toBe('2.3.4');
        expect(parsed.type).toBe('rule-pack');
        expect(parsed.license).toBe('MIT');
      } finally {
        process.stdout.write = origWrite;
      }
    });
  });

  describe('validate subcommand execution', () => {
    it('validates a correct plugin on disk', async () => {
      const pluginDir = path.join(tempDir, 'valid-plugin');
      await fsp.mkdir(pluginDir, { recursive: true });
      await fsp.writeFile(
        path.join(pluginDir, 'veris-plugin.json'),
        JSON.stringify(
          {
            schemaVersion: '1.0.0',
            id: 'valid-plugin',
            name: 'Valid Plugin',
            version: '1.0.0',
            description: 'Valid plugin description',
            author: 'Author',
            license: 'Apache-2.0',
            engines: { veris: '>=1.0.0' },
            type: 'extractor',
            entryPoint: './index.js',
            capabilities: ['core-types-read'],
          },
          null,
          2,
        ),
      );
      await fsp.writeFile(path.join(pluginDir, 'index.js'), 'export default {};\n');

      const stdoutWrites: string[] = [];
      const origWrite = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        stdoutWrites.push(chunk);
        return true;
      }) as unknown as typeof process.stdout.write;

      try {
        const { exitCode } = await runPlugins(['validate', pluginDir]);
        expect(exitCode).toBe(ExitCode.SUCCESS);
        const output = stdoutWrites.join('');
        expect(output).toContain('Manifest is valid');
        expect(output).toContain('Entry point exists');
      } finally {
        process.stdout.write = origWrite;
      }
    });

    it('rejects an invalid plugin manifest', async () => {
      const pluginDir = path.join(tempDir, 'invalid-plugin');
      await fsp.mkdir(pluginDir, { recursive: true });
      await fsp.writeFile(
        path.join(pluginDir, 'veris-plugin.json'),
        JSON.stringify(
          {
            schemaVersion: '9.9.9', // invalid
            id: 'INVALID ID WITH SPACES',
          },
          null,
          2,
        ),
      );

      const stderrWrites: string[] = [];
      const origStderr = process.stderr.write;
      process.stderr.write = ((chunk: string) => {
        stderrWrites.push(chunk);
        return true;
      }) as unknown as typeof process.stderr.write;

      try {
        const { exitCode } = await runPlugins(['validate', pluginDir]);
        expect(exitCode).toBe(ExitCode.ERROR);
        const output = stderrWrites.join('');
        expect(output).toContain('Manifest validation failed');
      } finally {
        process.stderr.write = origStderr;
      }
    });
  });
});
