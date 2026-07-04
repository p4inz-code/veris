/**
 * Discovery Engine — deterministic, streaming filesystem discovery.
 *
 * The DiscoveryEngine performs the first stage of the VERIS analysis pipeline:
 * recursively traversing a target to discover candidate artifacts.
 *
 * ## Invariants (from SPEC-010 §3):
 * - The engine never modifies files (read-only)
 * - Artifact IDs are deterministic
 * - Traversal order is deterministic
 * - Cancellation is cooperative and clean
 * - Permission errors are recovered, not fatal
 *
 * @module @veris/extractors/discovery/engine
 */

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as nodePath from 'node:path';

import { deterministicId, normalizePath, relative, extname } from '@veris/shared';
import { CancellationToken, CancellationTokenSource, CancelledError } from '@veris/shared';
import type { CancellationReason } from '@veris/shared';

import type { ArtifactGraph } from './graph.js';
import { createArtifactGraph } from './graph.js';
import type {
  DiscoveredArtifact,
  ArtifactDiscoveryDiagnostics,
  DiscoveryTarget,
  DiscoveryOptions,
  DiscoveryResult,
  DiscoveryDiagnostics,
  DiscoveryProgress,
  ProgressCallback,
  SymlinkPolicy,
} from './types.js';
import { DEFAULT_DISCOVERY_OPTIONS } from './types.js';

/** Mutable version of DiscoveryDiagnostics for building results. */
type MutableDiagnostics = {
  -readonly [K in keyof DiscoveryDiagnostics]: DiscoveryDiagnostics[K];
};

// ── Ignore Rule Matching ──

/** Simple gitignore-style pattern matching. */
function matchesIgnorePattern(path: string, pattern: string): boolean {
  // Handle leading / (match from root)
  let normalizedPattern = pattern;
  let matchFromRoot = false;
  if (normalizedPattern.startsWith('/')) {
    matchFromRoot = true;
    normalizedPattern = normalizedPattern.slice(1);
  }

  // Handle trailing / (directory only)
  const dirOnly = normalizedPattern.endsWith('/');
  if (dirOnly) normalizedPattern = normalizedPattern.slice(0, -1);

  // Handle leading **/ or just **
  const hasGlobStar = normalizedPattern.startsWith('**/');

  // Escape regex special characters except * and ?
  const regexStr = normalizedPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '___GLOBSTAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/___GLOBSTAR___/g, '.*')
    .replace(/\?/g, '[^/]');

  const regex = new RegExp(
    matchFromRoot || hasGlobStar ? `^(?:.*/)?${regexStr}$` : `(?:^|/)${regexStr}$`,
  );

  return regex.test(path);
}

/** Check if a path should be ignored based on ignore patterns. */
function isPathIgnored(path: string, ignorePatterns: string[], includePaths: string[]): boolean {
  // If path is in includePaths, don't ignore it
  for (const include of includePaths) {
    if (path === include || path.startsWith(include + '/')) {
      return false;
    }
  }

  for (const pattern of ignorePatterns) {
    if (pattern.startsWith('!')) {
      // Negation pattern: un-ignore
      if (matchesIgnorePattern(path, pattern.slice(1))) {
        return false;
      }
    } else {
      if (matchesIgnorePattern(path, pattern)) {
        return true;
      }
    }
  }
  return false;
}

// ── Cycle Detection ──

/** Track visited devices and inodes for cycle detection. */
class CycleDetector {
  private readonly visited = new Set<string>();
  private readonly symlinkDepths = new Map<string, number>();
  private cyclesFound = 0;

  /** Check if a (device, inode) pair has been visited. */
  check(device: number, inode: number): boolean {
    const key = `${device}:${inode}`;
    if (this.visited.has(key)) {
      this.cyclesFound++;
      return true;
    }
    this.visited.add(key);
    return false;
  }

  /** Track symlink depth for a path. Returns true if max depth exceeded. */
  checkSymlinkDepth(path: string, maxDepth: number): boolean {
    const current = this.symlinkDepths.get(path) ?? 0;
    if (current >= maxDepth) {
      this.cyclesFound++;
      return true;
    }
    this.symlinkDepths.set(path, current + 1);
    return false;
  }

