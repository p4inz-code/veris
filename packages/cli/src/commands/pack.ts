/**
 * `veris pack` command — manage knowledge packs.
 *
 * Usage:
 *   veris pack list                        List all loaded packs
 *   veris pack info <pack>                 Show detailed info about a pack
 *   veris pack validate [path]             Validate pack file(s)
 *   veris pack verify [path]               Verify pack integrity (checksums)
 *   veris pack doctor                      Diagnose pack configuration issues
 *
 * Every subcommand produces professional output with consistent UI,
 * exit codes, and help text.
 *
 * @module @veris/cli/commands/pack
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  PackRegistry,
  validatePackFile,
  validateChecksum,
  getAllCategories,
  type KnowledgePackFile,
  type PackMetadata,
  type KnowledgeEntry,
} from '@veris/knowledge';

import { getSymbolSet } from '../ui/renderer/index.js';
import { horizontalDivider } from '../ui/styles/index.js';
import { getResolvedTheme, ansiReset } from '../ui/theme/index.js';
import { ExitCode } from '../wirer.js';

// ── Help Text ──

export const PACK_HELP = `
Manage VERIS knowledge packs.

Knowledge packs are deterministic offline intelligence databases that
enrich security analysis with structured threat intelligence.

USAGE
  veris pack list                           List all loaded packs
  veris pack info <pack>                    Show detailed pack information
  veris pack validate [path]                Validate pack file(s)
  veris pack verify [path]                  Verify pack integrity
  veris pack doctor                         Diagnose pack issues

OPTIONS
  --help, -h            Show help for any subcommand
  --path, -p <dir>      Path to pack file or directory (default: ./packs/)
  --strict              Enable strict validation mode
  --verbose             Show detailed output

EXAMPLES
  veris pack list                           List loaded packs
  veris pack info malware-families          Show malware-families pack details
  veris pack validate ./packs/              Validate all packs in directory
  veris pack verify ./packs/malware.veris-pack.json   Verify single pack
  veris pack doctor                         Run pack diagnostics

EXIT CODES
  0  Success
  1  General error
  2  Usage error
  3  Validation/verification failed
  4  Pack not found
`;

// ── Pack Command ──

/** Run the pack command with given arguments. */
export async function runPack(args: readonly string[]): Promise<{ exitCode: number }> {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(PACK_HELP);
    return { exitCode: ExitCode.SUCCESS };
  }

  const subcommand = args[0];
  const subArgs = args.slice(1);

  switch (subcommand) {
    case 'list':
      return cmdList(subArgs);
    case 'info':
      return cmdInfo(subArgs);
    case 'validate':
      return cmdValidate(subArgs);
    case 'verify':
      return cmdVerify(subArgs);
    case 'doctor':
      return cmdDoctor(subArgs);
    default:
      process.stderr.write(`Unknown pack subcommand: "${subcommand}".\n`);
      process.stdout.write(`\nRun 'veris pack --help' for usage.\n`);
      return { exitCode: ExitCode.USAGE_ERROR };
  }
}

// ── Subcommand: list ──

