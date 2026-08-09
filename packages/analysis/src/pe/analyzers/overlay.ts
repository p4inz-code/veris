/**
 * PE Overlay Detection — detects data appended after the PE structure.
 *
 * Overlay is data appended after the last section of a PE file. It is
 * significant because:
 * - Malware often appends additional payloads in the overlay
 * - Packed executables may have decompressor stubs in the overlay
 * - Legitimate software rarely has large overlays
 *
 * @module @veris/analysis/pe/analyzers/overlay
 */

import { HIGH_ENTROPY_THRESHOLD } from '../constants.js';
import type { PEParsed, PEOverlay } from '../types.js';

export interface OverlayFinding {
  readonly type: string;
  readonly severity: 'info' | 'low' | 'medium' | 'high';
  readonly explanation: string;
  readonly confidence: number;
  readonly metadata: Record<string, unknown>;
}

/** Analyze overlay data. */
export function analyzeOverlay(pe: PEParsed): OverlayFinding | null {
  if (!pe.valid || !pe.overlay.present) return null;

  const overlay = pe.overlay;

  if (overlay.size <= 64) {
    return {
      type: 'pe-overlay-present',
      severity: 'info',
      explanation: `Small overlay detected: ${overlay.size} bytes at offset ${overlay.offset} (${overlay.percentage}% of file)`,
      confidence: 1.0,
      metadata: {
        size: overlay.size,
        offset: overlay.offset,
        entropy: overlay.entropy,
        percentage: overlay.percentage,
      },
    };
  }

  if (overlay.size > 1024 * 1024) {
    // > 1MB overlay
    return {
      type: 'pe-large-overlay',
      severity: 'high',
      explanation: `Large overlay detected: ${formatSize(overlay.size)} at offset 0x${overlay.offset.toString(16)} (${overlay.percentage}% of file). This is highly suspicious — overlays >1MB are rare in legitimate software and often contain appended malicious payloads or packed data`,
      confidence: 0.9,
      metadata: {
        size: overlay.size,
        offset: overlay.offset,
        entropy: overlay.entropy,
        percentage: overlay.percentage,
      },
    };
  }

  if (overlay.entropy > HIGH_ENTROPY_THRESHOLD) {
    return {
      type: 'pe-high-entropy-overlay',
      severity: 'high',
      explanation: `Overlay with high entropy (${overlay.entropy.toFixed(2)}) detected: ${formatSize(overlay.size)} at offset 0x${overlay.offset.toString(16)}. High entropy overlay data is characteristic of appended encrypted/compressed payloads`,
      confidence: 0.85,
      metadata: {
        size: overlay.size,
        offset: overlay.offset,
        entropy: overlay.entropy,
        percentage: overlay.percentage,
      },
    };
  }

  return {
    type: 'pe-overlay-present',
    severity: overlay.size > 1024 * 100 ? 'medium' : 'low',
    explanation: `Overlay detected: ${formatSize(overlay.size)} at offset 0x${overlay.offset.toString(16)} (${overlay.percentage}% of file, entropy: ${overlay.entropy.toFixed(2)})`,
    confidence: 1.0,
    metadata: {
      size: overlay.size,
      offset: overlay.offset,
      entropy: overlay.entropy,
      percentage: overlay.percentage,
    },
  };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
