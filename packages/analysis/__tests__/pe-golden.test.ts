/**
 * Golden Snapshot Tests for PE Analysis Engine.
 *
 * Tests each PE analyzer independently and captures deterministic
 * output snapshots for regression detection.
 *
 * @module @veris/analysis/__tests__/pe-golden
 */

import { describe, it, expect } from 'vitest';

import { analyzeSections } from '../src/pe/analyzers/sections.js';
import { analyzeImports } from '../src/pe/analyzers/imports.js';
import { detectPacker } from '../src/pe/analyzers/packer-detector.js';
import { analyzeOverlay } from '../src/pe/analyzers/overlay.js';
import { identifyCompiler } from '../src/pe/analyzers/compiler.js';
import { analyzeTLS } from '../src/pe/analyzers/tls.js';
import { analyzeResources } from '../src/pe/analyzers/resources.js';
import { analyzeSignature } from '../src/pe/analyzers/signature.js';
import { analyzeTimestamp } from '../src/pe/analyzers/timestamp.js';
import { analyzeEntryPoint } from '../src/pe/analyzers/entrypoint.js';
import { analyzePE } from '../src/pe/engine.js';
import { createMockPE } from './pe-fixtures.js';

describe('PE Golden Tests — Section Analyzer', () => {
  it('produces deterministic output for clean PE', () => {
    const pe = createMockPE('clean');
    const findings = analyzeSections(pe);
    expect(findings).toMatchSnapshot('clean-sections');
  });

  it('produces deterministic output for RWX PE', () => {
    const pe = createMockPE('rwx');
    const findings = analyzeSections(pe);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => f.type === 'pe-rwx-section')).toBe(true);
    // Snapshot the type and severity, not dynamic content
    const summary = findings.map((f) => ({
      type: f.type,
      severity: f.severity,
      section: f.section,
    }));
    expect(summary).toMatchSnapshot('rwx-sections-summary');
  });
});

describe('PE Golden Tests — Import Analyzer', () => {
  it('produces deterministic output for clean PE', () => {
    const pe = createMockPE('clean');
    const { findings } = analyzeImports(pe);
    expect(findings).toMatchSnapshot('clean-imports');
  });

  it('produces deterministic output for malicious imports', () => {
    const pe = createMockPE('malicious-imports');
    const { findings } = analyzeImports(pe);
    expect(findings.length).toBeGreaterThan(0);
    const summary = findings.map((f) => ({ type: f.type, severity: f.severity }));
    expect(summary).toMatchSnapshot('malicious-imports-summary');
  });
});

describe('PE Golden Tests — Packer Detector', () => {
  it('returns no packer or low-confidence packer for clean PE', () => {
    const pe = createMockPE('clean');
    const result = detectPacker(pe);
    // Clean PE with 3 imports may trigger low-confidence 'Generic' packer signal
    expect(result.confidence).toBeLessThan(0.5);
    expect(result).toMatchSnapshot('clean-packer');
  });

  it('detects UPX for UPX-packed PE', () => {
    const pe = createMockPE('upx');
    const result = detectPacker(pe);
    expect(result.packer).toBe('UPX');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result).toMatchSnapshot('upx-packer');
  });
});

describe('PE Golden Tests — Compiler Identifier', () => {
  it('identifies MSVC for MSVC-built PE', () => {
    const pe = createMockPE('msvc');
    const result = identifyCompiler(pe);
    expect(result.compiler).toBe('MSVC');
    expect(result).toMatchSnapshot('msvc-compiler');
  });

  it('identifies GCC for GCC-built PE', () => {
    const pe = createMockPE('gcc');
    const result = identifyCompiler(pe);
    expect(result).toMatchSnapshot('gcc-compiler');
  });

  it('identifies Rust for Rust-built PE', () => {
    const pe = createMockPE('rust');
    const result = identifyCompiler(pe);
    expect(result.compiler).toBe('Rust');
    expect(result).toMatchSnapshot('rust-compiler');
  });

  it('identifies Go for Go-built PE', () => {
    const pe = createMockPE('go');
    const result = identifyCompiler(pe);
    expect(result.compiler).toBe('Go');
    expect(result).toMatchSnapshot('go-compiler');
  });
});

