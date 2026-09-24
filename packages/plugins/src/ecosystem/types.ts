/**
 * @veris/plugins/ecosystem/types — Types and contracts for plugin ecosystem, catalog, and verification.
 *
 * Implements ADR-018:
 * - Local-first plugin catalog schema
 * - Multi-stage verification report
 * - Installation receipt and management
 *
 * @module @veris/plugins/ecosystem/types
 */

import type { PluginCapability, PluginManifest, PluginType } from '../types.js';

/**
 * Record of a plugin package available in a catalog.
 */
export interface PluginPackageRecord {
  /** Globally unique plugin identifier. */
  readonly id: string;
  /** Human-readable display name. */
  readonly name: string;
  /** Strict SemVer version string. */
  readonly version: string;
  /** Summary of package capabilities and functionality. */
  readonly description: string;
  /** Type of plugin extension point. */
  readonly type: PluginType;
  /** Author or publishing organization. */
  readonly author: string;
  /** SPDX license identifier. */
  readonly license: string;
  /** Declared capabilities requested by the package. */
  readonly capabilities: readonly PluginCapability[];
  /** Expected SHA-256 hash of the package contents. */
  readonly sha256: string;
  /** Compatible host VERIS engine range. */
  readonly engines: {
    readonly veris: string;
  };
  /** Local path or relative reference to package directory/archive. */
  readonly location: string;
  /** Categorization tags. */
  readonly tags?: readonly string[];
}

/**
 * Local-first catalog of verified plugin packages.
 */
export interface PluginCatalog {
  /** Catalog schema version (currently '1.0.0'). */
  readonly schemaVersion: '1.0.0';
  /** Human-readable catalog title. */
  readonly name: string;
  /** ISO 8601 generation or last-updated timestamp. */
  readonly updatedAt: string;
  /** List of package records. */
  readonly packages: readonly PluginPackageRecord[];
}

/**
 * Result of auditing a plugin's declared capabilities.
 */
export interface CapabilityAuditResult {
  readonly declared: readonly PluginCapability[];
  readonly safe: readonly PluginCapability[];
  readonly targetAccess: readonly PluginCapability[];
  readonly storage: readonly PluginCapability[];
  readonly dangerous: readonly PluginCapability[];
  readonly hasDangerous: boolean;
}

/**
 * Compatibility assessment result against current host.
 */
export interface CompatibilityResult {
  readonly compatible: boolean;
  readonly requiredRange: string;
  readonly hostVersion: string;
}

/**
 * Comprehensive verification report produced by the verification pipeline.
 */
export interface PluginVerificationReport {
  /** True only if all checks pass without fatal errors. */
  readonly valid: boolean;
  /** Path to the audited package directory or file. */
  readonly packagePath: string;
  /** Loaded and validated manifest, if valid. */
  readonly manifest?: PluginManifest;
  /** Computed deterministic SHA-256 checksum. */
  readonly computedSha256: string;
  /** Expected SHA-256 checksum, if specified for validation. */
  readonly expectedSha256?: string;
  /** Checksum match result, if expected checksum was provided. */
  readonly checksumMatch?: boolean;
  /** Engine compatibility result. */
  readonly compatibility: CompatibilityResult;
  /** Audited capability breakdown. */
  readonly capabilities: CapabilityAuditResult;
  /** Declarative purity check result for rule packs. */
  readonly declarativePurity: boolean;
  /** Informational and security warnings. */
  readonly warnings: readonly string[];
  /** Fatal verification errors blocking installation. */
  readonly errors: readonly string[];
}

/**
 * Metadata recorded upon successful plugin installation.
 */
export interface InstallReceipt {
  readonly pluginId: string;
  readonly name: string;
  readonly version: string;
  readonly type: PluginType;
  readonly installedAt: string;
  readonly verifiedSha256: string;
  readonly sourcePath: string;
  readonly capabilities: readonly PluginCapability[];
}

/**
 * Result of an installation operation.
 */
export interface InstallResult {
  readonly success: boolean;
  readonly pluginId: string;
  readonly targetDir: string;
  readonly receipt?: InstallReceipt;
  readonly verification: PluginVerificationReport;
  readonly error?: string;
}

/**
 * Result of a removal operation.
 */
export interface RemoveResult {
  readonly success: boolean;
  readonly pluginId: string;
  readonly targetDir: string;
  readonly removedFilesCount: number;
  readonly error?: string;
}
