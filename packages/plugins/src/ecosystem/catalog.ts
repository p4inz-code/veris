/**
 * @veris/plugins/ecosystem/catalog — Local-first plugin registry and catalog operations.
 *
 * Implements Section 1 of ADR-018:
 * - Offline-first catalog loading and validation
 * - In-memory multi-attribute package discovery and filtering
 * - Built-in standard ecosystem package index
 *
 * @module @veris/plugins/ecosystem/catalog
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { PluginCapability, PluginType } from '../types.js';

import type { PluginCatalog, PluginPackageRecord } from './types.js';

/**
 * Built-in reference catalog providing standard verified ecosystem packs.
 */
export const DEFAULT_ECOSYSTEM_CATALOG: PluginCatalog = {
  schemaVersion: '1.0.0',
  name: 'VERIS Standard Ecosystem Catalog',
  updatedAt: '2026-09-24T00:00:00.000Z',
  packages: [
    {
      id: '@veris-ecosystem/pe-extended-extractor',
      name: 'PE Extended Binary Extractor',
      version: '1.0.0',
      description: 'Deep section analysis and rich header metadata extraction for PE binaries.',
      type: 'extractor',
      author: 'VERIS Security Research',
      license: 'Apache-2.0',
      capabilities: ['core-types-read', 'target-read', 'metadata-extract'],
      sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
      engines: {
        veris: '>=1.0.0',
      },
      location: './packages/pe-extended',
      tags: ['pe', 'windows', 'extractor', 'binary'],
    },
    {
      id: '@veris-ecosystem/cloud-credentials-pack',
      name: 'Cloud Infrastructure Credential Rules',
      version: '1.0.0',
      description: 'Declarative rules detecting leaked AWS, GCP, Azure, and Kubernetes secrets.',
      type: 'rule-pack',
      author: 'VERIS Security Research',
      license: 'Apache-2.0',
      capabilities: ['core-types-read'],
      sha256: 'b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef01',
      engines: {
        veris: '>=1.0.0',
      },
      location: './packages/cloud-credentials',
      tags: ['rules', 'cloud', 'credentials', 'secrets'],
    },
    {
      id: '@veris-ecosystem/powershell-deobfuscator-pack',
      name: 'PowerShell Evasion Detection Pack',
      version: '1.0.0',
      description:
        'Detects base64 encoded commands, variable obfuscation, and AMSI bypass scripts.',
      type: 'rule-pack',
      author: 'Community Forensics SIG',
      license: 'MIT',
      capabilities: ['core-types-read'],
      sha256: 'c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef012',
      engines: {
        veris: '>=1.0.0',
      },
      location: './packages/powershell-evasion',
      tags: ['rules', 'powershell', 'evasion', 'script'],
    },
  ],
};

/**
 * Filter criteria for discovering packages in a catalog.
 */
export interface CatalogFilterQuery {
  readonly type?: PluginType;
  readonly search?: string;
  readonly tag?: string;
  readonly capability?: PluginCapability;
}

/**
 * Loads a PluginCatalog from a JSON file path, object, or falls back to standard catalog.
 */
export function loadCatalog(source?: string | PluginCatalog): PluginCatalog {
  if (!source) {
    return DEFAULT_ECOSYSTEM_CATALOG;
  }

  if (typeof source === 'object') {
    validateCatalogStructure(source);
    return source;
  }

  const resolved = path.resolve(source);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Catalog file not found: ${resolved}`);
  }

  const raw = fs.readFileSync(resolved, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse catalog JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  validateCatalogStructure(parsed);
  return parsed as PluginCatalog;
}

/**
 * Validates top-level schema conformance of a catalog object.
 */
function validateCatalogStructure(obj: unknown): void {
  if (!obj || typeof obj !== 'object') {
    throw new Error('Invalid catalog: root must be an object.');
  }

  const cat = obj as Record<string, unknown>;

  if (cat.schemaVersion !== '1.0.0') {
    throw new Error(
      `Unsupported catalog schemaVersion: ${String(cat.schemaVersion)} (expected '1.0.0')`,
    );
  }

  if (!Array.isArray(cat.packages)) {
    throw new Error('Invalid catalog: "packages" must be an array.');
  }
}

/**
 * Filters a catalog by type, search keyword, tag, or capability.
 */
export function filterCatalog(
  catalog: PluginCatalog,
  query?: CatalogFilterQuery,
): readonly PluginPackageRecord[] {
  if (!query) {
    return catalog.packages;
  }

  const searchLower = query.search?.toLowerCase().trim();
  const tagLower = query.tag?.toLowerCase().trim();

  return catalog.packages.filter((pkg) => {
    if (query.type && pkg.type !== query.type) {
      return false;
    }

    if (query.capability && !pkg.capabilities.includes(query.capability)) {
      return false;
    }

    if (tagLower && !pkg.tags?.some((t) => t.toLowerCase() === tagLower)) {
      return false;
    }

    if (searchLower) {
      const idMatch = pkg.id.toLowerCase().includes(searchLower);
      const nameMatch = pkg.name.toLowerCase().includes(searchLower);
      const descMatch = pkg.description.toLowerCase().includes(searchLower);
      const authorMatch = pkg.author.toLowerCase().includes(searchLower);
      if (!idMatch && !nameMatch && !descMatch && !authorMatch) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Saves a catalog to disk.
 */
export function saveCatalog(catalog: PluginCatalog, targetPath: string): void {
  validateCatalogStructure(catalog);
  const resolved = path.resolve(targetPath);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(resolved, JSON.stringify(catalog, null, 2), 'utf-8');
}
