/**
 * PE Resource Analysis — extracts and analyzes embedded resources.
 *
 * Analyzes:
 * - Icons (group-icon, icon)
 * - Version info (file version, product name, etc.)
 * - Manifest files
 * - Dialog layouts
 * - Embedded binaries
 * - Certificate resources
 * - String tables
 *
 * @module @veris/analysis/pe/analyzers/resources
 */

import type { PEParsed, PEResource } from '../types.js';

export interface ResourceFinding {
  readonly type: string;
  readonly severity: 'info' | 'low' | 'medium' | 'high';
  readonly explanation: string;
  readonly confidence: number;
  readonly metadata: Record<string, unknown>;
}

/** Analyze PE resources. */
export function analyzeResources(pe: PEParsed): readonly ResourceFinding[] {
  const findings: ResourceFinding[] = [];

  if (!pe.valid || pe.resources.length === 0) {
    return findings;
  }

  // Version info
  const versionInfo = pe.resources.filter((r) => r.type === 'version');
  if (versionInfo.length > 0) {
    const versionText = extractVersionString(versionInfo[0]);
    findings.push({
      type: 'pe-version-info',
      severity: 'info',
      explanation: `Version information present: ${versionText || 'binary data'}`,
      confidence: 1.0,
      metadata: {
        count: versionInfo.length,
        versionText,
        sizes: versionInfo.map((v) => v.size),
      },
    });
  }

  // Manifest
  const manifests = pe.resources.filter((r) => r.type === 'manifest');
  if (manifests.length > 0) {
    const text = manifests[0].data
      ? manifests[0].data.toString('utf-8', 0, Math.min(500, manifests[0].data.length))
      : '';
    const isAdmin = text.includes('requireAdministrator') || text.includes('highestAvailable');
    const isUIAccess = text.includes('uiAccess="true"');

    if (isAdmin) {
      findings.push({
        type: 'pe-requires-admin',
        severity: 'medium',
        explanation:
          'Executable requests administrator privileges (requireAdministrator in manifest)',
        confidence: 1.0,
        metadata: { manifestText: text },
      });
    }
    if (isUIAccess) {
      findings.push({
        type: 'pe-uiaccess',
        severity: 'medium',
        explanation: 'Executable has uiAccess=true — can interact with elevated windows',
        confidence: 1.0,
        metadata: { manifestText: text },
      });
    }

    findings.push({
      type: 'pe-manifest-present',
      severity: 'info',
      explanation: `${manifests.length} manifest resource(s) present`,
      confidence: 1.0,
      metadata: { count: manifests.length },
    });
  }

  // Embedded executables in resources
  const embeddedExes = pe.resources.filter((r) => r.type === 'rc-data' && r.size > 4096);
  for (const res of embeddedExes) {
    if (res.data && res.data.length >= 2 && res.data[0] === 0x4d && res.data[1] === 0x5a) {
      findings.push({
        type: 'pe-embedded-executable',
        severity: 'high',
        explanation: `Embedded PE executable found in resource "${res.name}" (${formatSize(res.size)}) — may contain dropped or injected payload`,
        confidence: 0.95,
        metadata: {
          resourceName: res.name,
          resourceId: res.id,
          size: res.size,
          offset: res.offset,
        },
      });
    }
  }

  // Icon information
  const icons = pe.resources.filter((r) => r.type === 'icon' || r.type === 'group-icon');
  if (icons.length > 0) {
    findings.push({
      type: 'pe-icons-present',
      severity: 'info',
      explanation: `${icons.length} icon resource(s) present`,
      confidence: 1.0,
      metadata: { count: icons.length },
    });
  }

  // Dialog information
  const dialogs = pe.resources.filter((r) => r.type === 'dialog');
  if (dialogs.length > 0) {
    findings.push({
      type: 'pe-dialogs-present',
      severity: 'info',
      explanation: `${dialogs.length} dialog resource(s) present`,
      confidence: 1.0,
      metadata: { count: dialogs.length },
    });
  }

  // Large binary resources
  const largeResources = pe.resources.filter((r) => r.size > 1024 * 100 && r.type === 'rc-data');
  if (largeResources.length > 0) {
    findings.push({
      type: 'pe-large-embedded-blobs',
      severity: 'medium',
      explanation: `${largeResources.length} large embedded data blob(s) — may contain configuration, payloads, or encrypted data`,
      confidence: 0.6,
      metadata: {
        count: largeResources.length,
        sizes: largeResources.map((r) => ({ name: r.name, size: r.size })),
      },
    });
  }

  return Object.freeze(findings);
}

function extractVersionString(resource: PEResource): string {
  if (!resource.data || resource.data.length < 52) return '';
  try {
    // Version resource starts with VS_VERSIONINFO structure
    // The StringFileInfo block contains key-value pairs
    const data = resource.data;
    // A simple extraction: look for common patterns
    const patterns = [
      'FileVersion',
      'ProductVersion',
      'FileDescription',
      'CompanyName',
      'ProductName',
      'LegalCopyright',
      'OriginalFilename',
      'InternalName',
    ];
    for (const pattern of patterns) {
      const idx = data.indexOf(Buffer.from(pattern, 'utf-16le'));
      if (idx >= 0) {
        const valueStart = idx + (pattern.length + 1) * 2; // skip the key in UTF-16
        const valueEnd = data.indexOf(0, valueStart);
        if (valueEnd > valueStart && valueEnd - valueStart < 256) {
          const value = data.toString('utf-16le', valueStart, valueEnd);
          if (value) return `${pattern}: ${value}`;
        }
      }
    }
  } catch {
    // Ignore parse errors
  }
  return '';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
