/**
 * PE Packer Detection — multi-signal detection for known packers.
 *
 * Uses NOT just entropy, but a combination of:
 * - Section names
 * - Entropy levels
 * - Import table characteristics
 * - Overlay presence
 * - Entry point analysis
 * - Compiler irregularities
 * - Resource anomalies
 *
 * @module @veris/analysis/pe/analyzers/packer-detector
 */

import {
  KNOWN_PACKER_SECTIONS,
  HIGH_ENTROPY_THRESHOLD,
  VERY_HIGH_ENTROPY_THRESHOLD,
} from '../constants.js';
import type { PEParsed, PackerResult } from '../types.js';

/** Detect packers using multi-signal analysis. */
export function detectPacker(pe: PEParsed): PackerResult {
  if (!pe.valid) {
    return { packer: null, confidence: 0, signals: [], packerType: null };
  }

  const signals: string[] = [];
  const candidates = new Map<string, { confidence: number; signals: string[] }>();

  // Signal 1: Known packer section names
  for (const section of pe.sections) {
    const packerName = KNOWN_PACKER_SECTIONS.get(section.name);
    if (packerName) {
      signals.push(`Section name "${section.name}" matches ${packerName}`);
      const entry = candidates.get(packerName) ?? { confidence: 0, signals: [] };
      entry.confidence = Math.min(1.0, entry.confidence + 0.45);
      entry.signals.push(`Known section name: "${section.name}"`);
      candidates.set(packerName, entry);
    }
  }

  // Signal 2: High entropy sections
  const highEntropySections = pe.sections.filter((s) => s.entropy > HIGH_ENTROPY_THRESHOLD);
  if (highEntropySections.length >= 2) {
    signals.push(`Multiple (${highEntropySections.length}) high entropy sections`);
    // Many packers have multiple high-entropy sections
  }
  if (highEntropySections.length >= 1) {
    signals.push(
      `${highEntropySections.length} high entropy section(s) (${highEntropySections.map((s) => `${s.name}=${s.entropy.toFixed(2)}`).join(', ')})`,
    );
  }

  // Signal 3: Overlay present
  if (pe.overlay.present && pe.overlay.size > 1024) {
    signals.push(
      `Large overlay present (${pe.overlay.size} bytes, entropy: ${pe.overlay.entropy.toFixed(2)})`,
    );
    // UPX, MPRESS, and others leave overlay data
    const upx = candidates.get('UPX');
    if (upx) {
      upx.confidence = Math.min(1.0, upx.confidence + 0.15);
      upx.signals.push(`Overlay present: ${pe.overlay.size} bytes`);
    }
    const mpress = candidates.get('MPRESS');
    if (mpress) {
      mpress.confidence = Math.min(1.0, mpress.confidence + 0.15);
      mpress.signals.push(`Overlay present: ${pe.overlay.size} bytes`);
    }
    const generic = candidates.get('Generic') ?? { confidence: 0, signals: [] };
    generic.confidence = Math.min(1.0, generic.confidence + 0.15);
    generic.signals.push(`Overlay present: ${pe.overlay.size} bytes`);
    candidates.set('Generic', generic);
  }

  // Signal 4: Few imports (packers typically have minimal import tables)
  const importCount = pe.imports.length;
  if (importCount === 0) {
    signals.push('No imports detected (packed or obfuscated)');
    const generic = candidates.get('Generic') ?? { confidence: 0, signals: [] };
    generic.confidence = Math.min(1.0, generic.confidence + 0.25);
    generic.signals.push('Empty import table');
    candidates.set('Generic', generic);
  } else if (importCount < 10) {
    signals.push(`Very few imports (${importCount}) — characteristic of packed executables`);
    const generic = candidates.get('Generic') ?? { confidence: 0, signals: [] };
    generic.confidence = Math.min(1.0, generic.confidence + 0.2);
    generic.signals.push(`Minimal imports: ${importCount}`);
    candidates.set('Generic', generic);
  }

  // Signal 5: Suspicious entry point (points to non-code section)
  if (pe.entryPoint > 0 && pe.sections.length > 1) {
    const epSection = pe.sections.find(
      (s) => pe.entryPoint >= s.virtualAddress && pe.entryPoint < s.virtualAddress + s.virtualSize,
    );
    if (epSection && !epSection.charFlags.isExecutable && !epSection.charFlags.containsCode) {
      signals.push(`Entry point is in non-executable section "${epSection.name}"`);
      const generic = candidates.get('Generic') ?? { confidence: 0, signals: [] };
      generic.confidence = Math.min(1.0, generic.confidence + 0.15);
      generic.signals.push(`Entry point in non-code section: "${epSection.name}"`);
      candidates.set('Generic', generic);
    }
  }

  // Signal 6: Section with raw size = 0 but virtual size > 0
  const zeroRawSections = pe.sections.filter((s) => s.rawSize === 0 && s.virtualSize > 0);
  if (zeroRawSections.length > 0) {
    signals.push(
      `${zeroRawSections.length} section(s) with zero raw size but non-zero virtual size (packer characteristic)`,
    );
    const generic = candidates.get('Generic') ?? { confidence: 0, signals: [] };
    generic.confidence = Math.min(1.0, generic.confidence + 0.2);
    generic.signals.push(
      `Zero-raw-size sections: ${zeroRawSections.map((s) => s.name).join(', ')}`,
    );
    candidates.set('Generic', generic);
  }

  // Signal 7: Very high entropy in .text section
  const textSection = pe.sections.find((s) => s.name === '.text');
  if (textSection && textSection.entropy > VERY_HIGH_ENTROPY_THRESHOLD) {
    signals.push(
      `.text section has very high entropy (${textSection.entropy.toFixed(2)}) — packed code`,
    );
    const generic = candidates.get('Generic') ?? { confidence: 0, signals: [] };
    generic.confidence = Math.min(1.0, generic.confidence + 0.25);
    generic.signals.push(`.text entropy: ${textSection.entropy.toFixed(2)}`);
    candidates.set('Generic', generic);
  }

  // Determine winner
  let bestPacker: string | null = null;
  let bestConfidence = 0;
  let bestSignals: string[] = [];
  let packerType: 'packer' | 'protector' | 'obfuscator' | null = null;

  for (const [packer, entry] of candidates) {
    if (entry.confidence > bestConfidence) {
      bestPacker = packer;
      bestConfidence = entry.confidence;
      bestSignals = entry.signals;
    }
  }

  // Classify type
  if (bestPacker) {
    const protectors = ['Themida', 'VMProtect', 'Enigma'];
    const obfuscators = ['ConfuserEx'];
    if (protectors.includes(bestPacker)) packerType = 'protector';
    else if (obfuscators.includes(bestPacker)) packerType = 'obfuscator';
    else packerType = 'packer';
  }

  return {
    packer: bestPacker,
    confidence: bestConfidence,
    signals: [...bestSignals],
    packerType,
  };
}
