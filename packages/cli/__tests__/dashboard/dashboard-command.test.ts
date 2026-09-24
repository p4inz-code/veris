/**
 * Tests for the `veris dashboard` CLI command and argument parsing.
 *
 * @module @veris/cli/__tests__/dashboard/dashboard-command.test
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseDashboardArgs, runDashboard, DASHBOARD_HELP } from '../../src/commands/dashboard.js';
import { ExitCode } from '../../src/wirer.js';

describe('veris dashboard command', () => {
  let tmpDir: string;
  let reportFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'veris-cmd-dash-'));
    reportFile = path.join(tmpDir, 'report.json');
    const dummyReport = {
      id: 'rep_123',
      findings: [
        {
          id: 'f1',
          ruleId: 'r1',
          title: 'Suspicious Execution',
          severity: 'high',
          evidence: [],
        },
      ],
      risk: { score: 70, level: 'HIGH' },
      summary: { targetPath: '/test/app' },
    };
    fs.writeFileSync(reportFile, JSON.stringify(dummyReport), 'utf-8');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('parseDashboardArgs', () => {
    it('parses report path and options correctly', () => {
      const opts = parseDashboardArgs([
        'custom-report.json',
        '--output',
        './out.html',
        '--port',
        '4000',
        '--no-open',
        '--serve',
      ]);

      expect(opts.report).toBe('custom-report.json');
      expect(opts.output).toBe('./out.html');
      expect(opts.port).toBe(4000);
      expect(opts.noOpen).toBe(true);
      expect(opts.serve).toBe(true);
    });

    it('handles --help flag', () => {
      const opts = parseDashboardArgs(['--help']);
      expect(opts.report).toBe('--help');
    });

    it('throws error on invalid port', () => {
      expect(() => parseDashboardArgs(['--port', 'not-a-port'])).toThrow(/Invalid port number/);
      expect(() => parseDashboardArgs(['--port', '99999'])).toThrow(/Invalid port number/);
    });

    it('throws error on missing --output argument', () => {
      expect(() => parseDashboardArgs(['--output'])).toThrow(/Missing argument for --output/);
    });

    it('throws error on unknown options', () => {
      expect(() => parseDashboardArgs(['--unknown-flag'])).toThrow(/Unknown option/);
    });
  });

  describe('runDashboard', () => {
    it('prints help text when --help is passed', async () => {
      let output = '';
      const origWrite = process.stdout.write;
      process.stdout.write = ((chunk: any) => {
        output += chunk;
        return true;
      }) as any;

      try {
        const res = await runDashboard({ report: '--help' });
        expect(res.exitCode).toBe(ExitCode.SUCCESS);
        expect(output).toContain('Launch or export the visual investigation dashboard');
      } finally {
        process.stdout.write = origWrite;
      }
    });

    it('returns NOT_FOUND when report file is missing', async () => {
      const res = await runDashboard({ report: path.join(tmpDir, 'missing.json') });
      expect(res.exitCode).toBe(ExitCode.NOT_FOUND);
    });

    it('exports standalone HTML when --output is specified without --serve', async () => {
      const outHtml = path.join(tmpDir, 'exported.html');
      const res = await runDashboard({
        report: reportFile,
        output: outHtml,
      });

      expect(res.exitCode).toBe(ExitCode.SUCCESS);
      expect(res.outputPath).toBe(outHtml);
      expect(fs.existsSync(outHtml)).toBe(true);
      expect(res.server).toBeUndefined();
    });

    it('starts loopback server when --serve or default mode is active', async () => {
      const res = await runDashboard({
        report: reportFile,
        port: 0,
        noOpen: true,
      });

      expect(res.exitCode).toBe(ExitCode.SUCCESS);
      expect(res.server).toBeDefined();
      expect(res.server?.port).toBeGreaterThan(0);
      await res.server?.close();
    });
  });
});
