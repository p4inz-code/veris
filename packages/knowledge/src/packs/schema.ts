/**
 * Knowledge Pack Schema — schema constants and helpers for pack validation.
 *
 * Defines the expected format, required fields, and structural constraints
 * for Knowledge Pack files. Used by the validator to ensure pack integrity.
 *
 * @module @veris/knowledge/packs/schema
 */

import type {
  PackMetadata,
  KnowledgeEntry,
  KnowledgeIndicator,
  KnowledgeReference,
  PackDependency,
  KnowledgeSeverity,
} from './types.js';

/** Current pack schema version. */
export const PACK_SCHEMA_VERSION = '1.0.0';

/** Minimum supported Veris version for this pack schema. */
export const MIN_VERIS_VERSION = '0.1.0';

/** Maximum entries per pack. */
export const MAX_ENTRIES_PER_PACK = 5000;

/** Maximum indicators per entry. */
export const MAX_INDICATORS_PER_ENTRY = 100;

/** Maximum references per entry. */
export const MAX_REFERENCES_PER_ENTRY = 20;

/** Maximum dependencies per pack. */
export const MAX_DEPENDENCIES = 20;

/** Maximum tag length. */
export const MAX_TAG_LENGTH = 64;

/** Maximum tags per entry. */
export const MAX_TAGS_PER_ENTRY = 20;

/** Valid severity levels. */
export const VALID_SEVERITIES: readonly KnowledgeSeverity[] = Object.freeze([
  'critical',
  'high',
  'medium',
  'low',
  'info',
]);

/** Valid indicator types. */
export const VALID_INDICATOR_TYPES: readonly string[] = Object.freeze([
  'string-pattern',
  'file-name',
  'file-path',
  'registry-key',
  'process-name',
  'service-name',
  'named-pipe',
  'mutex',
  'api-call',
  'import-name',
  'section-name',
  'hash-md5',
  'hash-sha1',
  'hash-sha256',
  'ip-address',
  'domain-name',
  'url-pattern',
  'network-port',
  'feature-type',
  'capability-type',
  'evidence-type',
]);

/** Required fields in pack metadata. */
export const REQUIRED_METADATA_FIELDS: readonly (keyof PackMetadata)[] = Object.freeze([
  'id',
  'name',
  'version',
  'description',
  'author',
  'license',
  'source',
  'checksum',
  'categories',
  'tags',
  'supportedVerisVersion',
  'createdAt',
  'updatedAt',
]);

/** Required fields in a knowledge entry. */
export const REQUIRED_ENTRY_FIELDS: readonly (keyof KnowledgeEntry)[] = Object.freeze([
  'id',
  'name',
  'description',
  'category',
  'tags',
  'severity',
  'behavior',
  'recommendedAction',
]);

/** Semver regex pattern for validation. */
export const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

/** Pack ID regex pattern (alphanumeric + hyphens). */
export const PACK_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

/** Entry ID regex pattern (alphanumeric + hyphens). */
export const ENTRY_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

/** SHA-256 hash regex pattern. */
export const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

/** ISO 8601 date regex pattern (basic). */
export const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * Check if a severity value is valid.
 */
export function isValidSeverity(severity: string): severity is KnowledgeSeverity {
  return VALID_SEVERITIES.includes(severity as KnowledgeSeverity);
}

/**
 * Check if an indicator type is valid.
 */
export function isValidIndicatorType(type: string): boolean {
  return VALID_INDICATOR_TYPES.includes(type);
}

/**
 * Get the expected file extension for knowledge pack files.
 */
export function getPackFileExtension(): string {
  return '.veris-pack.json';
}

/**
 * Create an empty pack metadata for a new pack.
 */
export function createPackMetadata(
  overrides: Partial<PackMetadata> & { id: string; name: string; version: string },
): PackMetadata {
  const now = new Date().toISOString();
  return Object.freeze({
    id: overrides.id,
    name: overrides.name,
    version: overrides.version,
    description: overrides.description ?? '',
    author: overrides.author ?? 'VERIS',
    license: overrides.license ?? 'UNLICENSED',
    source: overrides.source ?? '',
    checksum: overrides.checksum ?? '',
    categories: overrides.categories ?? [],
    tags: overrides.tags ?? [],
    supportedVerisVersion: overrides.supportedVerisVersion ?? MIN_VERIS_VERSION,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    dependencies: overrides.dependencies ?? [],
    references: overrides.references ?? [],
  });
}
