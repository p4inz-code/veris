/**
 * Cross-platform path utilities for VERIS.
 *
 * Provides safe, cross-platform path resolution independent of the
 * running platform (supports both Unix and Windows paths).
 *
 * @module @veris/shared/path
 */

import * as nodePath from 'node:path';

/**
 * Normalize a path to use forward slashes.
 * This ensures cross-platform consistency.
 */
export function normalizeToForward(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Normalize a path for internal use.
 * Converts to forward slashes and resolves . and .. segments.
 */
export function normalizePath(path: string): string {
  return normalizeToForward(nodePath.normalize(path));
}

/**
 * Join path segments using forward slashes.
 */
export function join(...segments: string[]): string {
  return normalizeToForward(nodePath.join(...segments));
}

/**
 * Resolve a path relative to a base directory.
 * Both paths are normalized to forward slashes.
 */
export function resolve(base: string, relative: string): string {
  return normalizeToForward(nodePath.resolve(base, relative));
}

/**
 * Get the directory name of a path (normalized).
 */
export function dirname(path: string): string {
  return normalizeToForward(nodePath.dirname(path));
}

/**
 * Get the file name (with extension) from a path.
 */
export function basename(path: string, ext?: string): string {
  return nodePath.basename(path, ext);
}

/**
 * Get the file extension from a path (lowercase).
 */
export function extname(path: string): string {
  return nodePath.extname(path).toLowerCase();
}

/**
 * Check if a path is an absolute path (works on both Unix and Windows).
 */
export function isAbsolute(path: string): boolean {
  // Unix absolute paths start with /
  if (path.startsWith('/')) return true;
  // Windows absolute paths start with a drive letter (e.g., C:\)
  if (/^[a-zA-Z]:[/\\]/.test(path)) return true;
  return false;
}

/**
 * Split a path into its components.
 */
export function split(path: string): string[] {
  return normalizePath(path).split('/').filter(Boolean);
}

/**
 * Check if a path contains path traversal (..) segments.
 */
export function hasPathTraversal(path: string): boolean {
  const normalized = normalizeToForward(path);
  return normalized.includes('..') || normalized.includes('./');
}

/**
 * Safely resolve a path against a base, ensuring the result doesn't
 * escape the base directory (path traversal prevention).
 */
export function safeResolve(base: string, target: string): string | null {
  const resolved = resolve(base, target);
  const normalizedBase = normalizePath(resolve(base, '.'));

  // The resolved path must start with the base directory
  if (!resolved.startsWith(normalizedBase)) {
    return null;
  }

  return resolved;
}

/**
 * Determine the relative path from base to target.
 */
export function relative(base: string, target: string): string {
  return normalizeToForward(nodePath.relative(base, target));
}