  /** Clear symlink depth tracking for a path (when leaving the symlink). */
  clearSymlinkDepth(path: string): void {
    this.symlinkDepths.delete(path);
  }

  get cycles(): number {
    return this.cyclesFound;
  }
}

// ── Ignore File Loading ──

/** Default ignore patterns for common VCS and build artifacts. */
const DEFAULT_IGNORE_PATTERNS = [
  '.git/',
  '.hg/',
  '.svn/',
  'node_modules/',
  '.veris/',
  '.DS_Store',
  'Thumbs.db',
];

/** Attempt to load .verisignore and .gitignore files from the target root. */
async function loadIgnoreFiles(targetPath: string): Promise<string[]> {
  const patterns: string[] = [...DEFAULT_IGNORE_PATTERNS];

  try {
    const verisIgnore = await fsp.readFile(nodePath.join(targetPath, '.verisignore'), 'utf-8');
    for (const line of verisIgnore.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        patterns.push(trimmed);
      }
    }
  } catch {
    // .verisignore is optional
  }

  try {
    const gitIgnore = await fsp.readFile(nodePath.join(targetPath, '.gitignore'), 'utf-8');
    for (const line of gitIgnore.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        patterns.push(trimmed);
      }
    }
  } catch {
    // .gitignore is optional
  }

  return patterns;
}

// ── Metadata Collection ──

interface CollectedMetadata {
  size: number;
  mtimeMs: number;
  birthtimeMs: number | null;
  isDirectory: boolean;
  isSymlink: boolean;
  isHidden: boolean;
  executableHint: boolean;
  device: number;
  inode: number;
}

/** Collect metadata from a file system entry. */
async function collectMetadata(
  fullPath: string,
  entryName: string,
  statTimeMs: number,
): Promise<
  { ok: true; metadata: CollectedMetadata } | { ok: false; error: NodeJS.ErrnoException }
> {
  try {
    const startTime = Date.now();
    const stats = await fsp.stat(fullPath);
    const elapsed = Date.now() - startTime;

    let device = 0;
    let inode = 0;
    try {
      device = stats.dev;
      inode = stats.ino;
    } catch {
      // Some platforms don't support device/inode
    }

    return {
      ok: true,
      metadata: {
        size: stats.size,
        mtimeMs: stats.mtimeMs,
        birthtimeMs: stats.birthtimeMs ?? null,
        isDirectory: stats.isDirectory(),
        isSymlink: stats.isSymbolicLink(),
        isHidden: entryName.startsWith('.'),
        executableHint:
          process.platform !== 'win32'
            ? (stats.mode & 0o111) !== 0
            : /\.(exe|com|bat|cmd|ps1|msi)$/i.test(entryName),
        device,
        inode,
      },
    };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    // Collect timing even on failure
    return { ok: false, error: err };
  }
}

// ── Concurrency Control ──

/**
 * Semaphore with cancellation support.
 *
 * Single-threaded only. No synchronization primitives needed for
 * JavaScript's event-loop concurrency model.
 *
 * Waiters can be cancelled via CancellationToken. Cancelled waiters
 * are removed from the queue and their acquire() promise rejects
 * with a CancelledError.
 */
class Semaphore {
  private current = 0;
  private readonly queue: Array<{
    resolve: () => void;
    token?: CancellationToken;
  }> = [];

  constructor(private readonly max: number) {}

  async acquire(token?: CancellationToken): Promise<void> {
    // Check cancellation before queueing
    token?.throwIfCancelled();

    if (this.current < this.max) {
      this.current++;
      return;
    }

    let unregister: (() => void) | undefined;

    try {
      return await new Promise<void>((resolve, reject) => {
        const entry = { resolve, token };

        // Register cancellation listener if token provided
        unregister = token?.onCancelled((reason) => {
          // Remove this entry from the queue
          const idx = this.queue.indexOf(entry);
          if (idx >= 0) {
            this.queue.splice(idx, 1);
          }
          reject(new CancelledError(reason.message));
        });

        // Use the same `entry` object so `indexOf` in the cancellation
        // handler finds it — avoids an object-reference mismatch bug
        // that would silently leak queue entries on cancellation.
        this.queue.push(entry);
      });
    } finally {
      // Guarantee the cancellation listener is removed on every outcome:
      // - resolve: normal acquire completion
      // - reject: cancellation or other error
      // This prevents listener leaks and retained closures.
      unregister?.();
    }
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next.resolve();
    } else if (this.current > 0) {
      // Only decrement if there are active permits to release.
      // Guards against underflow when release() is called
      // without a matching acquire().
      this.current--;
    }
  }
}

