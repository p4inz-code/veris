/**
 * Export manifest — manifest.json generation for export outputs.
 *
 * Features:
 * - File hashes (SHA-256) for integrity verification
 * - Relative paths for portability
 * - Export metadata and version info
 * - Deterministic ordering
 *
 * @module @veris/explain/export/export-manifest
 */

import * as crypto from 'node:crypto';
import * as path from 'node:path';

import type { Clock } from './export-options.js';

// ── Manifest Entry ──

/** A single file entry in the manifest. */
export interface ManifestEntry {
  readonly relativePath: string;
  readonly hash: string;
  readonly size: number;
  readonly format: string;
  readonly subjectId: string;
}

// ── Export Manifest ──

/** The complete export manifest. */
export interface ExportManifest {
  readonly manifestVersion: string;
  readonly exportedAt: string;
  readonly schemaVersion: string;
  readonly totalFiles: number;
  readonly totalSize: number;
  readonly files: readonly ManifestEntry[];
}

// ── Manifest Builder ──

/**
 * Builds export manifests with deterministic file hashing.
 *
 * All file paths are stored as relative paths for portability.
 * Hashes are SHA-256 for integrity verification.
 * Entries are sorted deterministically by relative path.
 */
export class ManifestBuilder {
  private readonly clock: Clock;
  private readonly schemaVersion: string;

  constructor(clock: Clock, schemaVersion: string) {
    this.clock = clock;
    this.schemaVersion = schemaVersion;
  }

  /**
   * Build a manifest from a list of file entries.
   *
   * @param entries - The file entries to include in the manifest.
   * @param baseDir - The base directory for computing relative paths.
   * @returns A complete ExportManifest.
   */
  build(entries: ManifestEntryInput[], baseDir: string): ExportManifest {
    const manifestEntries: ManifestEntry[] = entries.map((e) => ({
      relativePath: this.toRelativePath(e.absolutePath, baseDir),
      hash: e.hash,
      size: e.size,
      format: e.format,
      subjectId: e.subjectId,
    }));

    // Sort deterministically by relative path
    const sorted = [...manifestEntries].sort((a, b) =>
      a.relativePath.localeCompare(b.relativePath),
    );

    const totalSize = sorted.reduce((sum, e) => sum + e.size, 0);

    return {
      manifestVersion: '1.0.0',
      exportedAt: this.clock.now().toISOString(),
      schemaVersion: this.schemaVersion,
      totalFiles: sorted.length,
      totalSize,
      files: sorted,
    };
  }

  /**
   * Build an empty manifest (no files).
   *
   * @param baseDir - The base directory for computing relative paths.
   * @returns An empty ExportManifest.
   */
  buildEmpty(baseDir: string): ExportManifest {
    return {
      manifestVersion: '1.0.0',
      exportedAt: this.clock.now().toISOString(),
      schemaVersion: this.schemaVersion,
      totalFiles: 0,
      totalSize: 0,
      files: [],
    };
  }

  /**
   * Compute a SHA-256 hash of a file's contents.
   *
   * @param content - The file content to hash.
   * @returns The hex-encoded SHA-256 hash.
   */
  computeHash(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  // ── Private ──

  /**
   * Convert an absolute path to a relative path.
   * Uses forward slashes for cross-platform consistency.
   */
  private toRelativePath(absolutePath: string, baseDir: string): string {
    const relative = path.relative(baseDir, absolutePath);
    // Normalize to forward slashes for cross-platform consistency
    return relative.replace(/\\\\/g, '/');
  }
}

// ── Manifest Entry Input ──

/** Input data for building a manifest entry. */
export interface ManifestEntryInput {
  readonly absolutePath: string;
  readonly hash: string;
  readonly size: number;
  readonly format: string;
  readonly subjectId: string;
}
