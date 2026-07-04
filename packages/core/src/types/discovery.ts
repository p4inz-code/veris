/**
 * Discovery artifact types for VERIS.
 *
 * These types represent artifacts as discovered by the Discovery Engine,
 * before classification and extraction. They extend the canonical Artifact
 * type with filesystem-specific metadata.
 *
 * @module @veris/core/types/discovery
 */

import type { ArtifactType } from './artifact.js';

/** Symlink metadata for discovered artifacts. */
export interface SymlinkMetadata {
  /** The resolved symlink target path. */
  readonly targetPath: string;
  /** Whether the symlink target exists and is accessible. */
  readonly targetExists: boolean;
  /** Whether this is a broken symlink. */
  readonly isBroken: boolean;
  /** The type of the target (file, directory, or unknown). */
  readonly targetType: 'file' | 'directory' | 'unknown';
}

/** Junction metadata (Windows only). */
export interface JunctionMetadata {
  /** The resolved junction target path. */
  readonly targetPath: string;
  /** Whether the junction target exists. */
  readonly targetExists: boolean;
}

/** Discovery diagnostics for a single artifact. */
export interface ArtifactDiscoveryDiagnostics {
  /** Whether this artifact was discovered through a symlink follow. */
  readonly viaSymlink: boolean;
  /** Whether permission errors were encountered accessing this artifact. */
  readonly permissionError: boolean;
  /** Whether this artifact was skipped during discovery (filtered or excluded). */
  readonly skipped: boolean;
  /** Reason for skipping, if skipped. */
  readonly skipReason?: string;
  /** Depth of this artifact in the directory tree. */
  readonly depth: number;
}

/**
 * A discovered artifact — the output of the Discovery Engine.
 *
 * Contains all filesystem information about a discovered file or directory,
 * before classification and extraction begin.
 */
export interface DiscoveredArtifact {
  /** Stable deterministic ID (prefix: "dart_"). */
  readonly id: string;
  /** Parent artifact ID (null for root/top-level artifacts). */
  readonly parentId: string | null;
  /** Root artifact ID — the top-most ancestor in the discovery tree. */
  readonly rootId: string;
  /** Absolute path on the filesystem. */
  readonly absolutePath: string;
  /** Canonical/normalized path (resolved symlinks, normalized separators). */
  readonly canonicalPath: string;
  /** Path relative to the scan root. */
  readonly relativePath: string;
  /** File or directory name (basename). */
  readonly fileName: string;
  /** File extension (lowercase, including dot — e.g., ".js", ".txt"). Empty for directories. */
  readonly extension: string;
  /** Size in bytes. 0 for directories. */
  readonly size: number;
  /** Creation time (ISO 8601) or null if unavailable. */
  readonly createdAt: string | null;
  /** Modification time (ISO 8601) or null if unavailable. */
  readonly modifiedAt: string | null;
  /** Whether the file is hidden (dotfile on Unix, hidden attribute on Windows). */
  readonly isHidden: boolean;
  /** Whether the file has executable permission hint (Unix) or is an .exe/.dll (Windows). */
  readonly executableHint: boolean;
  /** Symlink metadata, if this is a symbolic link. */
  readonly symlink?: SymlinkMetadata;
  /** Junction metadata, if this is a junction point (Windows). */
  readonly junction?: JunctionMetadata;
  /** Whether this artifact is a directory. */
  readonly isDirectory: boolean;
  /** Whether this artifact is a symbolic link. */
  readonly isSymlink: boolean;
  /** Whether this artifact is a junction (Windows). */
  readonly isJunction: boolean;
  /** Initial classification hint from extension/position (may be overridden by classifier). */
  readonly typeHint?: ArtifactType;
  /** Discovery diagnostics for this artifact. */
  readonly diagnostics: ArtifactDiscoveryDiagnostics;
}

/** Simplified artifact info for graph nodes. */
export interface ArtifactNode {
  /** Stable deterministic ID. */
  readonly id: string;
  /** File or directory name. */
  readonly fileName: string;
  /** Whether this is a directory. */
  readonly isDirectory: boolean;
  /** Child node IDs (for directories). */
  readonly childrenIds: readonly string[];
  /** Parent node ID (null for root). */
  readonly parentId: string | null;
  /** Path relative to scan root. */
  readonly relativePath: string;
}
