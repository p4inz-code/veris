/**
 * @veris/plugins/ecosystem/installer — Plugin package installation and removal pipeline.
 *
 * Implements Section 3 & 4 of ADR-018:
 * - Verification gate before any filesystem mutation
 * - Safe directory layout without path traversal risks
 * - Atomic-style copy with immutable installation receipt
 * - Safe uninstallation with identity verification
 *
 * @module @veris/plugins/ecosystem/installer
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { InstallReceipt, InstallResult, RemoveResult } from './types.js';
import { verifyPluginPackage } from './verifier.js';

export interface InstallOptions {
  /** Overwrite if plugin is already installed. */
  readonly force?: boolean;
  /** Skip verification gate (NOT recommended, testing only). */
  readonly skipVerify?: boolean;
  /** Expected SHA-256 for integrity gating. */
  readonly expectedSha256?: string;
  /** Host version override for compatibility check. */
  readonly currentVerisVersion?: string;
}

/**
 * Computes a safe relative filesystem path for a plugin ID (supporting @scope/name).
 */
export function sanitizePluginDir(pluginId: string): string {
  // Normalize scoped packages (@scope/name -> @scope/name on disk or scope__name)
  const parts = pluginId.split('/').filter(Boolean);
  const cleanParts = parts.map((part) => part.replace(/[^a-zA-Z0-9_@-]/g, '_'));
  return path.join(...cleanParts);
}

/**
 * Installs a plugin package into the specified target plugins directory.
 */
export async function installPluginPackage(
  sourcePath: string,
  targetPluginsDir: string,
  options?: InstallOptions,
): Promise<InstallResult> {
  const resolvedSource = path.resolve(sourcePath);
  const resolvedTargetBase = path.resolve(targetPluginsDir);

  // 1. Mandatory verification gate
  const verification = await verifyPluginPackage(resolvedSource, {
    expectedSha256: options?.expectedSha256,
    currentVerisVersion: options?.currentVerisVersion,
  });

  if (!verification.valid && !options?.skipVerify) {
    return {
      success: false,
      pluginId: verification.manifest?.id ?? 'unknown',
      targetDir: resolvedTargetBase,
      verification,
      error: `Verification failed: ${verification.errors.join('; ')}`,
    };
  }

  const manifest = verification.manifest;
  if (!manifest) {
    return {
      success: false,
      pluginId: 'unknown',
      targetDir: resolvedTargetBase,
      verification,
      error: 'Cannot install package: valid manifest is required.',
    };
  }

  const destSubdir = sanitizePluginDir(manifest.id);
  const destination = path.join(resolvedTargetBase, destSubdir);

  // 2. Prevent accidental overwrite unless --force is set
  if (fs.existsSync(destination)) {
    if (!options?.force) {
      return {
        success: false,
        pluginId: manifest.id,
        targetDir: destination,
        verification,
        error: `Plugin is already installed at ${destination}. Re-run with --force to overwrite.`,
      };
    }
    fs.rmSync(destination, { recursive: true, force: true });
  }

  fs.mkdirSync(destination, { recursive: true });

  // 3. Copy assets
  const sourceStat = fs.statSync(resolvedSource);
  if (sourceStat.isDirectory()) {
    copyDirectoryRecursive(resolvedSource, destination);
  } else {
    // Single JSON manifest file: copy as veris-plugin.json
    fs.copyFileSync(resolvedSource, path.join(destination, 'veris-plugin.json'));
  }

  // 4. Write immutable installation receipt
  const receipt: InstallReceipt = {
    pluginId: manifest.id,
    name: manifest.name,
    version: manifest.version,
    type: manifest.type,
    installedAt: new Date().toISOString(),
    verifiedSha256: verification.computedSha256,
    sourcePath: resolvedSource,
    capabilities: manifest.capabilities,
  };

  const receiptPath = path.join(destination, '.veris-installed.json');
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2), 'utf-8');

  return {
    success: true,
    pluginId: manifest.id,
    targetDir: destination,
    receipt,
    verification,
  };
}

