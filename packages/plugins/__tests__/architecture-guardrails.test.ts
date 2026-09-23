import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { PERMISSION_GROUPS } from '../src/index.js';

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, '../../..');

describe('Architectural Guardrails (SPEC-001 & SPEC-010)', () => {
  it('enforces Constitutional Invariant F1: @veris/core has zero production dependencies', () => {
    const corePkgPath = path.resolve(repoRoot, 'packages/core/package.json');
    const corePkg = JSON.parse(readFileSync(corePkgPath, 'utf-8'));

    // dependencies key must not exist or be empty
    expect(corePkg.dependencies ?? {}).toEqual({});
  });

  it('enforces downward-only dependency direction for @veris/plugins', () => {
    const pluginsPkgPath = path.resolve(repoRoot, 'packages/plugins/package.json');
    const pluginsPkg = JSON.parse(readFileSync(pluginsPkgPath, 'utf-8'));

    const deps = Object.keys(pluginsPkg.dependencies ?? {});

    // @veris/plugins is an L7 Host/Extension package:
    // It may depend on L0 Core/Shared and L1 Framework (logger, config).
    // It must NEVER depend upward on higher-level composition packages like veris-cli or runner layers.
    expect(deps).not.toContain('veris-cli');
    expect(deps).not.toContain('@veris/runners');
    expect(deps).not.toContain('@veris/api');
  });

  it('guarantees offline-first architecture by forbidding network and process-spawn by default', () => {
    // Safe permissions must not include dangerous permissions
    expect(PERMISSION_GROUPS.safe).not.toContain('network');
    expect(PERMISSION_GROUPS.safe).not.toContain('process-spawn');

    // Dangerous permissions must be explicitly tracked
    expect(PERMISSION_GROUPS.dangerous).toContain('network');
    expect(PERMISSION_GROUPS.dangerous).toContain('process-spawn');
  });
});
