/**
 * PE Timestamp Analysis — detects anomalous compilation timestamps.
 *
 * Detects:
 * - Future timestamps (compiled in the future — impossible)
 * - Epoch timestamps (Jan 1 1970 — invalid/default)
 * - Zero timestamps (no timestamp set)
 * - Known fake values (e.g., 0xFFFFFFFF, 0x00000000, 0xDEADBEEF)
 * - Suspicious dates (too old or too new for the binary's apparent origin)
 *
 * @module @veris/analysis/pe/analyzers/timestamp
 */

import type { PEParsed, TimestampAnalysis } from '../types.js';

export interface TimestampFinding {
  readonly type: string;
  readonly severity: 'info' | 'low' | 'medium' | 'high';
  readonly explanation: string;
  readonly confidence: number;
  readonly metadata: Record<string, unknown>;
}

const EPOCH_VALUES: ReadonlySet<number> = new Set([
  0, // Zero
  0xffffffff, // -1 (unsigned max, often used by packers)
  0xdeadbeef, // Common debug marker
  0xbaadf00d, // Common debug marker
  0xcafebabe, // Java magic / debug marker
  0xfeedface, // Mach-O magic
  0xfeedbead, // Memory marker
  0xabababab, // Filler
  0xcdcdcdcd, // Debug filler
  0xfeeefeee, // Freed memory
  0x00000001, // Near-epoch
  0x00000002, // Near-epoch
]);

/**
 * Analyze the PE timestamp for anomalies.
 *
 * @param pe - The parsed PE structure.
 * @param referenceTimestampMs - Optional reference timestamp in milliseconds (default: Date.now()).
 *   Inject a fixed value for deterministic snapshot testing.
 */
export function analyzeTimestamp(pe: PEParsed, referenceTimestampMs?: number): TimestampFinding {
  if (!pe.valid) {
    return {
      type: 'pe-timestamp-analysis',
      severity: 'info',
      explanation: 'Cannot analyze timestamp on invalid PE',
      confidence: 0,
      metadata: { rawValue: 0 },
    };
  }

  const rawValue = pe.timeDateStamp;
  const refNow = referenceTimestampMs ?? Date.now();
  const nowUnix = Math.floor(refNow / 1000);

  // Check for known fake/epoch values
  if (EPOCH_VALUES.has(rawValue)) {
    const name = getEpochName(rawValue);
    return {
      type: 'pe-timestamp-epoch',
      severity: rawValue === 0xffffffff ? 'medium' : 'low',
      explanation: `Timestamp is ${name} (0x${rawValue.toString(16)}) — indicates the timestamp was not set or was intentionally zeroed, common in packed or manually crafted executables`,
      confidence: 1.0,
      metadata: { rawValue, epochName: name },
    };
  }

  const date = new Date(rawValue * 1000);
  const daysFromNow = Math.round((nowUnix - rawValue) / 86400);

  // Future timestamp
  if (rawValue > nowUnix + 86400) {
    // More than 1 day in the future
    return {
      type: 'pe-timestamp-future',
      severity: 'high',
      explanation: `Compilation timestamp is in the future: ${date.toISOString().split('T')[0]} (${daysFromNow > 0 ? `${daysFromNow} days ahead` : `${-daysFromNow} days in the future`}). This is impossible for legitimate software and indicates timestamp manipulation`,
      confidence: 1.0,
      metadata: {
        rawValue,
        parsedDate: date.toISOString(),
        daysFromNow: -daysFromNow,
      },
    };
  }

  // Very old (before 2000) — suspicious for modern executables
  if (rawValue > 0 && rawValue < 946684800) {
    // Before Jan 1 2000
    return {
      type: 'pe-timestamp-very-old',
      severity: 'medium',
      explanation: `Compilation timestamp is very old: ${date.toISOString().split('T')[0]} (${-daysFromNow} days ago). If the binary appears modern, this timestamp may have been faked`,
      confidence: 0.7,
      metadata: {
        rawValue,
        parsedDate: date.toISOString(),
        daysAgo: -daysFromNow,
      },
    };
  }

  // Now or near-future (within 1 day — clock skew tolerance)
  if (rawValue > nowUnix) {
    return {
      type: 'pe-timestamp-near-future',
      severity: 'low',
      explanation: `Timestamp is slightly in the future: ${date.toISOString().split('T')[0]} (${-daysFromNow} days ahead) — may be a clock skew or intentional manipulation`,
      confidence: 0.5,
      metadata: {
        rawValue,
        parsedDate: date.toISOString(),
        daysAhead: -daysFromNow,
      },
    };
  }

  // Normal timestamp (valid range)
  return {
    type: 'pe-timestamp-normal',
    severity: 'info',
    explanation: `Compilation timestamp: ${date.toISOString().split('T')[0]} (${-daysFromNow} days ago)`,
    confidence: 1.0,
    metadata: {
      rawValue,
      parsedDate: date.toISOString(),
      daysAgo: -daysFromNow,
    },
  };
}

function getEpochName(value: number): string {
  const names: Record<number, string> = {
    0: 'zero/epoch (Jan 1 1970)',
    0xffffffff: 'max unsigned (-1/0xFFFFFFFF)',
    0xdeadbeef: 'deadbeef debug marker',
    0xbaadf00d: 'baadf00d debug marker',
    0xcafebabe: 'cafebabe',
    0xfeedface: 'feedface',
    0xfeedbead: 'feedbead',
    0xabababab: 'abababab filler',
    0xcdcdcdcd: 'cdcdcdcd debug filler',
    0xfeeefeee: 'feeefeee freed memory',
  };
  return names[value] ?? `known epoch value (0x${value.toString(16)})`;
}