async function cmdList(args: readonly string[]): Promise<{ exitCode: number }> {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write('List all loaded knowledge packs.\n\n');
    process.stdout.write('Usage: veris pack list [options]\n');
    process.stdout.write('\nDisplays pack ID, version, categories, and entry count.\n');
    return { exitCode: ExitCode.SUCCESS };
  }

  const packDir = findPackDirectory(args);
  const registry = await loadPacksFromDirectory(packDir);

  const packs = registry.listWithMetadata();
  const diag = registry.diagnostics;

  if (packs.length === 0) {
    process.stdout.write('No knowledge packs loaded.\n');
    process.stdout.write('Use "veris pack doctor" to diagnose configuration.\n');
    return { exitCode: ExitCode.SUCCESS };
  }

  // Header
  const theme = getResolvedTheme();
  const R = ansiReset();
  const divider = horizontalDivider(60);

  process.stdout.write(
    `\n ${theme.ui.accent}Packs${R}  ${theme.ui.text}${packs.length} loaded${R}\n`,
  );
  process.stdout.write(` ${divider}\n`);

  // Summary line
  process.stdout.write(`   ${theme.ui.textDim}Entries${R}    ${countAllEntries(registry)}\n`);
  process.stdout.write(`   ${theme.ui.textDim}Categories${R}  ${countCategories(packs)}\n`);
  if (diag.totalErrors > 0)
    process.stdout.write(`   ${theme.status.error}Errors${R}      ${diag.totalErrors}\n`);
  if (diag.totalWarnings > 0)
    process.stdout.write(`   ${theme.status.warning}Warnings${R}    ${diag.totalWarnings}\n`);
  process.stdout.write('\n');

  // Pack list table
  const headerId = 'ID'.padEnd(28);
  const headerVer = 'Version'.padEnd(14);
  const headerEnt = 'Entries'.padEnd(10);
  process.stdout.write(`  ${theme.ui.textDim}${headerId}${headerVer}${headerEnt}Categories${R}\n`);
  process.stdout.write(` ${divider}\n`);

  for (const meta of packs) {
    const packEntry = registry.lookup(meta.id);
    const entryCount = packEntry ? packEntry.entries.length : 0;
    const cats = meta.categories.length > 0 ? meta.categories.slice(0, 2).join(', ') : '\u2014';
    const extraCats = meta.categories.length > 2 ? ` +${meta.categories.length - 2}` : '';

    const idCol = `  ${meta.id}`.padEnd(30);
    const verCol = meta.version.padEnd(14);
    const entCol = String(entryCount).padEnd(10);

    process.stdout.write(`${idCol}${verCol}${entCol}${cats}${extraCats}\n`);
  }

  process.stdout.write('\n');
  return { exitCode: ExitCode.SUCCESS };
}

// ── Subcommand: info ──

