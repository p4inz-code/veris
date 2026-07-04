/**
 * Deterministic streaming filesystem discovery engine for VERIS.
 *
 * Provides recursive, read-only traversal of the filesystem with
 * cancellation support, progress reporting, ignore rules, limits,
 * cycle detection, and permission recovery.
 *
 * @module @veris/discovery/discovery-engine
 */

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

import type { ArtifactType, DiscoveredArtifact } from '@veris/core';
import {
  CancellationToken,
  CancellationTokenSource,
  deterministicId,
  err,
  ok,
  type Result,
} from '@veris/shared';

import { ArtifactGraphBuilder } from './artifact-graph.js';
import { DiagnosticsCollector } from './diagnostics.js';
import { createIgnoreRules } from './ignore-rules.js';
import { DEFAULT_DISCOVERY_OPTIONS } from './types.js';
import type {
  DiscoveryDiagnostics,
  DiscoveryOptions,
  DiscoveryProgress,
  DiscoveryResult,
  ProgressCallback,
} from './types.js';

/** Default ignore patterns for VERIS discovery. */
const DEFAULT_IGNORE_PATTERNS: readonly string[] = [
  '.git/',
  '.svn/',
  '.hg/',
  'node_modules/',
  '.veris/',
];

/**
 * VERIS Discovery Engine.
 *
 * Provides deterministic, streaming filesystem discovery with comprehensive
 * filtering, safety checks, and diagnostics.
 *
 * ### Invariants
 * - Read-only: never modifies the filesystem
 * - Deterministic: same input produces the same output order
 * - Streaming: emits artifacts as they are discovered
 * - Cancellable: supports cooperative cancellation
 * - Safe: detects and prevents symlink/junction cycles
 * - Resilient: permission errors are recovered with diagnostics
 */
export class DiscoveryEngine {
  private readonly _options: Required<DiscoveryOptions>;

  constructor(options: DiscoveryOptions = {}) {
    this._options = { ...DEFAULT_DISCOVERY_OPTIONS, ...options };
  }

  /** Get the current options (immutable snapshot). */
  get options(): Required<DiscoveryOptions> {
    return { ...this._options };
  }

  /**
   * Discover artifacts from the given target path.
   *
   * Returns a DiscoveryResult containing the artifact graph, all artifacts,
   * and discovery diagnostics.
   */
  async discover(
    targetPath: string,
    token?: CancellationToken,
    onProgress?: ProgressCallback,
  ): Promise<DiscoveryResult> {
    const ct = token ?? new CancellationTokenSource().token;
    const absolutePath = path.resolve(targetPath);
    const collector = new DiagnosticsCollector();
    const builder = new ArtifactGraphBuilder();
    const ignoreRules = createIgnoreRules();

    // Add default and user-specified ignore patterns
    ignoreRules.addPatterns(DEFAULT_IGNORE_PATTERNS);
    ignoreRules.addPatterns(this._options.excludePatterns);

    const startTime = performance.now();

    // Validate target path
    ct.throwIfCancelled();
    collector.startTraversal();

    let targetStats: fs.Stats;
    try {
      targetStats = await fsp.stat(absolutePath);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        throw new Error(`Target path does not exist: "${absolutePath}"`);
      }
      if (err.code === 'EACCES' || err.code === 'EPERM') {
        throw new Error(`Permission denied accessing target: "${absolutePath}"`);
      }
      throw error;
    }

    // Track visited paths for cycle detection (real paths)
    const visitedRealPaths = new Set<string>();
    const visitedSymlinks = new Set<string>();

    // Counters for streaming progress
    let filesDiscovered = 0;
    let directoriesVisited = 0;
    let pathsSkipped = 0;
    const lastProgressTime = { current: startTime };

    // Process the root
    const rootArtifact = await this._processEntry(
      absolutePath,
      null, // no parent
      null, // root is its own root
      0, // depth 0
      targetStats,
      collector,
      builder,
      ignoreRules,
      visitedRealPaths,
      visitedSymlinks,
    );

    // Add the root artifact to the graph builder
    builder.add(rootArtifact);

