/**
 * @veris/plugins/ecosystem/verifier — Plugin package verification pipeline.
 *
 * Implements Section 2 of ADR-018:
 * - Manifest authenticity & structural validation
 * - Content-addressed SHA-256 integrity check
 * - Engine SemVer compatibility evaluation
 * - Security capability auditing & dangerous permission warnings
 * - Declarative purity enforcement for rule packs
 *
 * @module @veris/plugins/ecosystem/verifier
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { satisfies } from '@veris/shared';

import { validatePluginManifest } from '../manifest.js';
import { PERMISSION_GROUPS, type PluginCapability, type PluginManifest } from '../types.js';

import { computePackageSha256 } from './checksum.js';
import type {
  CapabilityAuditResult,
  CompatibilityResult,
  PluginVerificationReport,
} from './types.js';

export const CURRENT_HOST_VERSION = '1.2.0';

export interface VerifyPackageOptions {
  readonly expectedSha256?: string;
  readonly currentVerisVersion?: string;
}

/**
 * Audits and categorizes declared plugin capabilities.
 */
export function auditCapabilities(declared: readonly PluginCapability[]): CapabilityAuditResult {
  const safe: PluginCapability[] = [];
  const targetAccess: PluginCapability[] = [];
  const storage: PluginCapability[] = [];
  const dangerous: PluginCapability[] = [];

  for (const cap of declared) {
    if ((PERMISSION_GROUPS.dangerous as readonly string[]).includes(cap)) {
      dangerous.push(cap);
    } else if ((PERMISSION_GROUPS.targetAccess as readonly string[]).includes(cap)) {
      targetAccess.push(cap);
    } else if ((PERMISSION_GROUPS.storage as readonly string[]).includes(cap)) {
      storage.push(cap);
    } else {
      safe.push(cap);
    }
  }

  return {
    declared,
    safe,
    targetAccess,
    storage,
    dangerous,
    hasDangerous: dangerous.length > 0,
  };
}

/**
 * Executes the complete verification pipeline for a plugin package.
 */
