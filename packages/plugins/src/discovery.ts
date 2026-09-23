/**
 * Plugin Discovery for VERIS V2 Plugin Host.
 *
 * Scans configured and default directories for VERIS plugins:
 * - Explicit `pluginsDir`
 * - Local workspace `.veris/plugins`
 * - User home `~/.veris/plugins`
 *
 * Enforces path traversal guards, manifest validation, semver compatibility,
 * entry point verification, and deterministic sorting.
 *
 * @module @veris/plugins/discovery
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { PluginDiagnosticsCollector } from './diagnostics.js';
import {
  isPluginCompatible,
  sortPluginsDeterministically,
  validatePluginManifest,
} from './manifest.js';
import { PERMISSION_GROUPS, type DiscoveredPlugin, type PluginDiscoveryOptions } from './types.js';

export const DEFAULT_HOST_VERSION = '1.0.0';

/**
 * Discovers and validates all plugins from candidate search locations.
 */
export async function discoverPlugins(
  options: PluginDiscoveryOptions = {},
  diagnostics?: PluginDiagnosticsCollector,
): Promise<DiscoveredPlugin[]> {
  const hostVersion = options.hostVersion ?? DEFAULT_HOST_VERSION;
  const disabledIds = new Set(options.disabledPluginIds ?? []);
  const discoveredMap = new Map<string, DiscoveredPlugin>();

  // Determine search paths in priority order:
  // 1. Explicit pluginsDir (CLI / scan option)
  // 2. Workspace .veris/plugins
  // 3. User home .veris/plugins
  const searchPaths: string[] = [];

  if (options.pluginsDir) {
    searchPaths.push(path.resolve(options.pluginsDir));
  }

  if (options.workspaceDir) {
    searchPaths.push(path.resolve(options.workspaceDir, '.veris', 'plugins'));
  }

  const userHome = options.userHomeDir ?? os.homedir();
  if (userHome) {
    searchPaths.push(path.resolve(userHome, '.veris', 'plugins'));
  }

  for (const baseDir of searchPaths) {
    if (!fs.existsSync(baseDir)) {
      continue;
    }

    try {
      const stat = fs.statSync(baseDir);
      if (!stat.isDirectory()) {
        continue;
      }
    } catch {
      continue;
    }

    // Check if baseDir itself is a plugin directory
    if (hasManifest(baseDir)) {
      inspectAndRegister(baseDir, baseDir, hostVersion, disabledIds, discoveredMap, diagnostics);
      continue;
    }

    // Otherwise, discover candidate subdirectories
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(baseDir, { withFileTypes: true });
    } catch (err) {
      diagnostics?.warn(
        'discovery',
        'PLUGIN_DIR_READ_FAILED',
        `Failed to read plugin search directory: ${baseDir}`,
        { error: err instanceof Error ? err.message : String(err) },
      );
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const candidateDir = path.resolve(baseDir, entry.name);

      // Guard against directory traversal
      if (!isPathInside(candidateDir, baseDir)) {
        diagnostics?.error(
          entry.name,
          'PLUGIN_PATH_TRAVERSAL',
          `Plugin directory ${candidateDir} escapes search directory ${baseDir}`,
        );
        continue;
      }

      // Check for npm-style scoped directory (e.g. @corp/plugin)
      if (entry.name.startsWith('@')) {
        let scopedEntries: fs.Dirent[] = [];
        try {
          scopedEntries = fs.readdirSync(candidateDir, { withFileTypes: true });
        } catch {
          continue;
        }

        for (const scopedEntry of scopedEntries) {
          if (!scopedEntry.isDirectory()) continue;
          const scopedPluginDir = path.resolve(candidateDir, scopedEntry.name);
          if (!isPathInside(scopedPluginDir, baseDir)) {
            diagnostics?.error(
              `${entry.name}/${scopedEntry.name}`,
              'PLUGIN_PATH_TRAVERSAL',
              `Scoped plugin directory ${scopedPluginDir} escapes ${baseDir}`,
            );
            continue;
          }
          inspectAndRegister(
            scopedPluginDir,
            baseDir,
            hostVersion,
            disabledIds,
            discoveredMap,
            diagnostics,
          );
        }
      } else {
        inspectAndRegister(
          candidateDir,
          baseDir,
          hostVersion,
          disabledIds,
          discoveredMap,
          diagnostics,
        );
      }
    }
  }

  // Deterministic lexicographical sorting by plugin ID
  return sortPluginsDeterministically([...discoveredMap.values()]);
}