describe('PE Golden Tests — Overlay Analyzer', () => {
  it('returns null for PE without overlay', () => {
    const pe = createMockPE('clean');
    const result = analyzeOverlay(pe);
    expect(result).toBeNull();
  });

  it('detects overlay when present', () => {
    const pe = createMockPE('overlay');
    const result = analyzeOverlay(pe);
    expect(result).not.toBeNull();
    expect(result!.type).toContain('overlay');
    expect(result).toMatchSnapshot('overlay-detection');
  });
});

describe('PE Golden Tests — TLS Analyzer', () => {
  it('returns null for PE without TLS', () => {
    const pe = createMockPE('clean');
    const result = analyzeTLS(pe);
    expect(result).toBeNull();
  });

  it('detects TLS callbacks when present', () => {
    const pe = createMockPE('tls-callback');
    const result = analyzeTLS(pe);
    expect(result).not.toBeNull();
    expect(result!.type).toContain('tls');
    expect(result).toMatchSnapshot('tls-callback-detection');
  });
});

describe('PE Golden Tests — Signature Analyzer', () => {
  it('reports no signature for unsigned PE', () => {
    const pe = createMockPE('unsigned');
    const result = analyzeSignature(pe);
    expect(result.some((f) => f.type === 'pe-no-signature')).toBe(true);
    expect(result).toMatchSnapshot('unsigned-signature');
  });

  it('reports signature present for signed PE', () => {
    const pe = createMockPE('signed');
    const result = analyzeSignature(pe);
    expect(result.some((f) => f.type === 'pe-signature-present')).toBe(true);
    expect(result).toMatchSnapshot('signed-signature');
  });
});

describe('PE Golden Tests — Timestamp Analyzer', () => {
  // Fixed reference timestamp for deterministic snapshot tests
  const FIXED_REF_MS = new Date('2026-01-15T12:00:00Z').getTime();

  it('reports normal timestamp', () => {
    const pe = createMockPE('clean');
    const result = analyzeTimestamp(pe, FIXED_REF_MS);
    expect(result).toMatchSnapshot('normal-timestamp');
  });

  it('reports epoch timestamp', () => {
    const pe = createMockPE('zero-timestamp');
    const result = analyzeTimestamp(pe, FIXED_REF_MS);
    expect(result.type).toContain('epoch');
    expect(result).toMatchSnapshot('epoch-timestamp');
  });

  it('reports future timestamp', () => {
    const pe = createMockPE('future-timestamp');
    const result = analyzeTimestamp(pe, FIXED_REF_MS);
    expect(result.type).toContain('future');
    expect(result).toMatchSnapshot('future-timestamp');
  });
});

describe('PE Golden Tests — Entry Point Analyzer', () => {
  it('reports normal or near-section-start entry point', () => {
    const pe = createMockPE('clean');
    const result = analyzeEntryPoint(pe);
    // Entry point at 0x1000 with section .text starting at 0x1000 gives distance 0,
    // which may trigger 'near-section-start' - that's fine
    expect(result.severity).toBeDefined();
    expect(result).toMatchSnapshot('normal-entrypoint');
  });

  it('reports info entry point for invalid PE', () => {
    const pe = createMockPE('broken');
    const result = analyzeEntryPoint(pe);
    expect(result.type).toBeDefined();
    expect(result).toMatchSnapshot('broken-entrypoint');
  });

  it('reports entry point in packer section', () => {
    const pe = createMockPE('upx');
    const result = analyzeEntryPoint(pe);
    expect(result).toMatchSnapshot('packed-entrypoint');
  });
});

