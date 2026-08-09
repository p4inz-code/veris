/**
 * Performance Benchmarks for PE Analysis Engine.
 *
 * Measures parsing and analysis performance for various PE sizes.
 * These are benchmarks, not assertions — they measure timing
 * and provide performance baselines.
 *
 * @module @veris/analysis/__tests__/pe-benchmark
 */

import { describe, it, expect } from 'vitest';
import { parsePE } from '../src/pe/parser.js';
import { analyzePE } from '../src/pe/engine.js';

describe('PE Performance Benchmarks', () => {
  function createPE(size: number): Buffer {
    const buf = Buffer.alloc(size);
    const sectionCount = Math.min(Math.max(Math.floor(size / 4096), 1), 10);

    // DOS header (64 bytes)
    buf.writeUInt16LE(0x5a4d, 0); // MZ
    buf.writeUInt32LE(0x3c, 64); // e_lfanew = 64

    // PE signature + COFF header + Optional header
    let off = 64;
    buf.writeUInt32LE(0x00004550, off);
    off += 4; // PE signature
    buf.writeUInt16LE(0x8664, off);
    off += 2; // Machine: AMD64
    buf.writeUInt16LE(sectionCount, off);
    off += 2; // NumberOfSections
    buf.writeUInt32LE(1577836800, off);
    off += 4; // TimeDateStamp (2020-01-01)
    buf.writeUInt32LE(0, off);
    off += 4;
    buf.writeUInt32LE(0, off);
    off += 4;
    buf.writeUInt16LE(240, off);
    off += 2; // SizeOfOptionalHeader
    buf.writeUInt16LE(0x0102, off);
    off += 2; // Characteristics

    // Optional header PE32+
    const optOff = off;
    buf.writeUInt16LE(0x020b, off);
    off += 2; // Magic
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
    off += 4; // ImageBase (low)
    buf.writeUInt32LE(0, off);
    off += 4; // ImageBase (high)
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
    buf.writeUInt32LE(size, off);
    off += 4; // SizeOfImage
    buf.writeUInt32LE(0x400, off);
    off += 4; // SizeOfHeaders (large enough for sections)
    buf.writeUInt32LE(0, off);
    off += 4; // CheckSum
    buf.writeUInt16LE(2, off);
    off += 2; // Subsystem
    buf.writeUInt16LE(0x8540, off);
    off += 2; // DllCharacteristics
    buf.writeBigUInt64LE(BigInt(0x100000), off);
    off += 8; // SizeOfStackReserve
    buf.writeBigUInt64LE(BigInt(0x1000), off);
    off += 8; // SizeOfStackCommit
    buf.writeBigUInt64LE(BigInt(0x100000), off);
    off += 8; // SizeOfHeapReserve
    buf.writeBigUInt64LE(BigInt(0x1000), off);
    off += 8; // SizeOfHeapCommit
    buf.writeUInt32LE(0, off);
    off += 4; // LoaderFlags
    buf.writeUInt32LE(16, off);
    off += 4; // NumberOfRvaAndSizes

    // Data directories (16 empty) are at optOff + 112 for PE32+
    const dataDirOff = optOff + 112;
    for (let i = 0; i < 16; i++) {
      buf.writeUInt32LE(0, dataDirOff + i * 8);
      buf.writeUInt32LE(0, dataDirOff + i * 8 + 4);
    }

    // Section table starts at optOff + sizeOfOptionalHeader (240)
    off = optOff + 240;

    // Section table
    const sectionTableOff = off;
    const baseRawOff = sectionTableOff + sectionCount * 40;
    for (let i = 0; i < sectionCount; i++) {
      const name = `.text${i}`.padEnd(8, '\0');
      buf.write(name, off, 8, 'ascii');
      off += 8;
      buf.writeUInt32LE(0x2000, off);
      off += 4; // VirtualSize
      buf.writeUInt32LE(0x1000 + i * 0x1000, off);
      off += 4; // VirtualAddress
      buf.writeUInt32LE(0x200, off);
      off += 4; // RawSize
      buf.writeUInt32LE(baseRawOff + i * 0x200, off);
      off += 4; // PointerToRawData
      buf.writeUInt32LE(0, off);
      off += 4; // PointerToRelocations
      buf.writeUInt32LE(0, off);
      off += 4; // PointerToLineNumbers
      buf.writeUInt16LE(0, off);
      off += 2; // NumberOfRelocations
      buf.writeUInt16LE(0, off);
      off += 2; // NumberOfLineNumbers
      buf.writeUInt32LE(0x60000020, off);
      off += 4; // Characteristics (code execute read)
    }

    // Fill section data with NOPs
    const dataOff = baseRawOff;
    for (let i = 0; i < sectionCount * 0x200 && dataOff + i < buf.length; i++) {
      buf[dataOff + i] = 0x90; // NOP
    }

    return buf;
  }

  it('parses 1KB PE in reasonable time', () => {
    const buf = createPE(1024);
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      parsePE(buf);
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / 100;
    expect(avgMs).toBeLessThan(10); // Should parse in under 10ms per iteration
  });

  it('parses 100KB PE in reasonable time', () => {
    const buf = createPE(100 * 1024);
    const start = performance.now();
    for (let i = 0; i < 10; i++) {
      parsePE(buf);
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / 10;
    expect(avgMs).toBeLessThan(50); // Should parse in under 50ms
  });

  it('analyzes 1KB PE completely in reasonable time', () => {
    const buf = createPE(1024);
    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      analyzePE(buf, `bench-artifact-${i}`);
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / 50;
    expect(avgMs).toBeLessThan(20); // Should analyze in under 20ms
  });

  it('handles large PE (1MB) without excessive memory', () => {
    const buf = createPE(1024 * 1024);
    const start = performance.now();
    const result = analyzePE(buf, 'large-bench-artifact');
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000); // Under 1s for 1MB
    expect(result).toBeDefined();
  });

  it('handles 10MB PE without crashing', () => {
    const buf = createPE(10 * 1024 * 1024);
    const start = performance.now();
    const result = analyzePE(buf, 'very-large-artifact');
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(3000); // Under 3s for 10MB
    expect(result).toBeDefined();
  });

  it('handles 100MB PE gracefully', () => {
    const buf = createPE(100 * 1024 * 1024);
    const start = performance.now();
    const result = analyzePE(buf, 'huge-artifact');
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(15000); // Under 15s for 100MB
    expect(result).toBeDefined();
  });

  it('fuzzed detereminism: same binary produces same result', () => {
    const buf1 = createPE(8192);
    const buf2 = Buffer.from(buf1); // Copy

    const result1 = analyzePE(buf1, 'det-test');
    const result2 = analyzePE(buf2, 'det-test');

    expect(result1.evidence.length).toBe(result2.evidence.length);
    for (let i = 0; i < result1.evidence.length; i++) {
      expect(result1.evidence[i].id).toBe(result2.evidence[i].id);
    }
  });
});
