/**
 * Discovery types for the VERIS analysis pipeline.
 *
 * These types define the discovery stage — the first phase of the pipeline
 * where candidate artifacts are found from the filesystem or other targets.
 *
 * @module @veris/extractors/discovery/types
 */

import type { ArtifactType } from '@veris/core';

// ── Discovery Target ──

/** Supported discovery target types. */
export type DiscoveryTargetType =
  'file' | 'directory' | 'repository' | 'archive' | 'symlink' | 'junction' | 'stdin';

/**
 * A discovery target — the starting point for a scan.
 */
export interface DiscoveryTarget {
  /** Absolute or relative path to the target. */
  readonly path: string;
  /** Type of target. */
  readonly type: DiscoveryTargetType;
  /** Optional custom label for the target. */
  readonly label?: string;
}

// ── Discovered Artifact ──

/**
 * A lightweight artifact discovered during filesystem traversal.
 * This is the pre-classification, pre-extraction model.
 *
 * Distinguished from the canonical Artifact type (@veris/core) which
 * represents an artifact AFTER extraction.
 */
export interface DiscoveredArtifact {
  /** Stable deterministic ID (prefix: "da_"). */
  readonly id: string;
  /** Parent artifact ID, or null for root artifacts. */
  readonly parentId: string | null;
  /** Root artifact ID for this tree — self if root. */
  readonly rootId: string;
  /** Relative path from the scan target root. */
  readonly relativePath: string;
  /** Absolute filesystem path. */
  readonly absolutePath: string;
  /** Canonical (normalized, resolved) path. */
  readonly canonicalPath: string;
  /** File or directory name (last path component). */
  readonly name: string;
  /** File extension (lowercase, including dot), empty for directories. */
  readonly extension: string;
  /** Size in bytes. 0 for directories. */
  readonly size: number;
  /** Last modification timestamp (epoch ms). */
  readonly mtimeMs: number;
  /** Creation timestamp (epoch ms), if available. */
  readonly birthtimeMs: number | null;
  /** Whether the artifact is a directory. */
  readonly isDirectory: boolean;
  /** Whether the artifact is a symbolic link. */
  readonly isSymlink: boolean;
  /** Whether the artifact is a junction/reparse point (Windows). */
  readonly isJunction: boolean;
  /** Whether the artifact is hidden (dotfile or hidden attribute). */
  readonly isHidden: boolean;
  /** Whether the artifact is executable (Unix permissions or Windows extension hint). */
  readonly executableHint: boolean;
  /** Depth from scan root. Root = 0. */
  readonly depth: number;
  /** Initial metadata gathered during discovery. */
  readonly metadata: Readonly<Record<string, unknown>>;
  /** Discovery diagnostics for this artifact. */
  readonly diagnostics: ArtifactDiscoveryDiagnostics;
}

// ── Discovery Diagnostics ──

/** Per-artifact discovery diagnostics. */
export interface ArtifactDiscoveryDiagnostics {
  /** Time taken to stat this artifact (ms). */
  readonly statTimeMs: number;
  /** Whether stat was successful. */
  readonly statSuccess: boolean;
  /** Whether permission was denied when accessing this artifact. */
  readonly permissionDenied: boolean;
  /** Whether this artifact was skipped due to ignore rules. */
  readonly skipped: boolean;
  /** Reason for skipping, if skipped. */
  readonly skipReason?: string;
  /** Whether this is a duplicate (same inode on Unix). */
  readonly isDuplicate: boolean;
}