export async function verifyPluginPackage(
  packagePath: string,
  options?: VerifyPackageOptions,
): Promise<PluginVerificationReport> {
  const resolved = path.resolve(packagePath);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!fs.existsSync(resolved)) {
    return {
      valid: false,
      packagePath: resolved,
      computedSha256: '',
      compatibility: {
        compatible: false,
        requiredRange: 'unknown',
        hostVersion: options?.currentVerisVersion ?? CURRENT_HOST_VERSION,
      },
      capabilities: auditCapabilities([]),
      declarativePurity: false,
      warnings: [],
      errors: [`Package path does not exist: ${resolved}`],
    };
  }

  // 1. Locate and parse manifest
  let manifestRaw: unknown;
  let manifestFilePath: string | undefined;

  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    const candidates = [
      path.join(resolved, 'veris-plugin.json'),
      path.join(resolved, 'plugin.json'),
      path.join(resolved, 'package.json'),
    ];

    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        manifestFilePath = cand;
        break;
      }
    }

    if (!manifestFilePath) {
      errors.push(
        'Missing plugin manifest: directory must contain veris-plugin.json, plugin.json, or package.json',
      );
    } else {
      try {
        const content = fs.readFileSync(manifestFilePath, 'utf-8');
        const parsed = JSON.parse(content);
        if (manifestFilePath.endsWith('package.json')) {
          manifestRaw = parsed.veris;
          if (!manifestRaw) {
            errors.push('package.json exists but lacks required "veris" plugin manifest section');
          }
        } else {
          manifestRaw = parsed;
        }
      } catch (err) {
        errors.push(
          `Failed to parse manifest JSON: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } else if (stat.isFile() && resolved.endsWith('.json')) {
    try {
      const content = fs.readFileSync(resolved, 'utf-8');
      manifestRaw = JSON.parse(content);
      manifestFilePath = resolved;
    } catch (err) {
      errors.push(
        `Failed to parse manifest file: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else {
    errors.push(`Unsupported package target: must be a directory or JSON manifest: ${resolved}`);
  }

  // 2. Validate manifest schema
  let validatedManifest: PluginManifest | undefined;
  if (manifestRaw) {
    const valResult = validatePluginManifest(manifestRaw);
    if (!valResult.valid || !valResult.manifest) {
      for (const e of valResult.errors) {
        errors.push(`Manifest schema error in [${e.field}]: ${e.message}`);
      }
    } else {
      validatedManifest = valResult.manifest;
    }
  }

  // 3. Compute SHA-256 Checksum
  let computedSha256 = '';
  let checksumMatch: boolean | undefined;

  try {
    computedSha256 = computePackageSha256(resolved);
  } catch (err) {
    errors.push(
      `Failed to compute package checksum: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (options?.expectedSha256 && computedSha256) {
    const expected = options.expectedSha256.trim().toLowerCase();
    const actual = computedSha256.trim().toLowerCase();
    checksumMatch = expected === actual;
    if (!checksumMatch) {
      errors.push(
        `Integrity check failed: package SHA-256 (${actual}) does not match expected checksum (${expected}). Possible tampering or corruption detected.`,
      );
    }
  }

  // 4. Host Compatibility Check
  const hostVersion = options?.currentVerisVersion ?? CURRENT_HOST_VERSION;
  let compatibility: CompatibilityResult = {
    compatible: false,
    requiredRange: 'unknown',
    hostVersion,
  };

  if (validatedManifest) {
    const range = validatedManifest.engines.veris;
    const isCompatible = satisfies(hostVersion, range);
    compatibility = {
      compatible: isCompatible,
      requiredRange: range,
      hostVersion,
    };

    if (!isCompatible) {
      errors.push(
        `Engine incompatibility: package requires VERIS engine "${range}", but current host is running "${hostVersion}".`,
      );
    }
  }

  // 5. Capability Auditing & Dangerous Permission Warning
  const capabilities = auditCapabilities(validatedManifest?.capabilities ?? []);
  if (capabilities.hasDangerous) {
    for (const d of capabilities.dangerous) {
      warnings.push(
        `DANGEROUS CAPABILITY: Package requests "${d}". This permission is restricted/prohibited in default offline security analysis.`,
      );
    }
  }

  // 6. Declarative Purity & Security Bounds Check
  let declarativePurity = true;
  if (validatedManifest) {
    // Check path traversal in entryPoint or ID
    if (validatedManifest.entryPoint.includes('..')) {
      errors.push(
        `Security violation: entryPoint path traversal ".." is strictly prohibited: ${validatedManifest.entryPoint}`,
      );
    }

    if (
      validatedManifest.id.includes('..') ||
      validatedManifest.id.startsWith('/') ||
      validatedManifest.id.startsWith('\\')
    ) {
      errors.push(
        `Security violation: plugin ID contains illegal path characters: ${validatedManifest.id}`,
      );
    }

    // For rule-packs: enforce declarative purity (must not be an executable shell script or binary)
    if (validatedManifest.type === 'rule-pack') {
      const ep = validatedManifest.entryPoint.toLowerCase();
      const forbiddenExts = ['.exe', '.dll', '.so', '.dylib', '.bat', '.cmd', '.ps1', '.sh'];
      for (const ext of forbiddenExts) {
        if (ep.endsWith(ext)) {
          errors.push(
            `Declarative purity violation: rule pack cannot specify executable binary/script entry point: ${validatedManifest.entryPoint}`,
          );
          declarativePurity = false;
        }
      }
      if (ep.endsWith('.js') || ep.endsWith('.mjs') || ep.endsWith('.cjs')) {
        warnings.push(
          `Notice: Rule pack entryPoint is JavaScript code (${validatedManifest.entryPoint}). Ensure all rules are purely declarative.`,
        );
      }
    }
  }

  const valid = errors.length === 0 && Boolean(validatedManifest);

  return {
    valid,
    packagePath: resolved,
    manifest: validatedManifest,
    computedSha256,
    expectedSha256: options?.expectedSha256,
    checksumMatch,
    compatibility,
    capabilities,
    declarativePurity,
    warnings,
    errors,
  };
}
