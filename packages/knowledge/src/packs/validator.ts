/**
 * Knowledge Pack Validation Engine — strict validation for pack files.
 *
 * @module @veris/knowledge/packs/validator
 */

import { createHash } from 'node:crypto';

import { isValidCategory } from './categories.js';
import {
  REQUIRED_METADATA_FIELDS,
  REQUIRED_ENTRY_FIELDS,
  MAX_ENTRIES_PER_PACK,
  MAX_INDICATORS_PER_ENTRY,
  MAX_REFERENCES_PER_ENTRY,
  MAX_DEPENDENCIES,
  MAX_TAGS_PER_ENTRY,
  MAX_TAG_LENGTH,
  VALID_SEVERITIES,
  VALID_INDICATOR_TYPES,
  PACK_ID_PATTERN,
  ENTRY_ID_PATTERN,
  SEMVER_PATTERN,
  ISO_DATE_PATTERN,
} from './schema.js';
import type {
  KnowledgePack,
  KnowledgePackFile,
  PackError,
  PackMetadata,
  KnowledgeEntry,
  KnowledgeReference,
} from './types.js';

/** Result of pack validation. */
export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly PackError[];
  readonly warnings: readonly string[];
}

type FileEntry = Omit<KnowledgeEntry, 'references'> & {
  references?: readonly KnowledgeReference[];
};

/**
 * Validate a complete KnowledgePackFile structure.
 */
export function validatePackFile(file: KnowledgePackFile, filePath?: string): ValidationResult {
  const errors: PackError[] = [];
  const warnings: string[] = [];

  if (!file.metadata) {
    errors.push({
      code: 'MISSING_METADATA',
      message: 'Pack file is missing required "metadata" field.',
      path: filePath,
    });
    return { valid: false, errors, warnings };
  }

  const metaResult = validateMetadata(file.metadata, filePath);
  errors.push(...metaResult.errors);
  warnings.push(...metaResult.warnings);

  if (metaResult.errors.length > 0 && metaResult.errors.some((e) => e.code === 'MISSING_ID')) {
    return { valid: false, errors, warnings };
  }

  const packId = file.metadata.id;

  if (!Array.isArray(file.entries)) {
    errors.push({
      code: 'INVALID_ENTRIES',
      message: '"entries" must be an array.',
      packId,
      path: filePath,
    });
    return { valid: false, errors, warnings };
  }

  if (file.entries.length > MAX_ENTRIES_PER_PACK) {
    errors.push({
      code: 'TOO_MANY_ENTRIES',
      message: `Pack has ${file.entries.length} entries, maximum is ${MAX_ENTRIES_PER_PACK}.`,
      packId,
      path: filePath,
    });
  }

  const seenEntryIds = new Set<string>();
  const entries = file.entries as unknown as FileEntry[];

  for (let i = 0; i < entries.length; i++) {
    const entryResult = validateEntry(entries[i], packId, filePath, seenEntryIds);
    errors.push(...entryResult.errors);
    warnings.push(...entryResult.warnings);
  }

  // Cross-entry validation
  validateInternalReferences(entries, packId, filePath, errors, warnings);
  validateDuplicateReferences(entries, packId, warnings);
  validateDuplicateBehaviors(entries, packId, warnings);
  validateSemverVersions(entries, packId, errors);
  validateIdentifierFormats(entries, packId, errors);

  return { valid: errors.length === 0, errors, warnings };
}

