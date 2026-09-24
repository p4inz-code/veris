/**
 * `veris plugins` command — list, inspect, and validate local plugins.
 *
 * Usage:
 *   veris plugins                              List all discovered plugins
 *   veris plugins list [options]               List all discovered plugins
 *   veris plugins info <plugin-id> [options]   Show detailed plugin information
 *   veris plugins validate [path] [options]    Validate plugin manifest and entry point
 *
 * Professional CLI output conforming to VERIS design system and machine-readable contracts.
 *
 * @module @veris/cli/commands/plugins
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { loadFromEnv } from '@veris/config';
import {
  PluginHost,
  validatePluginManifest,
  loadCatalog,
  filterCatalog,
  verifyPluginPackage,
  installPluginPackage,
  removePluginPackage,
  type PluginType,
} from '@veris/plugins';

import { getSymbolSet } from '../ui/renderer/index.js';
import { horizontalDivider } from '../ui/styles/index.js';
import { getResolvedTheme, ansiReset } from '../ui/theme/index.js';
import { CLI_VERSION, ExitCode, CliError } from '../wirer.js';

// ── Help Text ──

export const PLUGINS_HELP = `
Manage, inspect, verify, and install VERIS plugins.

VERIS plugins extend analysis capabilities with local, deterministic
extractors and declarative rule packs.

USAGE
  veris plugins                             List discovered plugins
  veris plugins list [options]              List discovered plugins
  veris plugins info <plugin-id> [options]  Show detailed plugin information
  veris plugins validate [path] [options]   Validate a plugin manifest
  veris plugins catalog [path] [options]    Browse verified plugin catalog
  veris plugins verify <path> [options]     Verify integrity, capabilities, and compatibility
  veris plugins install <path> [options]    Verify and install a plugin package
  veris plugins remove <id> [options]       Uninstall a plugin package

OPTIONS
  --help, -h               Show help for any command
  --plugin-dir, -d <dir>   Directory to search for plugins
  --target, -t <dir>       Target plugins directory for install/remove
  --type <type>            Filter catalog by type (extractor, rule-pack)
  --search, -s <query>     Search catalog packages by keyword
  --tag <tag>              Filter catalog packages by tag
  --expected-sha256 <hash> Expected SHA-256 checksum for verification
  --force                  Overwrite existing plugin on installation
  --disable-plugin <id>    Disable specific plugin ID (repeatable)
  --json                   Output in machine-readable JSON format
  --verbose                Show detailed capabilities and diagnostics

EXAMPLES
  veris plugins                             List all local plugins
  veris plugins catalog                     Browse standard ecosystem catalog
  veris plugins catalog --search credentials Find credential rule packs
  veris plugins verify ./my-plugin          Verify package integrity and capabilities
  veris plugins install ./my-plugin         Install verified plugin into ./.veris/plugins
  veris plugins remove custom-rule-pack     Remove an installed plugin

EXIT CODES
  0  Success
  1  General error / validation failure
  2  Usage error
`;

// ── Command Options ──

interface PluginsCommandOptions {
  readonly subcommand: 'list' | 'info' | 'validate' | 'catalog' | 'verify' | 'install' | 'remove';
  readonly targetArg?: string;
  readonly pluginDir?: string;
  readonly targetDir?: string;
  readonly type?: string;
  readonly search?: string;
  readonly tag?: string;
  readonly expectedSha256?: string;
  readonly force?: boolean;
  readonly disabledPlugins: readonly string[];
  readonly json: boolean;
  readonly verbose: boolean;
}

// ── Parse Args ──

export function parsePluginsArgs(args: readonly string[]): PluginsCommandOptions {
  let subcommand: 'list' | 'info' | 'validate' | 'catalog' | 'verify' | 'install' | 'remove' =
    'list';
  let targetArg: string | undefined;
  let pluginDir: string | undefined;
  let targetDir: string | undefined;
  let type: string | undefined;
  let search: string | undefined;
  let tag: string | undefined;
  let expectedSha256: string | undefined;
  let force = false;
  const disabledPlugins: string[] = [];
  let json = false;
  let verbose = false;

  let i = 0;
  let firstPositional = true;

  while (i < args.length) {
    const arg = args[i];

    switch (arg) {
      case '--help':
      case '-h':
        process.stdout.write(PLUGINS_HELP);
        process.exit(ExitCode.SUCCESS);

      case '--plugin-dir':
      case '-d': {
        i++;
        if (i >= args.length) {
          throw new CliError('Missing value for --plugin-dir', ExitCode.USAGE_ERROR);
        }
        pluginDir = args[i];
        break;
      }

      case '--target':
      case '-t': {
        i++;
        if (i >= args.length) {
          throw new CliError('Missing value for --target', ExitCode.USAGE_ERROR);
        }
        targetDir = args[i];
        break;
      }

      case '--type': {
        i++;
        if (i >= args.length) {
          throw new CliError('Missing value for --type', ExitCode.USAGE_ERROR);
        }
        type = args[i];
        break;
      }

      case '--search':
      case '-s': {
        i++;
        if (i >= args.length) {
          throw new CliError('Missing value for --search', ExitCode.USAGE_ERROR);
        }
        search = args[i];
        break;
      }

      case '--tag': {
        i++;
        if (i >= args.length) {
          throw new CliError('Missing value for --tag', ExitCode.USAGE_ERROR);
        }
        tag = args[i];
        break;
      }

      case '--expected-sha256': {
        i++;
        if (i >= args.length) {
          throw new CliError('Missing value for --expected-sha256', ExitCode.USAGE_ERROR);
        }
        expectedSha256 = args[i];
        break;
      }

      case '--force': {
        force = true;
        break;
      }

      case '--disable-plugin': {
        i++;
        if (i >= args.length) {
          throw new CliError('Missing value for --disable-plugin', ExitCode.USAGE_ERROR);
        }
        disabledPlugins.push(args[i]);
        break;
      }

      case '--json':
        json = true;
        break;

      case '--verbose':
        verbose = true;
        break;

      default:
        if (!arg.startsWith('-')) {
          if (firstPositional) {
            firstPositional = false;
            if (
              arg === 'list' ||
              arg === 'info' ||
              arg === 'validate' ||
              arg === 'catalog' ||
              arg === 'verify' ||
              arg === 'install' ||
              arg === 'remove'
            ) {
              subcommand = arg;
            } else {
              targetArg = arg;
            }
          } else if (targetArg === undefined) {
            targetArg = arg;
          } else {
            throw new CliError(`Unexpected argument: "${arg}"`, ExitCode.USAGE_ERROR);
          }
        } else {
          throw new CliError(`Unknown option: "${arg}"`, ExitCode.USAGE_ERROR);
        }
    }

    i++;
  }

  return {
    subcommand,
    targetArg,
    pluginDir,
    targetDir,
    type,
    search,
    tag,
    expectedSha256,
    force,
    disabledPlugins,
    json,
    verbose,
  };
}

// ── Command Handler ──

export async function runPlugins(args: readonly string[]): Promise<{ exitCode: number }> {
  if (args.length > 0 && (args[0] === '--help' || args[0] === '-h')) {
    process.stdout.write(PLUGINS_HELP);
    return { exitCode: ExitCode.SUCCESS };
  }

  const options = parsePluginsArgs(args);

  switch (options.subcommand) {
    case 'list':
      return cmdList(options);
    case 'info':
      return cmdInfo(options);
    case 'validate':
      return cmdValidate(options);
    case 'catalog':
      return cmdCatalog(options);
    case 'verify':
      return cmdVerify(options);
    case 'install':
      return cmdInstall(options);
    case 'remove':
      return cmdRemove(options);
  }
}

// ── Subcommand: list ──

async function cmdList(options: PluginsCommandOptions): Promise<{ exitCode: number }> {
  const envConfig = loadFromEnv();
  const pluginsDir = options.pluginDir ?? envConfig.plugins?.pluginDir;
  const disabledPlugins = [
    ...(envConfig.plugins?.disabledPlugins ?? []),
    ...options.disabledPlugins,
  ];

  const host = new PluginHost({
    workspaceDir: path.resolve(process.cwd()),
    pluginsDir: pluginsDir ? path.resolve(process.cwd(), pluginsDir) : undefined,
    disabledPluginIds: [],
    hostVersion: CLI_VERSION,
  });

  const discovered = await host.discover();

  const loadHost = new PluginHost({
    workspaceDir: path.resolve(process.cwd()),
    pluginsDir: pluginsDir ? path.resolve(process.cwd(), pluginsDir) : undefined,
    disabledPluginIds: disabledPlugins,
    hostVersion: CLI_VERSION,
  });
  const loaded = await loadHost.loadAll();
  const diagnostics = [...host.getDiagnostics(), ...loadHost.getDiagnostics()];

  if (options.json) {
    const payload = discovered.map((d) => {
      const l = loaded.find((p) => p.id === d.id);
      const isDisabled = disabledPlugins.includes(d.id);
      let status = 'discovered';
      if (isDisabled) {
        status = 'disabled';
      } else if (l) {
        status = l.stateTracker.status;
      }
      return {
        id: d.id,
        name: d.manifest.name,
        version: d.manifest.version,
        type: d.manifest.type,
        status,
        description: d.manifest.description,
        capabilities: d.manifest.capabilities,
        supportedArtifactTypes: d.manifest.supportedArtifactTypes,
        directory: d.directory,
        entryPoint: d.entryPointFile,
      };
    });

    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    return { exitCode: ExitCode.SUCCESS };
  }

  const theme = getResolvedTheme();
  const R = ansiReset();
  const symbols = getSymbolSet();
  const divider = horizontalDivider(64);

  if (discovered.length === 0) {
    process.stdout.write(`\n ${theme.ui.accent}Plugins${R}  ${theme.ui.textDim}0 loaded${R}\n`);
    process.stdout.write(` ${divider}\n`);
    process.stdout.write(`   ${theme.ui.textDim}No plugins discovered.${R}\n`);
    if (pluginsDir) {
      process.stdout.write(`   ${theme.ui.textDim}Searched in: ${pluginsDir}${R}\n`);
    } else {
      process.stdout.write(
        `   ${theme.ui.textDim}Place plugins in ./.veris/plugins or specify --plugin-dir <dir>.${R}\n`,
      );
    }
    process.stdout.write('\n');
    return { exitCode: ExitCode.SUCCESS };
  }

  process.stdout.write(
    `\n ${theme.ui.accent}Plugins${R}  ${theme.ui.text}${loaded.length} active, ${discovered.length} discovered${R}\n`,
  );
  process.stdout.write(` ${divider}\n\n`);

  const idCol = 'ID'.padEnd(28);
  const verCol = 'Version'.padEnd(12);
  const typeCol = 'Type'.padEnd(14);
  const statCol = 'Status'.padEnd(14);
  process.stdout.write(
    `  ${theme.ui.textDim}${idCol}${verCol}${typeCol}${statCol}Description${R}\n`,
  );
  process.stdout.write(` ${divider}\n`);

  for (const disc of discovered) {
    const l = loaded.find((p) => p.id === disc.id);
    const isDisabled = disabledPlugins.includes(disc.id);
    let statusText: string;
    let statusColor: string;

    if (isDisabled) {
      statusText = 'disabled';
      statusColor = theme.ui.textDim;
    } else if (l) {
      statusText = l.stateTracker.status;
      switch (statusText) {
        case 'active':
          statusColor = theme.status.success;
          break;
        case 'quarantined':
          statusColor = theme.status.warning;
          break;
        case 'failed':
          statusColor = theme.status.error;
          break;
        default:
          statusColor = theme.ui.textDim;
      }
    } else {
      statusText = 'rejected';
      statusColor = theme.status.error;
    }

    const idPad = `  ${disc.id}`.padEnd(30);
    const verPad = disc.manifest.version.padEnd(12);
    const typePad = disc.manifest.type.padEnd(14);
    const statPad = `${statusColor}${statusText}${R}`.padEnd(
      14 + (statusColor ? statusColor.length + R.length : 0),
    );
    const desc = disc.manifest.description || '\u2014';

    process.stdout.write(`${idPad}${verPad}${typePad}${statPad}${desc}\n`);
  }

  // Diagnostics section if any warnings/errors exist
  const relevantDiags = diagnostics.filter(
    (d) => d.severity === 'error' || d.severity === 'warning',
  );
  if (relevantDiags.length > 0) {
    process.stdout.write(`\n ${divider}\n`);
    process.stdout.write(` ${theme.ui.accent}Diagnostics${R} (${relevantDiags.length})\n`);
    for (const d of relevantDiags) {
      const color = d.severity === 'error' ? theme.status.error : theme.status.warning;
      const sym = d.severity === 'error' ? symbols.error : symbols.warning;
      process.stdout.write(`   ${color}${sym}${R} [${d.pluginId}] ${d.code}: ${d.message}\n`);
    }
  }

  process.stdout.write('\n');
  return { exitCode: ExitCode.SUCCESS };
}

// ── Subcommand: info ──

async function cmdInfo(options: PluginsCommandOptions): Promise<{ exitCode: number }> {
  if (!options.targetArg) {
    process.stderr.write('Error: Plugin ID required.\n');
    process.stdout.write('Usage: veris plugins info <plugin-id>\n');
    return { exitCode: ExitCode.USAGE_ERROR };
  }

  const pluginId = options.targetArg;
  const envConfig = loadFromEnv();
  const pluginsDir = options.pluginDir ?? envConfig.plugins?.pluginDir;
  const disabledPlugins = [
    ...(envConfig.plugins?.disabledPlugins ?? []),
    ...options.disabledPlugins,
  ];

  const host = new PluginHost({
    workspaceDir: path.resolve(process.cwd()),
    pluginsDir: pluginsDir ? path.resolve(process.cwd(), pluginsDir) : undefined,
    disabledPluginIds: disabledPlugins,
    hostVersion: CLI_VERSION,
  });

  const discovered = await host.discover();
  const targetPlugin = discovered.find((d) => d.id === pluginId);

  if (!targetPlugin) {
    process.stderr.write(`Error: Plugin "${pluginId}" not found.\n`);
    process.stdout.write("Use 'veris plugins list' to view discovered plugins.\n");
    return { exitCode: ExitCode.ERROR };
  }

  const loaded = await host.loadAll();
  const loadedPlugin = loaded.find((p) => p.id === pluginId);
  const isDisabled = disabledPlugins.includes(pluginId);

  let status = 'discovered';
  if (isDisabled) {
    status = 'disabled';
  } else if (loadedPlugin) {
    status = loadedPlugin.stateTracker.status;
  }

  if (options.json) {
    const payload = {
      id: targetPlugin.id,
      name: targetPlugin.manifest.name,
      version: targetPlugin.manifest.version,
      type: targetPlugin.manifest.type,
      status,
      description: targetPlugin.manifest.description,
      author: targetPlugin.manifest.author,
      license: targetPlugin.manifest.license,
      engines: targetPlugin.manifest.engines,
      capabilities: targetPlugin.manifest.capabilities,
      supportedArtifactTypes: targetPlugin.manifest.supportedArtifactTypes,
      directory: targetPlugin.directory,
      entryPoint: targetPlugin.entryPointFile,
      diagnostics: host.getDiagnostics().filter((d) => d.pluginId === pluginId),
    };
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    return { exitCode: ExitCode.SUCCESS };
  }

  const theme = getResolvedTheme();
  const R = ansiReset();
  const symbols = getSymbolSet();
  const divider = horizontalDivider(64);
  const meta = targetPlugin.manifest;

  process.stdout.write(`\n ${theme.ui.accent}${meta.name}${R} (${meta.id})\n`);
  process.stdout.write(` ${divider}\n`);
  process.stdout.write(`   ${theme.ui.highlight}Version${R}       ${meta.version}\n`);
  process.stdout.write(`   ${theme.ui.highlight}Type${R}          ${meta.type}\n`);
  process.stdout.write(`   ${theme.ui.highlight}Status${R}        ${status}\n`);
  process.stdout.write(`   ${theme.ui.highlight}Author${R}        ${meta.author || '\u2014'}\n`);
  process.stdout.write(`   ${theme.ui.highlight}License${R}       ${meta.license || '\u2014'}\n`);
  process.stdout.write(`   ${theme.ui.highlight}Engine${R}        ${meta.engines.veris}\n`);
  process.stdout.write(`   ${theme.ui.highlight}Directory${R}     ${targetPlugin.directory}\n`);
  process.stdout.write(
    `   ${theme.ui.highlight}Entry Point${R}   ${targetPlugin.entryPointFile}\n\n`,
  );

  process.stdout.write(` ${theme.ui.accent}Description${R}\n`);
  process.stdout.write(`   ${meta.description || 'No description provided.'}\n\n`);

  process.stdout.write(` ${theme.ui.accent}Capabilities${R}\n`);
  if (meta.capabilities && meta.capabilities.length > 0) {
    for (const cap of meta.capabilities) {
      process.stdout.write(`   ${symbols.bullet} ${cap}\n`);
    }
  } else {
    process.stdout.write(`   ${theme.ui.textDim}None declared${R}\n`);
  }
  process.stdout.write('\n');

  if (meta.type === 'extractor' && meta.supportedArtifactTypes) {
    process.stdout.write(` ${theme.ui.accent}Supported Artifact Types${R}\n`);
    process.stdout.write(`   ${meta.supportedArtifactTypes.join(', ')}\n\n`);
  }

  const pluginDiags = host.getDiagnostics().filter((d) => d.pluginId === pluginId);
  if (pluginDiags.length > 0) {
    process.stdout.write(` ${theme.ui.accent}Diagnostics${R}\n`);
    for (const d of pluginDiags) {
      const color = d.severity === 'error' ? theme.status.error : theme.status.warning;
      const sym = d.severity === 'error' ? symbols.error : symbols.warning;
      process.stdout.write(`   ${color}${sym}${R} [${d.code}] ${d.message}\n`);
    }
    process.stdout.write('\n');
  }

  return { exitCode: ExitCode.SUCCESS };
}

// ── Subcommand: validate ──

async function cmdValidate(options: PluginsCommandOptions): Promise<{ exitCode: number }> {
  const targetDir = options.targetArg ?? options.pluginDir ?? '.';
  const resolvedDir = path.resolve(process.cwd(), targetDir);

  const theme = getResolvedTheme();
  const R = ansiReset();
  const symbols = getSymbolSet();
  const divider = horizontalDivider(64);

  process.stdout.write(`\n ${theme.ui.accent}Validate Plugin${R}  ${resolvedDir}\n`);
  process.stdout.write(` ${divider}\n`);

  if (!fs.existsSync(resolvedDir)) {
    process.stderr.write(
      `  ${theme.status.error}${symbols.error}${R} Path does not exist: ${resolvedDir}\n\n`,
    );
    return { exitCode: ExitCode.ERROR };
  }

  // Look for manifest in veris-plugin.json or package.json
  const manifestPath = path.join(resolvedDir, 'veris-plugin.json');
  const pkgPath = path.join(resolvedDir, 'package.json');

  let rawManifest: unknown;
  let foundManifestPath: string | null = null;

  if (fs.existsSync(manifestPath)) {
    try {
      rawManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      foundManifestPath = manifestPath;
    } catch (err) {
      process.stderr.write(
        `  ${theme.status.error}${symbols.error}${R} Failed to parse ${manifestPath}: ${err instanceof Error ? err.message : String(err)}\n\n`,
      );
      return { exitCode: ExitCode.ERROR };
    }
  } else if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { veris?: unknown };
      if (pkg.veris) {
        rawManifest = pkg.veris;
        foundManifestPath = pkgPath;
      }
    } catch (err) {
      process.stderr.write(
        `  ${theme.status.error}${symbols.error}${R} Failed to parse ${pkgPath}: ${err instanceof Error ? err.message : String(err)}\n\n`,
      );
      return { exitCode: ExitCode.ERROR };
    }
  }

  if (!foundManifestPath || !rawManifest) {
    process.stderr.write(
      `  ${theme.status.error}${symbols.error}${R} No plugin manifest found (expected veris-plugin.json or package.json#veris)\n\n`,
    );
    return { exitCode: ExitCode.ERROR };
  }

  const validation = validatePluginManifest(rawManifest);

  if (!validation.valid || !validation.manifest) {
    process.stderr.write(
      `  ${theme.status.error}${symbols.error}${R} Manifest validation failed (${validation.errors.length} error(s)):\n`,
    );
    for (const err of validation.errors) {
      process.stderr.write(
        `    ${theme.status.error}${symbols.bullet}${R} [${err.field}]: ${err.message}\n`,
      );
    }
    process.stdout.write('\n');
    return { exitCode: ExitCode.ERROR };
  }

  const manifest = validation.manifest;
  process.stdout.write(
    `  ${theme.status.success}${symbols.success}${R} Manifest is valid: ${manifest.name} (${manifest.id} v${manifest.version})\n`,
  );

  // Check entry point
  const entryPointPath = path.resolve(resolvedDir, manifest.entryPoint);
  if (!fs.existsSync(entryPointPath)) {
    process.stderr.write(
      `  ${theme.status.error}${symbols.error}${R} Entry point file not found: ${entryPointPath}\n\n`,
    );
    return { exitCode: ExitCode.ERROR };
  }

  process.stdout.write(
    `  ${theme.status.success}${symbols.success}${R} Entry point exists: ${manifest.entryPoint}\n\n`,
  );
  return { exitCode: ExitCode.SUCCESS };
}

// ── Subcommand: catalog ──

async function cmdCatalog(options: PluginsCommandOptions): Promise<{ exitCode: number }> {
  try {
    const catalog = loadCatalog(options.targetArg);
    const filtered = filterCatalog(catalog, {
      type: options.type as PluginType | undefined,
      search: options.search,
      tag: options.tag,
    });

    if (options.json) {
      process.stdout.write(
        JSON.stringify(
          {
            catalog: catalog.name,
            version: catalog.schemaVersion,
            updatedAt: catalog.updatedAt,
            totalPackages: catalog.packages.length,
            matchingPackages: filtered.length,
            packages: filtered,
          },
          null,
          2,
        ) + '\n',
      );
      return { exitCode: ExitCode.SUCCESS };
    }

    const theme = getResolvedTheme();
    const R = ansiReset();
    const divider = horizontalDivider(64);

    process.stdout.write(`\n  ${theme.ui.brand}VERIS Plugin Catalog${R} — ${catalog.name}\n`);
    process.stdout.write(`  ${divider}\n`);
    process.stdout.write(
      `  Showing ${filtered.length} of ${catalog.packages.length} package(s)\n\n`,
    );

    if (filtered.length === 0) {
      process.stdout.write(`  No packages matched the query criteria.\n\n`);
      return { exitCode: ExitCode.SUCCESS };
    }

    for (const pkg of filtered) {
      process.stdout.write(`  ${theme.ui.accent}${pkg.name}${R} (${pkg.id} v${pkg.version})\n`);
      process.stdout.write(`    Type:         ${pkg.type}\n`);
      process.stdout.write(`    Author:       ${pkg.author}\n`);
      process.stdout.write(`    License:      ${pkg.license}\n`);
      process.stdout.write(`    Engines:      VERIS ${pkg.engines.veris}\n`);
      process.stdout.write(`    Capabilities: ${pkg.capabilities.join(', ') || 'none'}\n`);
      if (pkg.tags && pkg.tags.length > 0) {
        process.stdout.write(`    Tags:         ${pkg.tags.join(', ')}\n`);
      }
      process.stdout.write(`    Description:  ${pkg.description}\n\n`);
    }

    return { exitCode: ExitCode.SUCCESS };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    return { exitCode: ExitCode.ERROR };
  }
}

// ── Subcommand: verify ──

async function cmdVerify(options: PluginsCommandOptions): Promise<{ exitCode: number }> {
  if (!options.targetArg) {
    process.stderr.write(
      'Error: Missing required package path. Usage: veris plugins verify <path>\n',
    );
    return { exitCode: ExitCode.USAGE_ERROR };
  }

  try {
    const report = await verifyPluginPackage(options.targetArg, {
      expectedSha256: options.expectedSha256,
    });

    if (options.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      return { exitCode: report.valid ? ExitCode.SUCCESS : ExitCode.ERROR };
    }

    const theme = getResolvedTheme();
    const symbols = getSymbolSet();
    const R = ansiReset();
    const divider = horizontalDivider(64);

    process.stdout.write(`\n  ${theme.ui.brand}VERIS Plugin Verification${R}\n`);
    process.stdout.write(`  ${divider}\n`);
    process.stdout.write(`  Target Path:   ${report.packagePath}\n`);
    process.stdout.write(`  SHA-256 Hash:  ${report.computedSha256 || 'N/A'}\n`);

    if (report.manifest) {
      process.stdout.write(`  Plugin ID:     ${report.manifest.id}\n`);
      process.stdout.write(`  Name:          ${report.manifest.name}\n`);
      process.stdout.write(`  Version:       ${report.manifest.version}\n`);
      process.stdout.write(`  Type:          ${report.manifest.type}\n`);
      process.stdout.write(
        `  Compatibility: ${report.compatibility.compatible ? 'Compatible' : 'Incompatible'} (requires ${report.compatibility.requiredRange}, host is ${report.compatibility.hostVersion})\n`,
      );
      process.stdout.write(`  Safe Caps:     ${report.capabilities.safe.join(', ') || 'none'}\n`);
      if (report.capabilities.targetAccess.length > 0) {
        process.stdout.write(`  Target Access: ${report.capabilities.targetAccess.join(', ')}\n`);
      }
      if (report.capabilities.dangerous.length > 0) {
        process.stdout.write(
          `  ${theme.status.error}Dangerous Caps:${R} ${report.capabilities.dangerous.join(', ')}\n`,
        );
      }
    }

    if (report.warnings.length > 0) {
      process.stdout.write(`\n  Warnings (${report.warnings.length}):\n`);
      for (const w of report.warnings) {
        process.stdout.write(`    ${theme.status.warning}${symbols.bullet}${R} ${w}\n`);
      }
    }

    if (report.errors.length > 0) {
      process.stdout.write(`\n  Errors (${report.errors.length}):\n`);
      for (const e of report.errors) {
        process.stdout.write(`    ${theme.status.error}${symbols.bullet}${R} ${e}\n`);
      }
    }

    process.stdout.write('\n');
    if (report.valid) {
      process.stdout.write(
        `  ${theme.status.success}${symbols.success}${R} Verification PASSED: Package is valid and safe for installation.\n\n`,
      );
      return { exitCode: ExitCode.SUCCESS };
    } else {
      process.stdout.write(
        `  ${theme.status.error}${symbols.error}${R} Verification FAILED: Resolve issues before installing.\n\n`,
      );
      return { exitCode: ExitCode.ERROR };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    return { exitCode: ExitCode.ERROR };
  }
}

// ── Subcommand: install ──

async function cmdInstall(options: PluginsCommandOptions): Promise<{ exitCode: number }> {
  if (!options.targetArg) {
    process.stderr.write(
      'Error: Missing required package path. Usage: veris plugins install <path> [--target <dir>]\n',
    );
    return { exitCode: ExitCode.USAGE_ERROR };
  }

  const targetDir = options.targetDir ?? options.pluginDir ?? './.veris/plugins';

  try {
    const result = await installPluginPackage(options.targetArg, targetDir, {
      force: options.force,
      expectedSha256: options.expectedSha256,
    });

    if (options.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return { exitCode: result.success ? ExitCode.SUCCESS : ExitCode.ERROR };
    }

    const theme = getResolvedTheme();
    const symbols = getSymbolSet();
    const R = ansiReset();

    if (result.success) {
      process.stdout.write(
        `\n  ${theme.status.success}${symbols.success}${R} Installed plugin ${theme.ui.accent}${result.pluginId}${R} successfully!\n`,
      );
      process.stdout.write(`  Destination: ${result.targetDir}\n`);
      if (result.receipt) {
        process.stdout.write(`  Checksum:    ${result.receipt.verifiedSha256}\n`);
        process.stdout.write(`  Installed:   ${result.receipt.installedAt}\n`);
      }
      process.stdout.write('\n');
      return { exitCode: ExitCode.SUCCESS };
    } else {
      process.stderr.write(
        `\n  ${theme.status.error}${symbols.error}${R} Installation failed: ${result.error}\n\n`,
      );
      return { exitCode: ExitCode.ERROR };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    return { exitCode: ExitCode.ERROR };
  }
}

// ── Subcommand: remove ──

async function cmdRemove(options: PluginsCommandOptions): Promise<{ exitCode: number }> {
  if (!options.targetArg) {
    process.stderr.write(
      'Error: Missing required plugin ID. Usage: veris plugins remove <plugin-id> [--target <dir>]\n',
    );
    return { exitCode: ExitCode.USAGE_ERROR };
  }

  const targetDir = options.targetDir ?? options.pluginDir ?? './.veris/plugins';

  try {
    const result = await removePluginPackage(options.targetArg, targetDir);

    if (options.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return { exitCode: result.success ? ExitCode.SUCCESS : ExitCode.ERROR };
    }

    const theme = getResolvedTheme();
    const symbols = getSymbolSet();
    const R = ansiReset();

    if (result.success) {
      process.stdout.write(
        `\n  ${theme.status.success}${symbols.success}${R} Removed plugin ${theme.ui.accent}${result.pluginId}${R} (${result.removedFilesCount} files deleted).\n\n`,
      );
      return { exitCode: ExitCode.SUCCESS };
    } else {
      process.stderr.write(
        `\n  ${theme.status.error}${symbols.error}${R} Removal failed: ${result.error}\n\n`,
      );
      return { exitCode: ExitCode.ERROR };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    return { exitCode: ExitCode.ERROR };
  }
}
