/**
 * Migration — cache migration helpers for schema version transitions.
 *
 * Implements SPEC-011 §11.3 schema migration strategy:
 * - Entries with stored.schema_version < engine.schema_version are
 *   re-validated on read and migrated if possible
 * - Entries with stored.schema_version > engine.schema_version are
 *   invalidated immediately
 * - Full cache clear is available via clear()
 *
 * @module @veris/explain/cache/migration
 */

import type { CacheEntry } from './cache-entry.js';
import { deserializeEntry } from './cache-entry.js';
import { checkSchemaCompatibility, getCurrentSchemaVersion } from './schema-version.js';

// ── Migration Result ──

/** Result of a migration operation. */
export interface MigrationResult {
  /** Number of entries successfully migrated. */
  readonly migrated: number;
  /** Number of entries invalidated. */
  readonly invalidated: number;
  /** Number of entries that failed migration. */
  readonly failed: number;
  /** Total entries processed. */
  readonly total: number;
  /** Human-readable summary. */
  readonly summary: string;
}

// ── Migration Step ──

/** A single migration step from one schema version to the next. */
export interface MigrationStep {
  /** Source schema version. */
  readonly fromVersion: number;
  /** Target schema version. */
  readonly toVersion: number;
  /** Migration function. */
  readonly migrate: (entry: CacheEntry) => CacheEntry | undefined;
  /** Description of the migration. */
  readonly description: string;
}

// ── Migration Registry ──

/**
 * Registry of migration steps.
 *
 * Migrations are registered in order and applied sequentially.
 */
export class MigrationRegistry {
  private readonly steps: MigrationStep[] = [];

  /**
   * Register a migration step.
   *
   * @param step - The migration step to register.
   */
  register(step: MigrationStep): void {
    this.steps.push(step);
  }

  /**
   * Get all registered migration steps, sorted by fromVersion.
   *
   * @returns Sorted array of migration steps.
   */
  getSteps(): MigrationStep[] {
    return [...this.steps].sort((a, b) => a.fromVersion - b.fromVersion);
  }

  /**
   * Check if a migration path exists between two versions.
   *
   * @param fromVersion - Starting schema version.
   * @param toVersion - Target schema version.
   * @returns True if a migration path exists.
   */
  hasMigrationPath(fromVersion: number, toVersion: number): boolean {
    if (fromVersion >= toVersion) return true; // No migration needed
    const sortedSteps = this.getSteps();
    let current = fromVersion;
    for (const step of sortedSteps) {
      if (step.fromVersion === current) {
        current = step.toVersion;
        if (current >= toVersion) return true;
      }
    }
    return false;
  }
}

// ── Default Migration Steps ──

/** Default migration steps for V1 (initial version — no migrations yet). */
export function createDefaultMigrationSteps(): MigrationStep[] {
  return [];
}

// ── Migration Functions ──

/**
 * Migrate a single cache entry from its stored schema version to the current.
 *
 * @param entry - The entry to migrate.
 * @param registry - Migration registry with available steps.
 * @param currentVersion - Target schema version.
 * @returns Migrated entry, or undefined if migration failed.
 */
export function migrateEntry(
  entry: CacheEntry,
  registry: MigrationRegistry,
  currentVersion: number = getCurrentSchemaVersion(),
): CacheEntry | undefined {
  const compatibility = checkSchemaCompatibility(entry.schemaVersion, currentVersion);

  // If the entry should be invalidated, return undefined
  if (compatibility.shouldInvalidate) {
    return undefined;
  }

  // If no migration needed, return the entry as-is
  if (!compatibility.shouldMigrate) {
    return entry;
  }

  // Apply migration steps sequentially
  const steps = registry.getSteps();
  let migrated = entry;
  let current = entry.schemaVersion;

  for (const step of steps) {
    if (step.fromVersion === current) {
      const result = step.migrate(migrated);
      if (!result) {
        return undefined; // Migration failed
      }
      migrated = result;
      current = step.toVersion;
    }
  }

  // Verify we reached the target version
  if (current !== currentVersion) {
    return undefined; // Incomplete migration path
  }

  return migrated;
}

/**
 * Migrate all entries in a store.
 *
 * @param entries - Current entries (key → CacheEntry).
 * @param registry - Migration registry.
 * @param currentVersion - Target schema version.
 * @returns Migration result with counts.
 */
export function migrateAll(
  entries: ReadonlyMap<string, CacheEntry>,
  registry: MigrationRegistry,
  currentVersion: number = getCurrentSchemaVersion(),
): MigrationResult {
  let migrated = 0;
  let invalidated = 0;
  let failed = 0;

  for (const [, entry] of entries) {
    const compatibility = checkSchemaCompatibility(entry.schemaVersion, currentVersion);

    if (compatibility.shouldInvalidate) {
      invalidated++;
      continue;
    }

    if (compatibility.shouldMigrate) {
      const result = migrateEntry(entry, registry, currentVersion);
      if (result) {
        migrated++;
      } else {
        failed++;
      }
    }
  }

  const total = migrated + invalidated + failed;

  return {
    migrated,
    invalidated,
    failed,
    total,
    summary: `Migrated ${migrated}, invalidated ${invalidated}, failed ${failed} of ${total} entries.`,
  };
}

/**
 * Migrate serialized entries from persistent storage.
 *
 * @param serializedEntries - Array of serialized entry data.
 * @param registry - Migration registry.
 * @param currentVersion - Target schema version.
 * @returns Array of (key, entry) tuples for entries that passed migration.
 */
export function migrateSerializedEntries(
  serializedEntries: Array<{ key: string; data: Record<string, unknown> }>,
  registry: MigrationRegistry,
  currentVersion: number = getCurrentSchemaVersion(),
): Array<{ key: string; entry: CacheEntry }> {
  const result: Array<{ key: string; entry: CacheEntry }> = [];

  for (const { key, data } of serializedEntries) {
    const entry = deserializeEntry(data, currentVersion);
    if (!entry) continue;

    const migrated = migrateEntry(entry, registry, currentVersion);
    if (migrated) {
      result.push({ key, entry: migrated });
    }
    // Failed/invalidated entries are dropped
  }

  return result;
}
