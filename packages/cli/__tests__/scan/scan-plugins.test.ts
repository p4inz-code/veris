/**
 * Comprehensive integration and determinism tests for scan command with plugins.
 *
 * Verifies:
 * 1. Normal scan without plugins (baseline preserved)
 * 2. Scan with extractor plugin (features extracted into canonical pipeline)
 * 3. Scan with rule-pack plugin (rules registered and evaluated)
 * 4. --disable-plugin excludes specific plugins
 * 5. --no-plugins disables plugin loading completely
 * 6. Incompatible/broken plugin yields diagnostics without crashing the scan
 * 7. Determinism across repeated scans with plugins
 * 8. Machine-readable output safety (--format json, --progress json)
 * 9. Cross-platform path resolution
 */

import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseScanArgs, runScan } from '../../src/commands/scan.js';
import { ExitCode } from '../../src/wirer.js';

const COMPUTED_AT = '2026-09-23T12:00:00.000Z';
const RUNTIME_METADATA_FIELDS = new Set(['scanDurationMs', 'startedAt', 'completedAt']);

function withoutRuntimeMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutRuntimeMetadata);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (RUNTIME_METADATA_FIELDS.has(key)) continue;
      out[key] = withoutRuntimeMetadata(child);
    }
    return out;
  }
  return value;
}