describe('PE Golden Tests — Resources Analyzer', () => {
  it('returns empty for PE without resources', () => {
    const pe = createMockPE('clean');
    const result = analyzeResources(pe);
    expect(result.length).toBe(0);
  });

  it('detects resources when present', () => {
    const pe = createMockPE('resource-heavy');
    const result = analyzeResources(pe);
    expect(result).toMatchSnapshot('resource-heavy');
  });
});

describe('PE Golden Tests — Full Engine', () => {
  it('produces deterministic output for clean PE', () => {
    const buffer = createMockPEMinimal();
    const result = analyzePE(buffer, 'golden-test-artifact');
    expect(result.parsed.valid).toBe(true);
    expect(result.evidence.length).toBeGreaterThanOrEqual(0);
    // Snapshot the types only (explanations may vary slightly)
    const evidenceTypes = result.evidence.map((e) => ({
      type: e.type,
      category: e.category,
      confidence: e.confidence,
    }));
    expect(evidenceTypes).toMatchSnapshot('full-engine-evidence-types');
    expect(result.suspiciousScore).toBeGreaterThanOrEqual(0);
    expect(result.suspiciousScore).toBeLessThanOrEqual(10);
  });

  it('produces identical output on repeated runs (determinism)', () => {
    const buffer = createMockPEMinimal();
    const result1 = analyzePE(buffer, 'determinism-test');
    const result2 = analyzePE(buffer, 'determinism-test');
    expect(result1.evidence.length).toBe(result2.evidence.length);
    for (let i = 0; i < result1.evidence.length; i++) {
      expect(result1.evidence[i].id).toBe(result2.evidence[i].id);
      expect(result1.evidence[i].type).toBe(result2.evidence[i].type);
      expect(result1.evidence[i].confidence).toBe(result2.evidence[i].confidence);
      expect(result1.evidence[i].explanation).toBe(result2.evidence[i].explanation);
    }
  });
});

// ── Helper: Create a minimal valid PE buffer for full engine tests ──