/**
 * Safely uninstalls a plugin from the target plugins directory.
 */
export async function removePluginPackage(
  pluginId: string,
  targetPluginsDir: string,
): Promise<RemoveResult> {
  const resolvedTargetBase = path.resolve(targetPluginsDir);

  if (!fs.existsSync(resolvedTargetBase)) {
    return {
      success: false,
      pluginId,
      targetDir: resolvedTargetBase,
      removedFilesCount: 0,
      error: `Plugins directory does not exist: ${resolvedTargetBase}`,
    };
  }

  // Locate plugin directory: check direct sanitized path or inspect manifests
  let targetPluginDir: string | undefined;

  const directPath = path.join(resolvedTargetBase, sanitizePluginDir(pluginId));
  if (fs.existsSync(directPath)) {
    targetPluginDir = directPath;
  } else {
    // Search recursively within targetPluginsDir for matching manifest
    targetPluginDir = findPluginDirById(resolvedTargetBase, pluginId);
  }

  if (!targetPluginDir || !fs.existsSync(targetPluginDir)) {
    return {
      success: false,
      pluginId,
      targetDir: resolvedTargetBase,
      removedFilesCount: 0,
      error: `Plugin "${pluginId}" is not installed in ${resolvedTargetBase}`,
    };
  }

  // Verify ownership before deleting
  const isMatch = verifyDirectoryBelongsToPlugin(targetPluginDir, pluginId);
  if (!isMatch) {
    return {
      success: false,
      pluginId,
      targetDir: targetPluginDir,
      removedFilesCount: 0,
      error: `Refusing to delete directory: manifest in ${targetPluginDir} does not match plugin ID "${pluginId}".`,
    };
  }

  const count = countFiles(targetPluginDir);
  fs.rmSync(targetPluginDir, { recursive: true, force: true });

  return {
    success: true,
    pluginId,
    targetDir: targetPluginDir,
    removedFilesCount: count,
  };
}

// ── Helpers ──

function copyDirectoryRecursive(src: string, dest: string): void {
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') {
      continue;
    }

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDirectoryRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function countFiles(dir: string): number {
  let count = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        count += countFiles(path.join(dir, entry.name));
      } else {
        count++;
      }
    }
  } catch {
    // Ignore
  }
  return count;
}

function verifyDirectoryBelongsToPlugin(dir: string, pluginId: string): boolean {
  // Check .veris-installed.json
  const receiptPath = path.join(dir, '.veris-installed.json');
  if (fs.existsSync(receiptPath)) {
    try {
      const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf-8'));
      if (receipt.pluginId === pluginId) return true;
    } catch {
      // Continue
    }
  }

  // Check manifest files
  const manifests = ['veris-plugin.json', 'plugin.json', 'package.json'];
  for (const m of manifests) {
    const p = path.join(dir, m);
    if (fs.existsSync(p)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
        const id = m === 'package.json' ? parsed.veris?.id : parsed.id;
        if (id === pluginId) return true;
      } catch {
        // Continue
      }
    }
  }

  return false;
}

function findPluginDirById(baseDir: string, pluginId: string): string | undefined {
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sub = path.join(baseDir, entry.name);

    if (verifyDirectoryBelongsToPlugin(sub, pluginId)) {
      return sub;
    }

    // Check nested directory (e.g. @scope/name)
    if (entry.name.startsWith('@')) {
      const nestedEntries = fs.readdirSync(sub, { withFileTypes: true });
      for (const nested of nestedEntries) {
        if (!nested.isDirectory()) continue;
        const nestedSub = path.join(sub, nested.name);
        if (verifyDirectoryBelongsToPlugin(nestedSub, pluginId)) {
          return nestedSub;
        }
      }
    }
  }

  return undefined;
}