    if (rootArtifact.isDirectory) {
      directoriesVisited++;
      await this._traverseDirectory(
        rootArtifact,
        absolutePath,
        absolutePath, // scan root
        1, // depth 1
        ct,
        collector,
        builder,
        ignoreRules,
        visitedRealPaths,
        visitedSymlinks,
        () => ({
          filesDiscovered,
          directoriesVisited,
          pathsSkipped,
          currentPath: absolutePath,
          elapsedMs: performance.now() - startTime,
        }),
        onProgress,
        (f) => {
          filesDiscovered = f;
        },
        (d) => {
          directoriesVisited = d;
        },
        (s) => {
          pathsSkipped = s;
        },
      );
    }

    collector.endTraversal();

    // Build the graph
    const graph = builder.build();

    // Build diagnostics
    collector.endMetadata();
    collector.endClassification();
    const diagnostics = collector.snapshot();

    return {
      graph,
      artifacts: graph.getAll(),
      root: rootArtifact,
      diagnostics,
    };
  }

  /**
   * Discover a single file (non-recursive).
   */
  async discoverFile(
    filePath: string,
    token?: CancellationToken,
  ): Promise<DiscoveredArtifact | null> {
    const absolutePath = path.resolve(filePath);
    const ct = token ?? new CancellationTokenSource().token;

    try {
      const stats = await fsp.stat(absolutePath);
      if (!stats.isFile()) return null;

      const collector = new DiagnosticsCollector();
      const builder = new ArtifactGraphBuilder();
      const ignoreRules = createIgnoreRules();

      const artifact = await this._processEntry(
        absolutePath,
        null,
        null,
        0,
        stats,
        collector,
        builder,
        ignoreRules,
        new Set(),
        new Set(),
      );

      return artifact;
    } catch {
      return null;
    }
  }

  /**
   * Stream artifacts from a directory traversal.
   * Yields artifacts as they are discovered, enabling low-memory processing.
   */
  async *stream(
    targetPath: string,
    token?: CancellationToken,
  ): AsyncGenerator<DiscoveredArtifact, DiscoveryDiagnostics, void> {
    const ct = token ?? new CancellationTokenSource().token;
    const absolutePath = path.resolve(targetPath);
    const collector = new DiagnosticsCollector();
    const ignoreRules = createIgnoreRules();

    ignoreRules.addPatterns(DEFAULT_IGNORE_PATTERNS);
    ignoreRules.addPatterns(this._options.excludePatterns);

    collector.startTraversal();

    let targetStats: fs.Stats;
    try {
      targetStats = await fsp.stat(absolutePath);
    } catch {
      collector.endTraversal();
      return collector.snapshot();
    }

    const visitedRealPaths = new Set<string>();
    const visitedSymlinks = new Set<string>();

    const rootArtifact = await this._processEntry(
      absolutePath,
      null,
      null,
      0,
      targetStats,
      collector,
      null, // no builder needed for streaming
      ignoreRules,
      visitedRealPaths,
      visitedSymlinks,
    );

    yield rootArtifact;

    if (targetStats.isDirectory()) {
      yield* this._streamDirectory(
        absolutePath,
        absolutePath,
        1,
        ct,
        collector,
        ignoreRules,
        visitedRealPaths,
        visitedSymlinks,
      );
    }

    collector.endTraversal();
    collector.endMetadata();
    collector.endClassification();
    return collector.snapshot();
  }

  /**
   * Recursively traverse a directory, emitting artifacts.
   */
  private async _traverseDirectory(
    parentArtifact: DiscoveredArtifact,
    dirPath: string,
    scanRoot: string,
    depth: number,
    ct: CancellationToken,
    collector: DiagnosticsCollector,
    builder: ArtifactGraphBuilder | null,
    ignoreRules: ReturnType<typeof createIgnoreRules>,
    visitedRealPaths: Set<string>,
    visitedSymlinks: Set<string>,
    getCurrentCounts: () => {
      filesDiscovered: number;
      directoriesVisited: number;
      pathsSkipped: number;
    },
    onProgress?: ProgressCallback,
    setFilesDiscovered?: (n: number) => void,
    setDirectoriesVisited?: (n: number) => void,
    setPathsSkipped?: (n: number) => void,
  ): Promise<void> {
    if (depth > this._options.maxDepth) return;

    // Check cancellation
    ct.throwIfCancelled();

    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dirPath, { withFileTypes: true });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'EACCES' || err.code === 'EPERM') {
        collector.recordPermissionFailure(dirPath);
        collector.recordDirectory();
        return;
      }
      throw error;
    }

    // Sort entries deterministically
    entries.sort((a, b) => a.name.localeCompare(b.name));

    // Batch stat calls for efficiency
    const batch: Array<{ name: string; dirent: fs.Dirent }> = [];

    for (const entry of entries) {
      // Check file count limit
      const counts = getCurrentCounts();
      if (counts.filesDiscovered >= this._options.maxFiles) return;

      // Skip hidden files/dirs
      if (entry.name.startsWith('.')) {
        if (entry.isDirectory() && !this._options.includeHiddenDirs) {
          collector.recordHiddenArtifact(path.join(dirPath, entry.name));
          continue;
        }
        if (entry.isFile() && !this._options.includeHidden) {
          continue;
        }
      }

      const entryPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(scanRoot, entryPath);

      // Check ignore rules
      if (ignoreRules.isIgnored(relativePath.replace(/\\/g, '/'))) {
        if (setPathsSkipped) setPathsSkipped(getCurrentCounts().pathsSkipped + 1);
        collector.recordSkipped(entryPath);
        continue;
      }

      // Handle symlinks
      if (entry.isSymbolicLink()) {
        const handled = await this._handleSymlink(
          entryPath,
          entry.name,
          parentArtifact,
          scanRoot,
          depth,
          ct,
          collector,
          builder,
          ignoreRules,
          visitedRealPaths,
          visitedSymlinks,
          getCurrentCounts,
          onProgress,
          setFilesDiscovered,
          setDirectoriesVisited,
          setPathsSkipped,
        );
        if (handled) continue;
      }

      // Handle junctions (Windows)
      if (this._isJunction(entry)) {
        const handled = await this._handleJunction(
          entryPath,
          entry.name,
          parentArtifact,
          scanRoot,
          depth,
          ct,
          collector,
          builder,
          ignoreRules,
          visitedRealPaths,
          visitedSymlinks,
          getCurrentCounts,
          onProgress,
          setFilesDiscovered,
          setDirectoriesVisited,
          setPathsSkipped,
        );
        if (handled) continue;
      }

      // For regular files and directories, batch stat calls
      if (entry.isFile() || entry.isDirectory()) {
        batch.push({ name: entry.name, dirent: entry });
      }
    }

    // Process batch
    const results = await this._batchStat(dirPath, batch, collector);

    for (const result of results) {
      // Check file count limit before processing each result
      if (getCurrentCounts().filesDiscovered >= this._options.maxFiles) return;
      if (!result.ok) {
        if (setPathsSkipped) setPathsSkipped(getCurrentCounts().pathsSkipped + 1);
        continue;
      }

      const { name, stats: entryStats } = result.value;

      if (entryStats.isFile()) {
        // Check file size limit
        if (entryStats.size > this._options.maxFileSize) {
          if (setPathsSkipped) setPathsSkipped(getCurrentCounts().pathsSkipped + 1);
          collector.recordSkipped(path.join(dirPath, name));
          continue;
        }

        const entryPath = path.join(dirPath, name);
        collector.recordFile();

        const counts = getCurrentCounts();
        if (setFilesDiscovered) setFilesDiscovered(counts.filesDiscovered + 1);

        const artifact = await this._createArtifact(
          entryPath,
          parentArtifact.id,
          parentArtifact.rootId,
          depth,
          entryStats,
          false,
          false,
          false,
          false,
          false,
          collector,
        );
        if (builder) builder.add(artifact);

        // Progress reporting
        if (onProgress) {
          this._reportProgress(onProgress, getCurrentCounts, startTimeTracker(performance.now()));
        }

        // Check if we've hit the file limit after adding this file
        if (getCurrentCounts().filesDiscovered >= this._options.maxFiles) return;
      } else if (entryStats.isDirectory()) {
        const entryPath = path.join(dirPath, name);
        collector.recordDirectory();
        if (setDirectoriesVisited) setDirectoriesVisited(getCurrentCounts().directoriesVisited + 1);

        const dirArtifact = await this._createArtifact(
          entryPath,
          parentArtifact.id,
          parentArtifact.rootId,
          depth,
          entryStats,
          true,
          false,
          false,
          false,
          false,
          collector,
        );
        if (builder) builder.add(dirArtifact);

        // Recurse into subdirectory
        await this._traverseDirectory(
          dirArtifact,
          entryPath,
          scanRoot,
          depth + 1,
          ct,
          collector,
          builder,
          ignoreRules,
          visitedRealPaths,
          visitedSymlinks,
          getCurrentCounts,
          onProgress,
          setFilesDiscovered,
          setDirectoriesVisited,
          setPathsSkipped,
        );
      }
    }

    // Check cancellation at end of directory
    ct.throwIfCancelled();
  }

  /**
   * Stream entries from a directory without building the graph.
   */
  private async *_streamDirectory(
    dirPath: string,
    scanRoot: string,
    depth: number,
    ct: CancellationToken,
    collector: DiagnosticsCollector,
    ignoreRules: ReturnType<typeof createIgnoreRules>,
    visitedRealPaths: Set<string>,
    visitedSymlinks: Set<string>,
  ): AsyncGenerator<DiscoveredArtifact, void, void> {
    if (depth > this._options.maxDepth) return;
    ct.throwIfCancelled();

    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      // Skip hidden
      if (entry.name.startsWith('.')) continue;

      const entryPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(scanRoot, entryPath);

      if (ignoreRules.isIgnored(relativePath.replace(/\\/g, '/'))) {
        continue;
      }

      let stats: fs.Stats | null = null;
      try {
        stats = await fsp.stat(entryPath);
      } catch {
        continue;
      }

      if (stats) {
        const artifact = await this._createArtifact(
          entryPath,
          null,
          null,
          depth,
          stats,
          stats.isDirectory(),
          entry.isSymbolicLink(),
          false,
          false,
          false,
          collector,
        );
        yield artifact;

        if (stats.isDirectory()) {
          yield* this._streamDirectory(
            entryPath,
            scanRoot,
            depth + 1,
            ct,
            collector,
            ignoreRules,
            visitedRealPaths,
            visitedSymlinks,
          );
        }
      }
    }
  }

  /**
   * Handle a symbolic link entry based on the symlink policy.
   * Returns true if the entry was handled (skip/error) and should not proceed
   * to normal file/directory processing.
   */
  private async _handleSymlink(
    entryPath: string,
    name: string,
    parentArtifact: DiscoveredArtifact,
    scanRoot: string,
    depth: number,
    ct: CancellationToken,
    collector: DiagnosticsCollector,
    builder: ArtifactGraphBuilder | null,
    ignoreRules: ReturnType<typeof createIgnoreRules>,
    visitedRealPaths: Set<string>,
    visitedSymlinks: Set<string>,
    getCurrentCounts: () => {
      filesDiscovered: number;
      directoriesVisited: number;
      pathsSkipped: number;
    },
    onProgress?: ProgressCallback,
    setFilesDiscovered?: (n: number) => void,
    setDirectoriesVisited?: (n: number) => void,
    setPathsSkipped?: (n: number) => void,
  ): Promise<boolean> {
    const policy = this._options.symlinkPolicy;

    if (policy === 'skip') {
      collector.recordSymlinkSkip(entryPath);
      return true;
    }

    if (policy === 'error') {
      throw new Error(`Symlink encountered and policy is "error": "${entryPath}"`);
    }

    // policy === "follow"
    let targetPath: string;
    try {
      targetPath = await fsp.readlink(entryPath);
    } catch {
      // Broken symlink — can't read link target
      collector.recordSymlinkSkip(entryPath);
      const stats = await this._lstatSafe(entryPath);
      if (stats) {
        const artifact = await this._createSymlinkArtifact(
          entryPath,
          parentArtifact.id,
          parentArtifact.rootId,
          depth,
          stats,
          entryPath,
          false,
          'unknown',
          collector,
        );
        if (builder) builder.add(artifact);
      }
      return true;
    }

    // Resolve relative symlinks
    const resolvedTarget = path.resolve(path.dirname(entryPath), targetPath);

    // Check for symlink cycles
    if (visitedSymlinks.has(resolvedTarget)) {
      collector.recordCycleDetection(entryPath);
      return true;
    }
    visitedSymlinks.add(resolvedTarget);

    // Check symlink depth
    if (visitedSymlinks.size > this._options.maxSymlinkDepth) {
      collector.recordCycleDetection(entryPath);
      return true;
    }

    // Check if we've already visited this real path
    if (visitedRealPaths.has(resolvedTarget)) {
      collector.recordCycleDetection(entryPath);
      return true;
    }

    let targetStats: fs.Stats;
    try {
      targetStats = await fsp.stat(resolvedTarget);
    } catch {
      // Broken symlink
      const stats = await this._lstatSafe(entryPath);
      if (stats) {
        const artifact = await this._createSymlinkArtifact(
          entryPath,
          parentArtifact.id,
          parentArtifact.rootId,
          depth,
          stats,
          resolvedTarget,
          false,
          'unknown',
          collector,
        );
        if (builder) builder.add(artifact);
      }
      return true;
    }

    visitedRealPaths.add(resolvedTarget);

    if (targetStats.isFile()) {
      // Check size limit
      if (targetStats.size > this._options.maxFileSize) {
        return true;
      }

      const artifact = await this._createSymlinkArtifact(
        entryPath,
        parentArtifact.id,
        parentArtifact.rootId,
        depth,
        targetStats,
        resolvedTarget,
        true,
        targetStats.isDirectory() ? 'directory' : 'file',
        collector,
      );
      if (builder) builder.add(artifact);
      collector.recordFile();
      if (setFilesDiscovered) setFilesDiscovered(getCurrentCounts().filesDiscovered + 1);
    } else if (targetStats.isDirectory()) {
      const dirArtifact = await this._createSymlinkArtifact(
        entryPath,
        parentArtifact.id,
        parentArtifact.rootId,
        depth,
        targetStats,
        resolvedTarget,
        true,
        'directory',
        collector,
      );
      if (builder) builder.add(dirArtifact);

      // Recurse through the symlink target
      collector.recordDirectory();
      if (setDirectoriesVisited) setDirectoriesVisited(getCurrentCounts().directoriesVisited + 1);
      await this._traverseDirectory(
        dirArtifact,
        resolvedTarget,
        scanRoot,
        depth + 1,
        ct,
        collector,
        builder,
        ignoreRules,
        visitedRealPaths,
        visitedSymlinks,
        getCurrentCounts,
        onProgress,
        setFilesDiscovered,
        setDirectoriesVisited,
        setPathsSkipped,
      );
    }

    return true;
  }

  /**
   * Handle a junction point (Windows only).
   * Similar to symlink handling.
   */
  private async _handleJunction(
    entryPath: string,
    name: string,
    parentArtifact: DiscoveredArtifact,
    scanRoot: string,
    depth: number,
    ct: CancellationToken,
    collector: DiagnosticsCollector,
    builder: ArtifactGraphBuilder | null,
    ignoreRules: ReturnType<typeof createIgnoreRules>,
    visitedRealPaths: Set<string>,
    visitedSymlinks: Set<string>,
    getCurrentCounts: () => {
      filesDiscovered: number;
      directoriesVisited: number;
      pathsSkipped: number;
    },
    onProgress?: ProgressCallback,
    setFilesDiscovered?: (n: number) => void,
    setDirectoriesVisited?: (n: number) => void,
    setPathsSkipped?: (n: number) => void,
  ): Promise<boolean> {
    // On non-Windows, junctions don't exist; treat as regular directory
    return false;
  }

  /**
   * Process a single entry and create its artifact.
   */
  private async _processEntry(
    entryPath: string,
    parentId: string | null,
    rootId: string | null,
    depth: number,
    stats: fs.Stats,
    collector: DiagnosticsCollector,
    builder: ArtifactGraphBuilder | null,
    ignoreRules: ReturnType<typeof createIgnoreRules>,
    visitedRealPaths: Set<string>,
    visitedSymlinks: Set<string>,
  ): Promise<DiscoveredArtifact> {
    const isDir = stats.isDirectory();

    if (isDir) {
      collector.recordDirectory();
    } else {
      collector.recordFile();
    }

    return this._createArtifact(
      entryPath,
      parentId,
      rootId ?? entryPath,
      depth,
      stats,
      isDir,
      false,
      false,
      false,
      false,
      collector,
    );
  }

  /**
   * Safe lstat that returns null instead of throwing.
   */
  private async _lstatSafe(p: string): Promise<fs.Stats | null> {
    try {
      return await fsp.lstat(p);
    } catch {
      return null;
    }
  }

  /**
   * Check if a dirent is a Windows junction.
   * On non-Windows systems, this always returns false.
   */
  private _isJunction(_entry: fs.Dirent): boolean {
    // Windows junctions appear as directories with specific reparse point attributes
    // This is a simplified check — full implementation would use fs.realpath behavior
    return false;
  }

  /**
   * Batch stat calls for efficiency.
   */
  private async _batchStat(
    dirPath: string,
    batch: Array<{ name: string; dirent: fs.Dirent }>,
    collector: DiagnosticsCollector,
  ): Promise<Array<Result<{ name: string; stats: fs.Stats }, { name: string }>>> {
    if (batch.length === 0) return [];

    const results: Array<Result<{ name: string; stats: fs.Stats }, { name: string }>> = [];

    for (const item of batch) {
      try {
        const entryPath = path.join(dirPath, item.name);
        const stats = await fsp.stat(entryPath);
        results.push(ok({ name: item.name, stats }));
      } catch (error: unknown) {
        const nodeErr = error as { code?: string };
        if (nodeErr.code === 'EACCES' || nodeErr.code === 'EPERM') {
          collector.recordPermissionFailure(path.join(dirPath, item.name));
        }
        results.push(err({ name: item.name }));
      }
    }

    return results;
  }

  /**
   * Create a DiscoveredArtifact from filesystem information.
   */
  private async _createArtifact(
    absolutePath: string,
    parentId: string | null,
    rootId: string | null,
    depth: number,
    stats: fs.Stats,
    isDirectory: boolean,
    isSymlink: boolean,
    isJunction: boolean,
    isHidden: boolean,
    executableHint: boolean,
    collector: DiagnosticsCollector,
  ): Promise<DiscoveredArtifact> {
    const fileName = path.basename(absolutePath);
    const ext = isDirectory ? '' : path.extname(absolutePath).toLowerCase();
    const canonicalPath = path.resolve(absolutePath);
    const relativePath = canonicalPath; // Will be computed relative to scan root at graph level

    // Detect hidden
    const hidden = isHidden || fileName.startsWith('.');

    // Detect executable hint
    const isExecutable = executableHint || (!isDirectory && this._isExecutable(stats));

    // Generate deterministic ID
    const idInput = `${canonicalPath}\0${stats.size}\0${stats.mtimeMs}`;
    const id = deterministicId('dart', idInput);

    // Determine effective rootId
    const effectiveRootId = rootId ?? id;

    // Determine type hint from extension
    const typeHint = this._typeHintFromExtension(ext);

    // Calculate relative path
    const relPath = canonicalPath; // adjusted when scan root is known

    if (hidden) {
      collector.recordHiddenArtifact(absolutePath);
    }

    return Object.freeze({
      id,
      parentId,
      rootId: effectiveRootId,
      absolutePath,
      canonicalPath,
      relativePath: relPath,
      fileName,
      extension: ext,
      size: isDirectory ? 0 : stats.size,
      createdAt: stats.birthtime?.toISOString() ?? null,
      modifiedAt: stats.mtime?.toISOString() ?? null,
      isHidden: hidden,
      executableHint: isExecutable,
      isDirectory,
      isSymlink,
      isJunction,
      typeHint,
      diagnostics: Object.freeze({
        viaSymlink: isSymlink,
        permissionError: false,
        skipped: false,
        depth,
      }),
    });
  }

  /**
   * Create a DiscoveredArtifact for a symlink with its metadata.
   */
  private async _createSymlinkArtifact(
    absolutePath: string,
    parentId: string | null,
    rootId: string | null,
    depth: number,
    stats: fs.Stats,
    targetPath: string,
    targetExists: boolean,
    targetType: 'file' | 'directory' | 'unknown',
    collector: DiagnosticsCollector,
  ): Promise<DiscoveredArtifact> {
    const isDir = stats.isDirectory();
    const fileName = path.basename(absolutePath);
    const ext = path.extname(absolutePath).toLowerCase();
    const canonicalPath = path.resolve(absolutePath);
    const hidden = fileName.startsWith('.');

    const id = deterministicId('dart', `${canonicalPath}\0${stats.size}\0${stats.mtimeMs}`);

    if (hidden) {
      collector.recordHiddenArtifact(absolutePath);
    }

    return Object.freeze({
      id,
      parentId,
      rootId: rootId ?? id,
      absolutePath,
      canonicalPath,
      relativePath: canonicalPath,
      fileName,
      extension: ext,
      size: isDir ? 0 : stats.size,
      createdAt: stats.birthtime?.toISOString() ?? null,
      modifiedAt: stats.mtime?.toISOString() ?? null,
      isHidden: hidden,
      executableHint: this._isExecutable(stats),
      isDirectory: isDir,
      isSymlink: true,
      isJunction: false,
      symlink: Object.freeze({
        targetPath,
        targetExists,
        isBroken: !targetExists,
        targetType,
      }),
      typeHint: this._typeHintFromExtension(ext),
      diagnostics: Object.freeze({
        viaSymlink: true,
        permissionError: false,
        skipped: false,
        depth,
      }),
    });
  }

  /**
   * Check if a file has executable permissions.
   */
  private _isExecutable(stats: fs.Stats): boolean {
    if (process.platform === 'win32') {
      // On Windows, executable hint is based on common executable extensions
      // Note: stats.isFile() used here to signal intent
      return false; // Windows doesn't have Unix-style executable bits
    }
    // Unix: check executable permission bits
    return (stats.mode & 0o111) !== 0;
  }

  /**
   * Determine a type hint from file extension.
   * This is a preliminary hint — full classification uses multi-signal analysis.
   */
  private _typeHintFromExtension(ext: string): ArtifactType | undefined {
    const extensionMap: Record<string, ArtifactType> = {
      '.py': 'script',
      '.js': 'script',
      '.ts': 'script',
      '.jsx': 'script',
      '.tsx': 'script',
      '.sh': 'script',
      '.bash': 'script',
      '.ps1': 'script',
      '.bat': 'script',
      '.cmd': 'script',
      '.rb': 'script',
      '.pl': 'script',
      '.php': 'script',
      '.lua': 'script',
      '.exe': 'executable',
      '.dll': 'executable',
      '.so': 'executable',
      '.dylib': 'executable',
      '.elf': 'executable',
      '.zip': 'archive',
      '.tar': 'archive',
      '.gz': 'archive',
      '.tgz': 'archive',
      '.bz2': 'archive',
      '.xz': 'archive',
      '.7z': 'archive',
      '.rar': 'archive',
      '.json': 'configuration',
      '.yaml': 'configuration',
      '.yml': 'configuration',
      '.toml': 'configuration',
      '.ini': 'configuration',
      '.cfg': 'configuration',
      '.env': 'configuration',
      '.xml': 'configuration',
      '.html': 'document',
      '.htm': 'document',
      '.md': 'document',
      '.pdf': 'document',
      '.txt': 'document',
      '.png': 'image',
      '.jpg': 'image',
      '.jpeg': 'image',
      '.gif': 'image',
      '.svg': 'image',
      '.ico': 'image',
      '.crt': 'certificate',
      '.pem': 'certificate',
      '.cert': 'certificate',
      '.key': 'certificate',
      '.p12': 'certificate',
      '.pfx': 'certificate',
      '.der': 'certificate',
    };

    return extensionMap[ext];
  }

  /**
   * Report progress via callback.
   */
  private _reportProgress(
    onProgress: ProgressCallback,
    getCounts: () => { filesDiscovered: number; directoriesVisited: number; pathsSkipped: number },
    startTime: number,
  ): void {
    const counts = getCounts();
    onProgress({
      filesDiscovered: counts.filesDiscovered,
      directoriesVisited: counts.directoriesVisited,
      pathsSkipped: counts.pathsSkipped,
      currentPath: '',
      elapsedMs: performance.now() - startTime,
    });
  }
}

/** Helper to track time. */
function startTimeTracker(start: number): number {
  return start;
}