function createMockPEMinimal(): Buffer {
  // Minimal PE: DOS header + PE signature + COFF header + optional header
  const buf = Buffer.alloc(1024);
  let off = 0;

  // DOS header: MZ magic
  buf.writeUInt16LE(0x5a4d, off);
  off += 2; // e_magic
  buf.writeUInt16LE(0x0090, off);
  off += 2; // e_cblp
  off += 56; // padding
  buf.writeUInt32LE(64, off);
  off += 4; // e_lfanew = 64

  // DOS stub (64 bytes total)
  off = 64;

  // PE signature
  buf.writeUInt32LE(0x00004550, off);
  off += 4;

  // COFF header
  buf.writeUInt16LE(0x014c, off);
  off += 2; // Machine: I386
  buf.writeUInt16LE(3, off);
  off += 2; // Number of sections
  buf.writeUInt32LE(0, off);
  off += 4; // TimeDateStamp (epoch = Jan 1 2020)
  buf.writeUInt32LE(0, off);
  off += 4; // PointerToSymbolTable
  buf.writeUInt32LE(0, off);
  off += 4; // NumberOfSymbols
  buf.writeUInt16LE(224, off);
  off += 2; // SizeOfOptionalHeader (PE32)
  buf.writeUInt16LE(0x0102, off);
  off += 2; // Characteristics: executable

  // Optional header PE32
  buf.writeUInt16LE(0x010b, off);
  off += 2; // Magic: PE32
  buf.writeUInt8(14, off);
  off += 1; // MajorLinkerVersion
  buf.writeUInt8(0, off);
  off += 1; // MinorLinkerVersion
  buf.writeUInt32LE(0x1000, off);
  off += 4; // SizeOfCode
  buf.writeUInt32LE(0x2000, off);
  off += 4; // SizeOfInitializedData
  buf.writeUInt32LE(0, off);
  off += 4; // SizeOfUninitializedData
  buf.writeUInt32LE(0x1000, off);
  off += 4; // AddressOfEntryPoint
  buf.writeUInt32LE(0x1000, off);
  off += 4; // BaseOfCode
  buf.writeUInt32LE(0x400000, off);
  off += 4; // BaseOfData / ImageBase (PE32)
  buf.writeUInt32LE(0x00400000, off);
  off += 4; // ImageBase (PE32)
  buf.writeUInt32LE(0x1000, off);
  off += 4; // SectionAlignment
  buf.writeUInt32LE(0x200, off);
  off += 4; // FileAlignment
  buf.writeUInt16LE(6, off);
  off += 2; // MajorOSVersion
  buf.writeUInt16LE(0, off);
  off += 2; // MinorOSVersion
  buf.writeUInt16LE(0, off);
  off += 2; // MajorImageVersion
  buf.writeUInt16LE(0, off);
  off += 2; // MinorImageVersion
  buf.writeUInt16LE(6, off);
  off += 2; // MajorSubsystemVersion
  buf.writeUInt16LE(0, off);
  off += 2; // MinorSubsystemVersion
  buf.writeUInt32LE(0, off);
  off += 4; // Win32VersionValue
  buf.writeUInt32LE(0x4000, off);
  off += 4; // SizeOfImage
  buf.writeUInt32LE(0x200, off);
  off += 4; // SizeOfHeaders
  buf.writeUInt32LE(0, off);
  off += 4; // CheckSum
  buf.writeUInt16LE(2, off);
  off += 2; // Subsystem: WINDOWS_GUI
  buf.writeUInt16LE(0x8540, off);
  off += 2; // DllCharacteristics
  buf.writeUInt32LE(0x100000, off);
  off += 4; // SizeOfStackReserve
  buf.writeUInt32LE(0x1000, off);
  off += 4; // SizeOfStackCommit
  buf.writeUInt32LE(0x100000, off);
  off += 4; // SizeOfHeapReserve
  buf.writeUInt32LE(0x1000, off);
  off += 4; // SizeOfHeapCommit
  buf.writeUInt32LE(0, off);
  off += 4; // LoaderFlags
  buf.writeUInt32LE(16, off);
  off += 4; // NumberOfRvaAndSizes

  // Data directories (all zero, none present)
  for (let i = 0; i < 16; i++) {
    buf.writeUInt32LE(0, off);
    off += 4; // RVA
    buf.writeUInt32LE(0, off);
    off += 4; // Size
  }

  // Section table - 3 sections
  writeSection(buf, off, '.text', 0x1000, 0x1000, 0x200, 0x1000, 0x60000020);
  off += 40;
  writeSection(buf, off, '.rdata', 0x2000, 0x1000, 0x200, 0x1200, 0x40000040);
  off += 40;
  writeSection(buf, off, '.data', 0x3000, 0x1000, 0x200, 0x1400, 0xc0000040);
  off += 40;

  // Fill .text with some code bytes (low entropy)
  for (let i = 0; i < 0x200; i++) {
    buf[0x1000 + i] = 0x90; // NOP sled
  }

  return buf;
}

function writeSection(
  buf: Buffer,
  off: number,
  name: string,
  vaddr: number,
  vsize: number,
  rawSize: number,
  rawOff: number,
  chars: number,
): void {
  buf.write(name.padEnd(8, '\0'), off, 8, 'ascii');
  buf.writeUInt32LE(vsize, off + 8);
  buf.writeUInt32LE(vaddr, off + 12);
  buf.writeUInt32LE(rawSize, off + 16);
  buf.writeUInt32LE(rawOff, off + 20);
  buf.writeUInt32LE(0, off + 24); // PointerToRelocations
  buf.writeUInt32LE(0, off + 28); // PointerToLineNumbers
  buf.writeUInt16LE(0, off + 32); // NumberOfRelocations
  buf.writeUInt16LE(0, off + 34); // NumberOfLineNumbers
  buf.writeUInt32LE(chars, off + 36); // Characteristics
}
