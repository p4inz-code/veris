/**
 * Discovery-specific types for @veris/discovery.
 *
 * @module @veris/discovery/types
 */

import type { DiscoveredArtifact, ArtifactNode } from '@veris/core';
import type { CancellationToken } from '@veris/shared';

/** Symlink resolution policy. */
export type SymlinkPolicy = 'follow' | 'skip' | 'error';

/** Junction resolution policy (Windows). */
export type JunctionPolicy = 'follow' | 'skip' | 'error';

/** Configuration options for the Discovery Engine. */
export interface DiscoveryOptions {
  /** Maximum directory traversal depth. Default: 50. */
  readonly maxDepth?: number;
  /** Maximum number of files to discover. Default: 100,000. */
  readonly maxFiles?: number;
  /** Maximum file size in bytes to include. Larger files are skipped. Default: Infinity. */
  readonly maxFileSize?: number;
  /** Whether to include hidden files (dotfiles). Default: false. */
  readonly includeHidden?: boolean;
  /** Whether to include hidden directories. Default: false. */
  readonly includeHiddenDirs?: boolean;
  /** Symlink resolution policy. Default: "follow". */
  readonly symlinkPolicy?: SymlinkPolicy;
  /** Junction resolution policy (Windows). Default: "follow". */
  readonly junctionPolicy?: JunctionPolicy;
  /** Maximum symlink resolution depth before cycle detection. Default: 40. */
  readonly maxSymlinkDepth?: number;
  /** Glob patterns to exclude (e.g., ["node_modules/**", ".git/**"]). */
  readonly excludePatterns?: readonly string[];
  /** Bounded concurrency for metadata fetching. Default: 8. */
  readonly concurrency?: number;
  /** Batch size for metadata fetching. Default: 64. */
  readonly batchSize?: number;
  /** Whether to collect detailed diagnostics. Default: true. */
  readonly diagnostics?: boolean;
}

/** Default discovery options. */
export const DEFAULT_DISCOVERY_OPTIONS: Required<DiscoveryOptions> = {
  maxDepth: 50,
  maxFiles: 100_000,
  maxFileSize: Infinity,
  includeHidden: false,
  includeHiddenDirs: false,
  symlinkPolicy: 'follow',
  junctionPolicy: 'follow',
  maxSymlinkDepth: 40,
  excludePatterns: [],
  concurrency: 8,
  batchSize: 64,
  diagnostics: true,
} as const;

/** Progress information emitted during discovery. */
export interface DiscoveryProgress {
  /** Number of files discovered so far. */
  readonly filesDiscovered: number;
  /** Number of directories visited so far. */
  readonly directoriesVisited: number;
  /** Number of paths skipped due to filters. */
  readonly pathsSkipped: number;
  /** Current path being processed. */
  readonly currentPath: string;
  /** Total elapsed time in milliseconds. */
  readonly elapsedMs: number;
}

/** Detailed discovery diagnostics collected during traversal. */
export interface DiscoveryDiagnostics {
  /** Total files visited. */
  readonly filesVisited: number;
  /** Total directories visited. */
  readonly directoriesVisited: number;
  /** Paths skipped due to filters/patterns/limits. */
  readonly skippedPaths: readonly string[];
  /** Paths where permission errors occurred. */
  readonly permissionFailures: readonly string[];
  /** Hidden artifacts discovered. */
  readonly hiddenArtifacts: readonly string[];
  /** Symlinks skipped (not followed). */
  readonly symlinkSkips: readonly string[];
  /** Symlink cycles detected and prevented. */
  readonly cycleDetections: readonly string[];
  /** Time spent on traversal in milliseconds. */
  readonly traversalTimeMs: number;
  /** Time spent on metadata fetching in milliseconds. */
  readonly metadataTimeMs: number;
  /** Time spent on classification in milliseconds. */
  readonly classificationTimeMs: number;
  /** Total discovery time in milliseconds. */
  readonly totalTimeMs: number;
}

/** Discovery result — the output of a discovery operation. */
export interface DiscoveryResult {
  /** The fully constructed artifact graph. */
  readonly graph: ArtifactGraph;
  /** All discovered artifacts, ordered deterministically. */
  readonly artifacts: readonly DiscoveredArtifact[];
  /** The root artifact (scan target). */
  readonly root: DiscoveredArtifact;
  /** Discovery diagnostics. */
  readonly diagnostics: DiscoveryDiagnostics;
}

/**
 * Immutable artifact graph with parent-child relationships
 * and fast lookups by ID and path.
 */
export interface ArtifactGraph {
  /** Get an artifact by its ID. Returns undefined if not found. */
  getById(id: string): DiscoveredArtifact | undefined;
  /** Get an artifact by its absolute path. Returns undefined if not found. */
  getByPath(absolutePath: string): DiscoveredArtifact | undefined;
  /** Get the children of an artifact (direct children only). */
  getChildren(parentId: string): readonly DiscoveredArtifact[];
  /** Get the parent of an artifact. Returns null for root. */
  getParent(childId: string): DiscoveredArtifact | null;
  /** Get the root artifact. */
  getRoot(): DiscoveredArtifact;
  /** Get all artifacts in the graph, in stable deterministic order. */
  getAll(): readonly DiscoveredArtifact[];
  /** Total number of artifacts in the graph. */
  readonly size: number;
  /** Whether the graph contains an artifact with the given ID. */
  has(id: string): boolean;
  /** Get the root ID. */
  readonly rootId: string;
}

/** Callback type for progress reporting. */
export type ProgressCallback = (progress: DiscoveryProgress) => void;

/** Ignore rules for discovery — parsed from .gitignore/.verisignore patterns. */
export interface IgnoreRules {
  /** Whether to check if a path should be ignored. */
  isIgnored(relativePath: string): boolean;
  /** Add an ignore pattern. */
  addPattern(pattern: string): void;
  /** Add multiple ignore patterns. */
  addPatterns(patterns: readonly string[]): void;
}
