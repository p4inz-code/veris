/**
 * Discovery diagnostics collector for VERIS.
 *
 * Tracks traversal statistics and timing for diagnostic reporting.
 *
 * @module @veris/discovery/diagnostics
 */

import type { DiscoveryDiagnostics } from './types.js';

/**
 * Collector for discovery diagnostics.
 * Tracks files visited, directories visited, skipped paths,
 * permission failures, hidden artifacts, symlink skips, and cycle detections.
 */
export class DiagnosticsCollector {
  private _filesVisited = 0;
  private _directoriesVisited = 0;
  private readonly _skippedPaths: string[] = [];
  private readonly _permissionFailures: string[] = [];
  private readonly _hiddenArtifacts: string[] = [];
  private readonly _symlinkSkips: string[] = [];
  private readonly _cycleDetections: string[] = [];
  private _traversalStart = 0;
  private _traversalEnd = 0;
  private _metadataStart = 0;
  private _metadataEnd = 0;
  private _classificationStart = 0;
  private _classificationEnd = 0;

  /** Start the traversal timer. */
  startTraversal(): void {
    this._traversalStart = performance.now();
  }

  /** End the traversal timer. */
  endTraversal(): void {
    this._traversalEnd = performance.now();
  }

  /** Start the metadata timer. */
  startMetadata(): void {
    this._metadataStart = performance.now();
  }

  /** End the metadata timer. */
  endMetadata(): void {
    this._metadataEnd = performance.now();
  }

  /** Start the classification timer. */
  startClassification(): void {
    this._classificationStart = performance.now();
  }

  /** End the classification timer. */
  endClassification(): void {
    this._classificationEnd = performance.now();
  }

  /** Record a visited file. */
  recordFile(): void {
    this._filesVisited++;
  }

  /** Record a visited directory. */
  recordDirectory(): void {
    this._directoriesVisited++;
  }

  /** Record a skipped path. */
  recordSkipped(path: string): void {
    this._skippedPaths.push(path);
  }

  /** Record a permission failure. */
  recordPermissionFailure(path: string): void {
    this._permissionFailures.push(path);
  }

  /** Record a hidden artifact. */
  recordHiddenArtifact(path: string): void {
    this._hiddenArtifacts.push(path);
  }

  /** Record a symlink skip. */
  recordSymlinkSkip(path: string): void {
    this._symlinkSkips.push(path);
  }

  /** Record a cycle detection. */
  recordCycleDetection(path: string): void {
    this._cycleDetections.push(path);
  }

  /** Build and return the final diagnostics snapshot. */
  snapshot(): DiscoveryDiagnostics {
    const traversalTimeMs = Math.max(0, this._traversalEnd - this._traversalStart);
    const metadataTimeMs = Math.max(0, this._metadataEnd - this._metadataStart);
    const classificationTimeMs = Math.max(0, this._classificationEnd - this._classificationStart);
    const totalTimeMs = traversalTimeMs + metadataTimeMs + classificationTimeMs;

    return Object.freeze({
      filesVisited: this._filesVisited,
      directoriesVisited: this._directoriesVisited,
      skippedPaths: Object.freeze([...this._skippedPaths]),
      permissionFailures: Object.freeze([...this._permissionFailures]),
      hiddenArtifacts: Object.freeze([...this._hiddenArtifacts]),
      symlinkSkips: Object.freeze([...this._symlinkSkips]),
      cycleDetections: Object.freeze([...this._cycleDetections]),
      traversalTimeMs,
      metadataTimeMs,
      classificationTimeMs,
      totalTimeMs,
    });
  }
}
