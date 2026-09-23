import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Artifact } from '@veris/core';
import { ExtractorRegistry } from '@veris/extractors';
import { RuleRegistry } from '@veris/rules';

import { PluginHost } from '../src/host.js';

describe('Plugin Host Lifecycle & Orchestration', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'veris-plugin-host-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const dummyArtifact: Artifact = {
    id: 'art_host_test',
    sessionId: 'sess_1',
    parentId: null,
    type: 'file',
    normalizedPath: '/tmp/target.txt',
    size: 50,
    mimeType: 'text/plain',
    contentHash: { algorithm: 'sha-256', value: '123456' },
  };

  it('runs complete end-to-end lifecycle: discover, load, activate, register, and extract', async () => {
    const pluginsDir = path.join(tempRoot, 'plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });

    // 1. Create a real extractor plugin file
    const extDir = path.join(pluginsDir, 'demo-extractor');
    fs.mkdirSync(extDir, { recursive: true });
    fs.writeFileSync(
      path.join(extDir, 'index.mjs'),
      `
      let activated = false;
      let deactivated = false;
      export default {
        type: 'extractor',
        lifecycle: {
          onInit(ctx) {},
          onActivate(ctx) { activated = true; },
          onDeactivate() { deactivated = true; }
        },
        canExtract(ctx) { return true; },
        async extract(ctx) {
          return [
            { extractorId: 'demo-extractor', type: 'demo-flag', value: 'flag-value', confidence: 0.9 }
          ];
        }
      };
      `,
    );

    fs.writeFileSync(
      path.join(extDir, 'veris-plugin.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        id: 'demo-extractor',
        name: 'Demo Extractor',
        version: '1.0.0',
        description: 'Demonstration extractor',
        author: 'Tester',
        license: 'MIT',
        engines: { veris: '^1.0.0' },
        type: 'extractor',
        entryPoint: './index.mjs',
        capabilities: ['core-types-read', 'target-read'],
      }),
    );

    // 2. Create a real rule pack plugin file
    const ruleDir = path.join(pluginsDir, 'demo-rules');
    fs.mkdirSync(ruleDir, { recursive: true });
    fs.writeFileSync(
      path.join(ruleDir, 'index.mjs'),
      `
      export default {
        type: 'rule-pack',
        rulePack: {
          id: 'demo-rules',
          version: '1.0.0',
          description: 'Demo Rules',
          metadata: { author: 'Tester', tags: ['configuration'], severity: { min: 1, max: 10 } },
          rules: [
            {
              id: 'RULE-DEMO-001',
              packId: 'demo-rules',
              version: '1.0.0',
              name: 'Demo Rule 1',
              description: 'Demo check',
              severity: { level: 'low', score: 3.0 },
              taxonomyIds: ['config:demo'],
              metadata: { tags: ['configuration'] },
              matchLogic: {
                kind: 'single-behavior',
                behaviorTaxonomyId: 'config:demo',
                propertyMatcher: { path: 'enabled', operator: 'equals', value: true }
              }
            }
          ]
        }
      };
      `,
    );

    fs.writeFileSync(
      path.join(ruleDir, 'veris-plugin.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        id: 'demo-rules',
        name: 'Demo Rule Pack',
        version: '1.0.0',
        description: 'Demonstration rules',
        author: 'Tester',
        license: 'MIT',
        engines: { veris: '^1.0.0' },
        type: 'rule-pack',
        entryPoint: './index.mjs',
        capabilities: ['core-types-read'],
      }),
    );

    // 3. Instantiate host and execute discovery + loading
    const host = new PluginHost({ pluginsDir, hostVersion: '1.0.0' });

    const discovered = await host.discover();
    expect(discovered).toHaveLength(2);
    expect(discovered[0].id).toBe('demo-extractor');
    expect(discovered[1].id).toBe('demo-rules');

    const loaded = await host.loadAll();
    expect(loaded).toHaveLength(2);
    expect(host.getActivePlugins()).toHaveLength(2);

    // 4. Register extractors into ExtractorRegistry and run extraction
    const extractorRegistry = new ExtractorRegistry();
    const registeredExtractors = host.registerExtractors(extractorRegistry);
    expect(registeredExtractors).toBe(1);
    expect(extractorRegistry.size).toBe(1);

    const extractionResult = await extractorRegistry.extract({
      artifact: dummyArtifact,
      sessionId: 'sess_1',
      content: Buffer.from('demo file content'),
    });

    expect(extractionResult.features).toHaveLength(1);
    expect(extractionResult.features[0].extractorId).toBe('demo-extractor');
    expect(extractionResult.features[0].type).toBe('demo-flag');
    expect(extractionResult.features[0].value).toBe('flag-value');

    // 5. Register rule packs into RuleRegistry
    const ruleRegistry = new RuleRegistry();
    const registeredRules = host.registerRulePacks(ruleRegistry);
    expect(registeredRules).toBe(1);
    expect(ruleRegistry.size).toBe(1);
    expect(ruleRegistry.has('RULE-DEMO-001')).toBe(true);

    // 6. Test graceful deactivation via dispose()
    await host.dispose();
    expect(host.getActivePlugins()).toHaveLength(0);
    expect(host.getStateTracker('demo-extractor')?.status).toBe('deactivated');
  });
});
