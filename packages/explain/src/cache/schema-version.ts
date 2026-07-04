/**
 * Schema version — version management and compatibility for cache entries.
 *
 * Implements SPEC-011 §11.3 schema versioning:
 * - Each cache entry stores its schema_version
 * - Schema increments when response_json format changes
 * - Entries with stored.schema_version < engine.schema_version are re-validated
 * - Entries with stored.schema_version > engine.schema_version are invalidated
 *
 * @module @veris/explain/cache/schema-version
 */

// ── Current Schema Version ──

/**
 * Current cache schema version.
 *
 * Increment when the Explanation type or cache entry format changes.
 * - v1: Initial cache schema (M7)
 */
export const CURRENT_SCHEMA_VERSION = 1;

/** Minimum compatible schema version. */
export const MIN_COMPATIBLE_SCHEMA_VERSION = 1;

/** Maximum supported schema version. */
export const MAX_SUPPORTED_SCHEMA_VERSION = 1;

// ── Compatibility Result ──

/** Result of a schema compatibility check. */
export interface SchemaCompatibilityResult {
  /** Whether the entry is compatible with the current schema. */
  readonly compatible: boolean;
  /** Whether the entry should be migrated (old schema). */
  readonly shouldMigrate: boolean;
  /** Whether the entry should be invalidated (newer schema from future). */
  readonly shouldInvalidate: boolean;
  /** Human-readable message. */
  readonly message: string;
}

// ── Schema Checks ──

/**
 * Check if a stored schema version is compatible with the current version.
 *
 * Rules per SPEC-011 §11.3:
 * - stored < current: re-validate on read, migrate if possible
 * - stored > current: invalidate immediately (future/downgrade scenario)
 * - stored === current: compatible
 *
 * @param storedVersion - The schema version of the stored entry.
 * @param currentVersion - The current engine schema version.
 * @returns Compatibility result with actions.
 */
export function checkSchemaCompatibility(
  storedVersion: number,
  currentVersion: number = CURRENT_SCHEMA_VERSION,
): SchemaCompatibilityResult {
  if (storedVersion === currentVersion) {
    return {
      compatible: true,
      shouldMigrate: false,
      shouldInvalidate: false,
      message: `Schema version ${storedVersion} matches current version.`,
    };
  }

  if (storedVersion < currentVersion) {
    // Old schema — may need migration
    if (storedVersion >= MIN_COMPATIBLE_SCHEMA_VERSION) {
      return {
        compatible: true,
        shouldMigrate: true,
        shouldInvalidate: false,
        message: `Schema version ${storedVersion} is older than current ${currentVersion}. Entry should be migrated.`,
      };
    }

    return {
      compatible: false,
      shouldMigrate: false,
      shouldInvalidate: true,
      message: `Schema version ${storedVersion} is too old (minimum: ${MIN_COMPATIBLE_SCHEMA_VERSION}). Entry must be invalidated.`,
    };
  }

  // storedVersion > currentVersion — future/downgrade scenario
  if (storedVersion <= MAX_SUPPORTED_SCHEMA_VERSION) {
    return {
      compatible: true,
      shouldMigrate: false,
      shouldInvalidate: false,
      message: `Schema version ${storedVersion} is newer but within supported range. Entry is compatible.`,
    };
  }

  return {
    compatible: false,
    shouldMigrate: false,
    shouldInvalidate: true,
    message: `Schema version ${storedVersion} is from a newer engine version. Entry must be invalidated.`,
  };
}

/**
 * Check if a schema version should trigger full cache invalidation.
 *
 * @param engineVersion - Current engine version.
 * @param previousEngineVersion - Previous engine version.
 * @returns True if the cache should be fully invalidated.
 */
export function shouldInvalidateOnEngineChange(
  engineVersion: string,
  previousEngineVersion: string,
): boolean {
  // Extract major versions
  const currentMajor = Number(engineVersion.split('.')[0]) || 0;
  const previousMajor = Number(previousEngineVersion.split('.')[0]) || 0;

  // Invalidate on major version changes
  if (currentMajor !== previousMajor) return true;

  // Invalidate on schema version changes (handled separately)
  return false;
}

/**
 * Get the current schema version for cache entries.
 */
export function getCurrentSchemaVersion(): number {
  return CURRENT_SCHEMA_VERSION;
}

/**
 * Validate and normalize a schema version number.
 *
 * @param version - The raw version value.
 * @returns A valid schema version number, or the current version if invalid.
 */
export function normalizeSchemaVersion(version: unknown): number {
  const num = Number(version);
  if (!Number.isInteger(num) || num < 0) {
    return CURRENT_SCHEMA_VERSION;
  }
  return num;
}
