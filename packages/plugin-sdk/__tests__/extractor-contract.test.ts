/**
 * Tests verifying the Extractor Plugin Contract and RawFeature boundary.
 */

import { describe, expect, it } from 'vitest';

import { customTokenExtractor } from '../examples/custom-extractor.js';
import {
  defineExtractorPlugin,
  definePluginManifest,
  PluginAuthoringError,
  type PluginExtractionContext,
  type PluginRawFeature,
} from '../src/index.js';

describe('Extractor Plugin Contract', () => {
  it('creates an immutable ExtractorPlugin object', () => {
    const manifest = definePluginManifest({
      id: 'unit-test-extractor',
      name: 'Unit Test Extractor',
      version: '1.0.0',
      description: 'Extractor for unit tests',
      author: 'Test Suite',
      type: 'extractor',
      capabilities: ['core-types-read', 'target-read'],
    });

    const plugin = defineExtractorPlugin({
      manifest,
      supportedArtifactTypes: ['text'],
      canExtract: (ctx) => ctx.artifact.size > 0,
      async extract(ctx: PluginExtractionContext): Promise<readonly PluginRawFeature[]> {
        return [
          {
            extractorId: manifest.id,
            type: 'test:feature',
            value: 'sample-value',
            confidence: 0.9,
          },
        ];
      },
    });

    expect(plugin.type).toBe('extractor');
    expect(plugin.manifest.id).toBe('unit-test-extractor');
    expect(Object.isFrozen(plugin)).toBe(true);
    expect(plugin.canExtract?.({ artifact: { size: 10 } } as any)).toBe(true);
  });

  it('rejects definition when manifest is not of type "extractor"', () => {
    const manifest = definePluginManifest({
      id: 'unit-test-rule-pack',
      name: 'Rule Pack',
      version: '1.0.0',
      description: 'Rule pack manifest',
      author: 'Test Suite',
      type: 'rule-pack',
      capabilities: ['core-types-read'],
    });

    expect(() =>
      defineExtractorPlugin({
        manifest,
        async extract() {
          return [];
        },
      }),
    ).toThrowError(PluginAuthoringError);
  });

  it('runs reference customTokenExtractor and produces factual RawFeatures only', async () => {
    const content = new TextEncoder().encode(
      '// Configuration file\nconst KEY = "SEC-TOKEN-0123456789ABCDEF";\n',
    );

    const mockContext: PluginExtractionContext = {
      artifact: {
        id: 'art-001',
        path: '/tmp/test.ts',
        name: 'test.ts',
        size: content.length,
      },
      content,
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      config: {},
    };

    expect(customTokenExtractor.canExtract?.(mockContext)).toBe(true);

    const features = await customTokenExtractor.extract(mockContext);

    expect(features).toHaveLength(1);
    const feature = features[0];

    // Factual feature properties
    expect(feature.extractorId).toBe('@example/custom-token-extractor');
    expect(feature.type).toBe('custom:security-token');
    expect(feature.value).toBe('SEC-TOKEN-0123456789ABCDEF');
    expect(feature.confidence).toBe(0.95);
    expect(feature.location?.offset).toBe(35);
    expect(feature.location?.length).toBe(26);

    // CRITICAL INVARIANT: Feature must NOT contain risk scores, findings, or CVE assignments
    expect((feature as any).riskScore).toBeUndefined();
    expect((feature as any).finding).toBeUndefined();
    expect((feature as any).severity).toBeUndefined();
  });
});
