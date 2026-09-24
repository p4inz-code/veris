/**
 * @veris/plugins/ecosystem/checksum — Deterministic SHA-256 package checksum calculator.
 *
 * Implements Section 2 of ADR-018:
 * - Content-addressed verification
 * - Lexicographical tree hashing over package files
 * - Platform-independent normalized relative paths (POSIX forward slashes)
 *
 * @module @veris/plugins/ecosystem/checksum
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const IGNORED_ENTRIES = new Set([
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  '.DS_Store',
  'Thumbs.db',
  '.veris-installed.json',
]);

/**
 * Computes a deterministic SHA-256 hash for a plugin package file or directory.
 *
 * For directories:
 * 1. Collects all files recursively, ignoring VCS and ephemeral metadata.
 * 2. Normalizes relative file paths to POSIX `/` slashes.
 * 3. Sorts relative paths in strict lexicographical order.
 * 4. Merkle-hashes each file entry: `<normalizedPath>:<size>:<fileSha256>\n`.
 */
export function computePackageSha256(targetPath: string): string {
  const resolved = path.resolve(targetPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Target package path does not exist: ${resolved}`);
  }

  const stat = fs.statSync(resolved);

  if (stat.isFile()) {
    const content = fs.readFileSync(resolved);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  if (!stat.isDirectory()) {
    throw new Error(`Target package is neither a regular file nor a directory: ${resolved}`);
  }

  // Recursive directory tree hashing
  const allFiles: { relPath: string; fullPath: string }[] = [];

  function walk(currentDir: string, relBase: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    // Deterministic traversal order
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (IGNORED_ENTRIES.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);
      const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      } else if (entry.isFile()) {
        allFiles.push({ relPath, fullPath });
      }
    }
  }

  walk(resolved, '');

  // Strict lexicographical sort on POSIX relative paths
  allFiles.sort((a, b) => a.relPath.localeCompare(b.relPath));

  const treeHasher = crypto.createHash('sha256');

  for (const file of allFiles) {
    const fileBytes = fs.readFileSync(file.fullPath);
    const fileHash = crypto.createHash('sha256').update(fileBytes).digest('hex');
    const manifestLine = `${file.relPath}:${fileBytes.length}:${fileHash}\n`;
    treeHasher.update(manifestLine, 'utf-8');
  }

  return treeHasher.digest('hex');
}
