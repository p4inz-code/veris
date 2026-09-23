/**
 * Reference Example: Custom Extractor Plugin
 *
 * Demonstrates authoring a factual, deterministic extractor plugin using @veris/plugin-sdk.
 *
 * Invariant: Extractors emit raw factual features only (PluginRawFeature[]).
 * They NEVER produce Findings, assign CVEs, or calculate Risk scores.
 *
 * @module @veris/plugin-sdk/examples/custom-extractor
 */

import {
  defineExtractorPlugin,
  definePluginManifest,
  type ExtractorPlugin,
  type PluginExtractionContext,
  type PluginRawFeature,
} from '../src/index.js';

// 1. Define the plugin manifest
export const manifest = definePluginManifest({
  id: '@example/custom-token-extractor',
  name: 'Custom Token Extractor',
  version: '1.0.0',
  description: 'Extracts proprietary security tokens and identifiers from configuration files.',
  author: 'Security Engineering Team',
  license: 'Apache-2.0',
  type: 'extractor',
  verisVersion: '>=1.0.0 <3.0.0',
  capabilities: ['core-types-read', 'target-read', 'custom-feature', 'metadata-extract'],
  supportedArtifactTypes: ['config', 'text', 'json'],
  tags: ['token', 'secrets', 'config'],
});

// 2. Implement the extractor contract
export const customTokenExtractor: ExtractorPlugin = defineExtractorPlugin({
  manifest,
  supportedArtifactTypes: ['config', 'text', 'json'],

  canExtract(context: PluginExtractionContext): boolean {
    // Fast, synchronous heuristic check (no I/O)
    return context.artifact.size > 0 && context.artifact.size < 10 * 1024 * 1024;
  },

  async extract(context: PluginExtractionContext): Promise<readonly PluginRawFeature[]> {
    const features: PluginRawFeature[] = [];

    if (!context.content) {
      return features;
    }

    // Decode content deterministically
    const text = new TextDecoder('utf-8', { fatal: false }).decode(context.content);

    // Scan for token pattern
    const pattern = /SEC-TOKEN-[A-Z0-9]{16}/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      if (context.cancellationToken?.isCancellationRequested) {
        break;
      }

      features.push({
        extractorId: manifest.id,
        type: 'custom:security-token',
        value: match[0],
        confidence: 0.95,
        location: {
          offset: match.index,
          length: match[0].length,
        },
        metadata: {
          tokenPrefix: 'SEC-TOKEN',
          matchedLength: match[0].length,
        },
      });
    }

    return Object.freeze(features);
  },
});
