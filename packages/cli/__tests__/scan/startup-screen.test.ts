/**
 * Tests for the startup screen.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderStartupScreen } from '../../src/scan/progress/startup-screen.js';
import { DashboardRenderer } from '../../src/scan/progress/dashboard-renderer.js';
import { createScanSession, type ScanConfig } from '../../src/scan/scan-session.js';
import { setSymbolSet, resetSymbolSet } from '../../src/ui/index.js';

function createTestConfig(): ScanConfig {
  return Object.freeze({
    target: '/test/path',
    preset: 'default',
    enabledAnalyzers: [
      'PE',
      'ELF',
      'MachO',
      'Certificate',
      'Document',
      'Office',
      'Entropy',
      'Import',
      'String',
      'Persistence',
      'Script',
      'Dependency',
    ],
    enabledFormats: ['json', 'markdown'],
    workerCount: 1,
    maxFindings: 1000,
    maxFiles: 100000,
    maxDepth: 50,
    includeHidden: false,
  });
}

function render(config: ScanConfig, options?: Parameters<typeof renderStartupScreen>[1]): string {
  return renderStartupScreen(config, options).join('\n');
}

describe('renderStartupScreen', () => {
  beforeEach(() => {
    resetSymbolSet();
  });

  it('renders the VERIS banner and version', () => {
    const out = render(createTestConfig(), { version: '1.2.3' });
    expect(out).toContain('VERIS v1.2.3');
    expect(out).toContain('Starting scan');
  });

  it('defaults the version to CLI_VERSION', () => {
    const out = render(createTestConfig());
    expect(out).toContain('VERIS v1.0.0');
  });

  it('shows platform and Node version when provided', () => {
    const out = render(createTestConfig(), {
      platform: 'win32 (Windows)',
      nodeVersion: 'v20.11.1',
    });
    expect(out).toContain('Node v20.11.1');
    expect(out).toContain('win32 (Windows)');
  });

  it('shows the active configuration summary with aligned values', () => {
    const out = render(createTestConfig());
    expect(out).toContain('Configuration');
    expect(out).toContain('Target');
    expect(out).toContain('/test/path');
    expect(out).toContain('Preset');
    expect(out).toContain('default');
    expect(out).toContain('Max files');
    expect(out).toContain('100,000'); // deterministic thousands separator
    expect(out).toContain('Max depth');
    expect(out).toContain('Hidden');
    expect(out).toContain('Formats');
    expect(out).toContain('json, markdown');
  });

  it('reports the loaded analyzer count', () => {
    const out = render(createTestConfig());
    expect(out).toContain('Analyzers');
    expect(out).toContain('12 loaded');
  });

  it('reports the knowledge pack count when provided', () => {
    const out = render(createTestConfig(), { knowledgePackCount: 6 });
    expect(out).toContain('Knowledge');
    expect(out).toContain('6 packs');
  });

  it('omits the knowledge row when no count is available', () => {
    const out = render(createTestConfig());
    expect(out).not.toContain('Knowledge');
  });

  it('uses the Unicode block logo when Unicode is supported', () => {
    setSymbolSet('unicode');
    const out = render(createTestConfig());
    expect(out).toContain('\u2588'); // block element
    expect(out).not.toContain('V E R I S');
  });

  it('falls back to an ASCII wordmark when Unicode is unavailable', () => {
    setSymbolSet('ascii');
    const out = render(createTestConfig());
    expect(out).toContain('V E R I S');
    expect(out).not.toContain('\u2588'); // no block elements
    expect(out).not.toContain('\u2014'); // no em-dash
  });

  it('wraps long values with aligned continuation lines', () => {
    setSymbolSet('ascii');
    const config = createTestConfig();
    const longTarget = '/very/long/path/'.repeat(12);
    const lines = renderStartupScreen({ ...config, target: longTarget });
    const out = lines.join('\n');
    // The value is fully present (wrapped, not truncated)
    expect(out).toContain(longTarget.slice(0, 40));
    expect(out).toContain(longTarget.slice(-40));
    // Continuation lines are indented to the value column (3 + 14 + 2)
    expect(lines.some((l) => /^ {19}\S/.test(l))).toBe(true);
  });

  it('keeps the visible width of every line within the configured width', () => {
    setSymbolSet('ascii');
    const lines = renderStartupScreen(createTestConfig());
    const visible = (line: string): string => line.replace(/\x1b\[[0-9;]*m/g, '');
    for (const line of lines) {
      expect(visible(line).length).toBeLessThanOrEqual(100);
    }
  });
});

describe('DashboardRenderer startup integration', () => {
  let renderer: DashboardRenderer;
  let output: string[];
  let origWrite: typeof process.stdout.write;

  beforeEach(() => {
    renderer = new DashboardRenderer();
    output = [];
    origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((str: string) => {
      output.push(str);
      return true;
    }) as typeof process.stdout.write;
  });

  afterEach(() => {
    process.stdout.write = origWrite;
    renderer.dispose();
  });

  it('writes the startup screen with version and pack count', () => {
    const session = createScanSession(createTestConfig(), '2026-07-11T00:00:00.000Z');
    renderer.onStart(session, { knowledgePackCount: 6 });

    const joined = output.join('');
    expect(joined).toContain('VERIS v1.0.0');
    expect(joined).toContain('6 packs');
    expect(joined).toContain('12 loaded');
    expect(joined).toContain('Starting scan');
  });

  it('writes the startup screen without a pack count when none is given', () => {
    const session = createScanSession(createTestConfig(), '2026-07-11T00:00:00.000Z');
    renderer.onStart(session);

    const joined = output.join('');
    expect(joined).toContain('VERIS v1.0.0');
    expect(joined).not.toContain('Knowledge');
  });
});