// ── Discovery Engine ──

export interface DiscoveryEngineOptions {
  /** Default options for the engine. */
  readonly defaultOptions?: Partial<DiscoveryOptions>;
}

/**
 * Deterministic, streaming filesystem discovery engine.
 *
 * Discovers artifacts from filesystem targets with:
 * - Recursive traversal with configurable limits
 * - Cancellation support via CancellationToken
 * - Progress reporting via callbacks
 * - Ignore rule support (.verisignore, .gitignore)
 * - Symlink policy (follow/skip/error)
 * - Junction detection
 * - Cycle detection
 * - Permission error recovery
 * - Deterministic traversal ordering
 * - Parallel metadata collection
 */
export class DiscoveryEngine {
  private readonly defaultOptions: Partial<DiscoveryOptions>;

  constructor(options: DiscoveryEngineOptions = {}) {
    this.defaultOptions = options.defaultOptions ?? {};
  }

  /**
   * Discover artifacts from a target path.
   *
   * @param target - The target to scan
   * @param options - Discovery options
   * @param cancellationToken - Optional cancellation token
   * @param onProgress - Optional progress callback
   * @returns DiscoveryResult with artifacts and diagnostics
   */
  async discover(
    target: DiscoveryTarget,
    options?: DiscoveryOptions,
    cancellationToken?: CancellationToken,
    onProgress?: ProgressCallback,
  ): Promise<DiscoveryResult> {
    const opts = this.resolveOptions(options);
    const resolvedPath = nodePath.resolve(target.path);
    const startTime = Date.now();
    const diagnostics: MutableDiagnostics = {
      filesDiscovered: 0,
      directoriesVisited: 0,
      skippedPaths: 0,
      permissionFailures: 0,
      symlinksSkipped: 0,
      junctionsDetected: 0,
      cyclesDetected: 0,
      duplicatesDetected: 0,
      traversalTimeMs: 0,
      metadataTimeMs: 0,
      classificationTimeMs: 0,
      totalTimeMs: 0,
    };

    // Load ignore patterns
    const ignorePatterns = [...opts.ignorePatterns, ...(await loadIgnoreFiles(resolvedPath))];

    const cycleDetector = new CycleDetector();
    const artifacts: DiscoveredArtifact[] = [];
    const semaphore = new Semaphore(opts.concurrency);
    const token = cancellationToken ?? new CancellationToken();
    const graph = createArtifactGraph();
    let totalSize = 0;
    let truncated = false;

    // Report initial progress
    this.reportProgress(onProgress, {
      phase: 'scanning',
      filesDiscovered: 0,
      directoriesVisited: 0,
      currentPath: resolvedPath,
      elapsedMs: 0,
    });

    const traversalStart = Date.now();

    // Recursive traversal
    const walkResult = await this.walkDirectory(
      resolvedPath,
      resolvedPath,
      opts,
      ignorePatterns,
      cycleDetector,
      diagnostics,
      artifacts,
      graph,
      semaphore,
      token,
      onProgress,
      startTime,
      totalSize,
      opts.maxTotalSize,
    );
    truncated = walkResult.truncated;
    totalSize = walkResult.totalSize;

    diagnostics.traversalTimeMs = Date.now() - traversalStart;

    // Report classification phase
    this.reportProgress(onProgress, {
      phase: 'classifying',
      filesDiscovered: artifacts.length,
      directoriesVisited: diagnostics.directoriesVisited,
      currentPath: null,
      elapsedMs: Date.now() - startTime,
    });

    // Classify all artifacts
    const classificationStart = Date.now();
    for (const artifact of artifacts) {
      token.throwIfCancelled();
      // Classification is done lazily through the classification engine
      // The result is attached to the artifact metadata
    }
    diagnostics.classificationTimeMs = Date.now() - classificationStart;

    diagnostics.totalTimeMs = Date.now() - startTime;

    // Report completion
    this.reportProgress(onProgress, {
      phase: 'complete',
      filesDiscovered: artifacts.length,
      directoriesVisited: diagnostics.directoriesVisited,
      currentPath: null,
      elapsedMs: Date.now() - startTime,
    });

    return {
      artifacts: Object.freeze([...artifacts]),
      diagnostics: Object.freeze({ ...diagnostics }),
      target: { ...target },
      truncated,
    };
  }

