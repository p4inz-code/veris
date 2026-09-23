/**
 * Comprehensive Adversarial Security & Hardening Test Suite for VERIS Plugins.
 *
 * Validates mitigations against all 25 threat vectors defined in Phase 9:
 * 1. Malicious finding injection
 * 2. Compromised manifest syntax error handling
 * 3. Path traversal in plugin ID
 * 4. Symlink directory escape
 * 5. Absolute path entry point escape
 * 6. Arbitrary / native module loading (.node, .exe)
 * 7. Malformed manifest schema validation
 * 8. Incompatible host version rejection
 * 9. Malicious raw feature values & NaN confidence sanitization
 * 10. ReDoS / invalid regex in Rule Pack matchers
 * 11. Executable functions hidden in Rule Pack AST
 * 12. Network capability rejection (offline-first policy)
 * 13. Process-spawn capability rejection
 * 14. Scoped context isolation (no secret leakage)
 * 15. Target-read capability boundary (content null without target-read)
 * 16. Resource exhaustion (feature count capping at 5,000 & string size truncation)
 * 17. Intentionally slow / hanging plugin timeout
 * 18. Consecutive error auto-quarantine (3-error threshold)
 * 19. Duplicate plugin ID precedence
 * 20. Deterministic plugin ordering (Unicode code point, locale-independent)
 * 21. Deterministic feature output ordering
 * 22. Cancellation token compliance
 * 23. Prototype poisoning in Rule Packs and features
 * 24. Circular structure rejection
 * 25. Accessor properties (getters/setters) in Rule Packs
 */

import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createArtifact } from '@veris/core';
import { CancellationTokenSource } from '@veris/shared';

import { createExtractorAdapter } from '../src/adapters/extractor-adapter.js';
import { adaptRulePackToRules } from '../src/adapters/rule-adapter.js';
import { PluginDiagnosticsCollector } from '../src/diagnostics.js';
import { discoverPlugins } from '../src/discovery.js';
import { PluginStateTracker } from '../src/lifecycle.js';
import { checkDeclarativePurity, loadPlugin } from '../src/loader.js';
import { sortPluginsDeterministically, validatePluginManifest } from '../src/manifest.js';
import type { DiscoveredPlugin, LoadedPlugin, PluginManifest } from '../src/types.js';

