import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PluginDiagnosticsCollector } from '../src/diagnostics.js';
import { discoverPlugins } from '../src/discovery.js';

describe('Plugin Discovery', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'veris-plugin-discovery-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('discovers valid extractor and rule plugins via veris-plugin.json', async () => {
    const pluginsDir = path.join(tempRoot, 'plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });

    // Plugin 1: zebra-extractor
    const p1Dir = path.join(pluginsDir, 'zebra-extractor');
    fs.mkdirSync(p1Dir, { recursive: true });
    fs.writeFileSync(path.join(p1Dir, 'index.js'), 'export default { extract() {} };');
    fs.writeFileSync(
      path.join(p1Dir, 'veris-plugin.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        id: 'zebra-extractor',
        name: 'Zebra Extractor',
        version: '1.0.0',
        description: 'Zebra test extractor',
        author: 'Tester',
        license: 'MIT',
        engines: { veris: '^1.0.0' },
        type: 'extractor',
        entryPoint: './index.js',
        capabilities: ['core-types-read', 'target-read'],
      }),
    );

    // Plugin 2: alpha-rules
    const p2Dir = path.join(pluginsDir, 'alpha-rules');
    fs.mkdirSync(p2Dir, { recursive: true });
    fs.writeFileSync(path.join(p2Dir, 'index.js'), 'export default { rulePack: { id: "p" } };');
    fs.writeFileSync(
      path.join(p2Dir, 'veris-plugin.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        id: 'alpha-rules',
        name: 'Alpha Rules',
        version: '2.0.0',
        description: 'Alpha test rules',
        author: 'Tester',
        license: 'Apache-2.0',
        engines: { veris: '>=1.0.0' },
        type: 'rule-pack',
        entryPoint: './index.js',
        capabilities: ['core-types-read'],
      }),
    );

    const diagnostics = new PluginDiagnosticsCollector();
    const discovered = await discoverPlugins({ pluginsDir, hostVersion: '1.0.0' }, diagnostics);

    expect(discovered).toHaveLength(2);
    // Invariant: Deterministic sorting by ID
    expect(discovered[0].id).toBe('alpha-rules');
    expect(discovered[1].id).toBe('zebra-extractor');
    expect(diagnostics.hasErrors()).toBe(false);
  });

  it('discovers plugins via package.json with veris section', async () => {
    const pluginsDir = path.join(tempRoot, 'plugins');
    const pDir = path.join(pluginsDir, 'pkg-plugin');
    fs.mkdirSync(pDir, { recursive: true });
    fs.writeFileSync(path.join(pDir, 'main.js'), 'export default {};');
    fs.writeFileSync(
      path.join(pDir, 'package.json'),
      JSON.stringify({
        name: 'my-pkg-plugin',
        version: '1.5.0',
        description: 'Pkg description',
        author: 'Package Author',
        license: 'ISC',
        veris: {
          schemaVersion: '1.0.0',
          id: 'my-pkg-plugin',
          name: 'Package Plugin',
          engines: { veris: '^1.0.0' },
          type: 'extractor',
          entryPoint: './main.js',
          capabilities: ['core-types-read'],
        },
      }),
    );

    const discovered = await discoverPlugins({ pluginsDir, hostVersion: '1.2.0' });
    expect(discovered).toHaveLength(1);
    expect(discovered[0].id).toBe('my-pkg-plugin');
    expect(discovered[0].manifest.version).toBe('1.5.0');
    expect(discovered[0].manifest.author).toBe('Package Author');
  });

  it('discovers npm scoped plugins (@scope/name)', async () => {
    const pluginsDir = path.join(tempRoot, 'plugins');
    const scopedDir = path.join(pluginsDir, '@corp', 'scoped-plugin');
    fs.mkdirSync(scopedDir, { recursive: true });
    fs.writeFileSync(path.join(scopedDir, 'index.js'), 'export default {};');
    fs.writeFileSync(
      path.join(scopedDir, 'veris-plugin.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        id: '@corp/scoped-plugin',
        name: 'Scoped Plugin',
        version: '0.1.0',
        description: 'Scoped test',
        author: 'Corp',
        license: 'MIT',
        engines: { veris: '>=1.0.0' },
        type: 'extractor',
        entryPoint: './index.js',
        capabilities: ['core-types-read'],
      }),
    );

    const discovered = await discoverPlugins({ pluginsDir, hostVersion: '1.0.0' });
    expect(discovered).toHaveLength(1);
    expect(discovered[0].id).toBe('@corp/scoped-plugin');
  });

  it('rejects plugins whose host engine version does not satisfy manifest requirements', async () => {
    const pluginsDir = path.join(tempRoot, 'plugins');
    const pDir = path.join(pluginsDir, 'future-plugin');
    fs.mkdirSync(pDir, { recursive: true });
    fs.writeFileSync(path.join(pDir, 'index.js'), 'export default {};');
    fs.writeFileSync(
      path.join(pDir, 'veris-plugin.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        id: 'future-plugin',
        name: 'Future Plugin',
        version: '1.0.0',
        description: 'Requires v2',
        author: 'Future',
        license: 'MIT',
        engines: { veris: '>=2.0.0' },
        type: 'extractor',
        entryPoint: './index.js',
        capabilities: ['core-types-read'],
      }),
    );

    const diagnostics = new PluginDiagnosticsCollector();
    const discovered = await discoverPlugins({ pluginsDir, hostVersion: '1.0.0' }, diagnostics);

    expect(discovered).toHaveLength(0);
    expect(diagnostics.hasErrors()).toBe(true);
    expect(
      diagnostics
        .getBySeverity('error')
        .some((d) => d.code === 'PLUGIN_INCOMPATIBLE_VERIS_VERSION'),
    ).toBe(true);
  });

  it('rejects plugins with missing or escaping entry points', async () => {
    const pluginsDir = path.join(tempRoot, 'plugins');

    // Missing entry point
    const missingDir = path.join(pluginsDir, 'missing-entry');
    fs.mkdirSync(missingDir, { recursive: true });
    fs.writeFileSync(
      path.join(missingDir, 'veris-plugin.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        id: 'missing-entry-plugin',
        name: 'Missing Entry',
        version: '1.0.0',
        description: 'No file',
        author: 'Tester',
        license: 'MIT',
        engines: { veris: '^1.0.0' },
        type: 'extractor',
        entryPoint: './nonexistent.js',
        capabilities: ['core-types-read'],
      }),
    );

    // Escaping entry point (traversal attack)
    const escapeDir = path.join(pluginsDir, 'escape-entry');
    fs.mkdirSync(escapeDir, { recursive: true });
    fs.writeFileSync(
      path.join(escapeDir, 'veris-plugin.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        id: 'escape-entry-plugin',
        name: 'Escape Entry',
        version: '1.0.0',
        description: 'Escaping path',
        author: 'Tester',
        license: 'MIT',
        engines: { veris: '^1.0.0' },
        type: 'extractor',
        entryPoint: '../../../../outside.js',
        capabilities: ['core-types-read'],
      }),
    );

    const diagnostics = new PluginDiagnosticsCollector();
    const discovered = await discoverPlugins({ pluginsDir }, diagnostics);

    expect(discovered).toHaveLength(0);
    expect(diagnostics.getAll().some((d) => d.code === 'PLUGIN_ENTRY_POINT_NOT_FOUND')).toBe(true);
    expect(diagnostics.getAll().some((d) => d.code === 'PLUGIN_ENTRY_POINT_ESCAPE')).toBe(true);
  });

  it('ignores administratively disabled plugins', async () => {
    const pluginsDir = path.join(tempRoot, 'plugins');
    const pDir = path.join(pluginsDir, 'disabled-plugin');
    fs.mkdirSync(pDir, { recursive: true });
    fs.writeFileSync(path.join(pDir, 'index.js'), 'export default {};');
    fs.writeFileSync(
      path.join(pDir, 'veris-plugin.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        id: 'disabled-plugin',
        name: 'Disabled Plugin',
        version: '1.0.0',
        description: 'Disabled',
        author: 'Tester',
        license: 'MIT',
        engines: { veris: '^1.0.0' },
        type: 'extractor',
        entryPoint: './index.js',
        capabilities: ['core-types-read'],
      }),
    );

    const diagnostics = new PluginDiagnosticsCollector();
    const discovered = await discoverPlugins(
      { pluginsDir, disabledPluginIds: ['disabled-plugin'] },
      diagnostics,
    );

    expect(discovered).toHaveLength(0);
    expect(diagnostics.getAll().some((d) => d.code === 'PLUGIN_DISABLED')).toBe(true);
  });

  it('deduplicates plugin IDs giving precedence to higher priority search paths', async () => {
    const customDir = path.join(tempRoot, 'custom');
    const workspaceDir = path.join(tempRoot, 'workspace');
    const wsPluginsDir = path.join(workspaceDir, '.veris', 'plugins');

    fs.mkdirSync(customDir, { recursive: true });
    fs.mkdirSync(wsPluginsDir, { recursive: true });

    // In custom dir: version 2.0.0
    const customPlugin = path.join(customDir, 'common-plugin');
    fs.mkdirSync(customPlugin, { recursive: true });
    fs.writeFileSync(path.join(customPlugin, 'index.js'), 'export default {};');
    fs.writeFileSync(
      path.join(customPlugin, 'veris-plugin.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        id: 'common-plugin',
        name: 'Common Custom',
        version: '2.0.0',
        description: 'High precedence',
        author: 'Tester',
        license: 'MIT',
        engines: { veris: '^1.0.0' },
        type: 'extractor',
        entryPoint: './index.js',
        capabilities: ['core-types-read'],
      }),
    );

    // In workspace dir: version 1.0.0
    const wsPlugin = path.join(wsPluginsDir, 'common-plugin');
    fs.mkdirSync(wsPlugin, { recursive: true });
    fs.writeFileSync(path.join(wsPlugin, 'index.js'), 'export default {};');
    fs.writeFileSync(
      path.join(wsPlugin, 'veris-plugin.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        id: 'common-plugin',
        name: 'Common Workspace',
        version: '1.0.0',
        description: 'Lower precedence',
        author: 'Tester',
        license: 'MIT',
        engines: { veris: '^1.0.0' },
        type: 'extractor',
        entryPoint: './index.js',
        capabilities: ['core-types-read'],
      }),
    );

    const diagnostics = new PluginDiagnosticsCollector();
    const discovered = await discoverPlugins({ pluginsDir: customDir, workspaceDir }, diagnostics);

    expect(discovered).toHaveLength(1);
    expect(discovered[0].manifest.version).toBe('2.0.0');
    expect(diagnostics.getAll().some((d) => d.code === 'PLUGIN_DUPLICATE_IGNORED')).toBe(true);
  });
});
