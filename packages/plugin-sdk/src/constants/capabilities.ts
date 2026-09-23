/**
 * Plugin Capability Constants and Groupings.
 *
 * @module @veris/plugin-sdk/constants/capabilities
 */

import type { PluginCapability } from '../types/manifest.js';

/**
 * Safe capabilities that are always granted without special user prompts.
 */
export const SAFE_CAPABILITIES: readonly PluginCapability[] = [
  'core-types-read',
  'config-read',
  'diagnostics-read',
] as const;

/**
 * Target inspection capabilities granting read-only access to files under scan.
 */
export const TARGET_CAPABILITIES: readonly PluginCapability[] = [
  'target-read',
  'custom-feature',
  'metadata-extract',
] as const;

/**
 * Storage capabilities granting designated output writing.
 */
export const OUTPUT_CAPABILITIES: readonly PluginCapability[] = ['fs-write-output'] as const;

/**
 * Restricted / dangerous capabilities that are denied by default in offline analysis.
 */
export const RESTRICTED_CAPABILITIES: readonly PluginCapability[] = [
  'network',
  'process-spawn',
] as const;

/**
 * Complete list of all valid plugin capabilities recognized by VERIS.
 */
export const ALL_CAPABILITIES: readonly PluginCapability[] = [
  ...SAFE_CAPABILITIES,
  ...TARGET_CAPABILITIES,
  ...OUTPUT_CAPABILITIES,
  ...RESTRICTED_CAPABILITIES,
] as const;

/**
 * Human-readable documentation for each capability.
 */
export const CAPABILITY_DESCRIPTIONS: Readonly<Record<PluginCapability, string>> = {
  'core-types-read': 'Read canonical VERIS object schemas and data structures',
  'config-read': 'Read plugin-specific configuration section from scan options',
  'diagnostics-read': 'Emit structured diagnostic logs to the host scan session',
  'target-read': 'Read-only access to the file under scan (content buffer)',
  'fs-write-output': 'Write exported artifacts to designated output directory',
  'custom-feature': 'Register and emit domain-specific raw feature types',
  'metadata-extract': 'Attach structured metadata dictionaries to extracted features',
  network: 'RESTRICTED: Network access (requires explicit user consent, denied in offline scans)',
  'process-spawn': 'DANGEROUS: Spawn child processes (forbidden by default)',
};