async function cmdInfo(args: readonly string[]): Promise<{ exitCode: number }> {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write('Show detailed information about a knowledge pack.\n\n');
    process.stdout.write('Usage: veris pack info <pack-id> [options]\n');
    process.stdout.write('\nDisplays metadata, entries, dependencies, and references.\n');
    return { exitCode: ExitCode.SUCCESS };
  }

  if (args.length === 0 || args[0].startsWith('--')) {
    process.stderr.write('Error: Pack ID required.\n');
    process.stdout.write('Usage: veris pack info <pack-id>\n');
    return { exitCode: ExitCode.USAGE_ERROR };
  }

  const packId = args[0];
  const packDir = findPackDirectory(args.slice(1));
  const registry = await loadPacksFromDirectory(packDir);
  const pack = registry.lookup(packId);

  if (!pack) {
    process.stderr.write(`Pack "${packId}" not found.\n`);
    process.stdout.write('Use "veris pack list" to see available packs.\n');
    return { exitCode: ExitCode.NOT_FOUND };
  }

  const meta = pack.metadata;
  const isVerbose = args.includes('--verbose');

  const theme = getResolvedTheme();
  const R = ansiReset();
  const symbols = getSymbolSet();
  const divider = horizontalDivider(60);

  // Pack header
  process.stdout.write(`\n ${theme.ui.accent}${meta.name}${R}\n`);
  process.stdout.write(` ${divider}\n`);

  // Basic info
  process.stdout.write(`   ${theme.ui.highlight}ID${R}          ${meta.id}\n`);
  process.stdout.write(`   ${theme.ui.highlight}Version${R}     ${meta.version}\n`);
  process.stdout.write(`   ${theme.ui.highlight}Author${R}      ${meta.author}\n`);
  process.stdout.write(`   ${theme.ui.highlight}License${R}     ${meta.license}\n`);
  process.stdout.write(`   ${theme.ui.highlight}Source${R}      ${meta.source}\n`);
  process.stdout.write(`   ${theme.ui.highlight}Veris${R}       ${meta.supportedVerisVersion}\n`);
  process.stdout.write(`   ${theme.ui.highlight}Created${R}     ${meta.createdAt.split('T')[0]}\n`);
  process.stdout.write(`   ${theme.ui.highlight}Updated${R}     ${meta.updatedAt.split('T')[0]}\n`);
  process.stdout.write(`   ${theme.ui.highlight}Entries${R}     ${pack.entries.length}\n`);
  process.stdout.write(
    `   ${theme.ui.highlight}Content${R}     ${pack.contentHash.slice(0, 16)}...\n`,
  );
  process.stdout.write('\n');

  // Description
  process.stdout.write(` ${theme.ui.accent}Description${R}\n`);
  process.stdout.write(`   ${meta.description}\n`);
  process.stdout.write('\n');

  // Categories
  process.stdout.write(` ${theme.ui.accent}Categories${R}\n`);
  process.stdout.write(`   ${meta.categories.join(', ')}\n`);
  process.stdout.write('\n');

  // Tags
  if (meta.tags.length > 0) {
    process.stdout.write(` ${theme.ui.accent}Tags${R}\n`);
    process.stdout.write(`   ${meta.tags.join(', ')}\n`);
    process.stdout.write('\n');
  }

  // Dependencies
  if (meta.dependencies.length > 0) {
    process.stdout.write(` ${theme.ui.accent}Dependencies${R}\n`);
    for (const dep of meta.dependencies) {
      const satisfied = registry.resolveDependencies(dep.id).satisfied;
      const statusSym = satisfied ? symbols.success : symbols.error;
      const statusColor = satisfied ? theme.status.success : theme.status.error;
      process.stdout.write(
        `   ${statusColor}${statusSym}${R} ${dep.id}@${dep.version}${dep.optional ? ` ${theme.ui.textDim}(optional)${R}` : ''}\n`,
      );
    }
    process.stdout.write('\n');
  }

  // References
  if (meta.references.length > 0) {
    process.stdout.write(` ${theme.ui.accent}References${R}\n`);
    for (const ref of meta.references) {
      process.stdout.write(`   ${symbols.bullet} ${ref.label} (${ref.source})\n`);
      process.stdout.write(`     ${theme.ui.textDim}${ref.url}${R}\n`);
    }
    process.stdout.write('\n');
  }

  // Entries section (detail in verbose mode, summary otherwise)
  process.stdout.write(
    ` ${theme.ui.accent}Entries${R}  ${theme.ui.text}${pack.entries.length}${R}\n`,
  );

  // Group by category
  const byCategory = new Map<string, KnowledgeEntry[]>();
  for (const entry of pack.entries) {
    const list = byCategory.get(entry.category) ?? [];
    list.push(entry);
    byCategory.set(entry.category, list);
  }

  for (const [cat, entries] of byCategory) {
    process.stdout.write(
      `    ${theme.ui.textDim}${cat}${R}  ${theme.ui.text}${entries.length}${R}\n`,
    );
    if (isVerbose) {
      for (const entry of entries) {
        const sevColor =
          theme.severity[entry.severity.toLowerCase() as keyof typeof theme.severity] ??
          theme.severity.info;
        process.stdout.write(
          `      ${symbols.bullet} ${entry.name} ${sevColor}[${entry.severity}]${R}\n`,
        );
        process.stdout.write(
          `        ${entry.description.slice(0, 120)}${entry.description.length > 120 ? '...' : ''}\n`,
        );
        process.stdout.write(
          `        ${theme.ui.textDim}Indicators${R}: ${entry.indicators.length}\n`,
        );
        if (entry.references.length > 0) {
          process.stdout.write(
            `        ${theme.ui.textDim}References${R}: ${entry.references.length}\n`,
          );
        }
        if (entry.mitreTechniques.length > 0) {
          process.stdout.write(
            `        ${theme.ui.textDim}MITRE${R}: ${entry.mitreTechniques.join(', ')}\n`,
          );
        }
      }
    } else {
      for (const entry of entries) {
        const sevColor =
          theme.severity[entry.severity.toLowerCase() as keyof typeof theme.severity] ??
          theme.severity.info;
        process.stdout.write(
          `      ${symbols.bullet} ${entry.name} ${sevColor}[${entry.severity}]${R}\n`,
        );
        process.stdout.write(
          `        ${entry.description.slice(0, 80)}${entry.description.length > 80 ? '...' : ''}\n`,
        );
      }
    }
  }
  process.stdout.write('\n');

  return { exitCode: ExitCode.SUCCESS };
}

