/**
 * PE TLS (Thread Local Storage) Callback Analysis.
 *
 * TLS callbacks execute before the entry point. They are significant because:
 * - Malware uses TLS callbacks to execute anti-debug, anti-VM, and
 *   unpacking code BEFORE the main executable runs
 * - Legitimate software rarely uses TLS callbacks
 * - Multiple TLS callbacks are highly suspicious
 *
 * @module @veris/analysis/pe/analyzers/tls
 */

import type { PEParsed, TLSInfo } from '../types.js';

export interface TLSFinding {
  readonly type: string;
  readonly severity: 'info' | 'medium' | 'high' | 'critical';
  readonly explanation: string;
  readonly confidence: number;
  readonly metadata: Record<string, unknown>;
}

/** Analyze TLS callback information. */
export function analyzeTLS(pe: PEParsed): TLSFinding | null {
  if (!pe.valid || !pe.tls) return null;

  const { tls } = pe;
  const callbackCount = tls.callbacks.length;

  if (callbackCount === 0) {
    // TLS directory present but no callbacks — uncommon but not suspicious
    return {
      type: 'pe-tls-present',
      severity: 'info',
      explanation: 'TLS directory present but no callbacks defined',
      confidence: 1.0,
      metadata: { callbackCount: 0, rawDataSize: tls.rawDataEnd - tls.rawDataStart },
    };
  }

  if (callbackCount === 1) {
    return {
      type: 'pe-tls-callback',
      severity: 'medium',
      explanation: `1 TLS callback found at address 0x${tls.callbacks[0].address.toString(16)}. TLS callbacks execute before the entry point and are commonly used by malware for anti-debugging, anti-VM checks, and unpacking`,
      confidence: 0.7,
      metadata: {
        callbackCount: 1,
        callbacks: tls.callbacks.map((c) => ({ address: `0x${c.address.toString(16)}` })),
        rawDataSize: tls.rawDataEnd - tls.rawDataStart,
      },
    };
  }

  // Multiple callbacks — highly suspicious
  return {
    type: 'pe-multiple-tls-callbacks',
    severity: callbackCount >= 3 ? 'critical' : 'high',
    explanation: `${callbackCount} TLS callbacks found (addresses: ${tls.callbacks.map((c) => `0x${c.address.toString(16)}`).join(', ')}). Multiple TLS callbacks are extremely rare in legitimate software and strongly indicate malware — each callback executes before the entry point, enabling stealthy initialization`,
    confidence: 0.9,
    metadata: {
      callbackCount,
      callbacks: tls.callbacks.map((c) => ({ address: `0x${c.address.toString(16)}` })),
      rawDataSize: tls.rawDataEnd - tls.rawDataStart,
    },
  };
}
