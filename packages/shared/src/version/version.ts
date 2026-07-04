/**
 * Semver comparison utilities for VERIS.
 *
 * @module @veris/shared/version
 */

/** Parsed semver components. */
export interface Semver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: string | null;
  readonly build: string | null;
}

/**
 * Parse a semver string into its components.
 * Returns null if the string is not valid semver.
 */
export function parseSemver(version: string): Semver | null {
  const re = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;
  const match = version.match(re);
  if (!match) return null;

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] ?? null,
    build: match[5] ?? null,
  };
}

/**
 * Compare two semver versions.
 * Returns:
 *   -1 if a < b
 *    0 if a === b
 *    1 if a > b
 */
export function compareSemver(a: string, b: string): number {
  const parsedA = parseSemver(a);
  const parsedB = parseSemver(b);

  if (!parsedA || !parsedB) {
    throw new Error(`Invalid semver: ${!parsedA ? a : b}`);
  }

  // Compare major.minor.patch
  if (parsedA.major !== parsedB.major) return parsedA.major > parsedB.major ? 1 : -1;
  if (parsedA.minor !== parsedB.minor) return parsedA.minor > parsedB.minor ? 1 : -1;
  if (parsedA.patch !== parsedB.patch) return parsedA.patch > parsedB.patch ? 1 : -1;

  // Compare prerelease: no prerelease > prerelease
  if (parsedA.prerelease === null && parsedB.prerelease !== null) return 1;
  if (parsedA.prerelease !== null && parsedB.prerelease === null) return -1;
  if (parsedA.prerelease !== null && parsedB.prerelease !== null) {
    return parsedA.prerelease.localeCompare(parsedB.prerelease);
  }

  return 0;
}

/**
 * Check if a version satisfies a semver range (e.g., "^1.0.0", ">=1.2.3 <2.0.0").
 * Currently supports: ^x.y.z, >=x.y.z, <=x.y.z, and simple x.y.z.
 */
export function satisfies(version: string, range: string): boolean {
  const parsed = parseSemver(version);
  if (!parsed) return false;

  // Exact version
  if (/^\d+\.\d+\.\d+$/.test(range)) {
    return compareSemver(version, range) === 0;
  }

  // Caret range (^x.y.z)
  const caretMatch = range.match(/^\^(\d+)\.(\d+)\.(\d+)$/);
  if (caretMatch) {
    const major = parseInt(caretMatch[1], 10);
    const minor = parseInt(caretMatch[2], 10);
    const patch = parseInt(caretMatch[3], 10);
    if (major !== 0) {
      // ^1.0.0 means >=1.0.0 <2.0.0
      return (
        parsed.major === major &&
        (parsed.minor > minor || (parsed.minor === minor && parsed.patch >= patch))
      );
    }
    // ^0.x.y means >=0.x.y <0.(x+1).0
    if (minor !== 0) {
      return parsed.major === 0 && parsed.minor === minor && parsed.patch >= patch;
    }
    // ^0.0.x means >=0.0.x <0.0.(x+1)
    return parsed.major === 0 && parsed.minor === 0 && parsed.patch >= patch;
  }

  // Tilde range (~x.y.z)
  const tildeMatch = range.match(/^~(\d+)\.(\d+)\.(\d+)$/);
  if (tildeMatch) {
    const major = parseInt(tildeMatch[1], 10);
    const minor = parseInt(tildeMatch[2], 10);
    const patch = parseInt(tildeMatch[3], 10);
    // ~x.y.z means >=x.y.z <x.(y+1).0
    if (parsed.major !== major) return false;
    if (parsed.minor < minor) return false;
    if (parsed.minor > minor) return false;
    return parsed.patch >= patch;
  }

  // Greater than or equal (>=x.y.z)
  const gteMatch = range.match(/^>=(\d+)\.(\d+)\.(\d+)$/);
  if (gteMatch) {
    return compareSemver(version, gteMatch[0].slice(1)) >= 0;
  }

  // Less than or equal (<=x.y.z)
  const lteMatch = range.match(/^<=(\d+)\.(\d+)\.(\d+)$/);
  if (lteMatch) {
    return compareSemver(version, lteMatch[0].slice(1)) <= 0;
  }

  // Unknown range format
  return false;
}
