/**
 * Tests verifying versioning, semver compatibility, and schema versions in the SDK.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_COMPATIBLE_VERIS_RANGE,
  definePluginManifest,
  MANIFEST_SCHEMA_VERSION,
  SDK_VERSION,
} from '../src/index.js';

describe('SDK Version & Compatibility Contract', () => {
  it('defines valid semver constants conforming to SemVer 2.0', () => {
    expect(SDK_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(MANIFEST_SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(DEFAULT_COMPATIBLE_VERIS_RANGE).toContain('>=1.0.0');
    expect(DEFAULT_COMPATIBLE_VERIS_RANGE).toContain('<3.0.0');
  });

  it('assigns DEFAULT_COMPATIBLE_VERIS_RANGE when no custom range is provided', () => {
    const manifest = definePluginManifest({
      id: 'compat-default-plugin',
      name: 'Default Range Plugin',
      version: '1.0.0',
      description: 'Tests default engine range',
      author: 'QA',
      type: 'extractor',
      capabilities: ['core-types-read'],
    });

    expect(manifest.engines.veris).toBe(DEFAULT_COMPATIBLE_VERIS_RANGE);
    expect(manifest.verisVersion).toBe(DEFAULT_COMPATIBLE_VERIS_RANGE);
  });

  it('preserves custom verisVersion ranges when explicitly declared', () => {
    const customRange = '>=2.0.0 <2.5.0';
    const manifest = definePluginManifest({
      id: 'custom-compat-plugin',
      name: 'Custom Range Plugin',
      version: '1.0.0',
      description: 'Tests custom range',
      author: 'QA',
      type: 'extractor',
      verisVersion: customRange,
      capabilities: ['core-types-read'],
    });

    expect(manifest.engines.veris).toBe(customRange);
    expect(manifest.verisVersion).toBe(customRange);
  });
});