/**
 * Check if a directory directly contains a plugin manifest.
 */
function hasManifest(dir: string): boolean {
  return (
    fs.existsSync(path.join(dir, 'veris-plugin.json')) ||
    fs.existsSync(path.join(dir, 'package.json'))
  );
}

/**
 * Inspect a candidate directory, validate its manifest, check compatibility,
 * and register it in the discovered map.
 */
function inspectAndRegister(
  candidateDir: string,
  searchBaseDir: string,
  hostVersion: string,
  disabledIds: Set<string>,
  discoveredMap: Map<string, DiscoveredPlugin>,
  diagnostics?: PluginDiagnosticsCollector,
): void {
  const verisPluginJson = path.join(candidateDir, 'veris-plugin.json');
  const packageJson = path.join(candidateDir, 'package.json');

  let manifestData: unknown = null;
  let manifestPath = '';

  if (fs.existsSync(verisPluginJson)) {
    manifestPath = verisPluginJson;
    try {
      const content = fs.readFileSync(verisPluginJson, 'utf-8');
      manifestData = JSON.parse(content);
    } catch (err) {
      diagnostics?.error(
        path.basename(candidateDir),
        'PLUGIN_MANIFEST_SYNTAX_ERROR',
        `Failed to parse ${verisPluginJson}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
  } else if (fs.existsSync(packageJson)) {
    manifestPath = packageJson;
    try {
      const content = fs.readFileSync(packageJson, 'utf-8');
      const pkg = JSON.parse(content);
      if (pkg.veris && typeof pkg.veris === 'object') {
        manifestData = {
          id: pkg.veris.id ?? pkg.name,
          version: pkg.veris.version ?? pkg.version,
          description: pkg.veris.description ?? pkg.description ?? '',
          author:
            pkg.veris.author ??
            (typeof pkg.author === 'string' ? pkg.author : (pkg.author?.name ?? '')),
          license: pkg.veris.license ?? pkg.license ?? '',
          ...pkg.veris,
        };
      }
    } catch (err) {
      diagnostics?.error(
        path.basename(candidateDir),
        'PLUGIN_MANIFEST_SYNTAX_ERROR',
        `Failed to parse ${packageJson}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
  }

  // If no manifest was found, this directory is not a plugin
  if (!manifestData) {
    return;
  }

  // Schema validation
  const validation = validatePluginManifest(manifestData);
  if (!validation.valid || !validation.manifest) {
    const rawRecord =
      typeof manifestData === 'object' && manifestData !== null
        ? (manifestData as Record<string, unknown>)
        : null;
    const rawId = typeof rawRecord?.id === 'string' ? rawRecord.id : path.basename(candidateDir);
    diagnostics?.error(
      rawId,
      'PLUGIN_MANIFEST_INVALID',
      `Plugin manifest at ${manifestPath} is invalid: ${validation.errors.map((e) => e.message).join('; ')}`,
      { errors: validation.errors },
    );
    return;
  }

  const manifest = validation.manifest;

  // Disabled check
  if (disabledIds.has(manifest.id)) {
    diagnostics?.info(
      manifest.id,
      'PLUGIN_DISABLED',
      `Plugin "${manifest.id}" is administratively disabled and was skipped`,
    );
    return;
  }

  // Dangerous capabilities check (offline-first security policy)
  const hasDangerous = manifest.capabilities.some((c) =>
    (PERMISSION_GROUPS.dangerous as readonly string[]).includes(c),
  );
  if (hasDangerous) {
    diagnostics?.error(
      manifest.id,
      'PLUGIN_DANGEROUS_CAPABILITY_FORBIDDEN',
      `Plugin "${manifest.id}" requests forbidden dangerous capabilities: ${manifest.capabilities.filter((c) => (PERMISSION_GROUPS.dangerous as readonly string[]).includes(c)).join(', ')} (offline-first policy forbids network and process-spawn)`,
      { capabilities: manifest.capabilities },
    );
    return;
  }

  // Host version compatibility check
  if (!isPluginCompatible(manifest, hostVersion)) {
    diagnostics?.error(
      manifest.id,
      'PLUGIN_INCOMPATIBLE_VERIS_VERSION',
      `Plugin "${manifest.id}" requires VERIS version range "${manifest.engines.veris}", but host is "${hostVersion}"`,
      { hostVersion, required: manifest.engines.veris },
    );
    return;
  }

  // Entry point resolution & path traversal check
  const entryPointFile = path.resolve(candidateDir, manifest.entryPoint);
  if (!isPathInside(entryPointFile, candidateDir)) {
    diagnostics?.error(
      manifest.id,
      'PLUGIN_ENTRY_POINT_ESCAPE',
      `Plugin entryPoint "${manifest.entryPoint}" escapes plugin directory ${candidateDir}`,
      { entryPoint: manifest.entryPoint, resolved: entryPointFile },
    );
    return;
  }

  const ext = path.extname(manifest.entryPoint).toLowerCase();
  if (ext !== '.js' && ext !== '.mjs' && ext !== '.cjs') {
    diagnostics?.error(
      manifest.id,
      'PLUGIN_INVALID_ENTRY_POINT_EXTENSION',
      `Plugin entry point "${manifest.entryPoint}" has invalid extension "${ext}". Only .js, .mjs, and .cjs are permitted`,
      { entryPoint: manifest.entryPoint },
    );
    return;
  }

  if (!fs.existsSync(entryPointFile)) {
    diagnostics?.error(
      manifest.id,
      'PLUGIN_ENTRY_POINT_NOT_FOUND',
      `Plugin entry point file "${entryPointFile}" does not exist`,
      { entryPoint: manifest.entryPoint, resolved: entryPointFile },
    );
    return;
  }

  try {
    const stat = fs.statSync(entryPointFile);
    if (!stat.isFile()) {
      diagnostics?.error(
        manifest.id,
        'PLUGIN_ENTRY_POINT_NOT_FILE',
        `Plugin entry point "${entryPointFile}" is not a regular file`,
        { entryPoint: manifest.entryPoint, resolved: entryPointFile },
      );
      return;
    }
  } catch (err) {
    diagnostics?.error(
      manifest.id,
      'PLUGIN_ENTRY_POINT_STAT_ERROR',
      `Cannot inspect plugin entry point file "${entryPointFile}": ${err instanceof Error ? err.message : String(err)}`,
      { entryPoint: manifest.entryPoint, resolved: entryPointFile },
    );
    return;
  }

  // Deduplication: earlier discovered search locations take precedence
  if (discoveredMap.has(manifest.id)) {
    diagnostics?.info(
      manifest.id,
      'PLUGIN_DUPLICATE_IGNORED',
      `Duplicate plugin "${manifest.id}" found in ${candidateDir} (ignored in favor of earlier discovery)`,
    );
    return;
  }

  discoveredMap.set(manifest.id, {
    id: manifest.id,
    manifest,
    manifestPath,
    directory: candidateDir,
    entryPointFile,
  });
}

/**
 * Verifies that a target path is strictly contained within an expected ancestor directory.
 * Prevents lexical traversal, null-byte injection, and symlink escapes.
 */
function isPathInside(targetPath: string, parentDir: string): boolean {
  if (targetPath.includes('\0') || parentDir.includes('\0')) {
    return false;
  }

  try {
    const resolvedTarget = path.resolve(targetPath);
    const resolvedParent = path.resolve(parentDir);

    // Lexical check first
    const rel = path.relative(resolvedParent, resolvedTarget);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return false;
    }

    // Symlink resolution check: ensure target does not physically resolve outside parent
    if (fs.existsSync(resolvedTarget) && fs.existsSync(resolvedParent)) {
      const realTarget = fs.realpathSync(resolvedTarget);
      const realParent = fs.realpathSync(resolvedParent);

      const normTarget =
        process.platform === 'win32' || process.platform === 'darwin'
          ? realTarget.toLowerCase()
          : realTarget;
      const normParent =
        process.platform === 'win32' || process.platform === 'darwin'
          ? realParent.toLowerCase()
          : realParent;

      const realRel = path.relative(normParent, normTarget);
      if (realRel.startsWith('..') || path.isAbsolute(realRel)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}
