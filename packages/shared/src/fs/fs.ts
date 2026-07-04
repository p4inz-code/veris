/**
 * Safe read-only filesystem operations for VERIS.
 *
 * Provides deterministic, read-only filesystem access for artifact discovery
 * and extraction. All operations are safe (no destructive writes) and
 * cross-platform compatible.
 *
 * @module @veris/shared/fs
 */

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as nodeOs from 'node:os';
import * as nodePath from 'node:path';

/**
 * Read a file as a Buffer. Returns null if the file doesn't exist.
 */
export async function readFile(path: string): Promise<Buffer | null> {
  try {
    return await fsp.readFile(path);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Read a file as a UTF-8 string. Returns null if the file doesn't exist.
 */
export async function readTextFile(path: string): Promise<string | null> {
  try {
    return await fsp.readFile(path, 'utf-8');
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Check if a file or directory exists.
 */
export async function exists(path: string): Promise<boolean> {
  try {
    await fsp.access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a path points to a file (not a directory).
 */
export async function isFile(path: string): Promise<boolean> {
  try {
    const stat = await fsp.stat(path);
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Check if a path points to a directory.
 */
export async function isDirectory(path: string): Promise<boolean> {
  try {
    const stat = await fsp.stat(path);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Get file size in bytes. Returns -1 if the file doesn't exist.
 */
export async function fileSize(path: string): Promise<number> {
  try {
    const stat = await fsp.stat(path);
    return stat.size;
  } catch {
    return -1;
  }
}

/**
 * List entries in a directory. Returns null if the directory doesn't exist.
 */
export async function readDirectory(path: string): Promise<string[] | null> {
  try {
    const entries = await fsp.readdir(path);
    return entries;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Recursively walk a directory, yielding file paths.
 * Skips dotfiles by default.
 */
export async function* walkDirectory(
  dir: string,
  options: { includeDotfiles?: boolean; maxDepth?: number } = {},
): AsyncGenerator<string> {
  const { includeDotfiles = false, maxDepth = 50 } = options;
  const rootDepth = dir.split(nodePath.sep).length;

  async function* walk(currentDir: string): AsyncGenerator<string> {
    const currentDepth = currentDir.split(nodePath.sep).length - rootDepth;
    if (currentDepth > maxDepth) return;

    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!includeDotfiles && entry.name.startsWith('.')) continue;

      const fullPath = nodePath.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        yield* walk(fullPath);
      } else if (entry.isFile()) {
        yield fullPath;
      }
    }
  }

  yield* walk(dir);
}

/**
 * Get file statistics. Returns null if the file doesn't exist.
 */
export async function stat(path: string): Promise<fsp.FileHandle | null> {
  try {
    const handle = await fsp.open(path, 'r');
    return handle;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Create a temporary directory for extraction.
 * The directory is automatically cleaned up when the callback completes.
 */
export async function withTempDir<T>(prefix: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const tmpDir = await fsp.mkdtemp(nodePath.join(nodeOs.tmpdir(), prefix));
  try {
    return await fn(tmpDir);
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
