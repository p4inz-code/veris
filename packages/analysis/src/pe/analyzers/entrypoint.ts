/**
 * PE Entry Point Analysis — analyzes the executable entry point.
 *
 * Analyzes:
 * - Entry RVA relative to sections
 * - Which section the entry point resides in
 * - Distance from section start
 * - Stub detection (very small entry sections)
 * - Packed entry points (entry in non-standard locations)
 * - Suspicious entry patterns
 *
 * @module @veris/analysis/pe/analyzers/entrypoint
 */

import { KNOWN_PACKER_SECTIONS } from '../constants.js';
import type { PEParsed, PESection } from '../types.js';

export interface EntryPointFinding {
  readonly type: string;
  readonly severity: 'info' | 'low' | 'medium' | 'high';
  readonly explanation: string;
  readonly confidence: number;
  readonly metadata: Record<string, unknown>;
}

/** Analyze the entry point. */
export function analyzeEntryPoint(pe: PEParsed): EntryPointFinding {
  if (!pe.valid) {
    return {
      type: 'pe-entry-point',
      severity: 'info',
      explanation: 'Cannot analyze entry point on invalid PE',
      confidence: 0,
      metadata: { entryPoint: 0 },
    };
  }

  const ep = pe.entryPoint;
  if (ep === 0) {
    return {
      type: 'pe-entry-point-zero',
      severity: 'high',
      explanation:
        'Entry point is 0 — this is unusual for executables (but may be normal for DLLs). May indicate a packed or obfuscated binary',
      confidence: 0.8,
      metadata: { entryPoint: 0 },
    };
  }

  // Find which section contains the entry point
  const epSection = pe.sections.find(
    (s) => ep >= s.virtualAddress && ep < s.virtualAddress + s.virtualSize,
  );

  if (!epSection) {
    return {
      type: 'pe-entry-point-outside-sections',
      severity: 'high',
      explanation: `Entry point (0x${ep.toString(16)}) is outside all defined sections — highly unusual and indicates deliberate manipulation`,
      confidence: 0.95,
      metadata: { entryPoint: ep },
    };
  }

  // Calculate distance from section start
  const distance = ep - epSection.virtualAddress;

  // Check if section is a known packer section
  const packerName = KNOWN_PACKER_SECTIONS.get(epSection.name);
  if (packerName) {
    return {
      type: 'pe-entry-point-in-packer-section',
      severity: 'high',
      explanation: `Entry point (0x${ep.toString(16)}) is in section "${epSection.name}", which is a known ${packerName} packer section. The real entry point is typically resolved at runtime by the unpacking stub`,
      confidence: 0.9,
      metadata: {
        entryPoint: ep,
        section: epSection.name,
        packer: packerName,
        distance,
        sectionVirtualSize: epSection.virtualSize,
        sectionRawSize: epSection.rawSize,
      },
    };
  }

  // Entry in a non-executable section
  if (!epSection.charFlags.isExecutable) {
    return {
      type: 'pe-entry-point-in-non-executable',
      severity: 'high',
      explanation: `Entry point (0x${ep.toString(16)}) is in section "${epSection.name}" which is NOT marked as executable. The section permissions will need to be changed at runtime for the entry point to execute`,
      confidence: 0.85,
      metadata: {
        entryPoint: ep,
        section: epSection.name,
        characteristics: epSection.characteristics,
        distance,
      },
    };
  }

  // Entry point in unusual section (not .text)
  if (epSection.name !== '.text' && epSection.name !== 'CODE') {
    return {
      type: 'pe-entry-point-in-unusual-section',
      severity: 'low',
      explanation: `Entry point (0x${ep.toString(16)}) is in section "${epSection.name}" rather than the standard .text section`,
      confidence: 0.5,
      metadata: {
        entryPoint: ep,
        section: epSection.name,
        distance,
      },
    };
  }

  // Distance from section start — very small distance may indicate a stub
  if (distance < 16 && epSection.virtualSize > 1024) {
    return {
      type: 'pe-entry-point-near-section-start',
      severity: 'low',
      explanation: `Entry point is very close to the start of section "${epSection.name}" (offset ${distance} bytes) — typical for packed executables where the entry is a small unpacking stub`,
      confidence: 0.5,
      metadata: {
        entryPoint: ep,
        section: epSection.name,
        distance,
        sectionSize: epSection.virtualSize,
      },
    };
  }

  // Entry point near section end (suggests overlay/packer transition)
  const endDistance = epSection.virtualAddress + epSection.virtualSize - ep;
  if (endDistance < 64 && epSection.virtualSize > 4096) {
    return {
      type: 'pe-entry-point-near-section-end',
      severity: 'low',
      explanation: `Entry point (0x${ep.toString(16)}) is very close to the end of section "${epSection.name}" (${endDistance} bytes from end) — unusual for normal code placement`,
      confidence: 0.4,
      metadata: {
        entryPoint: ep,
        section: epSection.name,
        endDistance,
      },
    };
  }

  // Normal entry point
  return {
    type: 'pe-entry-point-normal',
    severity: 'info',
    explanation: `Entry point at 0x${ep.toString(16)} in section "${epSection.name}" (offset ${distance} bytes), machine: ${pe.machine}, format: ${pe.format}`,
    confidence: 1.0,
    metadata: {
      entryPoint: ep,
      section: epSection.name,
      distance,
      sectionVirtualSize: epSection.virtualSize,
      sectionRawSize: epSection.rawSize,
      sectionExecutable: epSection.charFlags.isExecutable,
    },
  };
}
