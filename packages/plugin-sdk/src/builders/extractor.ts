/**
 * Extractor Plugin Builder.
 *
 * @module @veris/plugin-sdk/builders/extractor
 */

import { PluginAuthoringError } from '../errors/sdk-error.js';
import type { ExtractorPlugin, ExtractorPluginDefinition } from '../types/extractor.js';

/**
 * Define a type-safe Extractor Plugin conforming to the VERIS V2 contract.
 *
 * @param definition - The extractor plugin implementation and manifest.
 * @returns An immutable ExtractorPlugin object.
 * @throws {PluginAuthoringError} if manifest is missing or type is not 'extractor'.
 */
export function defineExtractorPlugin(definition: ExtractorPluginDefinition): ExtractorPlugin {
  if (!definition || typeof definition !== 'object') {
    throw new PluginAuthoringError(
      'Extractor plugin definition must be an object',
      'INVALID_DEFINITION',
    );
  }

  if (!definition.manifest || typeof definition.manifest !== 'object') {
    throw new PluginAuthoringError(
      'Extractor plugin definition requires a valid "manifest" object.',
      'MISSING_MANIFEST',
      'manifest',
    );
  }

  if (definition.manifest.type !== 'extractor') {
    throw new PluginAuthoringError(
      `Manifest type must be "extractor", but received "${definition.manifest.type}".`,
      'INVALID_PLUGIN_TYPE',
      'manifest.type',
    );
  }

  if (typeof definition.extract !== 'function') {
    throw new PluginAuthoringError(
      'Extractor plugin must provide an asynchronous "extract(context)" function.',
      'MISSING_EXTRACT_FUNCTION',
      'extract',
    );
  }

  if (definition.canExtract !== undefined && typeof definition.canExtract !== 'function') {
    throw new PluginAuthoringError(
      '"canExtract", if provided, must be a synchronous function returning a boolean.',
      'INVALID_CAN_EXTRACT_FUNCTION',
      'canExtract',
    );
  }

  const plugin: ExtractorPlugin = Object.freeze({
    type: 'extractor',
    manifest: definition.manifest,
    ...(definition.supportedArtifactTypes
      ? { supportedArtifactTypes: Object.freeze([...definition.supportedArtifactTypes]) }
      : {}),
    ...(definition.canExtract ? { canExtract: definition.canExtract } : {}),
    extract: definition.extract,
    ...(definition.lifecycle ? { lifecycle: definition.lifecycle } : {}),
  });

  return plugin;
}
