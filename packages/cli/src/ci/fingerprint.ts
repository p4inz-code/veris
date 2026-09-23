/**
 * @veris/cli/ci/fingerprint — Stable, cross-run finding fingerprinting.
 *
 * Implements Section 4 of ADR-015:
 *   fp = deterministicId('fp', ruleId, normalizedArtifactPath, title)
 *
 * Provides location-aware, cross-platform finding fingerprints that persist
 * across scan sessions, machine boundaries, and operational environments.
 *
 * @module @veris/cli/ci/fingerprint
 */

import type { Artifact, Finding } from '@veris/core';
import { deterministicId } from '@veris/shared';

import type { FindingFingerprint } from './types.js';

/**
 * Normalize an artifact path for deterministic cross-platform comparison.
 *
 * Guarantees:
 * - Backslashes are converted to forward slashes.
 * - Redundant leading './' or '/' prefixes are removed.
 * - Windows drive letters are converted to lowercase.
 * - Trailing slashes are stripped.
 */
export function normalizePathForFingerprint(rawPath: string): string {
  if (!rawPath || typeof rawPath !== 'string') {
    return '';
  }

  let normalized = rawPath.replace(/\\/g, '/').trim();

  // Normalize Windows drive letter: C:/foo -> c:/foo
  if (/^[A-Za-z]:\//.test(normalized)) {
    normalized = normalized[0].toLowerCase() + normalized.slice(1);
  }

  // Repeatedly strip leading './' and '/'
  while (normalized.startsWith('./') || normalized.startsWith('/')) {
    if (normalized.startsWith('./')) {
      normalized = normalized.slice(2);
    } else if (normalized.startsWith('/')) {
      normalized = normalized.slice(1);
    }
  }

  // Strip trailing '/'
  while (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

/**
 * Resolve the primary normalized artifact path(s) for a finding.
 *
 * @param finding - The target finding.
 * @param artifactsById - Optional lookup map of artifacts from the report.
 * @returns Deterministically sorted, normalized path string.
 */
export function resolveFindingArtifactPath(
  finding: Finding,
  artifactsById?: Map<string, Artifact>,
): string {
  const paths: string[] = [];

  if (finding.affectedArtifacts && finding.affectedArtifacts.length > 0) {
    for (const ref of finding.affectedArtifacts) {
      if (!ref) continue;
      const artifact = artifactsById?.get(ref.artifactId);
      if (artifact?.normalizedPath) {
        paths.push(normalizePathForFingerprint(artifact.normalizedPath));
      } else if (artifact?.originalPath) {
        paths.push(normalizePathForFingerprint(artifact.originalPath));
      } else if (ref.artifactId) {
        paths.push(normalizePathForFingerprint(ref.artifactId));
      }
    }
  }

  // Fallback to finding properties if no affectedArtifacts resolved
  if (paths.length === 0 && finding.properties) {
    const propPath =
      finding.properties.artifactPath ?? finding.properties.filePath ?? finding.properties.path;
    if (typeof propPath === 'string' && propPath.length > 0) {
      paths.push(normalizePathForFingerprint(propPath));
    }
  }

  if (paths.length === 0) {
    return '';
  }

  // Deduplicate and sort deterministically
  const uniquePaths = Array.from(new Set(paths)).sort();
  return uniquePaths.join('|');
}

/**
 * Compute the stable fingerprint for a finding.
 *
 * @param finding - The finding to fingerprint.
 * @param artifactsById - Optional lookup map of report artifacts.
 * @returns The stable FindingFingerprint.
 */
export function computeFindingFingerprint(
  finding: Finding,
  artifactsById?: Map<string, Artifact>,
): FindingFingerprint {
  const ruleId = (finding.ruleId ?? '').trim();
  const artifactPath = resolveFindingArtifactPath(finding, artifactsById);
  const title = (finding.title ?? '').trim();

  const hash = deterministicId('fp', ruleId, artifactPath, title);

  return Object.freeze({
    hash,
    ruleId,
    artifactPath,
    title,
  });
}
