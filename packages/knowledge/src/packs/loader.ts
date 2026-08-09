/**
 * Knowledge Pack Loader — loads packs from disk.
 *
 * Supports:
 * - Multiple directories
 * - Recursive discovery
 * - Version compatibility checking
 * - Integrity verification (checksum validation)
 * - Deterministic load order
 *
 * @module @veris/knowledge/packs/loader
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  KnowledgePack,
  KnowledgePackFile,
  PackLoadResult,
  PackError,
  KnowledgeEntry,
  KnowledgeReference,
} from './types.js';
import { validatePackFile, computePackChecksum, computePackContentHash } from './validator.js';

/** Loader configuration. */
export interface LoaderConfig {
  readonly directories: readonly string[];
  readonly recursive?: boolean;
  readonly validate?: boolean;
  readonly verifyChecksum?: boolean;
  readonly extension?: string;
}

/** Default loader configuration. */
const DEFAULT_CONFIG: LoaderConfig = {
  directories: [],
  recursive: true,
  validate: true,
  verifyChecksum: true,
  extension: '.veris-pack.json',
};

/**
 * Load all packs from the configured directories.
 */
export async function loadAllPacks(config?: Partial<LoaderConfig>): Promise<{
  packs: KnowledgePack[];
  errors: PackError[];
  warnings: string[];
}> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const allErrors: PackError[] = [];
  const allWarnings: string[] = [];
  const packs: KnowledgePack[] = [];

  const files = discoverPackFiles(
    cfg.directories ?? [],
    cfg.recursive ?? true,
    cfg.extension ?? '.veris-pack.json',
  );

  for (const filePath of files) {
    const result = await loadPackFromFile(
      filePath,
      cfg.validate ?? true,
      cfg.verifyChecksum ?? true,
    );
    if (result.pack) {
      packs.push(result.pack);
    }
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  }

  return { packs, errors: allErrors, warnings: allWarnings };
}

function discoverPackFiles(
  directories: readonly string[],
  recursive: boolean,
  extension: string,
): string[] {
  const files: string[] = [];
  for (const dir of directories) {
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && recursive) {
        files.push(...discoverPackFiles([fullPath], true, extension));
      } else if (entry.isFile() && entry.name.endsWith(extension)) {
        files.push(fullPath);
      }
    }
  }
  return files.sort();
}

/**
 * Load a single pack from a file path.
 */
export async function loadPackFromFile(
  filePath: string,
  validate: boolean = true,
  verifyChecksum: boolean = true,
): Promise<PackLoadResult> {
  const errors: PackError[] = [];
  const warnings: string[] = [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch (parseErr) {
      errors.push({
        code: 'PARSE_ERROR',
        message: `Failed to parse pack file: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
        path: filePath,
      });
      return { errors, warnings };
    }

    const packFile = raw as KnowledgePackFile;

    if (validate) {
      const validationResult = validatePackFile(packFile, filePath);
      if (!validationResult.valid) {
        return {
          errors: [...validationResult.errors],
          warnings: [...validationResult.warnings, ...warnings],
        };
      }
      warnings.push(...validationResult.warnings);
    }

    if (!packFile.metadata || !packFile.metadata.id) {
      errors.push({
        code: 'INVALID_PACK',
        message: 'Pack file has no valid metadata with id.',
        path: filePath,
      });
      return { errors, warnings };
    }

    if (verifyChecksum && packFile.metadata) {
      const checksumField = (packFile.metadata as Record<string, unknown>).checksum;
      if (typeof checksumField === 'string' && checksumField.length > 0) {
        const actualChecksum = computePackChecksum(content);
        if (actualChecksum.toLowerCase() !== (checksumField as string).toLowerCase()) {
          warnings.push(`Checksum mismatch for pack "${packFile.metadata.id}"`);
        }
      }
    }

    const entries: KnowledgeEntry[] = packFile.entries.map((e) => {
      const base = e as unknown as KnowledgeEntry;
      return {
        ...base,
        references: e.references ?? [],
      } as KnowledgeEntry;
    });

    const pack: KnowledgePack = {
      metadata: {
        ...packFile.metadata,
        checksum: '',
      },
      entries,
      contentHash: '',
    };

    // Compute content hash
    const contentHash = computePackContentHash(pack);

    return {
      pack: { ...pack, contentHash },
      errors: [],
      warnings,
    };
  } catch (err) {
    errors.push({
      code: 'LOAD_ERROR',
      message: `Failed to load pack file: ${err instanceof Error ? err.message : String(err)}`,
      path: filePath,
    });
    return { errors, warnings };
  }
}

/**
 * Check if a pack version is compatible with the current Veris version.
 */
export function isVersionCompatible(
  supportedVerisVersion: string,
  currentVerisVersion: string = '0.1.0',
): boolean {
  const supported = supportedVerisVersion.split('.').map(Number);
  const current = currentVerisVersion.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const s = supported[i] ?? 0;
    const c = current[i] ?? 0;
    if (c < s) return false;
    if (c > s) return true;
  }
  return true;
}
