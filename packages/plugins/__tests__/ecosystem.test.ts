/**
 * @veris/plugins/__tests__/ecosystem.test — Tests for plugin ecosystem, catalog, verifier, and installer.
 *
 * Validates ADR-018:
 * - Content-addressed deterministic SHA-256 checksums
 * - Local catalog filtering and schema validation
 * - 4-stage lifecycle: Discovery -> Verification -> Installation -> Execution
 * - Capability auditing and dangerous permission warnings
 * - Declarative purity and path traversal defenses
 * - Safe installation receipt writing and uninstallation
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  computePackageSha256,
  loadCatalog,
  filterCatalog,
  saveCatalog,
  DEFAULT_ECOSYSTEM_CATALOG,
  verifyPluginPackage,
  installPluginPackage,
  removePluginPackage,
  type PluginCatalog,
  type PluginManifest,
} from '../src/index.js';

describe('Plugin Ecosystem Foundation (Phase 14 / ADR-018)', () => {
  let tmpDir: string;
  let pkgDir: string;
  let pluginsTargetDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'veris-eco-test-'));
    pkgDir = path.join(tmpDir, 'test-plugin');
    pluginsTargetDir = path.join(tmpDir, 'installed-plugins');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.mkdirSync(pluginsTargetDir, { recursive: true });

    // Create a valid dummy plugin package
    const manifest: PluginManifest = {
      schemaVersion: '1.0.0',
      id: '@veris-test/mock-extractor',
      name: 'Mock Extractor Plugin',
      version: '1.0.0',
      description: 'Test plugin for ecosystem verification',
      author: 'Test Author',
      license: 'MIT',
      engines: { veris: '>=1.0.0' },
      type: 'extractor',
      entryPoint: './index.js',
      capabilities: ['core-types-read', 'target-read'],
      tags: ['test', 'mock'],
    };

    fs.writeFileSync(
      path.join(pkgDir, 'veris-plugin.json'),
      JSON.stringify(manifest, null, 2),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(pkgDir, 'index.js'),
      'export function extract() { return []; }',
      'utf-8',
    );
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('Deterministic Checksum Calculation', () => {
    it('computes deterministic SHA-256 for a directory regardless of traversal order', () => {
      const hash1 = computePackageSha256(pkgDir);
      const hash2 = computePackageSha256(pkgDir);
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('detects tampering when any file content changes', () => {
      const originalHash = computePackageSha256(pkgDir);

      // Mutate a file
      fs.writeFileSync(
        path.join(pkgDir, 'index.js'),
        'export function extract() { return [1]; }',
        'utf-8',
      );

      const modifiedHash = computePackageSha256(pkgDir);
      expect(modifiedHash).not.toBe(originalHash);
    });

    it('ignores VCS and build metadata files', () => {
      const baseHash = computePackageSha256(pkgDir);

      // Add ignored files
      fs.mkdirSync(path.join(pkgDir, '.git'));
      fs.writeFileSync(path.join(pkgDir, '.git', 'HEAD'), 'ref: refs/heads/main');
      fs.writeFileSync(path.join(pkgDir, '.DS_Store'), 'ignored');

      const afterIgnored = computePackageSha256(pkgDir);
      expect(afterIgnored).toBe(baseHash);
    });
  });

  describe('Local-First Catalog Management', () => {
    it('loads the built-in default ecosystem catalog', () => {
      const cat = loadCatalog();
      expect(cat.schemaVersion).toBe('1.0.0');
      expect(cat.packages.length).toBeGreaterThan(0);
      expect(cat.packages.some((p) => p.id === '@veris-ecosystem/pe-extended-extractor')).toBe(
        true,
      );
    });

    it('filters catalog by type, keyword search, tag, and capabilities', () => {
      const cat = DEFAULT_ECOSYSTEM_CATALOG;

      const rulePacks = filterCatalog(cat, { type: 'rule-pack' });
      expect(rulePacks.every((p) => p.type === 'rule-pack')).toBe(true);

      const credentialMatches = filterCatalog(cat, { search: 'credential' });
      expect(credentialMatches.length).toBeGreaterThan(0);
      expect(credentialMatches[0].name).toContain('Credential');

      const tagMatches = filterCatalog(cat, { tag: 'windows' });
      expect(tagMatches.length).toBeGreaterThan(0);
      expect(tagMatches[0].tags).toContain('windows');

      const targetReadMatches = filterCatalog(cat, { capability: 'target-read' });
      expect(targetReadMatches.length).toBeGreaterThan(0);
      expect(targetReadMatches[0].capabilities).toContain('target-read');
    });

    it('saves and reloads custom catalog files', () => {
      const customCatalog: PluginCatalog = {
        schemaVersion: '1.0.0',
        name: 'Enterprise Private Catalog',
        updatedAt: new Date().toISOString(),
        packages: [
          {
            id: 'internal-yara-pack',
            name: 'Internal YARA Rules',
            version: '2.1.0',
            description: 'Proprietary threat signatures',
            type: 'rule-pack',
            author: 'SecOps',
            license: 'UNLICENSED',
            capabilities: ['core-types-read'],
            sha256: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
            engines: { veris: '>=1.0.0' },
            location: './rules/yara',
          },
        ],
      };

      const customPath = path.join(tmpDir, 'custom-catalog.json');
      saveCatalog(customCatalog, customPath);
      expect(fs.existsSync(customPath)).toBe(true);

      const reloaded = loadCatalog(customPath);
      expect(reloaded.name).toBe('Enterprise Private Catalog');
      expect(reloaded.packages[0].id).toBe('internal-yara-pack');
    });
  });

  describe('Plugin Verification Pipeline', () => {
    it('passes verification for a compliant package', async () => {
      const report = await verifyPluginPackage(pkgDir);
      expect(report.valid).toBe(true);
      expect(report.manifest?.id).toBe('@veris-test/mock-extractor');
      expect(report.compatibility.compatible).toBe(true);
      expect(report.errors).toHaveLength(0);
    });

    it('verifies integrity against an expected SHA-256 hash', async () => {
      const expectedHash = computePackageSha256(pkgDir);
      const report = await verifyPluginPackage(pkgDir, { expectedSha256: expectedHash });
      expect(report.valid).toBe(true);
      expect(report.checksumMatch).toBe(true);

      // Verify mismatch failure
      const badReport = await verifyPluginPackage(pkgDir, {
        expectedSha256: '0000000000000000000000000000000000000000000000000000000000000000',
      });
      expect(badReport.valid).toBe(false);
      expect(badReport.checksumMatch).toBe(false);
      expect(badReport.errors.some((e) => e.includes('Integrity check failed'))).toBe(true);
    });

    it('flags dangerous capabilities with security warnings', async () => {
      const manifestPath = path.join(pkgDir, 'veris-plugin.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      manifest.capabilities.push('network', 'process-spawn');
      fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf-8');

      const report = await verifyPluginPackage(pkgDir);
      expect(report.capabilities.hasDangerous).toBe(true);
      expect(report.capabilities.dangerous).toContain('network');
      expect(report.capabilities.dangerous).toContain('process-spawn');
      expect(report.warnings.some((w) => w.includes('DANGEROUS CAPABILITY'))).toBe(true);
    });

    it('fails verification if engine version is incompatible', async () => {
      const manifestPath = path.join(pkgDir, 'veris-plugin.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      manifest.engines.veris = '>=9.0.0'; // Future version
      fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf-8');

      const report = await verifyPluginPackage(pkgDir, { currentVerisVersion: '1.2.0' });
      expect(report.valid).toBe(false);
      expect(report.compatibility.compatible).toBe(false);
      expect(report.errors.some((e) => e.includes('Engine incompatibility'))).toBe(true);
    });

    it('enforces declarative purity and prevents executable binaries in rule packs', async () => {
      const manifestPath = path.join(pkgDir, 'veris-plugin.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      manifest.type = 'rule-pack';
      manifest.entryPoint = './malicious-binary.exe';
      fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf-8');

      const report = await verifyPluginPackage(pkgDir);
      expect(report.valid).toBe(false);
      expect(report.declarativePurity).toBe(false);
      expect(report.errors.some((e) => e.includes('Declarative purity violation'))).toBe(true);
    });

    it('blocks directory traversal attempts in entryPoint', async () => {
      const manifestPath = path.join(pkgDir, 'veris-plugin.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      manifest.entryPoint = '../../etc/passwd';
      fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf-8');

      const report = await verifyPluginPackage(pkgDir);
      expect(report.valid).toBe(false);
      expect(report.errors.some((e) => e.includes('path traversal'))).toBe(true);
    });
  });

  describe('Plugin Installation & Uninstallation Lifecycle', () => {
    it('safely installs a verified plugin and writes an installation receipt', async () => {
      const installRes = await installPluginPackage(pkgDir, pluginsTargetDir);
      expect(installRes.success).toBe(true);
      expect(installRes.pluginId).toBe('@veris-test/mock-extractor');
      expect(fs.existsSync(installRes.targetDir)).toBe(true);

      // Verify receipt
      const receiptFile = path.join(installRes.targetDir, '.veris-installed.json');
      expect(fs.existsSync(receiptFile)).toBe(true);
      const receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf-8'));
      expect(receipt.pluginId).toBe('@veris-test/mock-extractor');
      expect(receipt.verifiedSha256).toBe(installRes.verification.computedSha256);
      expect(receipt.capabilities).toEqual(['core-types-read', 'target-read']);
    });

    it('refuses to overwrite existing plugin unless --force is specified', async () => {
      const first = await installPluginPackage(pkgDir, pluginsTargetDir);
      expect(first.success).toBe(true);

      // Attempt second install without force
      const second = await installPluginPackage(pkgDir, pluginsTargetDir);
      expect(second.success).toBe(false);
      expect(second.error).toContain('Plugin is already installed');

      // Attempt second install with force
      const forced = await installPluginPackage(pkgDir, pluginsTargetDir, { force: true });
      expect(forced.success).toBe(true);
    });

    it('refuses to install a package that fails verification', async () => {
      // Corrupt the package manifest
      fs.writeFileSync(path.join(pkgDir, 'veris-plugin.json'), '{ "invalid": "json" ...');

      const installRes = await installPluginPackage(pkgDir, pluginsTargetDir);
      expect(installRes.success).toBe(false);
      expect(installRes.error).toContain('Verification failed');
    });

    it('uninstalls an installed plugin and cleans up directory', async () => {
      const installRes = await installPluginPackage(pkgDir, pluginsTargetDir);
      expect(installRes.success).toBe(true);

      const removeRes = await removePluginPackage('@veris-test/mock-extractor', pluginsTargetDir);
      expect(removeRes.success).toBe(true);
      expect(removeRes.removedFilesCount).toBeGreaterThan(0);
      expect(fs.existsSync(installRes.targetDir)).toBe(false);
    });

    it('returns error when attempting to remove non-existent plugin', async () => {
      const removeRes = await removePluginPackage('non-existent-plugin', pluginsTargetDir);
      expect(removeRes.success).toBe(false);
      expect(removeRes.error).toContain('is not installed');
    });
  });
});