function validateMetadata(
  meta: Omit<PackMetadata, 'checksum'>,
  filePath?: string,
): ValidationResult {
  const errors: PackError[] = [];
  const warnings: string[] = [];
  const packId = meta.id ?? '<unknown>';

  for (const field of REQUIRED_METADATA_FIELDS) {
    if (field === 'checksum') continue;
    const value = (meta as Record<string, unknown>)[field];
    if (value === undefined || value === null || value === '') {
      errors.push({
        code: 'MISSING_FIELD',
        message: `Metadata is missing required field: "${field}".`,
        packId,
        path: `metadata.${field}`,
      });
    }
  }

  if (meta.id && !PACK_ID_PATTERN.test(meta.id)) {
    errors.push({
      code: 'INVALID_PACK_ID',
      message: `Pack ID "${meta.id}" must match pattern: lowercase alphanumeric with hyphens.`,
      packId: meta.id,
      path: 'metadata.id',
    });
  }

  if (meta.version && !SEMVER_PATTERN.test(meta.version)) {
    errors.push({
      code: 'INVALID_VERSION',
      message: `Version "${meta.version}" must be semver format (e.g., "1.0.0").`,
      packId,
      path: 'metadata.version',
    });
  }

  if (meta.categories) {
    for (const cat of meta.categories) {
      if (!isValidCategory(cat)) {
        warnings.push(`Unknown category "${cat}" in pack "${meta.id}".`);
      }
    }
  }

  if (meta.tags) {
    for (const tag of meta.tags) {
      if (tag.length > MAX_TAG_LENGTH) {
        warnings.push(`Tag exceeds max length in pack "${meta.id}".`);
      }
    }
  }

  if (meta.dependencies) {
    if (meta.dependencies.length > MAX_DEPENDENCIES) {
      errors.push({
        code: 'TOO_MANY_DEPENDENCIES',
        message: `Pack has ${meta.dependencies.length} dependencies, max ${MAX_DEPENDENCIES}.`,
        packId,
        path: 'metadata.dependencies',
      });
    }
    const seenDeps = new Set<string>();
    for (const dep of meta.dependencies) {
      if (seenDeps.has(dep.id)) {
        errors.push({
          code: 'DUPLICATE_DEPENDENCY',
          message: `Duplicate dependency: "${dep.id}".`,
          packId,
        });
      }
      seenDeps.add(dep.id);
    }
  }

  if (meta.createdAt && !ISO_DATE_PATTERN.test(meta.createdAt)) {
    warnings.push(`Pack "${meta.id}" has an invalid createdAt date format. Expected ISO 8601.`);
  }
  if (meta.updatedAt && !ISO_DATE_PATTERN.test(meta.updatedAt)) {
    warnings.push(`Pack "${meta.id}" has an invalid updatedAt date format. Expected ISO 8601.`);
  }

  // Validate semver versions
  if (meta.supportedVerisVersion && !SEMVER_PATTERN.test(meta.supportedVerisVersion)) {
    errors.push({
      code: 'INVALID_SEMVER',
      message: `supportedVerisVersion "${meta.supportedVerisVersion}" is not valid semver.`,
      packId,
      path: 'metadata.supportedVerisVersion',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateEntry(
  entry: FileEntry,
  packId: string,
  filePath?: string,
  seenIds?: Set<string>,
): ValidationResult {
  const errors: PackError[] = [];
  const warnings: string[] = [];

  for (const field of REQUIRED_ENTRY_FIELDS) {
    const value = (entry as Record<string, unknown>)[field];
    if (value === undefined || value === null || (typeof value === 'string' && value === '')) {
      errors.push({
        code: 'MISSING_ENTRY_FIELD',
        message: `Entry "${entry.id ?? '<unknown>'}" is missing required field: "${field}".`,
        packId,
        entryId: entry.id,
        path: `entry.${field}`,
      });
    }
  }

  if (entry.id && seenIds) {
    if (seenIds.has(entry.id)) {
      errors.push({
        code: 'DUPLICATE_ENTRY_ID',
        message: `Duplicate entry ID: "${entry.id}".`,
        packId,
        entryId: entry.id,
      });
    }
    seenIds.add(entry.id);
  }

  if (entry.id && !ENTRY_ID_PATTERN.test(entry.id)) {
    errors.push({
      code: 'INVALID_ENTRY_ID',
      message: `Entry ID "${entry.id}" must match pattern: lowercase alphanumeric with hyphens.`,
      packId,
      entryId: entry.id,
      path: 'entry.id',
    });
  }

  if (entry.severity && !VALID_SEVERITIES.includes(entry.severity)) {
    errors.push({
      code: 'INVALID_SEVERITY',
      message: `Invalid severity "${entry.severity}". Valid values: ${VALID_SEVERITIES.join(', ')}.`,
      packId,
      entryId: entry.id,
      path: 'entry.severity',
    });
  }

  if (entry.category && !isValidCategory(entry.category)) {
    warnings.push(`Entry "${entry.id}" uses unknown category "${entry.category}".`);
  }

  if (entry.tags && entry.tags.length > MAX_TAGS_PER_ENTRY) {
    errors.push({
      code: 'TOO_MANY_TAGS',
      message: `Entry "${entry.id}" has ${entry.tags.length} tags, max ${MAX_TAGS_PER_ENTRY}.`,
      packId,
      entryId: entry.id,
    });
  }

  if (entry.indicators && entry.indicators.length > MAX_INDICATORS_PER_ENTRY) {
    errors.push({
      code: 'TOO_MANY_INDICATORS',
      message: `Entry "${entry.id}" has ${entry.indicators.length} indicators, max ${MAX_INDICATORS_PER_ENTRY}.`,
      packId,
      entryId: entry.id,
    });
  }

  if (entry.references && entry.references.length > MAX_REFERENCES_PER_ENTRY) {
    errors.push({
      code: 'TOO_MANY_REFERENCES',
      message: `Entry "${entry.id}" has ${entry.references.length} references, max ${MAX_REFERENCES_PER_ENTRY}.`,
      packId,
      entryId: entry.id,
    });
  }

  // Validate indicator types
  if (entry.indicators) {
    for (const indicator of entry.indicators) {
      if (!VALID_INDICATOR_TYPES.includes(indicator.type)) {
        warnings.push(`Entry "${entry.id}" uses unknown indicator type "${indicator.type}".`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateInternalReferences(
  entries: FileEntry[],
  packId: string,
  filePath: string | undefined,
  errors: PackError[],
  warnings: string[],
): void {
  const entryIds = new Set(entries.map((e) => e.id));
  for (const entry of entries) {
    if (entry.relatedEntries) {
      for (const refId of entry.relatedEntries) {
        if (!entryIds.has(refId)) {
          warnings.push(
            `Entry "${entry.id}" references related entry "${refId}" which does not exist in this pack.`,
          );
        }
      }
    }
  }
}

/**
 * Validate for duplicate references across entries.
 */
function validateDuplicateReferences(
  entries: FileEntry[],
  packId: string,
  warnings: string[],
): void {
  const refMap = new Map<string, string[]>(); // url -> entry IDs

  for (const entry of entries) {
    if (!entry.references) continue;
    for (const ref of entry.references) {
      const url = ref.url;
      const existing = refMap.get(url) ?? [];
      existing.push(entry.id);
      refMap.set(url, existing);
    }
  }

  for (const [url, entryIds] of refMap) {
    if (entryIds.length > 1) {
      warnings.push(
        `Pack "${packId}": URL "${url}" is duplicated across entries: ${entryIds.join(', ')}.`,
      );
    }
  }
}

/**
 * Validate for duplicate behavior descriptions across entries.
 */
function validateDuplicateBehaviors(
  entries: FileEntry[],
  packId: string,
  warnings: string[],
): void {
  const behaviorMap = new Map<string, string[]>(); // normalized behavior -> entry IDs

  for (const entry of entries) {
    if (!entry.behavior) continue;
    const normalized = entry.behavior.slice(0, 100).toLowerCase().trim();
    const existing = behaviorMap.get(normalized) ?? [];
    existing.push(entry.id);
    behaviorMap.set(normalized, existing);
  }

  for (const [behavior, entryIds] of behaviorMap) {
    if (entryIds.length > 1) {
      warnings.push(
        `Pack "${packId}": ${entryIds.length} entries share very similar behavior descriptions: ${entryIds.join(', ')}.`,
      );
    }
  }
}

/**
 * Validate semver versions on all entries with explicit version fields.
 */
function validateSemverVersions(entries: FileEntry[], packId: string, errors: PackError[]): void {
  for (const entry of entries) {
    const meta = entry as unknown as Record<string, unknown>;
    if (meta.version && typeof meta.version === 'string' && !SEMVER_PATTERN.test(meta.version)) {
      errors.push({
        code: 'INVALID_ENTRY_SEMVER',
        message: `Entry "${entry.id}" has invalid version "${meta.version}" (must be semver).`,
        packId,
        entryId: entry.id,
        path: 'entry.metadata.version',
      });
    }
  }
}

/**
 * Validate identifier formats for all entries.
 */
function validateIdentifierFormats(
  entries: FileEntry[],
  packId: string,
  errors: PackError[],
): void {
  for (const entry of entries) {
    if (entry.mitreTechniques) {
      for (const technique of entry.mitreTechniques) {
        if (!/^T\d{4}(\.\d{3})?$/.test(technique)) {
          errors.push({
            code: 'INVALID_MITRE_ID',
            message: `Entry "${entry.id}" has invalid MITRE ATT&CK ID "${technique}". Expected format: Txxxx.xxx or Txxxx.`,
            packId,
            entryId: entry.id,
          });
        }
      }
    }
  }
}

export function computePackChecksum(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

export function computePackContentHash(pack: KnowledgePack): string {
  const obj = JSON.parse(JSON.stringify(pack)) as Record<string, unknown>;
  obj.contentHash = '';
  const keys = Object.keys(obj).sort();
  const sorted: Record<string, unknown> = {};
  for (const key of keys) {
    sorted[key] = obj[key];
  }
  const content = JSON.stringify(sorted, deterministicReplacer);
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

function deterministicReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(value as Record<string, unknown>).sort();
    for (const k of keys) {
      sorted[k] = (value as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return value;
}

export function validateChecksum(content: string, expectedChecksum: string): boolean {
  return computePackChecksum(content).toLowerCase() === expectedChecksum.toLowerCase();
}
