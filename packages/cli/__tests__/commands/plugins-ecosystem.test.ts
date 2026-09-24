/**
 * Tests for `veris plugins` ecosystem subcommands: catalog, verify, install, and remove.
 *
 * Implements Phase 14 tests.
 *
 * @module @veris/cli/__tests__/commands/plugins-ecosystem.test
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parsePluginsArgs, runPlugins, PLUGINS_HELP } from '../../src/commands/plugins.js';
import { ExitCode } from '../../src/wirer.js';

describe('veris plugins ecosystem commands', () => {
  let tmpDir: string;
  let pkgDir: string;
  let pluginsTargetDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'veris-cmd-eco-'));
    pkgDir = path.join(tmpDir, 'sample-plugin');
    pluginsTargetDir = path.join(tmpDir, 'installed-plugins');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.mkdirSync(pluginsTargetDir, { recursive: true });

    // Valid sample manifest
    const manifest = {
      schemaVersion: '1.0.0',
      id: '@veris-ecosystem/test-sample',
      name: 'Sample Ecosystem Plugin',
      version: '1.0.0',
      description: 'A test plugin package for CLI ecosystem tests',
      author: 'Test Maintainer',
      license: 'Apache-2.0',
      engines: { veris: '>=1.0.0' },
      type: 'rule-pack',
      entryPoint: './rules.json',
      capabilities: ['core-types-read'],
      tags: ['test', 'sample'],
    };

    fs.writeFileSync(
      path.join(pkgDir, 'veris-plugin.json'),
      JSON.stringify(manifest, null, 2),
      'utf-8',
    );
    fs.writeFileSync(path.join(pkgDir, 'rules.json'), JSON.stringify({ rules: [] }), 'utf-8');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('argument parsing', () => {
    it('parses catalog command with search and filter options', () => {
      const opts = parsePluginsArgs([
        'catalog',
        './custom-catalog.json',
        '--type',
        'extractor',
        '--search',
        'pe',
        '--tag',
        'binary',
        '--json',
      ]);

      expect(opts.subcommand).toBe('catalog');
      expect(opts.targetArg).toBe('./custom-catalog.json');
      expect(opts.type).toBe('extractor');
      expect(opts.search).toBe('pe');
      expect(opts.tag).toBe('binary');
      expect(opts.json).toBe(true);
    });

    it('parses verify command with expected checksum', () => {
      const opts = parsePluginsArgs([
        'verify',
        './pkg-dir',
        '--expected-sha256',
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        '--json',
      ]);

      expect(opts.subcommand).toBe('verify');
      expect(opts.targetArg).toBe('./pkg-dir');
      expect(opts.expectedSha256).toBe(
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      );
      expect(opts.json).toBe(true);
    });

    it('parses install and remove commands with target and force flags', () => {
      const installOpts = parsePluginsArgs([
        'install',
        './pkg-dir',
        '--target',
        './custom-plugins',
        '--force',
        '--json',
      ]);

      expect(installOpts.subcommand).toBe('install');
      expect(installOpts.targetArg).toBe('./pkg-dir');
      expect(installOpts.targetDir).toBe('./custom-plugins');
      expect(installOpts.force).toBe(true);
      expect(installOpts.json).toBe(true);

      const removeOpts = parsePluginsArgs([
        'remove',
        '@scope/plugin-name',
        '--target',
        './custom-plugins',
        '--json',
      ]);

      expect(removeOpts.subcommand).toBe('remove');
      expect(removeOpts.targetArg).toBe('@scope/plugin-name');
      expect(removeOpts.targetDir).toBe('./custom-plugins');
    });
  });

  describe('execution: catalog', () => {
    it('outputs default catalog packages in JSON mode', async () => {
      let output = '';
      const origWrite = process.stdout.write;
      process.stdout.write = ((chunk: any) => {
        output += chunk;
        return true;
      }) as any;

      try {
        const res = await runPlugins(['catalog', '--json']);
        expect(res.exitCode).toBe(ExitCode.SUCCESS);
        const parsed = JSON.parse(output);
        expect(parsed.catalog).toBe('VERIS Standard Ecosystem Catalog');
        expect(parsed.packages.length).toBeGreaterThan(0);
      } finally {
        process.stdout.write = origWrite;
      }
    });

    it('filters catalog packages by search query', async () => {
      let output = '';
      const origWrite = process.stdout.write;
      process.stdout.write = ((chunk: any) => {
        output += chunk;
        return true;
      }) as any;

      try {
        const res = await runPlugins(['catalog', '--search', 'credentials', '--json']);
        expect(res.exitCode).toBe(ExitCode.SUCCESS);
        const parsed = JSON.parse(output);
        expect(parsed.packages.length).toBeGreaterThan(0);
        expect(parsed.packages[0].name).toContain('Credential');
      } finally {
        process.stdout.write = origWrite;
      }
    });
  });

  describe('execution: verify', () => {
    it('verifies a compliant plugin package successfully', async () => {
      let output = '';
      const origWrite = process.stdout.write;
      process.stdout.write = ((chunk: any) => {
        output += chunk;
        return true;
      }) as any;

      try {
        const res = await runPlugins(['verify', pkgDir, '--json']);
        expect(res.exitCode).toBe(ExitCode.SUCCESS);
        const report = JSON.parse(output);
        expect(report.valid).toBe(true);
        expect(report.manifest.id).toBe('@veris-ecosystem/test-sample');
      } finally {
        process.stdout.write = origWrite;
      }
    });

    it('returns error when package path does not exist', async () => {
      const res = await runPlugins(['verify', path.join(tmpDir, 'non-existent')]);
      expect(res.exitCode).toBe(ExitCode.ERROR);
    });
  });

  describe('execution: install and remove', () => {
    it('completes the full install, verify, and remove lifecycle', async () => {
      // 1. Install
      let installOutput = '';
      const origWrite = process.stdout.write;
      process.stdout.write = ((chunk: any) => {
        installOutput += chunk;
        return true;
      }) as any;

      try {
        const installRes = await runPlugins([
          'install',
          pkgDir,
          '--target',
          pluginsTargetDir,
          '--json',
        ]);
        expect(installRes.exitCode).toBe(ExitCode.SUCCESS);
        const parsedInstall = JSON.parse(installOutput);
        expect(parsedInstall.success).toBe(true);
        expect(parsedInstall.pluginId).toBe('@veris-ecosystem/test-sample');
      } finally {
        process.stdout.write = origWrite;
      }

      // 2. Prevent overwrite without --force
      const duplicateRes = await runPlugins(['install', pkgDir, '--target', pluginsTargetDir]);
      expect(duplicateRes.exitCode).toBe(ExitCode.ERROR);

      // 3. Remove
      let removeOutput = '';
      process.stdout.write = ((chunk: any) => {
        removeOutput += chunk;
        return true;
      }) as any;

      try {
        const removeRes = await runPlugins([
          'remove',
          '@veris-ecosystem/test-sample',
          '--target',
          pluginsTargetDir,
          '--json',
        ]);
        expect(removeRes.exitCode).toBe(ExitCode.SUCCESS);
        const parsedRemove = JSON.parse(removeOutput);
        expect(parsedRemove.success).toBe(true);
        expect(parsedRemove.removedFilesCount).toBeGreaterThan(0);
      } finally {
        process.stdout.write = origWrite;
      }
    });
  });
});
