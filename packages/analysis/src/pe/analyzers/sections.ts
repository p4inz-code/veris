/**
 * PE Section Analysis — analyzes PE sections for anomalies.
 *
 * Detects:
 * - RWX sections (executable + writable)
 * - High entropy sections (packed/encrypted)
 * - Duplicate section names
 * - Empty executable sections
 * - Non-standard section names
 * - Section alignment issues
 *
 * @module @veris/analysis/pe/analyzers/sections
 */

import {
  STANDARD_SECTION_NAMES,
  KNOWN_PACKER_SECTIONS,
  HIGH_ENTROPY_THRESHOLD,
  VERY_HIGH_ENTROPY_THRESHOLD,
} from '../constants.js';
import type { PEParsed, PESection } from '../types.js';

export interface SectionFinding {
  readonly type: string;
  readonly section: string;
  readonly severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  readonly explanation: string;
  readonly confidence: number;
  readonly metadata: Record<string, unknown>;
}

/** Analyze all sections for anomalies. */
export function analyzeSections(pe: PEParsed): readonly SectionFinding[] {
  const findings: SectionFinding[] = [];

  if (!pe.valid || pe.sections.length === 0) {
    return findings;
  }

  const sectionNames = new Set<string>();
  const seenNames = new Set<string>();

  for (const section of pe.sections) {
    // Check for RWX sections
    if (section.charFlags.isExecutable && section.charFlags.isWritable) {
      const detail = section.charFlags.isReadable ? 'RWX' : 'WX';
      findings.push({
        type: 'pe-rwx-section',
        section: section.name,
        severity: 'high',
        explanation: `Section "${section.name}" is both executable and writable (${detail}) — allows code injection and shellcode execution`,
        confidence: 1.0,
        metadata: {
          section: section.name,
          characteristics: section.characteristics,
          virtualSize: section.virtualSize,
          rawSize: section.rawSize,
        },
      });
    }

    // Check for high entropy
    if (section.entropy > VERY_HIGH_ENTROPY_THRESHOLD) {
      findings.push({
        type: 'pe-very-high-entropy-section',
        section: section.name,
        severity: 'high',
        explanation: `Section "${section.name}" has very high entropy (${section.entropy.toFixed(2)}/8.0) — likely packed or encrypted`,
        confidence: Math.min(1.0, (section.entropy - VERY_HIGH_ENTROPY_THRESHOLD) / 0.5 + 0.5),
        metadata: { section: section.name, entropy: section.entropy },
      });
    } else if (section.entropy > HIGH_ENTROPY_THRESHOLD) {
      findings.push({
        type: 'pe-high-entropy-section',
        section: section.name,
        severity: 'medium',
        explanation: `Section "${section.name}" has high entropy (${section.entropy.toFixed(2)}/8.0)`,
        confidence: Math.min(1.0, (section.entropy - HIGH_ENTROPY_THRESHOLD) / 1.0),
        metadata: { section: section.name, entropy: section.entropy },
      });
    }

    // Check for duplicate section names
    if (seenNames.has(section.name)) {
      findings.push({
        type: 'pe-duplicate-section-name',
        section: section.name,
        severity: 'medium',
        explanation: `Duplicate section name "${section.name}" found — potential PE manipulation`,
        confidence: 0.9,
        metadata: { section: section.name },
      });
    }
    seenNames.add(section.name);

    // Check for non-standard section names
    if (
      !STANDARD_SECTION_NAMES.includes(section.name) &&
      !KNOWN_PACKER_SECTIONS.has(section.name)
    ) {
      sectionNames.add(section.name);
    }

    // Check for empty executable sections
    if (section.charFlags.isExecutable && section.rawSize === 0 && section.virtualSize > 0) {
      findings.push({
        type: 'pe-empty-executable-section',
        section: section.name,
        severity: 'medium',
        explanation: `Executable section "${section.name}" has zero raw size but non-zero virtual size — suspicious`,
        confidence: 0.7,
        metadata: { section: section.name, virtualSize: section.virtualSize },
      });
    }

    // Check for sections with raw size > virtual size
    if (section.rawSize > section.virtualSize && section.virtualSize > 0) {
      findings.push({
        type: 'pe-section-size-anomaly',
        section: section.name,
        severity: 'low',
        explanation: `Section "${section.name}" has raw size (${section.rawSize}) > virtual size (${section.virtualSize}) — data may be truncated at runtime`,
        confidence: 0.6,
        metadata: {
          section: section.name,
          rawSize: section.rawSize,
          virtualSize: section.virtualSize,
        },
      });
    }
  }

  // Report non-standard section names
  if (sectionNames.size > 0) {
    findings.push({
      type: 'pe-nonstandard-section-names',
      section: Array.from(sectionNames).join(', '),
      severity: 'low',
      explanation: `Found ${sectionNames.size} non-standard section name(s): ${Array.from(sectionNames).join(', ')}`,
      confidence: 0.5,
      metadata: { names: Array.from(sectionNames) },
    });
  }

  // Check section alignment
  const misaligned = pe.sections.filter(
    (s) => s.rawOffset % pe.fileAlignment !== 0 && s.rawSize > 0,
  );
  if (misaligned.length > 0) {
    findings.push({
      type: 'pe-section-alignment-anomaly',
      section: misaligned.map((s) => s.name).join(', '),
      severity: 'low',
      explanation: `${misaligned.length} section(s) are not aligned to file alignment (${pe.fileAlignment})`,
      confidence: 0.7,
      metadata: { misalignedCount: misaligned.length },
    });
  }

  return Object.freeze(findings);
}

/** Check if any section is RWX. */
export function hasRWXSection(pe: PEParsed): boolean {
  return pe.sections.some((s) => s.charFlags.isExecutable && s.charFlags.isWritable);
}

/** Count total sections that are packed (high entropy or suspicious name). */
export function countPackedSections(pe: PEParsed): number {
  return pe.sections.filter((s) => s.isPacked).length;
}