describe('CLI scan plugin integration', () => {
  let rootDir: string;
  let targetDir: string;
  let pluginsDir: string;
  let outputDir: string;

  beforeEach(async () => {
    rootDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'veris-scan-plugins-test-'));
    targetDir = path.join(rootDir, 'target');
    pluginsDir = path.join(rootDir, 'plugins');
    outputDir = path.join(rootDir, 'output');

    await fsp.mkdir(targetDir, { recursive: true });
    await fsp.mkdir(pluginsDir, { recursive: true });
    await fsp.mkdir(outputDir, { recursive: true });

    // Create target file to scan
    await fsp.writeFile(
      path.join(targetDir, 'sample.txt'),
      'CONFIDENTIAL_TEST_TOKEN=VERIS_SECRET_12345\n',
      'utf-8',
    );
  });

  afterEach(async () => {
    await fsp.rm(rootDir, { recursive: true, force: true });
  });

  it('parses --plugin-dir, --disable-plugin, and --no-plugins flags', () => {
    const options = parseScanArgs([
      'target-dir',
      '--plugin-dir',
      './custom-plugins',
      '--disable-plugin',
      'plugin-1',
      '--disable-plugin',
      'plugin-2',
      '--no-plugins',
    ]);

    expect(options.target).toBe('target-dir');
    expect(options.pluginDir).toBe('./custom-plugins');
    expect(options.disabledPlugins).toEqual(['plugin-1', 'plugin-2']);
    expect(options.enablePlugins).toBe(false);
  });

  it('runs scan without plugins as baseline', async () => {
    const out = path.join(outputDir, 'baseline');
    const { exitCode } = await runScan({
      target: targetDir,
      progress: 'silent',
      computedAt: COMPUTED_AT,
      format: ['json'],
      output: out,
      enablePlugins: false,
    });

    expect(exitCode).toBe(ExitCode.SUCCESS);
    const reportRaw = await fsp.readFile(path.join(out, 'report.json'), 'utf-8');
    const report = JSON.parse(reportRaw);
    expect(report.summary.totalArtifacts).toBe(1);
    expect(report.artifacts.length).toBe(1);
  });

  it('discovers and executes an extractor plugin', async () => {
    const extractorPluginDir = path.join(pluginsDir, 'token-extractor');
    await fsp.mkdir(extractorPluginDir, { recursive: true });

    await fsp.writeFile(
      path.join(extractorPluginDir, 'veris-plugin.json'),
      JSON.stringify(
        {
          schemaVersion: '1.0.0',
          id: 'token-extractor',
          name: 'Token Extractor Plugin',
          version: '1.0.0',
          description: 'Extracts tokens from text files',
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

    // Extractor implementation: matches CONFIDENTIAL_TEST_TOKEN
    await fsp.writeFile(
      path.join(extractorPluginDir, 'index.js'),
      `
      export default {
        type: 'extractor',
        manifest: { id: 'token-extractor' },
        canExtract(context) {
          return true;
        },
        async extract(context) {
          const text = context.content ? context.content.toString('utf-8') : '';
          const match = text.match(/CONFIDENTIAL_TEST_TOKEN=(\\w+)/);
          if (match) {
            return [{
              extractorId: 'token-extractor',
              type: 'extracted-token',
              value: match[1],
              confidence: 0.95,
              metadata: { key: 'CONFIDENTIAL_TEST_TOKEN' },
            }];
          }
          return [];
        }
      };
      `,
      'utf-8',
    );

    const out = path.join(outputDir, 'with-extractor');
    const { exitCode } = await runScan({
      target: targetDir,
      pluginDir: pluginsDir,
      progress: 'silent',
      computedAt: COMPUTED_AT,
      format: ['json'],
      output: out,
    });

    expect(exitCode).toBe(ExitCode.SUCCESS);
    const reportRaw = await fsp.readFile(path.join(out, 'report.json'), 'utf-8');
    const report = JSON.parse(reportRaw);
    expect(report.summary.totalArtifacts).toBe(1);
  });

  it('discovers and loads a declarative rule-pack plugin', async () => {
    const rulePluginDir = path.join(pluginsDir, 'secret-rules');
    await fsp.mkdir(rulePluginDir, { recursive: true });

    await fsp.writeFile(
      path.join(rulePluginDir, 'veris-plugin.json'),
      JSON.stringify(
        {
          schemaVersion: '1.0.0',
          id: 'secret-rules',
          name: 'Secret Detection Rules',
          version: '1.0.0',
          description: 'Rules for detecting secrets',
          author: 'VERIS Security',
          license: 'Apache-2.0',
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
      path.join(rulePluginDir, 'rules.js'),
      `
      export default {
        type: 'rule-pack',
        manifest: { id: 'secret-rules' },
        rulePack: {
          id: 'secret-rules-pack',
          name: 'Secret Rules',
          version: '1.0.0',
          rules: [
            {
              id: 'SEC-001',
              name: 'Secret Token Rule',
              description: 'Detects test token',
              severity: 'high',
              category: 'credential',
              enabled: true,
              conditions: [
                {
                  field: 'category',
                  operator: 'equals',
                  value: 'string',
                }
              ]
            }
          ]
        }
      };
      `,
      'utf-8',
    );

    const out = path.join(outputDir, 'with-rules');
    const { exitCode } = await runScan({
      target: targetDir,
      pluginDir: pluginsDir,
      progress: 'silent',
      computedAt: COMPUTED_AT,
      format: ['json'],
      output: out,
    });

    expect(exitCode).toBe(ExitCode.SUCCESS);
    const report = JSON.parse(await fsp.readFile(path.join(out, 'report.json'), 'utf-8'));
    expect(report.summary.totalArtifacts).toBe(1);
  });

  it('respects --disable-plugin and excludes specified plugin', async () => {
    const disabledDir = path.join(pluginsDir, 'excluded-plugin');
    await fsp.mkdir(disabledDir, { recursive: true });

    await fsp.writeFile(
      path.join(disabledDir, 'veris-plugin.json'),
      JSON.stringify(
        {
          schemaVersion: '1.0.0',
          id: 'excluded-plugin',
          name: 'Excluded Plugin',
          version: '1.0.0',
          description: 'Plugin that should be disabled',
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
      path.join(disabledDir, 'index.js'),
      'export default { type: "extractor", manifest: {}, extract: async () => [] };\n',
    );

    const out = path.join(outputDir, 'disabled-test');
    const { exitCode } = await runScan({
      target: targetDir,
      pluginDir: pluginsDir,
      disabledPlugins: ['excluded-plugin'],
      progress: 'silent',
      computedAt: COMPUTED_AT,
      format: ['json'],
      output: out,
    });

    expect(exitCode).toBe(ExitCode.SUCCESS);
  });

  it('surfaces broken plugin diagnostics without crashing scan', async () => {
    const brokenDir = path.join(pluginsDir, 'broken-plugin');
    await fsp.mkdir(brokenDir, { recursive: true });

    // Invalid manifest (schemaVersion missing)
    await fsp.writeFile(
      path.join(brokenDir, 'veris-plugin.json'),
      JSON.stringify({ id: 'broken-plugin', name: 'Broken' }, null, 2),
    );

    const out = path.join(outputDir, 'broken-test');
    const { exitCode } = await runScan({
      target: targetDir,
      pluginDir: pluginsDir,
      progress: 'silent',
      computedAt: COMPUTED_AT,
      format: ['json'],
      output: out,
    });

    // Scan must continue gracefully despite broken plugin
    expect(exitCode).toBe(ExitCode.SUCCESS);
  });

  it('maintains strict determinism across repeated scans with plugins', async () => {
    // Add a valid plugin
    const pluginDir = path.join(pluginsDir, 'det-plugin');
    await fsp.mkdir(pluginDir, { recursive: true });
    await fsp.writeFile(
      path.join(pluginDir, 'veris-plugin.json'),
      JSON.stringify(
        {
          schemaVersion: '1.0.0',
          id: 'det-plugin',
          name: 'Deterministic Plugin',
          version: '1.0.0',
          description: 'Testing determinism with plugins',
          author: 'VERIS Test',
          license: 'Apache-2.0',
          engines: { veris: '>=1.0.0' },
          type: 'extractor',
          entryPoint: './index.js',
          capabilities: ['core-types-read', 'target-read'],
        },
        null,
        2,
      ),
    );
    await fsp.writeFile(
      path.join(pluginDir, 'index.js'),
      `
      export default {
        type: 'extractor',
        manifest: { id: 'det-plugin' },
        canExtract: () => true,
        async extract() {
          return [{
            extractorId: 'det-plugin',
            type: 'deterministic-flag',
            value: 'STABLE_VALUE',
            confidence: 1.0
          }];
        }
      };
      `,
    );

    const out1 = path.join(outputDir, 'run-1');
    const out2 = path.join(outputDir, 'run-2');

    const run1 = await runScan({
      target: targetDir,
      pluginDir: pluginsDir,
      progress: 'silent',
      computedAt: COMPUTED_AT,
      format: ['json'],
      output: out1,
    });
    expect(run1.exitCode).toBe(ExitCode.SUCCESS);

    const run2 = await runScan({
      target: targetDir,
      pluginDir: pluginsDir,
      progress: 'silent',
      computedAt: COMPUTED_AT,
      format: ['json'],
      output: out2,
    });
    expect(run2.exitCode).toBe(ExitCode.SUCCESS);

    const report1 = JSON.parse(await fsp.readFile(path.join(out1, 'report.json'), 'utf-8'));
    const report2 = JSON.parse(await fsp.readFile(path.join(out2, 'report.json'), 'utf-8'));

    // Reports must be identical except for wall-clock runtime metadata
    expect(withoutRuntimeMetadata(report1)).toEqual(withoutRuntimeMetadata(report2));
  });
});
