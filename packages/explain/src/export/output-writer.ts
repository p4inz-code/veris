/**
 * Output writer — atomic file writes with overwrite protection.
 *
 * Features:
 * - Atomic writes (write to temp, rename on success)
 * - Overwrite protection (fails if file exists unless --overwrite)
 * - UTF-8 encoding
 * - Deterministic error messages
 * - Offline-first (no network, no randomness)
 *
 * @module @veris/explain/export/output-writer
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// ── Write Result ──

/** Result of a file write operation. */
export interface WriteResult {
  readonly success: boolean;
  readonly path: string;
  readonly bytesWritten: number;
  readonly error?: string;
}

// ── Output Writer ──

/**
 * Atomic file writer with overwrite protection.
 *
 * Write strategy:
 * 1. If file exists and overwrite is false → fail with FILE_EXISTS
 * 2. Create parent directories if they don't exist
 * 3. Write to a temporary file in the same directory
 * 4. Rename (atomic on same filesystem) to target path
 * 5. Return result with bytes written
 */
export class OutputWriter {
  private readonly encoding: BufferEncoding;

  constructor(encoding: BufferEncoding = 'utf-8') {
    this.encoding = encoding;
  }

  /**
   * Write content to a file atomically.
   *
   * @param filePath - The target file path.
   * @param content - The content to write.
   * @param overwrite - Whether to overwrite an existing file.
   * @returns The write result.
   */
  write(filePath: string, content: string, overwrite: boolean): WriteResult {
    const resolvedPath = path.resolve(filePath);

    // Overwrite protection
    if (!overwrite && fs.existsSync(resolvedPath)) {
      return {
        success: false,
        path: resolvedPath,
        bytesWritten: 0,
        error: `File already exists: ${resolvedPath}. Use overwrite=true to replace.`,
      };
    }

    try {
      // Ensure parent directory exists
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Generate a deterministic temp filename based on input hash
      // This avoids collisions while remaining deterministic
      const hash = this.computeHash(content);
      const tmpPath = path.join(dir, `.veris_tmp_${hash}_${path.basename(resolvedPath)}`);

      // Write to temp file
      const bytes = Buffer.byteLength(content, this.encoding);
      fs.writeFileSync(tmpPath, content, {
        encoding: this.encoding,
        mode: 0o644,
      });

      // Atomic rename (atomic on same filesystem)
      fs.renameSync(tmpPath, resolvedPath);

      return {
        success: true,
        path: resolvedPath,
        bytesWritten: bytes,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        path: resolvedPath,
        bytesWritten: 0,
        error: `Failed to write file: ${message}`,
      };
    }
  }

  /**
   * Write content to a file atomically. Async version.
   *
   * @param filePath - The target file path.
   * @param content - The content to write.
   * @param overwrite - Whether to overwrite an existing file.
   * @returns The write result.
   */
  async writeAsync(filePath: string, content: string, overwrite: boolean): Promise<WriteResult> {
    return this.write(filePath, content, overwrite);
  }

  /**
   * Check if a file exists.
   *
   * @param filePath - The file path to check.
   * @returns True if the file exists.
   */
  exists(filePath: string): boolean {
    return fs.existsSync(path.resolve(filePath));
  }

  /**
   * Compute a deterministic (non-cryptographic) hash of content for temp naming.
   */
  private computeHash(content: string): string {
    return crypto.createHash('sha256').update(content, this.encoding).digest('hex').slice(0, 16);
  }
}