describe('Plugin Security & Hardening Suite (Phase 9)', () => {
  let tempDir: string;
  let pluginsDir: string;

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'veris-plugin-sec-'));
    pluginsDir = path.join(tempDir, 'plugins');
    await fsp.mkdir(pluginsDir, { recursive: true });
  });

  afterEach(async () => {
    await fsp.rm(tempDir, { recursive: true, force: true });
  });

  // Threat 1: Malicious finding injection into raw features
  it('Threat 1: rejects raw features attempting to inject findings, risk scores, or CVEs', async () => {
    const loaded = createMockLoadedPlugin('fake-extractor', 'extractor', {
      extract: async () => [
        { type: 'valid-token', value: 'secret123', confidence: 0.9 },
        { type: 'evil-finding', value: 'exploit', finding: { id: 'fake-finding' } },
        { type: 'evil-risk', value: 'exploit', riskScore: 10.0 },
        { type: 'evil-cve', value: 'exploit', cve: 'CVE-2024-9999' },
      ],
    });

    const diagnostics = new PluginDiagnosticsCollector();
    const adapter = createExtractorAdapter(loaded, { diagnostics });
    const artifact = createArtifact('file', 'test.js', 'console.log(1);');

    const result = await adapter.extract({ artifact, content: Buffer.from('test') });

    // Only the valid raw feature should remain; the 3 malicious ones must be discarded
    expect(result.features).toHaveLength(1);
    expect(result.features[0].type).toBe('valid-token');
    expect(diagnostics.getAll().some((d) => d.code === 'PLUGIN_ILLEGAL_FINDING_FEATURE')).toBe(
      true,
    );
  });

  // Threat 2: Compromised manifest syntax error handling
  it('Threat 2: gracefully handles corrupt manifest JSON without throwing unhandled exceptions', async () => {
    const badPluginDir = path.join(pluginsDir, 'corrupt-json-plugin');
    await fsp.mkdir(badPluginDir, { recursive: true });
    await fsp.writeFile(path.join(badPluginDir, 'veris-plugin.json'), '{ broken JSON !!@@#$');

    const diagnostics = new PluginDiagnosticsCollector();
    const discovered = await discoverPlugins({ pluginsDir }, diagnostics);

    expect(discovered).toHaveLength(0);
    expect(diagnostics.getAll().some((d) => d.code === 'PLUGIN_MANIFEST_SYNTAX_ERROR')).toBe(true);
  });

  // Threat 3: Path traversal in plugin ID
  it('Threat 3: rejects plugin IDs containing path traversal characters', () => {
    const badIds = [
      '../evil-plugin',
      '../../escape',
      'plugin/../../traversal',
      'plugin\\windows\\traversal',
      '.leading-dot',
      'trailing-dot.',
    ];

    for (const badId of badIds) {
      const res = validatePluginManifest({
        schemaVersion: '1.0.0',
        id: badId,
        name: 'Bad ID Plugin',
        version: '1.0.0',
        description: 'Test',
        author: 'Tester',
        license: 'Apache-2.0',
        engines: { veris: '>=1.0.0' },
        type: 'extractor',
        entryPoint: './index.js',
        capabilities: ['core-types-read'],
      });

      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.field === 'id')).toBe(true);
    }
  });

  // Threat 4: Symlink directory escape
  it('Threat 4: detects and blocks symlinks escaping the plugin directory', async () => {
    // Only test if symlink creation is permitted in the environment
    const outsideTarget = path.join(tempDir, 'outside-payload.js');
    await fsp.writeFile(outsideTarget, 'export default { type: "extractor" };', 'utf-8');

    const pluginDir = path.join(pluginsDir, 'symlink-plugin');
    await fsp.mkdir(pluginDir, { recursive: true });

    let symlinkCreated = false;
    try {
      await fsp.symlink(outsideTarget, path.join(pluginDir, 'symlink-entry.js'));
      symlinkCreated = true;
    } catch {
      // Symlinks may require elevated privileges on Windows; skip if not permitted
    }

    if (symlinkCreated) {
      await fsp.writeFile(
        path.join(pluginDir, 'veris-plugin.json'),
        JSON.stringify({
          schemaVersion: '1.0.0',
          id: 'symlink-plugin',
          name: 'Symlink Plugin',
          version: '1.0.0',
          description: 'Symlink escape attempt',
          author: 'Tester',
          license: 'Apache-2.0',
          engines: { veris: '>=1.0.0' },
          type: 'extractor',
          entryPoint: './symlink-entry.js',
          capabilities: ['core-types-read'],
        }),
      );

      const diagnostics = new PluginDiagnosticsCollector();
      const discovered = await discoverPlugins({ pluginsDir }, diagnostics);

      expect(discovered).toHaveLength(0);
      expect(diagnostics.getAll().some((d) => d.code === 'PLUGIN_ENTRY_POINT_ESCAPE')).toBe(true);
    }
  });

  // Threat 5: Absolute path entry point escape
  it('Threat 5: blocks absolute path entry points', async () => {
    const pluginDir = path.join(pluginsDir, 'abs-entry-plugin');
    await fsp.mkdir(pluginDir, { recursive: true });

    await fsp.writeFile(
      path.join(pluginDir, 'veris-plugin.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        id: 'abs-entry-plugin',
        name: 'Absolute Entry Plugin',
        version: '1.0.0',
        description: 'Absolute entry point',
        author: 'Tester',
        license: 'Apache-2.0',
        engines: { veris: '>=1.0.0' },
        type: 'extractor',
        entryPoint: process.platform === 'win32' ? 'C:\\Windows\\System32\\cmd.exe' : '/bin/sh',
        capabilities: ['core-types-read'],
      }),
    );

    const diagnostics = new PluginDiagnosticsCollector();
    const discovered = await discoverPlugins({ pluginsDir }, diagnostics);

    expect(discovered).toHaveLength(0);
    expect(diagnostics.getAll().some((d) => d.code === 'PLUGIN_ENTRY_POINT_ESCAPE')).toBe(true);
  });

  // Threat 6: Arbitrary / native module loading (.node, .exe)
  it('Threat 6: rejects entry points with non-JS file extensions', async () => {
    const pluginDir = path.join(pluginsDir, 'native-addon-plugin');
    await fsp.mkdir(pluginDir, { recursive: true });
    await fsp.writeFile(path.join(pluginDir, 'addon.node'), 'binary-data');

    await fsp.writeFile(
      path.join(pluginDir, 'veris-plugin.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        id: 'native-addon-plugin',
        name: 'Native Addon Plugin',
        version: '1.0.0',
        description: 'Native node addon attempt',
        author: 'Tester',
        license: 'Apache-2.0',
        engines: { veris: '>=1.0.0' },
        type: 'extractor',
        entryPoint: './addon.node',
        capabilities: ['core-types-read'],
      }),
    );

    const diagnostics = new PluginDiagnosticsCollector();
    const discovered = await discoverPlugins({ pluginsDir }, diagnostics);

    expect(discovered).toHaveLength(0);
    expect(
      diagnostics.getAll().some((d) => d.code === 'PLUGIN_INVALID_ENTRY_POINT_EXTENSION'),
    ).toBe(true);
  });

  // Threat 7: Malformed manifest schema validation
  it('Threat 7: enforces complete schema validation for missing required fields', () => {
    const res = validatePluginManifest({
      id: 'incomplete-plugin',
      // Missing name, version, author, license, engines, etc.
    });

    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThan(3);
  });

  // Threat 8: Incompatible host version rejection
  it('Threat 8: blocks plugins incompatible with host VERIS version', async () => {
    const pluginDir = path.join(pluginsDir, 'future-plugin');
    await fsp.mkdir(pluginDir, { recursive: true });
    await fsp.writeFile(path.join(pluginDir, 'index.js'), 'export default {};');
    await fsp.writeFile(
      path.join(pluginDir, 'veris-plugin.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        id: 'future-plugin',
        name: 'Future Plugin',
        version: '1.0.0',
        description: 'Requires v2',
        author: 'Tester',
        license: 'Apache-2.0',
        engines: { veris: '>=2.0.0' },
        type: 'extractor',
        entryPoint: './index.js',
        capabilities: ['core-types-read'],
      }),
    );

    const diagnostics = new PluginDiagnosticsCollector();
    const discovered = await discoverPlugins({ pluginsDir, hostVersion: '1.1.0' }, diagnostics);

    expect(discovered).toHaveLength(0);
    expect(diagnostics.getAll().some((d) => d.code === 'PLUGIN_INCOMPATIBLE_VERIS_VERSION')).toBe(
      true,
    );
  });

  // Threat 9: Malicious raw feature values & NaN confidence sanitization
  it('Threat 9: sanitizes NaN/infinite confidence scores and control characters in feature types', async () => {
    const loaded = createMockLoadedPlugin('sanitize-test', 'extractor', {
      extract: async () => [
        {
          type: 'dirty\x00\x1Ftype',
          value: 'value',
          confidence: Number.NaN, // Malicious NaN
        },
        {
          type: 'infinite-type',
          value: 'value',
          confidence: 999.0, // Out of bounds [0.0, 1.0]
        },
        {
          type: 'negative-type',
          value: 'value',
          confidence: -50.0, // Below 0.0
        },
      ],
    });

    const adapter = createExtractorAdapter(loaded);
    const artifact = createArtifact('file', 'test.js');
    const result = await adapter.extract({ artifact });

    expect(result.features[0].type).toBe('dirtytype');
    expect(result.features[0].confidence).toBe(1.0); // Default fallback for NaN

    const inf = result.features.find((f) => f.type === 'infinite-type');
    expect(inf?.confidence).toBe(1.0); // Clamped to max 1.0

    const neg = result.features.find((f) => f.type === 'negative-type');
    expect(neg?.confidence).toBe(0.0); // Clamped to min 0.0
  });

  // Threat 10: ReDoS / invalid regex in Rule Pack matchers
  it('Threat 10: rejects rule matchers with invalid regular expressions or oversized patterns', () => {
    const badRegexRulePack = {
      id: 'bad-regex-pack',
      name: 'Bad Regex',
      version: '1.0.0',
      description: 'Test',
      rules: [
        {
          id: 'R-001',
          name: 'Invalid Regex Rule',
          description: 'Tests broken regex',
          severity: { level: 'high', score: 8.0 },
          metadata: { tags: ['injection'] },
          matchLogic: {
            kind: 'single-behavior' as const,
            behaviorTaxonomyId: 'process:exec',
            propertyMatcher: {
              path: 'command',
              operator: 'regex' as const,
              value: '[a-z', // Broken syntax!
            },
          },
        },
      ],
    };

    expect(() => adaptRulePackToRules(badRegexRulePack as any)).toThrow(/Invalid regex pattern/);

    const oversizedRegexRulePack = {
      id: 'oversized-regex-pack',
      name: 'Oversized Regex',
      version: '1.0.0',
      description: 'Test',
      rules: [
        {
          id: 'R-002',
          name: 'Oversized Regex Rule',
          description: 'Tests oversized regex',
          severity: { level: 'high', score: 8.0 },
          metadata: { tags: ['injection'] },
          matchLogic: {
            kind: 'single-behavior' as const,
            behaviorTaxonomyId: 'process:exec',
            propertyMatcher: {
              path: 'command',
              operator: 'regex' as const,
              value: 'a'.repeat(1500), // Exceeds 1000 char limit
            },
          },
        },
      ],
    };

    expect(() => adaptRulePackToRules(oversizedRegexRulePack as any)).toThrow(
      /exceeds 1000 character maximum limit/,
    );
  });

  // Threat 11: Executable functions hidden in Rule Pack AST
  it('Threat 11: detects and rejects executable functions embedded in Rule Pack AST', () => {
    const maliciousRulePack = {
      id: 'evil-pack',
      name: 'Evil Pack',
      rules: [
        {
          id: 'R-001',
          name: 'Trojan Rule',
          evaluate: () => {
            // Malicious payload
            return true;
          },
        },
      ],
    };

    const purity = checkDeclarativePurity(maliciousRulePack);
    expect(purity.pure).toBe(false);
    expect(purity.violation).toContain('Executable function found');
  });

  // Threat 12: Network capability rejection (offline-first policy)
  it('Threat 12: rejects plugins requesting network capability under offline policy', async () => {
    const pluginDir = path.join(pluginsDir, 'network-plugin');
    await fsp.mkdir(pluginDir, { recursive: true });
    await fsp.writeFile(path.join(pluginDir, 'index.js'), 'export default {};');
    await fsp.writeFile(
      path.join(pluginDir, 'veris-plugin.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        id: 'network-plugin',
        name: 'Network Requester',
        version: '1.0.0',
        description: 'Attempts network access',
        author: 'Tester',
        license: 'Apache-2.0',
        engines: { veris: '>=1.0.0' },
        type: 'extractor',
        entryPoint: './index.js',
        capabilities: ['core-types-read', 'network'],
      }),
    );

    const diagnostics = new PluginDiagnosticsCollector();
    const discovered = await discoverPlugins({ pluginsDir }, diagnostics);

    expect(discovered).toHaveLength(0);
    expect(
      diagnostics.getAll().some((d) => d.code === 'PLUGIN_DANGEROUS_CAPABILITY_FORBIDDEN'),
    ).toBe(true);
  });

  // Threat 13: Process-spawn capability rejection
  it('Threat 13: rejects plugins requesting process-spawn capability', async () => {
    const pluginDir = path.join(pluginsDir, 'spawn-plugin');
    await fsp.mkdir(pluginDir, { recursive: true });
    await fsp.writeFile(path.join(pluginDir, 'index.js'), 'export default {};');
    await fsp.writeFile(
      path.join(pluginDir, 'veris-plugin.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        id: 'spawn-plugin',
        name: 'Process Spawner',
        version: '1.0.0',
        description: 'Attempts process spawning',
        author: 'Tester',
        license: 'Apache-2.0',
        engines: { veris: '>=1.0.0' },
        type: 'extractor',
        entryPoint: './index.js',
        capabilities: ['core-types-read', 'process-spawn'],
      }),
    );

    const diagnostics = new PluginDiagnosticsCollector();
    const discovered = await discoverPlugins({ pluginsDir }, diagnostics);

    expect(discovered).toHaveLength(0);
    expect(
      diagnostics.getAll().some((d) => d.code === 'PLUGIN_DANGEROUS_CAPABILITY_FORBIDDEN'),
    ).toBe(true);
  });

  // Threat 14: Scoped context isolation (no secret leakage)
  it('Threat 14: provides strictly scoped context with no environment variables or process objects', async () => {
    let capturedContext: any = null;

    const loaded = createMockLoadedPlugin('context-inspector', 'extractor', {
      extract: async (ctx: any) => {
        capturedContext = ctx;
        return [];
      },
    });

    const adapter = createExtractorAdapter(loaded);
    const artifact = createArtifact('file', 'test.txt');
    await adapter.extract({ artifact });

    expect(capturedContext).toBeDefined();
    // Verify no process, env, or global leaked into context
    expect(capturedContext.process).toBeUndefined();
    expect(capturedContext.env).toBeUndefined();
    expect(capturedContext.secrets).toBeUndefined();
    expect(Object.isFrozen(capturedContext)).toBe(true);
  });

  // Threat 15: Target-read capability boundary
  it('Threat 15: denies content buffer access when target-read capability is not declared', async () => {
    let receivedContent: Buffer | null = Buffer.from('placeholder');

    const loadedWithoutTargetRead = createMockLoadedPlugin(
      'no-target-read',
      'extractor',
      {
        extract: async (ctx: any) => {
          receivedContent = ctx.content;
          return [];
        },
      },
      ['core-types-read'], // 'target-read' deliberately omitted
    );

    const adapter = createExtractorAdapter(loadedWithoutTargetRead);
    const artifact = createArtifact('file', 'test.txt');
    await adapter.extract({
      artifact,
      content: Buffer.from('CONFIDENTIAL FILE CONTENT'),
    });

    // Content buffer must be null because target-read was not granted
    expect(receivedContent).toBeNull();
  });

  // Threat 16: Resource exhaustion (feature count capping & string size limit)
  it('Threat 16: truncates oversized feature emissions to protect against memory exhaustion', async () => {
    const loaded = createMockLoadedPlugin('bomb-plugin', 'extractor', {
      extract: async () => {
        const features = [];
        // Generate 6,000 features (exceeds 5,000 limit)
        for (let i = 0; i < 6000; i++) {
          features.push({ type: 'item', value: i, confidence: 1.0 });
        }
        return features;
      },
    });

    const diagnostics = new PluginDiagnosticsCollector();
    const adapter = createExtractorAdapter(loaded, { diagnostics });
    const artifact = createArtifact('file', 'test.txt');
    const result = await adapter.extract({ artifact });

    // Must be capped at exactly 5000 features
    expect(result.features).toHaveLength(5000);
    expect(diagnostics.getAll().some((d) => d.code === 'PLUGIN_FEATURE_LIMIT_EXCEEDED')).toBe(true);
  });

  // Threat 17: Intentionally slow / hanging plugin timeout
  it('Threat 17: terminates hanging plugins after timeout threshold', async () => {
    const loaded = createMockLoadedPlugin('slow-plugin', 'extractor', {
      extract: async () => {
        // Sleep for 2 seconds
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return [];
      },
    });

    const diagnostics = new PluginDiagnosticsCollector();
    // Set aggressive timeout of 100ms for test
    const adapter = createExtractorAdapter(loaded, { diagnostics, timeoutMs: 100 });
    const artifact = createArtifact('file', 'test.txt');

    const result = await adapter.extract({ artifact });

    expect(result.features).toHaveLength(0);
    expect(diagnostics.getAll().some((d) => d.code === 'PLUGIN_EXTRACTION_ERROR')).toBe(true);
    expect(diagnostics.getAll().some((d) => d.message.includes('timed out'))).toBe(true);
  });

  // Threat 18: Consecutive error auto-quarantine
  it('Threat 18: automatically quarantines plugin after 3 consecutive errors and blocks execution', async () => {
    const loaded = createMockLoadedPlugin('crashing-plugin', 'extractor', {
      extract: async () => {
        throw new Error('Fatal internal crash');
      },
    });

    const diagnostics = new PluginDiagnosticsCollector();
    const adapter = createExtractorAdapter(loaded, { diagnostics });
    const artifact = createArtifact('file', 'test.txt');

    // Run 1: Fails (error count: 1)
    await adapter.extract({ artifact });
    expect(loaded.stateTracker.status).toBe('active');
    expect(loaded.stateTracker.consecutiveErrors).toBe(1);

    // Run 2: Fails (error count: 2)
    await adapter.extract({ artifact });
    expect(loaded.stateTracker.status).toBe('active');
    expect(loaded.stateTracker.consecutiveErrors).toBe(2);

    // Run 3: Fails (error count: 3 -> quarantined!)
    await adapter.extract({ artifact });
    expect(loaded.stateTracker.status).toBe('quarantined');
    expect(loaded.stateTracker.canExecute()).toBe(false);
    expect(diagnostics.getAll().some((d) => d.code === 'PLUGIN_QUARANTINED')).toBe(true);

    // Run 4: Subsequent execution blocked immediately
    const run4 = await adapter.extract({ artifact });
    expect(run4.diagnostics.skipped).toBe(true);
    expect(run4.diagnostics.skipReason).toContain('quarantined');
  });

  // Threat 19: Duplicate plugin ID precedence
  it('Threat 19: ignores duplicate plugin IDs with warning diagnostic', async () => {
    const dirA = path.join(pluginsDir, 'dup-plugin-a');
    const dirB = path.join(pluginsDir, 'dup-plugin-b');
    await fsp.mkdir(dirA, { recursive: true });
    await fsp.mkdir(dirB, { recursive: true });

    await fsp.writeFile(path.join(dirA, 'index.js'), 'export default {};');
    await fsp.writeFile(path.join(dirB, 'index.js'), 'export default {};');

    const manifestContent = JSON.stringify({
      schemaVersion: '1.0.0',
      id: 'duplicate-id',
      name: 'Duplicate',
      version: '1.0.0',
      description: 'Test',
      author: 'Tester',
      license: 'Apache-2.0',
      engines: { veris: '>=1.0.0' },
      type: 'extractor',
      entryPoint: './index.js',
      capabilities: ['core-types-read'],
    });

    await fsp.writeFile(path.join(dirA, 'veris-plugin.json'), manifestContent);
    await fsp.writeFile(path.join(dirB, 'veris-plugin.json'), manifestContent);

    const diagnostics = new PluginDiagnosticsCollector();
    const discovered = await discoverPlugins({ pluginsDir }, diagnostics);

    expect(discovered).toHaveLength(1);
    expect(diagnostics.getAll().some((d) => d.code === 'PLUGIN_DUPLICATE_IGNORED')).toBe(true);
  });

  // Threat 20: Deterministic plugin ordering (Unicode code point, locale-independent)
  it('Threat 20: guarantees locale-independent Unicode code point ordering', () => {
    const list = [
      { id: 'plugin-z' },
      { id: 'plugin-a' },
      { id: 'plugin-B' },
      { id: 'plugin-1' },
      { id: 'plugin-0' },
    ];

    const sorted = sortPluginsDeterministically(list);
    const sortedIds = sorted.map((p) => p.id);

    expect(sortedIds).toEqual(['plugin-0', 'plugin-1', 'plugin-B', 'plugin-a', 'plugin-z']);
  });

  // Threat 21: Deterministic feature output ordering
  it('Threat 21: ensures extracted features are deterministically sorted regardless of emission order', async () => {
    const loaded = createMockLoadedPlugin('unordered-emitter', 'extractor', {
      extract: async () => [
        { type: 'zebra', value: '1', confidence: 0.5 },
        { type: 'apple', value: 'b', confidence: 0.9 },
        { type: 'apple', value: 'a', confidence: 0.9 },
        { type: 'beta', value: 'x', confidence: 0.8 },
      ],
    });

    const adapter = createExtractorAdapter(loaded);
    const artifact = createArtifact('file', 'test.js');
    const result = await adapter.extract({ artifact });

    const types = result.features.map((f) => `${f.type}:${f.value}`);
    expect(types).toEqual(['apple:a', 'apple:b', 'beta:x', 'zebra:1']);
  });

  // Threat 22: Cancellation token compliance
  it('Threat 22: respects cancellation token before and after extraction', async () => {
    const source = new CancellationTokenSource();
    source.cancel('Test cancellation');

    const loaded = createMockLoadedPlugin('cancel-plugin', 'extractor', {
      extract: async () => [{ type: 'should-not-reach', value: 1 }],
    });

    const adapter = createExtractorAdapter(loaded);
    const artifact = createArtifact('file', 'test.js');
    const result = await adapter.extract({ artifact, cancellationToken: source.token });

    expect(result.diagnostics.skipped).toBe(true);
    expect(result.diagnostics.skipReason).toBe('Cancellation requested');
    expect(result.features).toHaveLength(0);
  });

  // Threat 23: Prototype poisoning in Rule Packs and features
  it('Threat 23: detects and rejects prototype pollution attempts in Rule Packs', () => {
    const pollutedObject = JSON.parse('{"id": "polluted-pack", "__proto__": {"polluted": true}}');
    const purity = checkDeclarativePurity(pollutedObject);

    expect(purity.pure).toBe(false);
    expect(purity.violation).toContain('Forbidden prototype poisoning property');
  });

  // Threat 24: Circular structure rejection
  it('Threat 24: rejects circular structures without stack overflow', () => {
    const circularObj: any = { id: 'circular-pack', rules: [] };
    circularObj.self = circularObj;

    const purity = checkDeclarativePurity(circularObj);
    expect(purity.pure).toBe(false);
    expect(purity.violation).toContain('Circular structure detected');
  });

  // Threat 25: Accessor properties (getters/setters) in Rule Packs
  it('Threat 25: detects and rejects getter/setter properties in Rule Packs', () => {
    const getterObj = {
      id: 'getter-pack',
      rules: [],
      get evilPayload() {
        return 'executed';
      },
    };

    const purity = checkDeclarativePurity(getterObj);
    expect(purity.pure).toBe(false);
    expect(purity.violation).toContain('Accessor property (getter/setter)');
  });
});

/** Helper to construct a mock LoadedPlugin for unit testing */
function createMockLoadedPlugin(
  id: string,
  type: 'extractor' | 'rule-pack',
  instance: any,
  capabilities: readonly string[] = ['core-types-read', 'target-read'],
): LoadedPlugin {
  const manifest: PluginManifest = {
    schemaVersion: '1.0.0',
    id,
    name: id,
    version: '1.0.0',
    description: 'Mock plugin for testing',
    author: 'VERIS Test',
    license: 'Apache-2.0',
    engines: { veris: '>=1.0.0' },
    type,
    entryPoint: './index.js',
    capabilities: capabilities as any,
  };

  const stateTracker = new PluginStateTracker(id);
  stateTracker.transitionTo('active');

  return {
    id,
    manifest,
    directory: '/mock/path',
    entryPointFile: '/mock/path/index.js',
    instance,
    stateTracker,
  };
}
