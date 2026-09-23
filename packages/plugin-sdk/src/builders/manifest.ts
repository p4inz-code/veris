/**
 * Plugin Manifest Builder and Authoring Validator.
 *
 * @module @veris/plugin-sdk/builders/manifest
 */

import {
  ALL_CAPABILITIES,
  DEFAULT_COMPATIBLE_VERIS_RANGE,
  MANIFEST_SCHEMA_VERSION,
} from '../constants/index.js';
import { type PluginFieldValidationError, PluginValidationError } from '../errors/sdk-error.js';
import type { PluginManifest, PluginManifestInput, PluginType } from '../types/manifest.js';

const SEMVER_REGEX =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

const PLUGIN_ID_REGEX = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

const VALID_PLUGIN_TYPES = new Set<PluginType>(['extractor', 'rule-pack']);
const VALID_CAPABILITIES = new Set<string>(ALL_CAPABILITIES);

/**
 * Define and validate a VERIS plugin manifest with type-safe defaults.
 *
 * @param input - The authoring input for the manifest.
 * @returns An immutable, validated PluginManifest object.
 * @throws {PluginValidationError} if any required field is missing or invalid.
 */
export function definePluginManifest(input: PluginManifestInput): PluginManifest {
  const errors: PluginFieldValidationError[] = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new PluginValidationError('Manifest definition must be an object', [
      { field: 'root', message: 'Input must be a valid object' },
    ]);
  }

  // ID validation
  if (typeof input.id !== 'string' || input.id.trim() === '') {
    errors.push({ field: 'id', message: 'Plugin ID must be a non-empty string' });
  } else if (!PLUGIN_ID_REGEX.test(input.id)) {
    errors.push({
      field: 'id',
      message: `Plugin ID "${input.id}" must follow npm package naming conventions (e.g. "my-plugin" or "@scope/my-plugin")`,
    });
  }

  // Name validation
  if (typeof input.name !== 'string' || input.name.trim() === '') {
    errors.push({ field: 'name', message: 'Plugin name must be a non-empty string' });
  }

  // Version validation
  if (typeof input.version !== 'string' || !SEMVER_REGEX.test(input.version)) {
    errors.push({
      field: 'version',
      message: `Plugin version "${String(input.version)}" must be a valid semver string (e.g. "1.0.0")`,
    });
  }

  // Description validation
  if (typeof input.description !== 'string' || input.description.trim() === '') {
    errors.push({ field: 'description', message: 'Plugin description must be a non-empty string' });
  }

  // Author validation
  if (typeof input.author !== 'string' || input.author.trim() === '') {
    errors.push({ field: 'author', message: 'Plugin author must be a non-empty string' });
  }

  // Type validation
  if (typeof input.type !== 'string' || !VALID_PLUGIN_TYPES.has(input.type)) {
    errors.push({
      field: 'type',
      message: `Plugin type must be one of: ${[...VALID_PLUGIN_TYPES].join(', ')}`,
    });
  }

  // Capabilities validation
  if (!Array.isArray(input.capabilities)) {
    errors.push({ field: 'capabilities', message: 'Plugin capabilities must be an array' });
  } else {
    for (let i = 0; i < input.capabilities.length; i++) {
      const cap = input.capabilities[i];
      if (typeof cap !== 'string' || !VALID_CAPABILITIES.has(cap)) {
        errors.push({
          field: `capabilities[${i}]`,
          message: `Unknown or unsupported capability: "${String(cap)}"`,
        });
      }
    }
  }

  // Engine resolution
  const verisRange = input.verisVersion ?? input.engines?.veris ?? DEFAULT_COMPATIBLE_VERIS_RANGE;
  if (typeof verisRange !== 'string' || verisRange.trim() === '') {
    errors.push({
      field: 'engines.veris',
      message: 'Compatible VERIS semver range cannot be empty',
    });
  }

  if (errors.length > 0) {
    throw new PluginValidationError(
      `Plugin manifest for "${input.id ?? 'unknown'}" failed authoring validation with ${errors.length} error(s).`,
      errors,
    );
  }

  const license =
    typeof input.license === 'string' && input.license.trim() !== '' ? input.license : 'Apache-2.0';
  const entryPoint =
    typeof input.entryPoint === 'string' && input.entryPoint.trim() !== ''
      ? input.entryPoint
      : './dist/index.js';

  const manifest: PluginManifest = Object.freeze({
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    id: input.id,
    name: input.name,
    version: input.version,
    description: input.description,
    author: input.author,
    license,
    engines: Object.freeze({
      veris: verisRange,
      ...(input.engines?.node ? { node: input.engines.node } : {}),
    }),
    verisVersion: verisRange,
    type: input.type,
    entryPoint,
    capabilities: Object.freeze([...input.capabilities]),
    ...(input.supportedArtifactTypes
      ? { supportedArtifactTypes: Object.freeze([...input.supportedArtifactTypes]) }
      : {}),
    ...(input.tags ? { tags: Object.freeze([...input.tags]) } : {}),
  });

  return manifest;
}
