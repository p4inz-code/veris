/**
 * Cache key — prompt version extraction and cache key integration.
 *
 * Generates deterministic cache keys from template metadata for use by
 * the PersistentCache (M7). Cache keys include:
 * - promptVersion: version of the prompt template
 * - templateId: the template identifier
 * - type: template type (system, context, format)
 *
 * @module @veris/explain/prompts/cache-key
 */

import { compareSemver } from './frontmatter.js';

// ── Types ──

/** Components of a prompt-based cache key. */
export interface PromptCacheKeyComponents {
  /** Template identifier. */
  readonly templateId: string;
  /** Semantic version of the template. */
  readonly promptVersion: string;
}

// ── Public API ──

/**
 * Extract cache key components from a prompt template.
 *
 * @param templateId - The template identifier.
 * @param version - The template version string.
 * @returns Cache key components for use in cache key generation.
 */
export function extractCacheKeyComponents(
  templateId: string,
  version: string,
): PromptCacheKeyComponents {
  return {
    templateId,
    promptVersion: version,
  };
}

/**
 * Format a prompt version string for inclusion in a composite cache key.
 *
 * Format: `{templateId}:v{version}`
 * Example: `finding-explain-system-v1:v1.2.0`
 *
 * @param templateId - Template identifier.
 * @param version - Semantic version string.
 * @returns Formatted version string for cache key embedding.
 */
export function formatPromptVersion(templateId: string, version: string): string {
  return `${templateId}:v${version}`;
}

/**
 * Determine if a cache entry is stale based on template version.
 *
 * @param cachedVersion - The version stored in the cache.
 * @param currentVersion - The current template version.
 * @returns True if the cached entry uses an older version.
 */
export function isCacheStale(cachedVersion: string, currentVersion: string): boolean {
  return compareSemver(cachedVersion, currentVersion) < 0;
}

/**
 * Encode all cache key components into a deterministic string.
 *
 * Components:
 * - promptVersion: template version
 * - modelId: provider identifier (passed through)
 * - modelVersion: provider model version (passed through)
 * - inputHash: SHA-256 of context (passed through)
 * - engineVersion: @veris/explain version (passed through)
 * - mode: explanation mode (passed through)
 *
 * @param promptVersion - Formatted prompt version string.
 * @returns A deterministic string segment for the cache key.
 */
export function encodePromptSegment(promptVersion: string): string {
  return promptVersion;
}

/**
 * Extract just the major version number from a semver string.
 * Useful for coarse cache invalidation.
 *
 * @param version - The full semver version string.
 * @returns The major version number.
 */
export function getMajorVersion(version: string): number {
  return Number(version.split('.')[0]) || 0;
}

/**
 * Validate that a template version is compatible with a minimum version.
 *
 * @param version - The template version to check.
 * @param minimumVersion - The minimum required version.
 * @returns True if version >= minimumVersion.
 */
export function isVersionCompatible(version: string, minimumVersion: string): boolean {
  return compareSemver(version, minimumVersion) >= 0;
}
