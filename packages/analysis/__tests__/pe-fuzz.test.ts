/**
 * Fuzz Tests for PE Parser — ensures no crashes on malformed input.
 *
 * Tests various forms of invalid/broken PE data to verify the parser
 * handles errors gracefully without crashing.
 *
 * @module @veris/analysis/__tests__/pe-fuzz
 */

import { describe, it, expect } from 'vitest';
import { parsePE, computeEntropy, rvaToOffset, isSuspiciousSectionName } from '../src/pe/parser.js';

describe('PE Fuzz Tests — Malformed Inputs', () => {
  it('handles empty buffer gracefully', () => {
    const result = parsePE(Buffer.alloc(0));
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('handles tiny buffer gracefully', () => {
    const result = parsePE(Buffer.alloc(10));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('small');
  });

  it('handles buffer smaller than minimum PE size', () => {
    const result = parsePE(Buffer.alloc(63));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('64');
  });

  it('handles invalid DOS magic gracefully', () => {
    const buf = Buffer.alloc(128);
    buf.writeUInt16LE(0x0000, 0); // Invalid MZ magic
    const result = parsePE(buf);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('DOS');
  });

  it('handles reversed DOS magic gracefully', () => {
    const buf = Buffer.alloc(128);
    buf.writeUInt16LE(0x4d5a, 0); // ZM instead of MZ
    const result = parsePE(buf);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('DOS');
  });

  it('handles PE signature offset beyond file gracefully', () => {
    const buf = Buffer.alloc(256);
    buf.writeUInt16LE(0x5a4d, 0); // MZ
    buf.writeUInt32LE(0x3c, 200); // e_lfanew points beyond file (200 > 64)
    const result = parsePE(buf);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('handles invalid PE signature gracefully', () => {
    const buf = Buffer.alloc(256);
    buf.writeUInt16LE(0x5a4d, 0); // MZ
    buf.writeUInt32LE(0x3c, 64); // e_lfanew = 64
    buf.writeUInt32LE(0x00000000, 64); // Invalid PE signature
    const result = parsePE(buf);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('PE signature');
  });

  it('handles invalid optional header magic gracefully', () => {
    const buf = createValidPEBase();
    buf.writeUInt16LE(0x0000, 88); // Invalid optional header magic
    const result = parsePE(buf);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('optional header magic');
  });

  it('handles huge number of sections gracefully', () => {
    const buf = createValidPEBase();
    buf.writeUInt16LE(9999, 70); // numberOfSections = 9999
    const result = parsePE(buf);
    expect(result.valid).toBe(true); // Should cap at 100
    expect(result).toBeDefined();
  });

  it('handles zero sections gracefully', () => {
    const buf = createValidPEBase();
    buf.writeUInt16LE(0, 70); // numberOfSections = 0
    const result = parsePE(buf);
    expect(result.valid).toBe(true);
    expect(result.sections.length).toBe(0);
  });

  it('handles negative number of sections gracefully', () => {
    const buf = createValidPEBase();
    buf.writeUInt16LE(0xffff, 70); // numberOfSections = 65535 (max uint16)
    const result = parsePE(buf);
    // Should not crash; sections will be capped
    expect(result).toBeDefined();
  });

  it('handles corrupted section table gracefully', () => {
    const buf = createValidPEBase();
    // Corrupt section table area
    for (let i = 0; i < 120; i++) {
      buf[248 + i] = 0xff; // Fill with garbage
    }
    const result = parsePE(buf);
    expect(result).toBeDefined();
    // Should not crash
  });

  it('handles deterministic byte sequences gracefully', () => {
    // Generate deterministic buffers and ensure no crashes
    for (let size = 64; size <= 512; size += 32) {
      const buf = Buffer.alloc(size);
      for (let i = 0; i < size; i++) {
        buf[i] = (i * 137 + 251) & 0xff; // Deterministic pseudo-random pattern
      }
      const result = parsePE(buf);
      // Should never throw, just return valid=false
      expect(result).toBeDefined();
      expect(typeof result.valid).toBe('boolean');
    }
  });

  it('handles all-zeros buffer of various sizes', () => {
    for (const size of [64, 128, 256, 512, 1024]) {
      const buf = Buffer.alloc(size, 0);
      const result = parsePE(buf);
      expect(result).toBeDefined();
    }
  });

  it('handles all-ones buffer', () => {
    const buf = Buffer.alloc(512, 0xff);
    const result = parsePE(buf);
    expect(result).toBeDefined();
  });

  it('handles sequential byte buffer', () => {
    const buf = Buffer.alloc(256);
    for (let i = 0; i < 256; i++) buf[i] = i;
    const result = parsePE(buf);
    expect(result).toBeDefined();
  });

  it('handles buffer with only PE signature and nothing else', () => {
    const buf = Buffer.alloc(68);
    buf.writeUInt16LE(0x5a4d, 0); // MZ
    buf.writeUInt32LE(0x3c, 64); // e_lfanew
    buf.writeUInt32LE(0x00004550, 64); // PE\0\0
    // No COFF or optional header
    const result = parsePE(buf);
    expect(result).toBeDefined();
  });

  it('handles missing data directories gracefully', () => {
    const buf = createValidPEBase();
    // Set numberOfRvaAndSizes to 0 (offset in optional header PE32: 96 bytes from optional header start)
    // The optional header starts at offset 88 (64 + 4 + 20)
    const optHeaderOffset = 88;
    buf.writeUInt32LE(0, optHeaderOffset + 96);
    const result = parsePE(buf);
    expect(result).toBeDefined();
  });

  it('handles sections with huge raw sizes gracefully', () => {
    const buf = createValidPEBase();
    // Make section 0 have huge raw size
    buf.writeUInt32LE(0x7fffffff, 248 + 16); // rawSize
    const result = parsePE(buf);
    expect(result).toBeDefined();
  });
});

describe('PE Fuzz Tests — Utility Functions', () => {
  it('computeEntropy handles empty data', () => {
    expect(computeEntropy(Buffer.alloc(0))).toBe(0);
  });

  it('computeEntropy handles single-byte data', () => {
    expect(computeEntropy(Buffer.from([0x42]))).toBe(0);
  });

  it('computeEntropy handles uniform data', () => {
    const data = Buffer.alloc(256, 0x41);
    expect(computeEntropy(data)).toBe(0);
  });

  it('computeEntropy handles maximum entropy data', () => {
    const data = Buffer.alloc(256);
    for (let i = 0; i < 256; i++) data[i] = i;
    const entropy = computeEntropy(data);
    expect(entropy).toBeGreaterThan(7.5);
    expect(entropy).toBeLessThanOrEqual(8.0);
  });

  it('rvaToOffset returns -1 for no sections', () => {
    expect(rvaToOffset(0x1000, [])).toBe(-1);
  });

  it('rvaToOffset returns -1 for invalid RVA', () => {
    const sections = [{ virtualAddress: 0x1000, virtualSize: 0x1000, rawOffset: 0x200 } as any];
    expect(rvaToOffset(0x0000, sections)).toBe(-1);
  });

  it('isSuspiciousSectionName returns true for non-standard names', () => {
    expect(isSuspiciousSectionName('UPX0')).toBe(true);
    expect(isSuspiciousSectionName('.themida')).toBe(true);
    expect(isSuspiciousSectionName('CUSTOM')).toBe(true);
  });

  it('isSuspiciousSectionName returns false for standard names', () => {
    expect(isSuspiciousSectionName('.text')).toBe(false);
    expect(isSuspiciousSectionName('.data')).toBe(false);
    expect(isSuspiciousSectionName('.rdata')).toBe(false);
  });
});

// ── Helper ──

function createValidPEBase(): Buffer {
  const buf = Buffer.alloc(512);
  let off = 0;

  // DOS header
  buf.writeUInt16LE(0x5a4d, off);
  off += 2;
  buf.writeUInt16LE(0x0090, off);
  off += 2;
  off += 56;
  buf.writeUInt32LE(64, off);
  off += 4; // e_lfanew

  // DOS stub (pad to 64 bytes)
  off = 64;

  // PE signature
  buf.writeUInt32LE(0x00004550, off);
  off += 4;

  // COFF header
  buf.writeUInt16LE(0x014c, off);
  off += 2; // Machine: I386
  buf.writeUInt16LE(3, off);
  off += 2; // NumberOfSections
  buf.writeUInt32LE(0, off);
  off += 4; // TimeDateStamp
  buf.writeUInt32LE(0, off);
  off += 4;
  buf.writeUInt32LE(0, off);
  off += 4;
  buf.writeUInt16LE(224, off);
  off += 2; // SizeOfOptionalHeader
  buf.writeUInt16LE(0x0102, off);
  off += 2; // Characteristics

  // Optional header PE32 (minimal)
  for (let i = 0; i < 224; i++) {
    buf[off + i] = 0;
  }
  buf.writeUInt16LE(0x010b, off); // PE32 magic
  buf.writeUInt32LE(0x1000, off + 16); // AddressOfEntryPoint
  buf.writeUInt32LE(0x1000, off + 32); // SectionAlignment
  buf.writeUInt32LE(0x200, off + 36); // FileAlignment
  buf.writeUInt32LE(0x4000, off + 56); // SizeOfImage
  buf.writeUInt32LE(0x200, off + 60); // SizeOfHeaders
  buf.writeUInt16LE(2, off + 68); // Subsystem
  buf.writeUInt32LE(16, off + 96); // NumberOfRvaAndSizes

  // Data directories (16 empty)
  for (let i = 0; i < 16; i++) {
    buf.writeUInt32LE(0, off + 100 + i * 8);
    buf.writeUInt32LE(0, off + 104 + i * 8);
  }

  return buf;
}