// ── Subcommand: validate ──

async function cmdValidate(args: readonly string[]): Promise<{ exitCode: number }> {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write('Validate knowledge pack file(s).\n\n');
    process.stdout.write('Usage: veris pack validate [path] [options]\n');
    process.stdout.write(
      '\nChecks required fields, schema version, duplicate IDs, references, and categories.\n',
    );
    return { exitCode: ExitCode.SUCCESS };
  }

  const targetPath = args.length > 0 && !args[0].startsWith('--') ? args[0] : './packs/';
  const isStrict = args.includes('--strict');

  // Check if target exists
  if (!fs.existsSync(targetPath)) {
    process.stderr.write(`Error: Path "${targetPath}" does not exist.\n`);
    return { exitCode: ExitCode.NOT_FOUND };
  }

  const files = collectPackFiles(targetPath);
  if (files.length === 0) {
    process.stdout.write(`No pack files found at "${targetPath}".\n`);
    process.stdout.write('Expected files with .veris-pack.json extension.\n');
    return { exitCode: ExitCode.SUCCESS };
  }

  const theme = getResolvedTheme();
  const R = ansiReset();
  const symbols = getSymbolSet();
  const divider = horizontalDivider(60);

  process.stdout.write(
    `\n ${theme.ui.accent}Validate${R}  ${theme.ui.text}${files.length} file(s) from ${targetPath}${R}\n`,
  );
  process.stdout.write(` ${divider}\n`);

  let totalPassed = 0;
  let totalFailed = 0;
  let totalWarnings = 0;

  for (const filePath of files) {
    const fileName = path.basename(filePath);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const raw = JSON.parse(content) as KnowledgePackFile;
      const result = validatePackFile(raw, filePath);

      if (result.valid) {
        totalPassed++;
        process.stdout.write(`  ${theme.status.success}${symbols.success}${R} ${fileName}\n`);
      } else {
        totalFailed++;
        process.stdout.write(`  ${theme.status.error}${symbols.error}${R} ${fileName}\n`);
        for (const error of result.errors) {
          process.stdout.write(
            `    ${theme.status.error}Error${R} [${error.code}]: ${error.message}\n`,
          );
        }
      }

      for (const warning of result.warnings) {
        totalWarnings++;
        if (isStrict) {
          process.stdout.write(`    ${theme.status.error}${symbols.error}${R} ${warning}\n`);
        } else {
          process.stdout.write(`    ${theme.status.warning}${symbols.warning}${R} ${warning}\n`);
        }
      }

      if (!isStrict && result.valid && result.warnings.length === 0) {
        process.stdout.write(`    ${theme.ui.textDim}All checks passed.${R}\n`);
      }
    } catch (err) {
      totalFailed++;
      process.stdout.write(`  ${theme.status.error}${symbols.error}${R} ${fileName}\n`);
      process.stdout.write(
        `    ${theme.status.error}Error${R}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
    process.stdout.write('\n');
  }

  // Summary
  process.stdout.write(` ${divider}\n`);
  const resultColor = totalFailed > 0 ? theme.status.error : theme.status.success;
  process.stdout.write(
    ` ${resultColor}Result${R}: ${totalPassed} passed, ${totalFailed} failed, ${totalWarnings} warnings\n`,
  );

  if (totalFailed > 0 && isStrict) {
    process.stdout.write(
      ` ${theme.ui.textDim}Exit code: 3 (strict mode \u2014 failures detected)${R}\n`,
    );
  }
  process.stdout.write('\n');

  return { exitCode: totalFailed > 0 && isStrict ? 3 : ExitCode.SUCCESS };
}

// ── Subcommand: verify ──

async function cmdVerify(args: readonly string[]): Promise<{ exitCode: number }> {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write('Verify knowledge pack integrity and checksums.\n\n');
    process.stdout.write('Usage: veris pack verify [path] [options]\n');
    process.stdout.write('\nValidates checksums and structural integrity of pack files.\n');
    return { exitCode: ExitCode.SUCCESS };
  }

  const targetPath = args.length > 0 && !args[0].startsWith('--') ? args[0] : './packs/';

  if (!fs.existsSync(targetPath)) {
    process.stderr.write(`Error: Path "${targetPath}" does not exist.\n`);
    return { exitCode: ExitCode.NOT_FOUND };
  }

  const files = collectPackFiles(targetPath);
  if (files.length === 0) {
    process.stdout.write(`No pack files found at "${targetPath}".\n`);
    return { exitCode: ExitCode.SUCCESS };
  }

  const theme = getResolvedTheme();
  const R = ansiReset();
  const symbols = getSymbolSet();
  const divider = horizontalDivider(60);

  process.stdout.write(
    `\n ${theme.ui.accent}Verify${R}  ${theme.ui.text}${files.length} pack file(s)${R}\n`,
  );
  process.stdout.write(` ${divider}\n`);

  let passed = 0;
  let failed = 0;

  for (const filePath of files) {
    const fileName = path.basename(filePath);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const raw = JSON.parse(content) as KnowledgePackFile;

      if (!raw.metadata) {
        process.stdout.write(
          `  ${theme.status.error}${symbols.error}${R} ${fileName} \u2014 missing metadata\n`,
        );
        failed++;
        continue;
      }
      if (raw.metadata.id) {
        process.stdout.write(
          `  ${symbols.bullet} ${fileName} \u2014 ${raw.metadata.id} v${raw.metadata.version ?? '?'}\n`,
        );
      } else {
        process.stdout.write(`  ${symbols.bullet} ${fileName}\n`);
      }

      // Verify checksum
      const checksumField = (raw.metadata as Record<string, unknown>).checksum;
      if (typeof checksumField === 'string' && checksumField.length > 0) {
        const valid = validateChecksum(content, checksumField);
        if (valid) {
          process.stdout.write(
            `    ${theme.status.success}${symbols.success}${R} Checksum verified\n`,
          );
        } else {
          process.stdout.write(
            `    ${theme.status.error}${symbols.error}${R} Checksum MISMATCH (expected: ${checksumField})\n`,
          );
          failed++;
        }
      } else {
        process.stdout.write(
          `    ${theme.status.warning}${symbols.warning}${R} No checksum field to verify\n`,
        );
      }

      // Verify entries
      const entries = raw.entries;
      if (entries && entries.length > 0) {
        process.stdout.write(
          `    ${theme.status.success}${symbols.success}${R} ${entries.length} entries\n`,
        );

        // Check for duplicate IDs
        const ids = new Set<string>();
        let dupCount = 0;
        for (const entry of entries) {
          if (ids.has(entry.id)) dupCount++;
          ids.add(entry.id);
        }
        if (dupCount > 0) {
          process.stdout.write(
            `    ${theme.status.error}${symbols.error}${R} ${dupCount} duplicate entry ID(s) found\n`,
          );
          failed++;
        }
      } else {
        process.stdout.write(
          `    ${theme.status.warning}${symbols.warning}${R} No entries found\n`,
        );
      }

      passed++;
    } catch (err) {
      process.stdout.write(
        `  ${theme.status.error}${symbols.error}${R} ${fileName} \u2014 ${err instanceof Error ? err.message : String(err)}\n`,
      );
      failed++;
    }
    process.stdout.write('\n');
  }

  process.stdout.write(` ${divider}\n`);
  const finalColor = failed > 0 ? theme.status.error : theme.status.success;
  process.stdout.write(` ${finalColor}Result${R}: ${passed - failed} verified, ${failed} failed\n`);
  process.stdout.write('\n');

  return { exitCode: failed > 0 ? 3 : ExitCode.SUCCESS };
}

// ── Subcommand: doctor ──

async function cmdDoctor(args: readonly string[]): Promise<{ exitCode: number }> {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write('Diagnose knowledge pack configuration and issues.\n\n');
    process.stdout.write('Usage: veris pack doctor [options]\n');
    process.stdout.write('\nChecks pack configuration, loads packs, and reports any issues.\n');
    return { exitCode: ExitCode.SUCCESS };
  }

  const theme = getResolvedTheme();
  const R = ansiReset();
  const symbols = getSymbolSet();
  const divider = horizontalDivider(60);
  const packDir = findPackDirectory(args);

  process.stdout.write(`\n ${theme.ui.accent}Diagnostics${R}\n`);
  process.stdout.write(` ${divider}\n`);

  // Check 1: Pack directory
  const resolvedDir = path.resolve(packDir);
  const dirExists = fs.existsSync(resolvedDir);
  process.stdout.write(`\n   ${theme.ui.highlight}Pack directory${R}  ${resolvedDir}\n`);
  process.stdout.write(
    `   ${theme.ui.highlight}Status${R}        ${dirExists ? `${theme.status.success}${symbols.success} Found${R}` : `${theme.status.error}${symbols.error} Not found${R}`}\n`,
  );

  if (!dirExists) {
    process.stdout.write(
      `\n   ${theme.ui.textDim}Recommendation: Create pack directory or specify --path.${R}\n`,
    );
    process.stdout.write(`   ${theme.ui.textDim}Default pack directory: ./packs/${R}\n`);
    return { exitCode: ExitCode.NOT_FOUND };
  }

  // Check 2: Discover pack files
  const packFiles = collectPackFiles(resolvedDir);
  process.stdout.write(`\n   ${theme.ui.highlight}Pack files${R}    ${packFiles.length} found\n`);
  if (packFiles.length === 0) {
    process.stdout.write(
      `   ${theme.ui.textDim}Expected files with .veris-pack.json extension.${R}\n`,
    );
    process.stdout.write('\n');
    return { exitCode: ExitCode.SUCCESS };
  }

  // Check 3: Load packs
  process.stdout.write(`\n   ${theme.ui.highlight}Loading${R}\n`);
  const registry = await loadPacksFromDirectory(resolvedDir);
  const loadedPacks = registry.listWithMetadata();
  const failedPacks = registry.getFailedPacks();
  const diag = registry.diagnostics;
  const conflicts = registry.detectConflicts();

  process.stdout.write(
    `    ${theme.ui.text}Loaded${R}: ${loadedPacks.length}/${packFiles.length}\n`,
  );
  if (failedPacks.size > 0) {
    process.stdout.write(`    ${theme.status.error}Failed${R}: ${failedPacks.size}\n`);
    for (const [id, errors] of failedPacks) {
      for (const err of errors) {
        process.stdout.write(
          `      ${theme.status.error}${symbols.error}${R} ${id}: [${err.code}] ${err.message}\n`,
        );
      }
    }
  }

  // Check 4: Version conflicts
  if (conflicts.length > 0) {
    process.stdout.write(
      `\n   ${theme.status.warning}${symbols.warning}${R} Version conflicts detected:\n`,
    );
    for (const conflict of conflicts) {
      process.stdout.write(`      ${theme.status.error}${symbols.error}${R} ${conflict}\n`);
    }
  } else {
    process.stdout.write(
      `\n   ${theme.status.success}${symbols.success}${R} No version conflicts\n`,
    );
  }

  // Check 5: Dependency resolution
  if (loadedPacks.length > 0) {
    process.stdout.write(`\n   ${theme.ui.highlight}Dependencies${R}\n`);
    let depIssues = 0;
    for (const meta of loadedPacks) {
      const depResult = registry.resolveDependencies(meta.id);
      if (!depResult.satisfied) {
        depIssues++;
        process.stdout.write(
          `    ${theme.status.warning}${symbols.warning}${R} ${meta.id}: missing dependencies \u2014 ${depResult.missing.join(', ')}\n`,
        );
      }
    }
    if (depIssues === 0) {
      process.stdout.write(
        `    ${theme.status.success}${symbols.success}${R} All dependencies satisfied\n`,
      );
    }
  }

  // Check 6: Category usage
  if (loadedPacks.length > 0) {
    process.stdout.write(`\n   ${theme.ui.highlight}Categories${R}\n`);
    const allCategories = getAllCategories();
    const usedCategories = new Set<string>();
    for (const meta of loadedPacks) {
      for (const cat of meta.categories) usedCategories.add(cat);
    }
    for (const cat of allCategories) {
      const used = usedCategories.has(cat.id);
      const statSym = used ? symbols.success : '\u25CB';
      const statColor = used ? theme.status.success : theme.ui.textDim;
      process.stdout.write(`    ${statColor}${statSym}${R} ${cat.name}\n`);
    }
    process.stdout.write('\n');
  }

  // Summary
  process.stdout.write(` ${divider}\n`);
  process.stdout.write(` ${theme.ui.accent}Summary${R}\n`);
  process.stdout.write(`   ${theme.ui.textDim}Loaded${R}     ${loadedPacks.length}\n`);
  process.stdout.write(`   ${theme.ui.textDim}Failed${R}     ${failedPacks.size}\n`);
  process.stdout.write(`   ${theme.ui.textDim}Conflicts${R}  ${conflicts.length}\n`);
  process.stdout.write(`   ${theme.ui.textDim}Entries${R}    ${countAllEntries(registry)}\n`);

  if (diag.totalErrors > 0 || failedPacks.size > 0 || conflicts.length > 0) {
    process.stdout.write(
      ` ${theme.status.warning}${symbols.warning}${R} Issues found \u2014 review recommendations above.\n`,
    );
  } else {
    process.stdout.write(
      ` ${theme.status.success}${symbols.success}${R} All checks passed \u2014 packs are healthy.\n`,
    );
  }
  process.stdout.write('\n');

  return { exitCode: diag.totalErrors > 0 ? 3 : ExitCode.SUCCESS };
}

// ── Helpers ──

function findPackDirectory(args: readonly string[]): string {
  // Check for --path or -p
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--path' || args[i] === '-p') && i + 1 < args.length) {
      return args[i + 1];
    }
  }
  // Default: check ./packs/ first, otherwise ./
  return './packs/';
}

function collectPackFiles(targetPath: string): string[] {
  const resolved = path.resolve(targetPath);
  const files: string[] = [];

  if (!fs.existsSync(resolved)) return files;

  const stat = fs.statSync(resolved);
  if (stat.isFile()) {
    if (resolved.endsWith('.veris-pack.json')) {
      files.push(resolved);
    }
  } else if (stat.isDirectory()) {
    const entries = fs.readdirSync(resolved, { recursive: true }) as string[];
    for (const entry of entries) {
      const fullPath = path.join(resolved, entry);
      if (fullPath.endsWith('.veris-pack.json') && fs.statSync(fullPath).isFile()) {
        files.push(fullPath);
      }
    }
  }

  return files.sort();
}

async function loadPacksFromDirectory(dir: string): Promise<PackRegistry> {
  const registry = new PackRegistry({ validateOnLoad: true, strict: true });

  if (!fs.existsSync(dir)) {
    return registry;
  }

  const files = collectPackFiles(dir);
  for (const filePath of files) {
    try {
      await registry.loadFromFile(filePath);
    } catch {
      // Silently continue — errors are recorded in diagnostics
    }
  }

  return registry;
}

function countAllEntries(registry: PackRegistry): number {
  let count = 0;
  for (const id of registry.list()) {
    const pack = registry.lookup(id);
    if (pack) count += pack.entries.length;
  }
  return count;
}

function countCategories(packs: PackMetadata[]): number {
  const cats = new Set<string>();
  for (const meta of packs) {
    for (const cat of meta.categories) cats.add(cat);
  }
  return cats.size;
}
