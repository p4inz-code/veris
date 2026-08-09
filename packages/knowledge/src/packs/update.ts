/**
 * Offline Update System — framework for knowledge pack updates.
 *
 * @module @veris/knowledge/packs/update
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { loadPackFromFile } from './loader.js';
import type { KnowledgePack, PackError } from './types.js';
import { computePackChecksum } from './validator.js';

export const BUNDLE_EXTENSION = '.veris-pack-bundle.json';
export const BUNDLE_FORMAT_VERSION = '1.0.0';

export interface UpdateBundle {
  readonly formatVersion: string;
  readonly metadata: UpdateBundleMetadata;
  readonly packs: readonly BundlePackEntry[];
  readonly signature: string;
}

export interface UpdateBundleMetadata {
  readonly id: string;
  readonly version: string;
  readonly createdAt: string;
  readonly description: string;
  readonly minVerisVersion: string;
  readonly author: string;
}

export interface BundlePackEntry {
  readonly id: string;
  readonly version: string;
  readonly filePath: string;
  readonly previousVersion?: string;
  readonly type: 'new' | 'update' | 'downgrade';
  readonly contentBase64: string;
  readonly checksum: string;
  readonly releaseNotes?: string;
}

export interface UpdateResult {
  readonly bundle: UpdateBundle;
  readonly applied: readonly string[];
  readonly failed: readonly PackError[];
  readonly rollbackAvailable: boolean;
  readonly rollbackFiles: readonly string[];
}

export function verifyBundleSignature(bundle: UpdateBundle): boolean {
  const content = JSON.stringify({
    formatVersion: bundle.formatVersion,
    metadata: bundle.metadata,
    packs: bundle.packs.map((p) => ({
      id: p.id,
      version: p.version,
      previousVersion: p.previousVersion,
      type: p.type,
      contentBase64: p.contentBase64,
      checksum: p.checksum,
      releaseNotes: p.releaseNotes,
    })),
  });
  const computedSignature = createHash('sha256').update(content).digest('hex');
  return computedSignature === bundle.signature;
}

export async function applyUpdateBundle(
  bundle: UpdateBundle,
  targetDir: string,
  rollbackDir: string,
): Promise<UpdateResult> {
  const applied: string[] = [];
  const failed: PackError[] = [];
  const rollbackFiles: string[] = [];

  if (!verifyBundleSignature(bundle)) {
    failed.push({ code: 'INVALID_SIGNATURE', message: 'Bundle signature verification failed.' });
    return { bundle, applied, failed, rollbackAvailable: false, rollbackFiles };
  }

  fs.mkdirSync(targetDir, { recursive: true });
  fs.mkdirSync(rollbackDir, { recursive: true });

  for (const packEntry of bundle.packs) {
    try {
      const targetPath = path.join(targetDir, `${packEntry.id}.veris-pack.json`);
      if (fs.existsSync(targetPath) && packEntry.previousVersion) {
        const rollbackPath = path.join(
          rollbackDir,
          `${packEntry.id}-v${packEntry.previousVersion}.veris-pack.json`,
        );
        fs.copyFileSync(targetPath, rollbackPath);
        rollbackFiles.push(rollbackPath);
      }
      const content = Buffer.from(packEntry.contentBase64, 'base64').toString('utf-8');
      fs.writeFileSync(targetPath, content, 'utf-8');
      const writtenContent = fs.readFileSync(targetPath, 'utf-8');
      const writtenChecksum = computePackChecksum(writtenContent);
      if (writtenChecksum.toLowerCase() !== packEntry.checksum.toLowerCase()) {
        throw new Error('Checksum mismatch after writing pack file');
      }
      applied.push(packEntry.id);
    } catch (err) {
      failed.push({
        code: 'UPDATE_FAILED',
        message: `Failed to apply update for "${packEntry.id}": ${err instanceof Error ? err.message : String(err)}`,
        packId: packEntry.id,
      });
    }
  }

  return { bundle, applied, failed, rollbackAvailable: rollbackFiles.length > 0, rollbackFiles };
}

export function rollbackUpdate(
  packId: string,
  rollbackFile: string,
  targetDir: string,
): { success: boolean; error?: string } {
  try {
    if (!fs.existsSync(rollbackFile))
      return { success: false, error: `Rollback file not found: ${rollbackFile}` };
    const targetPath = path.join(targetDir, `${packId}.veris-pack.json`);
    fs.copyFileSync(rollbackFile, targetPath);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: `Rollback failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function getMigrationPath(
  oldVersion: string,
  newVersion: string,
): Array<{ from: string; to: string; direction: 'upgrade' | 'downgrade' }> {
  const oldParts = oldVersion.split('.').map(Number);
  const newParts = newVersion.split('.').map(Number);
  const isUpgrade =
    newParts[0] > oldParts[0] ||
    (newParts[0] === oldParts[0] && newParts[1] > oldParts[1]) ||
    (newParts[0] === oldParts[0] && newParts[1] === oldParts[1] && newParts[2] > oldParts[2]);
  if (isUpgrade) {
    return [{ from: oldVersion, to: newVersion, direction: 'upgrade' as const }];
  }
  return [{ from: oldVersion, to: newVersion, direction: 'downgrade' as const }];
}
