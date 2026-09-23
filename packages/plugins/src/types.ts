/**
 * @veris/plugins — Core types and contracts for VERIS V2 Plugin Architecture.
 *
 * Defines the extension contracts for external extractors and rule packs,
 * manifest schema, capability model, lifecycle states, and sandboxing boundaries.
 *
 * ## Invariants (from SPEC-007 and SPEC-010):
 * - Extractor plugins produce raw features only (never Findings or Risk scores)
 * - Rule plugins provide declarative rule packs only (no arbitrary code execution)
 * - All plugins are offline-first and zero-telemetry
 * - Plugin execution order and outputs are strictly deterministic
 *
 * @module @veris/plugins/types
 */

import type { Artifact, ArtifactType, SourceLocation, RulePack } from '@veris/core';
import type { CancellationToken } from '@veris/shared';

// ── Plugin Types & Identifiers ──

/**
 * Supported V2 plugin extension types.
 *
 * V2 strictly scopes extension points to Extractor and Rule plugins.
 * Other extension points (renderers, themes, exporters) are deferred to later milestones.
 */
export type PluginType = 'extractor' | 'rule-pack';

/**
 * Lifecycle states of a plugin within the VERIS host.
 */
export type PluginStatus =
  | 'discovered' // Found on filesystem
  | 'validated' // Manifest checked and valid
  | 'initialized' // onInit() hook completed
  | 'active' // Registered in engine registries and accepting work
  | 'deactivated' // Safely shut down via onDeactivate()
  | 'failed' // Threw non-recoverable error
  | 'quarantined'; // Disabled due to crash loop or security violation

export interface StateTransitionEvent {
  readonly pluginId: string;
  readonly from: PluginStatus;
  readonly to: PluginStatus;
  readonly reason?: string;
  readonly timestamp: number;
}

export interface IPluginStateTracker {
  readonly pluginId: string;
  readonly status: PluginStatus;
  readonly consecutiveErrors: number;
  readonly transitions: readonly StateTransitionEvent[];
  transitionTo(to: PluginStatus, reason?: string): void;
  recordError(error: Error | string): boolean;
  recordSuccess(): void;
  canExecute(): boolean;
}

// ── Permission & Capability Model ──

/**
 * Granular capabilities a plugin can declare and request.
 *
 * Offline-first invariant:
 * - 'core-types-read', 'config-read', 'diagnostics-read' are safe and always granted.
 * - 'target-read' grants read-only access to artifact content buffers.
 * - 'network' and 'process-spawn' are strictly restricted/forbidden in offline analysis.
 */
export type PluginCapability =
  | 'core-types-read' // Read canonical object schemas
  | 'config-read' // Read plugin-specific configuration section
  | 'diagnostics-read' // Emit and read diagnostic logs
  | 'target-read' // Read scanned artifact content buffer
  | 'fs-write-output' // Write output to designated export directory
  | 'custom-feature' // Register custom raw feature types
  | 'metadata-extract' // Extract structured metadata
  | 'network' // RESTRICTED: Network access (requires explicit user consent, off by default)
  | 'process-spawn'; // DANGEROUS: Spawn child processes (forbidden by default)

/** Groups of permissions for security auditing and user prompt display. */
export const PERMISSION_GROUPS = {
  safe: ['core-types-read', 'config-read', 'diagnostics-read'] as const,
  targetAccess: ['target-read'] as const,
  storage: ['fs-write-output'] as const,
  dangerous: ['network', 'process-spawn'] as const,
} as const;

// ── Plugin Manifest ──

/**
 * Manifest schema for VERIS V2 plugins.
 * Stored in `veris-plugin.json` or in `package.json#veris`.
 */
export interface PluginManifest {
  /** Manifest schema version (currently '1.0.0'). */
  readonly schemaVersion: '1.0.0';

  /**
   * Globally unique, scoped identifier.
   * Format: `@scope/veris-plugin-name` or `veris-plugin-name`.
   */
  readonly id: string;

  /** Human-readable display name. */
  readonly name: string;

  /** Semver version of the plugin. */
  readonly version: string;

  /** Brief description of what this plugin does. */
  readonly description: string;

  /** Author or vendor identity. */
  readonly author: string;

  /** SPDX license identifier. */
  readonly license: string;

  /** Host compatibility requirements. */
  readonly engines: {
    /** Semver range of compatible VERIS versions (e.g. ">=1.0.0 <2.0.0"). */
    readonly veris: string;
  };

  /** Type of plugin extension. */
  readonly type: PluginType;

  /** Relative path to the plugin entry point module (e.g. "./dist/index.js"). */
  readonly entryPoint: string;

  /** Declared capabilities required for execution. */
  readonly capabilities: readonly PluginCapability[];

  /** For extractor plugins: artifact types this plugin can process. */
  readonly supportedArtifactTypes?: readonly ArtifactType[];

  /** Categorization tags. */
  readonly tags?: readonly string[];
}

// ── Plugin Scoped Context & Logger ──

/**
 * Scoped logger provided to plugins by the host.
 * Prevents plugins from tampering with global terminal / stdout streams.
 */
export interface ScopedPluginLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Context provided to plugins during initialization and activation.
 */
export interface PluginContext {
  /** The plugin's unique ID. */
  readonly pluginId: string;

  /** Host VERIS engine version. */
  readonly verisVersion: string;

  /** Scoped, validated configuration for this plugin. */
  readonly config: Readonly<Record<string, unknown>>;

  /** Scoped logger for diagnostic emission. */
  readonly logger: ScopedPluginLogger;

  /** Cooperative cancellation token. */
  readonly cancellationToken: CancellationToken;
}

// ── Plugin Lifecycle ──

/**
 * Optional lifecycle hooks implemented by plugins.
 */
