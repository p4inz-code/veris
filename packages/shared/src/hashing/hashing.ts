/**
 * Hashing utilities for VERIS.
 *
 * Provides SHA-256 hashing for deterministic content-addressed IDs.
 *
 * @module @veris/shared/hashing
 */

import { createHash, type BinaryLike } from 'node:crypto';

/**
 * Compute the SHA-256 hash of input data.
 * Returns a lowercase hex-encoded string.
 */
export function sha256(data: BinaryLike): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Compute a deterministic content hash from an array of parts.
 * Parts are joined with a null byte separator before hashing.
 */
export function computeContentHash(...parts: BinaryLike[]): string {
  const hash = createHash('sha256');
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) hash.update('\0');
    hash.update(parts[i]);
  }
  return hash.digest('hex');
}

/**
 * Compute the hash of a string using UTF-8 encoding.
 */
export function hashString(data: string): string {
  return sha256(Buffer.from(data, 'utf-8'));
}

/**
 * Compute the hash of a Buffer.
 */
export function hashBuffer(data: Buffer): string {
  return sha256(data);
}

/**
 * Generate a deterministic ID with the given prefix and content.
 *
 * @param prefix - Short prefix for the ID (e.g., "art", "feat", "fin")
 * @param content - Parts of content that uniquely identify the object
 * @returns Deterministic ID in the format: {prefix}_{sha256}
 */
export function deterministicId(prefix: string, ...content: BinaryLike[]): string {
  return `${prefix}_${computeContentHash(...content)}`;
}
