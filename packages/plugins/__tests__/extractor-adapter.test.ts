import { describe, expect, it } from 'vitest';

import type { Artifact } from '@veris/core';
import type { ExtractionContext } from '@veris/extractors';

import { createExtractorAdapter } from '../src/adapters/extractor-adapter.js';
import { PluginDiagnosticsCollector } from '../src/diagnostics.js';
import { PluginStateTracker } from '../src/lifecycle.js';
import type { ExtractorPlugin, LoadedPlugin, PluginManifest } from '../src/types.js';

describe('Plugin Extractor Adapter', () => {
  const dummyArtifact: Artifact = {
    id: 'art_123',
    sessionId: 'sess_1',
    parentId: null,
    type: 'file',
    normalizedPath: '/tmp/test.bin',
    size: 100,
    mimeType: 'application/octet-stream',
    contentHash: { algorithm: 'sha-256', value: 'abcdef' },
  };

  function createMockLoadedExtractor(
    manifestOverrides: Partial<PluginManifest> = {},
    extractorOverrides: Partial<ExtractorPlugin> = {},
  ): { loaded: LoadedPlugin; stateTracker: PluginStateTracker } {
    const manifest: PluginManifest = {
      schemaVersion: '1.0.0',
      id: 'test-extractor',
      name: 'Test Extractor',
      version: '1.0.0',
      description: 'Test',
      author: 'Tester',
      license: 'MIT',
      engines: { veris: '^1.0.0' },
      type: 'extractor',
      entryPoint: './index.js',
      capabilities: ['core-types-read', 'target-read'],
      ...manifestOverrides,
    };

    const stateTracker = new PluginStateTracker(manifest.id);
    stateTracker.transitionTo('active');

    const instance: ExtractorPlugin = {
      type: 'extractor',
      extract: async () => [],
      ...extractorOverrides,
    };

    const loaded: LoadedPlugin = {
      id: manifest.id,
      manifest,
      directory: '/tmp/test-extractor',
      entryPointFile: '/tmp/test-extractor/index.js',
      instance,
      stateTracker,
    };

    return { loaded, stateTracker };
  }

  it('enforces capability boundary: strips content buffer if target-read capability is missing', async () => {
    let receivedContent: Buffer | null | undefined = undefined;

    const { loaded } = createMockLoadedExtractor(
      { capabilities: ['core-types-read'] }, // No 'target-read'
      {
        extract: async (ctx) => {
          receivedContent = ctx.content as Buffer | null;
          return [];
        },
      },
    );

    const adapter = createExtractorAdapter(loaded);
    const context: ExtractionContext = {
      artifact: dummyArtifact,
      sessionId: 'sess_1',
      content: Buffer.from('sensitive-file-content'),
    };

    await adapter.extract(context);
    expect(receivedContent).toBeNull();
  });

  it('allows content buffer when target-read capability is explicitly declared', async () => {
    let receivedContent: Buffer | null | undefined = undefined;

    const { loaded } = createMockLoadedExtractor(
      { capabilities: ['core-types-read', 'target-read'] },
      {
        extract: async (ctx) => {
          receivedContent = ctx.content as Buffer | null;
          return [];
        },
      },
    );

    const adapter = createExtractorAdapter(loaded);
    const buffer = Buffer.from('hello-world');
    const context: ExtractionContext = {
      artifact: dummyArtifact,
      sessionId: 'sess_1',
      content: buffer,
    };

    await adapter.extract(context);
    expect(receivedContent).toEqual(buffer);
  });

  it('sanitizes features and strictly rejects illegal findings or risk scores in raw features', async () => {
    const diagnostics = new PluginDiagnosticsCollector();
    const { loaded } = createMockLoadedExtractor(
      {},
      {
        extract: async () => [
          {
            extractorId: 'test-extractor',
            type: 'valid-token',
            value: 'token-abc',
            confidence: 0.95,
          },
          // Illegal: attempts to emit a finding
          {
            extractorId: 'test-extractor',
            type: 'malware-rule',
            value: 'bad',
            finding: { title: 'Trojan detected' },
            confidence: 1.0,
          } as any,
          // Illegal: attempts to inject risk score
          {
            extractorId: 'test-extractor',
            type: 'bad-score',
            value: 'bad',
            riskScore: 10,
            confidence: 1.0,
          } as any,
        ],
      },
    );

    const adapter = createExtractorAdapter(loaded, { diagnostics });
    const result = await adapter.extract({
      artifact: dummyArtifact,
      sessionId: 'sess_1',
      content: null,
    });

    expect(result.features).toHaveLength(1);
    expect(result.features[0].type).toBe('valid-token');
    expect(result.features[0].value).toBe('token-abc');

    expect(diagnostics.getAll().some((d) => d.code === 'PLUGIN_ILLEGAL_FINDING_FEATURE')).toBe(
      true,
    );
  });

  it('quarantines extractor plugin after 3 consecutive failures', async () => {
    const diagnostics = new PluginDiagnosticsCollector();
    const { loaded, stateTracker } = createMockLoadedExtractor(
      {},
      {
        extract: async () => {
          throw new Error('Parser crashed!');
        },
      },
    );

    const adapter = createExtractorAdapter(loaded, { diagnostics });
    const context: ExtractionContext = {
      artifact: dummyArtifact,
      sessionId: 'sess_1',
      content: null,
    };

    // Errors 1 and 2
    const res1 = await adapter.extract(context);
    expect(res1.features).toHaveLength(0);
    expect(stateTracker.status).toBe('active');

    const res2 = await adapter.extract(context);
    expect(res2.features).toHaveLength(0);
    expect(stateTracker.status).toBe('active');

    // Error 3: triggers auto-quarantine
    const res3 = await adapter.extract(context);
    expect(res3.features).toHaveLength(0);
    expect(stateTracker.status).toBe('quarantined');
    expect(stateTracker.canExecute()).toBe(false);

    // Call 4: should immediately skip without executing
    const res4 = await adapter.extract(context);
    expect(res4.diagnostics.skipped).toBe(true);
    expect(res4.diagnostics.skipReason).toContain('quarantined');
  });

  it('canExtract checks supportedArtifactTypes and stateTracker', () => {
    const { loaded, stateTracker } = createMockLoadedExtractor(
      { supportedArtifactTypes: ['executable'] },
      { canExtract: () => true },
    );

    const adapter = createExtractorAdapter(loaded);

    // File type does not match 'executable'
    expect(
      adapter.canExtract({
        artifact: dummyArtifact, // type: 'file'
        sessionId: 'sess_1',
        content: null,
      }),
    ).toBe(false);

    // Matches executable
    expect(
      adapter.canExtract({
        artifact: { ...dummyArtifact, type: 'executable' },
        sessionId: 'sess_1',
        content: null,
      }),
    ).toBe(true);

    // When quarantined, returns false immediately
    stateTracker.transitionTo('quarantined');
    expect(
      adapter.canExtract({
        artifact: { ...dummyArtifact, type: 'executable' },
        sessionId: 'sess_1',
        content: null,
      }),
    ).toBe(false);
  });
});