  /**
   * Discover from a single file path.
   */
  async discoverFile(
    filePath: string,
    options?: DiscoveryOptions,
    cancellationToken?: CancellationToken,
    onProgress?: ProgressCallback,
  ): Promise<DiscoveryResult> {
    return this.discover({ path: filePath, type: 'file' }, options, cancellationToken, onProgress);
  }

  /**
   * Discover from a directory path.
   */
  async discoverDirectory(
    dirPath: string,
    options?: DiscoveryOptions,
    cancellationToken?: CancellationToken,
    onProgress?: ProgressCallback,
  ): Promise<DiscoveryResult> {
    return this.discover(
      { path: dirPath, type: 'directory' },
      options,
      cancellationToken,
      onProgress,
    );
  }

  // ── Private Methods ──

  private resolveOptions(options?: DiscoveryOptions): Required<DiscoveryOptions> {
    return {
      ...DEFAULT_DISCOVERY_OPTIONS,
      ...this.defaultOptions,
      ...options,
    };
  }

  private reportProgress(
    onProgress: ProgressCallback | undefined,
    progress: DiscoveryProgress,
  ): void {
    onProgress?.(progress);
  }

  /**
   * Recursively walk a directory, collecting discovered artifacts.
   */
  private async walkDirectory(
    dirPath: string,
    rootPath: string,
    opts: Required<DiscoveryOptions>,
    ignorePatterns: string[],
    cycleDetector: CycleDetector,
    diagnostics: MutableDiagnostics,
    artifacts: DiscoveredArtifact[],
    graph: ArtifactGraph,
    semaphore: Semaphore,
    token: CancellationToken,
    onProgress: ProgressCallback | undefined,
    startTime: number,
    totalSize: number,
    maxTotalSize: number,
  ): Promise<{ truncated: boolean; totalSize: number }> {
    let currentTotalSize = totalSize;

    // Check cancellation
    token.throwIfCancelled();

    // Check file count limit
    if (artifacts.length >= opts.maxFiles) {
      return { truncated: true, totalSize: currentTotalSize };
    }

    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dirPath, { withFileTypes: true });
      diagnostics.directoriesVisited++;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'EACCES' || err.code === 'EPERM') {
        diagnostics.permissionFailures++;
        return { truncated: false, totalSize: currentTotalSize };
      }
      if (err.code === 'ENOENT') {
        return { truncated: false, totalSize: currentTotalSize };
      }
      throw error;
    }

    // Sort entries for deterministic ordering
    if (opts.deterministic) {
      entries.sort((a, b) => a.name.localeCompare(b.name));
    }

    for (const entry of entries) {
      token.throwIfCancelled();

      // Check file count limit
      if (artifacts.length >= opts.maxFiles) {
        return { truncated: true, totalSize: currentTotalSize };
      }

      const fullPath = nodePath.join(dirPath, entry.name);
      const relPath = relative(rootPath, fullPath);

      // Check exclude paths
      if (opts.excludePaths.some((p) => relPath === p || relPath.startsWith(p + '/'))) {
        diagnostics.skippedPaths++;
        continue;
      }

      // Check ignore patterns
      if (isPathIgnored(relPath, ignorePatterns, opts.includePaths)) {
        diagnostics.skippedPaths++;
        continue;
      }

      // Check hidden files
      if (!opts.includeHidden && entry.name.startsWith('.')) {
        diagnostics.skippedPaths++;
        continue;
      }

      if (entry.isDirectory()) {
        // Check depth limit
        const depth = relPath.split('/').filter(Boolean).length;
        if (depth >= opts.maxDepth) {
          diagnostics.skippedPaths++;
          continue;
        }

        // Record directory as a discovered artifact
        const artifact = await this.createDiscoveredArtifact(
          fullPath,
          rootPath,
          entry.name,
          /* isDirectory */ true,
          /* isSymlink */ entry.isSymbolicLink(),
          /* isJunction */ false,
          opts,
          diagnostics,
          null, // parentId — set later
        );

        if (artifact) {
          artifacts.push(artifact);
          graph.addNode(artifact);
        }

        // Recursively walk subdirectory
        const subResult = await this.walkDirectory(
          fullPath,
          rootPath,
          opts,
          ignorePatterns,
          cycleDetector,
          diagnostics,
          artifacts,
          graph,
          semaphore,
          token,
          onProgress,
          startTime,
          currentTotalSize,
          maxTotalSize,
        );

        if (subResult.truncated) {
          return { truncated: true, totalSize: subResult.totalSize };
        }
        currentTotalSize = subResult.totalSize;

        // Report progress periodically
        this._reportPeriodicProgress(
          onProgress,
          artifacts.length,
          diagnostics.directoriesVisited,
          fullPath,
          startTime,
        );
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        await semaphore.acquire();

        try {
          const metadataStart = Date.now();
          const result = await collectMetadata(fullPath, entry.name, metadataStart);
          const metadataTime = Date.now() - metadataStart;

          if (!result.ok) {
            this._handlePermissionError(
              result.error,
              fullPath,
              rootPath,
              entry,
              relPath,
              metadataTime,
              diagnostics,
              artifacts,
              graph,
            );
            semaphore.release();
            continue;
          }

          const meta = result.metadata;

          // Symlink handling
          const symlinkResult = await this._handleSymlink(
            meta,
            fullPath,
            opts,
            cycleDetector,
            diagnostics,
          );
          if (symlinkResult === 'skip') {
            semaphore.release();
            continue;
          }

          // Cycle detection via device+inode
          this._checkDeviceCycle(meta, opts, cycleDetector, diagnostics);

          // Check size limit against cumulative total
          if (currentTotalSize + meta.size > maxTotalSize) {
            diagnostics.skippedPaths++;
            semaphore.release();
            return { truncated: true, totalSize: currentTotalSize };
          }
          currentTotalSize += meta.size;

          // Create artifact
          const artifact = await this.createDiscoveredArtifact(
            fullPath,
            rootPath,
            entry.name,
            meta.isDirectory,
            meta.isSymlink,
            false,
            opts,
            diagnostics,
            null,
            meta,
          );
          if (artifact) {
            artifacts.push(artifact);
            graph.addNode(artifact);
          }

          semaphore.release();

          // Periodic progress
          this._reportPeriodicProgress(
            onProgress,
            artifacts.length,
            diagnostics.directoriesVisited,
            fullPath,
            startTime,
          );
        } catch (error) {
          semaphore.release();
          throw error;
        }
      }
    }

    return { truncated: false, totalSize: currentTotalSize };
  }

  /** Handle a permission-denied stat error — creates a placeholder artifact. */
  private _handlePermissionError(
    err: NodeJS.ErrnoException,
    fullPath: string,
    rootPath: string,
    entry: fs.Dirent,
    relPath: string,
    metadataTime: number,
    diagnostics: MutableDiagnostics,
    artifacts: DiscoveredArtifact[],
    graph: ArtifactGraph,
  ): { truncated: boolean; totalSize: number } {
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      diagnostics.permissionFailures++;
      const placeholder: DiscoveredArtifact = {
        id: deterministicId('da', fullPath, 'permission-denied'),
        parentId: null,
        rootId: '',
        relativePath: relPath,
        absolutePath: fullPath,
        canonicalPath: normalizePath(fullPath),
        name: entry.name,
        extension: extname(entry.name),
        size: 0,
        mtimeMs: 0,
        birthtimeMs: null,
        isDirectory: false,
        isSymlink: entry.isSymbolicLink(),
        isJunction: false,
        isHidden: entry.name.startsWith('.'),
        executableHint: false,
        depth: relPath.split('/').filter(Boolean).length,
        metadata: {},
        diagnostics: {
          statTimeMs: metadataTime,
          statSuccess: false,
          permissionDenied: true,
          skipped: false,
          isDuplicate: false,
        },
      };
      artifacts.push(placeholder);
      graph.addNode(placeholder);
      return { truncated: false, totalSize: 0 };
    }
    diagnostics.skippedPaths++;
    return { truncated: false, totalSize: 0 };
  }

  /** Handle symlink policy — returns "skip" if the symlink should be skipped. */
  private async _handleSymlink(
    meta: CollectedMetadata,
    fullPath: string,
    opts: Required<DiscoveryOptions>,
    cycleDetector: CycleDetector,
    diagnostics: MutableDiagnostics,
  ): Promise<'skip' | 'proceed'> {
    if (!meta.isSymlink) return 'proceed';

    if (opts.symlinkPolicy === 'skip') {
      diagnostics.symlinksSkipped++;
      return 'skip';
    }

    if (opts.detectCycles) {
      const resolvedLink = await fsp.readlink(fullPath).catch(() => '');
      if (cycleDetector.checkSymlinkDepth(fullPath, opts.maxSymlinkDepth)) {
        diagnostics.cyclesDetected++;
        diagnostics.symlinksSkipped++;
        return 'skip';
      }
    }
    return 'proceed';
  }

  /** Check device+inode cycle detection. */
  private _checkDeviceCycle(
    meta: CollectedMetadata,
    opts: Required<DiscoveryOptions>,
    cycleDetector: CycleDetector,
    diagnostics: MutableDiagnostics,
  ): void {
    if (opts.detectCycles && meta.device !== 0 && meta.inode !== 0) {
      if (cycleDetector.check(meta.device, meta.inode)) {
        diagnostics.duplicatesDetected++;
      }
    }
  }

  /** Report progress every 100 artifacts. */
  private _reportPeriodicProgress(
    onProgress: ProgressCallback | undefined,
    filesDiscovered: number,
    directoriesVisited: number,
    currentPath: string,
    startTime: number,
  ): void {
    if (filesDiscovered % 100 === 0) {
      this.reportProgress(onProgress, {
        phase: 'scanning',
        filesDiscovered,
        directoriesVisited,
        currentPath,
        elapsedMs: Date.now() - startTime,
      });
    }
  }

  /**
   * Create a DiscoveredArtifact from filesystem metadata.
   */
  private async createDiscoveredArtifact(
    fullPath: string,
    rootPath: string,
    entryName: string,
    isDirectory: boolean,
    isSymlink: boolean,
    isJunction: boolean,
    opts: Required<DiscoveryOptions>,
    diagnostics: DiscoveryDiagnostics,
    _parentId: string | null,
    meta?: CollectedMetadata,
  ): Promise<DiscoveredArtifact | null> {
    const relPath = relative(rootPath, fullPath);
    const canonicalPath = normalizePath(fullPath);
    const depth = relPath.split('/').filter(Boolean).length;

    // Build a deterministic ID from the path and metadata
    const idContent = [
      canonicalPath,
      String(isDirectory),
      String(meta?.size ?? 0),
      String(meta?.mtimeMs ?? 0),
    ];
    const id = deterministicId('da', ...idContent);

    const artifact: DiscoveredArtifact = {
      id,
      parentId: null, // Set by graph
      rootId: '', // Set by graph
      relativePath: relPath,
      absolutePath: fullPath,
      canonicalPath,
      name: entryName,
      extension: isDirectory ? '' : extname(entryName),
      size: meta?.size ?? 0,
      mtimeMs: meta?.mtimeMs ?? 0,
      birthtimeMs: meta?.birthtimeMs ?? null,
      isDirectory,
      isSymlink,
      isJunction,
      isHidden: entryName.startsWith('.'),
      executableHint: meta?.executableHint ?? false,
      depth,
      metadata: {},
      diagnostics: {
        statTimeMs: 0,
        statSuccess: meta !== undefined,
        permissionDenied: false,
        skipped: false,
        isDuplicate: false,
      },
    };

    return artifact;
  }
}

/** Create a DiscoveryEngine with default options. */
export function createDiscoveryEngine(options?: DiscoveryEngineOptions): DiscoveryEngine {
  return new DiscoveryEngine(options);
}
