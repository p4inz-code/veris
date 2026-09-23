import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CancellationToken } from '@veris/shared';

import { PluginDiagnosticsCollector } from '../src/diagnostics.js';
import { checkDeclarativePurity, loadPlugin } from '../src/loader.js';
import type { DiscoveredPlugin, PluginContext } from '../src/types.js';

describe('Plugin Loader', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'veris-plugin-loader-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  function createTestContext(pluginId: string): PluginContext {
    return {
      pluginId,
      verisVersion: '1.0.0',
      config: {},
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      cancellationToken: new CancellationToken(),
    };
  }

  it('successfully loads an ExtractorPlugin and invokes onInit() hook', async () => {
    const pluginDir = path.join(tempRoot, 'extractor-plugin');
    fs.mkdirSync(pluginDir, { recursive: true });
    const entryPoint = path.join(pluginDir, 'index.mjs');

    fs.writeFileSync(
      entryPoint,
      `
      let initialized = false;
      export default {
        type: 'extractor',
        lifecycle: {
          onInit(ctx) {
            initialized = true;
          }
        },
        canExtract(ctx) { return true; },
        async extract(ctx) {
          return [{ extractorId: 'test-extractor', type: 'custom', value: 42, confidence: 1.0 }];
        }
      };
      `,
    );

    const discovered: DiscoveredPlugin = {
      id: 'test-extractor',
      manifest: {
        schemaVersion: '1.0.0',
        id: 'test-extractor',
        name: 'Test Extractor',
        version: '1.0.0',
        description: 'Test',
        author: 'Tester',
        license: 'MIT',
        engines: { veris: '^1.0.0' },
        type: 'extractor',
        entryPoint: './index.mjs',
        capabilities: ['core-types-read'],
      },
      manifestPath: path.join(pluginDir, 'veris-plugin.json'),
      directory: pluginDir,
      entryPointFile: entryPoint,
    };

    const diagnostics = new PluginDiagnosticsCollector();
    const loaded = await loadPlugin(discovered, createTestContext('test-extractor'), diagnostics);

    expect(loaded).not.toBeNull();
    expect(loaded!.stateTracker.status).toBe('initialized');
    expect(diagnostics.hasErrors()).toBe(false);
  });

  it('rejects an extractor plugin that fails to implement extract() method', async () => {
    const pluginDir = path.join(tempRoot, 'bad-extractor');
    fs.mkdirSync(pluginDir, { recursive: true });
    const entryPoint = path.join(pluginDir, 'index.mjs');

    fs.writeFileSync(
      entryPoint,
      `
      export default {
        type: 'extractor',
        // Missing extract() method
      };
      `,
    );

    const discovered: DiscoveredPlugin = {
      id: 'bad-extractor',
      manifest: {
        schemaVersion: '1.0.0',
        id: 'bad-extractor',
        name: 'Bad Extractor',
        version: '1.0.0',
        description: 'Bad',
        author: 'Tester',
        license: 'MIT',
        engines: { veris: '^1.0.0' },
        type: 'extractor',
        entryPoint: './index.mjs',
        capabilities: ['core-types-read'],
      },
      manifestPath: path.join(pluginDir, 'veris-plugin.json'),
      directory: pluginDir,
      entryPointFile: entryPoint,
    };

    const diagnostics = new PluginDiagnosticsCollector();
    const loaded = await loadPlugin(discovered, createTestContext('bad-extractor'), diagnostics);

    expect(loaded).toBeNull();
    expect(diagnostics.getAll().some((d) => d.code === 'PLUGIN_EXTRACTOR_CONTRACT_VIOLATION')).toBe(
      true,
    );
  });

  it('enforces declarative purity: rejects rule pack with functions', async () => {
    const pluginDir = path.join(tempRoot, 'impure-rules');
    fs.mkdirSync(pluginDir, { recursive: true });
    const entryPoint = path.join(pluginDir, 'index.mjs');

    fs.writeFileSync(
      entryPoint,
      `
      export default {
        type: 'rule-pack',
        rulePack: {
          id: 'impure-pack',
          version: '1.0.0',
          description: 'Impure',
          metadata: { author: 'Tester', tags: [], severity: { min: 1, max: 10 } },
          rules: [
            {
              id: 'rule-1',
              packId: 'impure-pack',
              version: '1.0.0',
              name: 'Rule 1',
              description: 'Desc',
              severity: { level: 'high', score: 8.0 },
              taxonomyIds: ['exec'],
              metadata: {},
              matchLogic: {
                kind: 'single-behavior',
                behaviorTaxonomyId: 'exec',
                propertyMatcher: {
                  path: 'cmd',
                  operator: 'equals',
                  value: () => 'malicious_eval', // Forbidden function!
                }
              }
            }
          ]
        }
      };
      `,
    );

    const discovered: DiscoveredPlugin = {
      id: 'impure-rules',
      manifest: {
        schemaVersion: '1.0.0',
        id: 'impure-rules',
        name: 'Impure Rules',
        version: '1.0.0',
        description: 'Rules with code',
        author: 'Tester',
        license: 'MIT',
        engines: { veris: '^1.0.0' },
        type: 'rule-pack',
        entryPoint: './index.mjs',
        capabilities: ['core-types-read'],
      },
      manifestPath: path.join(pluginDir, 'veris-plugin.json'),
      directory: pluginDir,
      entryPointFile: entryPoint,
    };

    const diagnostics = new PluginDiagnosticsCollector();
    const loaded = await loadPlugin(discovered, createTestContext('impure-rules'), diagnostics);

    expect(loaded).toBeNull();
    expect(diagnostics.getAll().some((d) => d.code === 'PLUGIN_RULE_NOT_DECLARATIVE')).toBe(true);
  });

  it('traps onInit() exception and transitions plugin to failed', async () => {
    const pluginDir = path.join(tempRoot, 'failing-init');
    fs.mkdirSync(pluginDir, { recursive: true });
    const entryPoint = path.join(pluginDir, 'index.mjs');

    fs.writeFileSync(
      entryPoint,
      `
      export default {
        type: 'extractor',
        lifecycle: {
          onInit() {
            throw new Error('Initialization crash!');
          }
        },
        extract: async () => []
      };
      `,
    );

    const discovered: DiscoveredPlugin = {
      id: 'failing-init',
      manifest: {
        schemaVersion: '1.0.0',
        id: 'failing-init',
        name: 'Failing Init',
        version: '1.0.0',
        description: 'Fails in init',
        author: 'Tester',
        license: 'MIT',
        engines: { veris: '^1.0.0' },
        type: 'extractor',
        entryPoint: './index.mjs',
        capabilities: ['core-types-read'],
      },
      manifestPath: path.join(pluginDir, 'veris-plugin.json'),
      directory: pluginDir,
      entryPointFile: entryPoint,
    };

    const diagnostics = new PluginDiagnosticsCollector();
    const loaded = await loadPlugin(discovered, createTestContext('failing-init'), diagnostics);

    expect(loaded).toBeNull();
    expect(diagnostics.getAll().some((d) => d.code === 'PLUGIN_INIT_FAILED')).toBe(true);
  });

  describe('checkDeclarativePurity', () => {
    it('approves purely declarative objects, arrays, primitives', () => {
      const ast = {
        id: 'rule-1',
        score: 7.5,
        enabled: true,
        tags: ['net', 'cve'],
        sub: { deep: null },
      };
      expect(checkDeclarativePurity(ast).pure).toBe(true);
    });

    it('rejects functions and symbols in nested structures', () => {
      expect(checkDeclarativePurity({ fn: () => {} }).pure).toBe(false);
      expect(checkDeclarativePurity({ nested: [{ s: Symbol('test') }] }).pure).toBe(false);
    });
  });
});
