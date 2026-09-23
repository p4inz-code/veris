/**
 * Tests verifying the public API boundary and zero-runtime-dependency invariant.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import * as SDK from '../src/index.js';

describe('SDK Public API Boundary', () => {
  it('declares exactly zero runtime dependencies in package.json', () => {
    const pkgPath = resolve(__dirname, '../package.json');
    const pkgJson = JSON.parse(readFileSync(pkgPath, 'utf-8'));

    expect(pkgJson.dependencies).toBeDefined();
    expect(Object.keys(pkgJson.dependencies)).toHaveLength(0);
  });

  it('exports all expected public builders, constants, and errors', () => {
    // Builders
    expect(typeof SDK.definePluginManifest).toBe('function');
    expect(typeof SDK.defineExtractorPlugin).toBe('function');
    expect(typeof SDK.defineRulePackPlugin).toBe('function');

    // Constants
    expect(SDK.SDK_VERSION).toBe('0.1.0');
    expect(SDK.MANIFEST_SCHEMA_VERSION).toBe('1.0.0');
    expect(SDK.DEFAULT_COMPATIBLE_VERIS_RANGE).toBe('>=1.0.0 <3.0.0');
    expect(Array.isArray(SDK.ALL_CAPABILITIES)).toBe(true);
    expect(Array.isArray(SDK.SAFE_CAPABILITIES)).toBe(true);
    expect(Array.isArray(SDK.DETERMINISM_RULES)).toBe(true);

    // Errors
    expect(typeof SDK.PluginAuthoringError).toBe('function');
    expect(typeof SDK.PluginValidationError).toBe('function');
  });

  it('does not export any private runtime loader or internal CLI symbols', () => {
    const exportedKeys = Object.keys(SDK);

    // Prohibited internal host symbols
    expect(exportedKeys).not.toContain('PluginLoader');
    expect(exportedKeys).not.toContain('PluginStateTracker');
    expect(exportedKeys).not.toContain('discoverPlugins');
    expect(exportedKeys).not.toContain('loadPlugin');
    expect(exportedKeys).not.toContain('executeScan');
  });
});
