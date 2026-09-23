/**
 * Tests verifying the Plugin Manifest Builder and contract validation.
 */

import { describe, expect, it } from 'vitest';

import {
  definePluginManifest,
  MANIFEST_SCHEMA_VERSION,
  PluginValidationError,
} from '../src/index.js';

describe('definePluginManifest', () => {
  it('creates an immutable, valid manifest with defaults', () => {
    const manifest = definePluginManifest({
      id: 'my-custom-extractor',
      name: 'Custom Extractor',
      version: '1.2.0',
      description: 'Parses proprietary test tokens',
      author: 'Security Team',
      type: 'extractor',
      capabilities: ['core-types-read', 'target-read'],
    });

    expect(manifest.schemaVersion).toBe(MANIFEST_SCHEMA_VERSION);
    expect(manifest.id).toBe('my-custom-extractor');
    expect(manifest.name).toBe('Custom Extractor');
    expect(manifest.version).toBe('1.2.0');
    expect(manifest.license).toBe('Apache-2.0');
    expect(manifest.entryPoint).toBe('./dist/index.js');
    expect(manifest.engines.veris).toBe('>=1.0.0 <3.0.0');
    expect(manifest.verisVersion).toBe('>=1.0.0 <3.0.0');
    expect(manifest.capabilities).toEqual(['core-types-read', 'target-read']);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.engines)).toBe(true);
    expect(Object.isFrozen(manifest.capabilities)).toBe(true);
  });

  it('accepts scoped package IDs', () => {
    const manifest = definePluginManifest({
      id: '@org/veris-token-extractor',
      name: 'Scoped Token Extractor',
      version: '0.1.0',
      description: 'Scoped extractor',
      author: 'Enterprise',
      type: 'extractor',
      capabilities: ['target-read'],
    });

    expect(manifest.id).toBe('@org/veris-token-extractor');
  });

  it('rejects invalid plugin IDs with informative errors', () => {
    expect(() =>
      definePluginManifest({
        id: 'INVALID_UPPERCASE',
        name: 'Bad ID Plugin',
        version: '1.0.0',
        description: 'Test',
        author: 'Dev',
        type: 'extractor',
        capabilities: ['core-types-read'],
      }),
    ).toThrowError(PluginValidationError);
  });

  it('rejects invalid semver versions', () => {
    expect(() =>
      definePluginManifest({
        id: 'valid-id',
        name: 'Bad Version',
        version: 'v1.0', // Non-semver
        description: 'Test',
        author: 'Dev',
        type: 'extractor',
        capabilities: ['core-types-read'],
      }),
    ).toThrowError(PluginValidationError);
  });

  it('rejects unknown capabilities', () => {
    expect(() =>
      definePluginManifest({
        id: 'valid-id',
        name: 'Bad Cap',
        version: '1.0.0',
        description: 'Test',
        author: 'Dev',
        type: 'extractor',
        capabilities: ['arbitrary-cloud-exec' as any],
      }),
    ).toThrowError(PluginValidationError);
  });

  it('rejects unsupported plugin types', () => {
    expect(() =>
      definePluginManifest({
        id: 'valid-id',
        name: 'Bad Type',
        version: '1.0.0',
        description: 'Test',
        author: 'Dev',
        type: 'exporter' as any, // Not supported in V2
        capabilities: ['core-types-read'],
      }),
    ).toThrowError(PluginValidationError);
  });

  it('preserves optional tags and supportedArtifactTypes', () => {
    const manifest = definePluginManifest({
      id: 'tagged-extractor',
      name: 'Tagged Extractor',
      version: '1.0.0',
      description: 'Test tags',
      author: 'Dev',
      type: 'extractor',
      capabilities: ['target-read'],
      supportedArtifactTypes: ['pe', 'elf'],
      tags: ['binary', 'native'],
    });

    expect(manifest.supportedArtifactTypes).toEqual(['pe', 'elf']);
    expect(manifest.tags).toEqual(['binary', 'native']);
  });
});