/** Aggregate discovery diagnostics for the entire scan. */
export interface DiscoveryDiagnostics {
  /** Total files discovered. */
  readonly filesDiscovered: number;
  /** Total directories visited. */
  readonly directoriesVisited: number;
  /** Paths skipped due to ignore rules. */
  readonly skippedPaths: number;
  /** Permission failures encountered. */
  readonly permissionFailures: number;
  /** Symlinks that were skipped (not followed). */
  readonly symlinksSkipped: number;
  /** Junctions detected. */
  readonly junctionsDetected: number;
  /** Detectable cycles found (symlink loops, junction loops). */
  readonly cyclesDetected: number;
  /** Duplicate files detected (same inode). */
  readonly duplicatesDetected: number;
  /** Total traversal time (ms). */
  readonly traversalTimeMs: number;
  /** Total metadata collection time (ms). */
  readonly metadataTimeMs: number;
  /** Total classification time (ms). */
  readonly classificationTimeMs: number;
  /** Total end-to-end discovery time (ms). */
  readonly totalTimeMs: number;
}

// ── Discovery Options ──

/** Symlink resolution policy. */
export type SymlinkPolicy = 'follow' | 'skip' | 'error';

/** Options for the discovery engine. */
export interface DiscoveryOptions {
  /** Maximum directory traversal depth (default: 50). */
  readonly maxDepth?: number;
  /** Maximum number of files to discover (default: 100000). */
  readonly maxFiles?: number;
  /** Maximum total size of discovered files in bytes (default: 10GB). */
  readonly maxTotalSize?: number;
  /** Symlink resolution policy (default: "follow"). */
  readonly symlinkPolicy?: SymlinkPolicy;
  /** Whether to include hidden files/directories (default: true). */
  readonly includeHidden?: boolean;
  /** Whether to follow junctions (Windows, default: false). */
  readonly followJunctions?: boolean;
  /** Glob patterns to ignore (gitignore-style). */
  readonly ignorePatterns?: string[];
  /** Paths to specifically include (overrides ignorePatterns). */
  readonly includePaths?: string[];
  /** Paths to specifically exclude. */
  readonly excludePaths?: string[];
  /** Whether to enable cycle detection (default: true). */
  readonly detectCycles?: boolean;
  /** Maximum symlink resolution depth before detecting a cycle (default: 40). */
  readonly maxSymlinkDepth?: number;
  /** Whether traversal order should be deterministic (default: true). */
  readonly deterministic?: boolean;
  /** Number of concurrent metadata collection operations (default: 4). */
  readonly concurrency?: number;
  /** Whether to stop on permission errors (default: false). */
  readonly strictPermissions?: boolean;
}

/** Default discovery options. */
export const DEFAULT_DISCOVERY_OPTIONS: Required<DiscoveryOptions> = {
  maxDepth: 50,
  maxFiles: 100_000,
  maxTotalSize: 10 * 1024 * 1024 * 1024,
  symlinkPolicy: 'follow',
  includeHidden: true,
  followJunctions: false,
  ignorePatterns: [],
  includePaths: [],
  excludePaths: [],
  detectCycles: true,
  maxSymlinkDepth: 40,
  deterministic: true,
  concurrency: 4,
  strictPermissions: false,
};

// ── Discovery Progress ──

/** Progress information emitted during discovery. */
export interface DiscoveryProgress {
  /** Current phase of discovery. */
  readonly phase: 'scanning' | 'collecting' | 'classifying' | 'complete';
  /** Number of files discovered so far. */
  readonly filesDiscovered: number;
  /** Number of directories visited so far. */
  readonly directoriesVisited: number;
  /** Current path being processed (if applicable). */
  readonly currentPath: string | null;
  /** Total time elapsed (ms). */
  readonly elapsedMs: number;
}

/** Progress callback type. */
export type ProgressCallback = (progress: DiscoveryProgress) => void;

// ── Discovery Result ──

/** The complete result of a discovery operation. */
export interface DiscoveryResult {
  /** All discovered artifacts. */
  readonly artifacts: readonly DiscoveredArtifact[];
  /** Aggregate diagnostics. */
  readonly diagnostics: DiscoveryDiagnostics;
  /** The target that was scanned. */
  readonly target: DiscoveryTarget;
  /** Whether the discovery was truncated (hit a limit). */
  readonly truncated: boolean;
}
