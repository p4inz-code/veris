/**
 * Plugin Manifest Validator and Deterministic Ordering Utilities.
 *
 * @module @veris/plugins/manifest
 */

import { parseSemver, satisfies } from '@veris/shared';

import type { PluginCapability, PluginManifest, PluginType } from './types.js';

const VALID_PLUGIN_TYPES = new Set<PluginType>(['extractor', 'rule-pack']);

const VALID_CAPABILITIES = new Set<PluginCapability>([
  'core-types-read',
  'config-read',
  'diagnostics-read',
  'target-read',
  'fs-write-output',
  'custom-feature',
  'metadata-extract',
  'network',
  'process-spawn',
]);

export interface ManifestValidationError {
  readonly field: string;
  readonly message: string;
}

export interface ManifestValidationResult {
  readonly valid: boolean;
  readonly manifest?: PluginManifest;
  readonly errors: readonly ManifestValidationError[];
}

/**
 * Validate an unknown object against the VERIS PluginManifest schema (v1.0.0).
 */
export function validatePluginManifest(input: unknown): ManifestValidationResult {
  const errors: ManifestValidationError[] = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      valid: false,
      errors: [{ field: 'root', message: 'Manifest must be an object' }],
    };
  }

  const raw = input as Record<string, unknown>;

  // schemaVersion
  if (raw.schemaVersion !== '1.0.0') {
    errors.push({
      field: 'schemaVersion',
      message: `Invalid schemaVersion: expected "1.0.0", got ${String(raw.schemaVersion)}`,
    });
  }

  // id
  if (typeof raw.id !== 'string' || raw.id.trim() === '') {
    errors.push({ field: 'id', message: 'Plugin ID must be a non-empty string' });
  } else if (!/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(raw.id)) {
    errors.push({
      field: 'id',
      message: `Plugin ID "${raw.id}" must follow npm package naming conventions`,
    });
  }

  // name
  if (typeof raw.name !== 'string' || raw.name.trim() === '') {
    errors.push({ field: 'name', message: 'Plugin name must be a non-empty string' });
  }

  // version
  if (typeof raw.version !== 'string' || parseSemver(raw.version) === null) {
    errors.push({
      field: 'version',
      message: `Plugin version "${String(raw.version)}" must be a valid semver string`,
    });
  }

  // description
  if (typeof raw.description !== 'string') {
    errors.push({ field: 'description', message: 'Plugin description must be a string' });
  }

  // author
  if (typeof raw.author !== 'string' || raw.author.trim() === '') {
    errors.push({ field: 'author', message: 'Plugin author must be a non-empty string' });
  }

  // license
  if (typeof raw.license !== 'string' || raw.license.trim() === '') {
    errors.push({ field: 'license', message: 'Plugin license must be a valid SPDX string' });
  }

  // engines.veris
  if (!raw.engines || typeof raw.engines !== 'object') {
    errors.push({ field: 'engines', message: 'Plugin engines declaration is required' });
  } else {
    const engines = raw.engines as Record<string, unknown>;
    if (typeof engines.veris !== 'string' || engines.veris.trim() === '') {
      errors.push({
        field: 'engines.veris',
        message: 'engines.veris semver range is required (e.g. ">=1.0.0 <2.0.0")',
      });
    }
  }

  // type
  if (typeof raw.type !== 'string' || !VALID_PLUGIN_TYPES.has(raw.type as PluginType)) {
    errors.push({
      field: 'type',
      message: `Plugin type must be one of: ${[...VALID_PLUGIN_TYPES].join(', ')}`,
    });
  }

  // entryPoint
  if (typeof raw.entryPoint !== 'string' || raw.entryPoint.trim() === '') {
    errors.push({ field: 'entryPoint', message: 'Plugin entryPoint must be a valid path string' });
  }

  // capabilities
  if (!Array.isArray(raw.capabilities)) {
    errors.push({ field: 'capabilities', message: 'Plugin capabilities must be an array' });
  } else {
    for (let i = 0; i < raw.capabilities.length; i++) {
      const cap = raw.capabilities[i];
      if (typeof cap !== 'string' || !VALID_CAPABILITIES.has(cap as PluginCapability)) {
        errors.push({
          field: `capabilities[${i}]`,
          message: `Unknown capability "${String(cap)}"`,
        });
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    manifest: input as PluginManifest,
    errors: [],
  };
}

/**
 * Check whether a plugin manifest satisfies the host VERIS engine version.
 */
export function isPluginCompatible(manifest: PluginManifest, hostVersion: string): boolean {
  return satisfies(hostVersion, manifest.engines.veris);
}

/**
 * Sort any collection of plugins deterministically by ID.
 * Eliminates filesystem discovery non-determinism.
 */
export function sortPluginsDeterministically<
  T extends { readonly id?: string; readonly manifest?: { readonly id: string } },
>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const idA = a.id ?? a.manifest?.id ?? '';
    const idB = b.id ?? b.manifest?.id ?? '';
    return idA.localeCompare(idB);
  });
}
