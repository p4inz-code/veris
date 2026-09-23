/**
 * Plugin Manifest Types and Contracts.
 *
 * @module @veris/plugin-sdk/types/manifest
 */

/**
 * Extension types supported in VERIS V2.
 *
 * In V2, extension is strictly constrained to Extractor plugins and Rule Pack plugins.
 * Other extension points (exporters, renderers, AI consumers) are explicitly deferred.
 */
export type PluginType = 'extractor' | 'rule-pack';

/**
 * Granular capabilities a plugin can declare and request.
 */
export type PluginCapability =
  | 'core-types-read'
  | 'config-read'
  | 'diagnostics-read'
  | 'target-read'
  | 'fs-write-output'
  | 'custom-feature'
  | 'metadata-extract'
  | 'network'
  | 'process-spawn';

/**
 * Compatible engine constraints.
 */
export interface PluginEngines {
  /** Compatible VERIS semver range (e.g. ">=1.0.0 <3.0.0"). */
  readonly veris: string;
  /** Optional Node.js runtime constraint (e.g. ">=18.0.0"). */
  readonly node?: string;
}

/**
 * Canonical Plugin Manifest conforming to ADR-014 and SPEC-007.
 * Defined in `veris-plugin.json` or exported via `definePluginManifest()`.
 */
export interface PluginManifest {
  /** Manifest schema version (always '1.0.0' for V2). */
  readonly schemaVersion: '1.0.0';

  /**
   * Globally unique, scoped identifier.
   * Format: `@[a-z0-9-~][a-z0-9-._~]*\/[a-z0-9-~][a-z0-9-._~]*` or `[a-z0-9-~][a-z0-9-._~]*`.
   */
  readonly id: string;

  /** Human-readable display name. */
  readonly name: string;

  /** Strict Semantic Version (e.g. "1.0.0"). */
  readonly version: string;

  /** Concise description of what this plugin accomplishes. */
  readonly description: string;

  /** Author or maintaining organization identifier. */
  readonly author: string;

  /** SPDX license identifier (e.g. "Apache-2.0", "MIT"). */
  readonly license: string;

  /** Host runtime compatibility requirements. */
  readonly engines: PluginEngines;

  /** Convenience alias for engines.veris */
  readonly verisVersion?: string;

  /** Extension category. */
  readonly type: PluginType;

  /** Relative path to bundle entry point (e.g. "./dist/index.js"). */
  readonly entryPoint: string;

  /** Declared capabilities required for execution. */
  readonly capabilities: readonly PluginCapability[];

  /** For extractor plugins: artifact file types this plugin can inspect. */
  readonly supportedArtifactTypes?: readonly string[];

  /** Optional categorization tags. */
  readonly tags?: readonly string[];
}

/**
 * Ergonomic authoring input for defining a plugin manifest.
 * Provides sensible defaults for schemaVersion, license, and compatible engines.
 */
export interface PluginManifestInput {
  /** Globally unique identifier. */
  readonly id: string;
  /** Human-readable display name. */
  readonly name: string;
  /** Semver version (e.g. "1.0.0"). */
  readonly version: string;
  /** Summary of plugin capabilities. */
  readonly description: string;
  /** Author or organization name. */
  readonly author: string;
  /** SPDX license identifier (defaults to "Apache-2.0"). */
  readonly license?: string;
  /** Extension type. */
  readonly type: PluginType;
  /** Relative bundle entry point (defaults to "./dist/index.js"). */
  readonly entryPoint?: string;
  /** Compatible VERIS range (defaults to ">=1.0.0 <3.0.0"). */
  readonly verisVersion?: string;
  /** Detailed engine specifications. */
  readonly engines?: PluginEngines;
  /** Capabilities requested by this plugin. */
  readonly capabilities: readonly PluginCapability[];
  /** Supported artifact types (for extractors). */
  readonly supportedArtifactTypes?: readonly string[];
  /** Optional categorization tags. */
  readonly tags?: readonly string[];
}
