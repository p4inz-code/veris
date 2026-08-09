/**
 * Pack Diagnostics — exposes loaded packs, failed packs, duplicates,
 * version conflicts, and validation warnings.
 *
 * @module @veris/knowledge/packs/diagnostics
 */

import type { PackError } from './types.js';

export interface PackDiagnostics {
  readonly totalPacks: number;
  readonly loadedPacks: readonly string[];
  readonly versionConflicts: readonly string[];
  readonly duplicatePacks: readonly string[];
  readonly totalWarnings: number;
  readonly totalErrors: number;
}

const EMPTY_DIAGNOSTICS: PackDiagnostics = {
  totalPacks: 0,
  loadedPacks: [],
  versionConflicts: [],
  duplicatePacks: [],
  totalWarnings: 0,
  totalErrors: 0,
};

/**
 * Create a diagnostics object.
 */
export function createPackDiagnostics(overrides?: Partial<PackDiagnostics>): PackDiagnostics {
  if (!overrides) return EMPTY_DIAGNOSTICS;
  return {
    totalPacks: overrides.totalPacks ?? 0,
    loadedPacks: overrides.loadedPacks ?? [],
    versionConflicts: overrides.versionConflicts ?? [],
    duplicatePacks: overrides.duplicatePacks ?? [],
    totalWarnings: overrides.totalWarnings ?? 0,
    totalErrors: overrides.totalErrors ?? 0,
  };
}

/**
 * Format diagnostics for CLI display.
 */
export function formatPackDiagnostics(diag: PackDiagnostics): string {
  const parts: string[] = [];
  parts.push(`Total packs: ${diag.totalPacks}`);
  parts.push(`Loaded: ${diag.loadedPacks.length}`);
  if (diag.totalErrors > 0) parts.push(`Errors: ${diag.totalErrors}`);
  if (diag.totalWarnings > 0) parts.push(`Warnings: ${diag.totalWarnings}`);
  if (diag.versionConflicts.length > 0)
    parts.push(`Version conflicts: ${diag.versionConflicts.length}`);
  if (diag.duplicatePacks.length > 0) parts.push(`Duplicates: ${diag.duplicatePacks.length}`);
  if (diag.loadedPacks.length > 0) {
    parts.push('');
    parts.push('Loaded packs:');
    for (const packId of diag.loadedPacks) {
      parts.push(`  - ${packId}`);
    }
  }
  return parts.join('\n');
}