export interface PluginLifecycle {
  /**
   * Called once when the plugin is loaded into the host.
   * Perform initial resource allocation or validation.
   */
  onInit?(context: PluginContext): Promise<void> | void;

  /**
   * Called before the plugin is registered in the engine registries.
   */
  onActivate?(context: PluginContext): Promise<void> | void;

  /**
   * Called during scan shutdown or when the plugin is unloaded.
   * Clean up all memory, handles, or cached data.
   */
  onDeactivate?(): Promise<void> | void;
}

/** Base plugin interface. */
export interface Plugin {
  /** Validated manifest definition. */
  readonly manifest: PluginManifest;

  /** Optional lifecycle hooks. */
  readonly lifecycle?: PluginLifecycle;
}

// ── Extractor Plugin Contract ──

/**
 * Raw feature emitted by an external extractor plugin.
 * Mirrors the internal RawFeature model in `@veris/extractors`.
 */
export interface PluginRawFeature {
  /** The extractor ID that produced this feature. */
  readonly extractorId: string;

  /** Extractor-specific feature type (e.g. "custom-token", "entropy-segment"). */
  readonly type: string;

  /** Extracted value. Must be JSON-serializable. */
  readonly value: unknown;

  /** Extractor confidence in this feature [0.0, 1.0]. */
  readonly confidence: number;

  /** Optional source location in the artifact. */
  readonly location?: SourceLocation;

  /** Optional metadata. Must be JSON-serializable. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Context passed to an ExtractorPlugin during artifact extraction.
 * Provides read-only access to artifact metadata and content.
 */
export interface PluginExtractionContext {
  /** The artifact being inspected. */
  readonly artifact: Readonly<Artifact>;

  /**
   * Raw artifact content buffer.
   * Null if file cannot be read or target-read permission was denied.
   */
  readonly content: Buffer | null;

  /** Cooperative cancellation token. */
  readonly cancellationToken: CancellationToken;

  /** Scoped logger. */
  readonly logger: ScopedPluginLogger;

  /** Plugin-specific configuration. */
  readonly config: Readonly<Record<string, unknown>>;
}

/**
 * Extractor Plugin contract.
 *
 * Implemented by third-party packages to extend VERIS extraction capabilities.
 * Extractors are stateless and deterministic: identical context produces identical features.
 */
export interface ExtractorPlugin extends Plugin {
  readonly type: 'extractor';

  /** Declared artifact types this extractor supports. */
  readonly supportedArtifactTypes?: readonly ArtifactType[] | readonly string[];

  /**
   * Fast, synchronous heuristic check whether this extractor applies to the artifact.
   * MUST NOT perform I/O.
   */
  canExtract?(context: PluginExtractionContext): boolean;

  /**
   * Execute extraction and return raw unnormalized features.
   * MUST be deterministic and side-effect free.
   */
  extract(context: PluginExtractionContext): Promise<readonly PluginRawFeature[]>;
}

// ── Rule Plugin Contract ──

/**
 * Rule Plugin contract.
 *
 * Provides declarative rule packs to the VERIS rule engine.
 * Rule plugins export declarative definitions only (no arbitrary imperative code).
 */
export interface RulePlugin extends Plugin {
  readonly type: 'rule-pack';

  /** The declarative rule pack provided by this plugin. */
  readonly rulePack: Readonly<RulePack>;
}

// ── Diagnostics & Discovery Types ──

export type PluginDiagnosticSeverity = 'info' | 'warning' | 'error';

/**
 * Structured diagnostic record emitted during plugin discovery, loading, and runtime.
 */
export interface PluginDiagnostic {
  readonly code: string;
  readonly severity: PluginDiagnosticSeverity;
  readonly pluginId: string;
  readonly message: string;
  readonly timestamp: number;
  readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * A plugin discovered on the local filesystem.
 */
export interface DiscoveredPlugin {
  /** Unique plugin identifier (from manifest.id). */
  readonly id: string;
  /** Validated plugin manifest. */
  readonly manifest: PluginManifest;
  /** Absolute path to the manifest file (veris-plugin.json or package.json). */
  readonly manifestPath: string;
  /** Absolute path to the plugin root directory. */
  readonly directory: string;
  /** Absolute path to the resolved entry point script. */
  readonly entryPointFile: string;
}

/**
 * A plugin loaded and initialized in memory.
 */
export interface LoadedPlugin {
  /** Unique plugin identifier (from manifest.id). */
  readonly id: string;
  /** The plugin's manifest. */
  readonly manifest: PluginManifest;
  /** Root directory of the plugin on disk. */
  readonly directory: string;
  /** Resolved entry point file. */
  readonly entryPointFile: string;
  /** Instantiated plugin object. */
  readonly instance: ExtractorPlugin | RulePlugin;
  /** Runtime state machine and quarantine tracker. */
  readonly stateTracker: IPluginStateTracker;
}

/**
 * Configuration options for plugin discovery.
 */
export interface PluginDiscoveryOptions {
  /** Optional workspace root directory for resolving .veris/plugins. */
  readonly workspaceDir?: string;
  /** Explicit plugins directory to discover from. */
  readonly pluginsDir?: string;
  /** User home directory override (for testing or custom installations). */
  readonly userHomeDir?: string;
  /** Host VERIS engine version for compatibility checking (default: '1.0.0'). */
  readonly hostVersion?: string;
  /** Plugin IDs to exclude or ignore during discovery. */
  readonly disabledPluginIds?: readonly string[];
}

/**
 * Options for configuring the PluginHost.
 */
export interface PluginHostOptions extends PluginDiscoveryOptions {
  /** Scoped logger for host operations. */
  readonly logger?: ScopedPluginLogger;
  /** Per-plugin configurations keyed by plugin ID. */
  readonly pluginConfigs?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}
