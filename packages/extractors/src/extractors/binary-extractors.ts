/**
 * Binary executable extractors for PE, ELF, and Mach-O formats.
 *
 * Each extractor detects the respective binary format and extracts
 * deterministic metadata: sections, imports, exports, symbols, etc.
 *
 * @module @veris/extractors/extractors/binary-extractors
 */

import { BaseExtractor } from '../base-extractor.js';
import type { ExtractionContext, ExtractionResult } from '../types.js';
import { createRawFeature } from '../types.js';

// ─── PE Extractor ───────────────────────────────────────────────

/** PE header offsets and constants. */
const PE_MAGIC_OFFSET = 0x3c; // Offset to PE signature pointer
const PE_SIGNATURE = 0x00004550; // "PE\0\0"

/**
 * Extracts metadata from PE (Portable Executable) files.
 * Supports both PE32 and PE32+ formats.
 */
export class PEExtractor extends BaseExtractor {
  constructor() {
    super({
      id: 'pe-extractor',
      name: 'PE Extractor',
      version: '0.1.0',
      supportedArtifactTypes: ['executable', 'file'],
      priority: 100,
    });
  }

  canExtract(context: ExtractionContext): boolean {
    if (!context.content || context.content.length < 64) return false;
    // Check DOS header MZ magic
    if (context.content[0] !== 0x4d || context.content[1] !== 0x5a) return false;
    const peOffset = context.content.readUInt32LE(PE_MAGIC_OFFSET);
    if (peOffset + 4 > context.content.length) return false;
    return context.content.readUInt32LE(peOffset) === PE_SIGNATURE;
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const buffer = context.content!;
    const startTime = Date.now();
    const features: ReturnType<typeof createRawFeature>[] = [];
    const issues: import('../types.js').ExtractionIssue[] = [];

    try {
      const peOffset = buffer.readUInt32LE(PE_MAGIC_OFFSET);
      const coffOffset = peOffset + 4;

      // COFF header
      const machine = buffer.readUInt16LE(coffOffset);
      const sections = buffer.readUInt16LE(coffOffset + 2);
      const characteristics = buffer.readUInt16LE(coffOffset + 18);

      const machineNames: Record<number, string> = {
        0x014c: 'I386',
        0x8664: 'AMD64',
        0x01c4: 'ARMNT',
        0xaa64: 'ARM64',
        0x0200: 'IA64',
        0x01c2: 'ARM',
        0x01c0: 'ARM Thumb',
        0x01c1: 'ARM Thumb',
      };

      // Optional header
      const optHeaderOffset = coffOffset + 20;
      const optMagic = buffer.readUInt16LE(optHeaderOffset);
      const isPE32Plus = optMagic === 0x020b;

      let imageBase: number;
      let entryPoint: number;
      let sizeOfImage: number;
      let sizeOfCode: number;

      if (isPE32Plus) {
        imageBase = Number(buffer.readBigUInt64LE(optHeaderOffset + 24));
        entryPoint = buffer.readUInt32LE(optHeaderOffset + 16);
        sizeOfImage = buffer.readUInt32LE(optHeaderOffset + 56);
        sizeOfCode = buffer.readUInt32LE(optHeaderOffset + 20);
      } else {
        imageBase = buffer.readUInt32LE(optHeaderOffset + 28);
        entryPoint = buffer.readUInt32LE(optHeaderOffset + 16);
        sizeOfImage = buffer.readUInt32LE(optHeaderOffset + 56);
        sizeOfCode = buffer.readUInt32LE(optHeaderOffset + 20);
      }

      // Emit PE header metadata
      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'pe-header',
          value: {
            machine: machineNames[machine] ?? `0x${machine.toString(16)}`,
            imageBase,
            entryPoint,
            sizeOfImage,
            sizeOfCode,
            isPE32Plus,
            numberOfSections: sections,
            characteristics,
          },
          confidence: 1.0,
          metadata: { format: 'pe' },
        }),
      );

      // Parse section table
      const sectionTableOffset = isPE32Plus ? optHeaderOffset + 240 : optHeaderOffset + 224;

      for (let i = 0; i < sections; i++) {
        const sectionOffset = sectionTableOffset + i * 40;
        if (sectionOffset + 40 > buffer.length) break;

        const name = buffer.toString('ascii', sectionOffset, sectionOffset + 8).replace(/\0/g, '');
        const virtualSize = buffer.readUInt32LE(sectionOffset + 8);
        const virtualAddress = buffer.readUInt32LE(sectionOffset + 12);
        const rawSize = buffer.readUInt32LE(sectionOffset + 16);
        const rawOffset = buffer.readUInt32LE(sectionOffset + 20);
        const sectionChars = buffer.readUInt32LE(sectionOffset + 36);

        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'pe-section',
            value: {
              name,
              virtualSize,
              virtualAddress,
              rawSize,
              rawOffset,
              characteristics: sectionChars,
            },
            confidence: 1.0,
            metadata: { sectionIndex: i },
          }),
        );

        // Compute section entropy if content available
        if (rawSize > 0 && rawOffset + rawSize <= buffer.length) {
          const sectionData = buffer.subarray(rawOffset, rawOffset + rawSize);
          const entropy = this._computeShannonEntropy(sectionData);
          features.push(
            createRawFeature({
              extractorId: this.id,
              type: 'section-entropy',
              value: entropy,
              confidence: 1.0,
              metadata: { section: name, offset: rawOffset, size: rawSize },
            }),
          );
        }
      }

      // Parse import directory
      const importFeatures = this._parseImportDirectory(
        buffer,
        peOffset,
        optHeaderOffset,
        isPE32Plus,
      );
      features.push(...importFeatures);
    } catch (error) {
      issues.push(
        this.error(
          'PE_PARSE_ERROR',
          `Failed to parse PE: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(features, {
      bytesProcessed: buffer.length,
      startTime,
      endTime,
      issues,
    });
  }

  private _parseImportDirectory(
    buffer: Buffer,
    peOffset: number,
    optHeaderOffset: number,
    isPE32Plus: boolean,
  ): ReturnType<typeof createRawFeature>[] {
    const features: ReturnType<typeof createRawFeature>[] = [];

    // Data directory is at a fixed offset in the optional header
    const dataDirOffset = isPE32Plus ? optHeaderOffset + 112 : optHeaderOffset + 96;
    const importRva = buffer.readUInt32LE(dataDirOffset);
    const importSize = buffer.readUInt32LE(dataDirOffset + 4);

    if (importRva === 0 || importSize === 0) return features;

    // Find section that contains the import RVA
    const sectionTableOffset = isPE32Plus ? optHeaderOffset + 240 : optHeaderOffset + 224;
    let importFileOffset = -1;

    const numSections = buffer.readUInt16LE(peOffset + 4 + 2);
    for (let i = 0; i < numSections; i++) {
      const secOffset = sectionTableOffset + i * 40;
      if (secOffset + 40 > buffer.length) break;
      const va = buffer.readUInt32LE(secOffset + 12);
      const rawOffset = buffer.readUInt32LE(secOffset + 20);
      const vsize = buffer.readUInt32LE(secOffset + 8);
      if (importRva >= va && importRva < va + vsize) {
        importFileOffset = rawOffset + (importRva - va);
        break;
      }
    }

    if (importFileOffset < 0) return features;

    // Parse import descriptors (20 bytes each, ends with all zeros)
    let descOffset = importFileOffset;
    while (descOffset + 20 <= buffer.length) {
      const originalFirstThunk = buffer.readUInt32LE(descOffset);
      const nameRva = buffer.readUInt32LE(descOffset + 12);

      if (originalFirstThunk === 0 && nameRva === 0) break;

      // Resolve DLL name
      const dllName = this._rvaToString(buffer, nameRva, sectionTableOffset, numSections);

      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'pe-import',
          value: { dll: dllName },
          confidence: 1.0,
          metadata: { format: 'pe' },
        }),
      );

      descOffset += 20;
    }

    return features;
  }

  private _rvaToString(
    buffer: Buffer,
    rva: number,
    sectionTableOffset: number,
    numSections: number,
  ): string {
    for (let i = 0; i < numSections; i++) {
      const secOffset = sectionTableOffset + i * 40;
      if (secOffset + 40 > buffer.length) break;
      const va = buffer.readUInt32LE(secOffset + 12);
      const rawOffset = buffer.readUInt32LE(secOffset + 20);
      if (rva >= va && rva < va + buffer.readUInt32LE(secOffset + 8)) {
        const fileOffset = rawOffset + (rva - va);
        const end = buffer.indexOf(0, fileOffset);
        if (end < 0)
          return buffer.toString('utf-8', fileOffset, fileOffset + 256).replace(/\0/g, '');
        return buffer.toString('utf-8', fileOffset, end);
      }
    }
    return '';
  }

  private _computeShannonEntropy(data: Buffer): number {
    if (data.length === 0) return 0;
    const freq = new Float64Array(256);
    for (let i = 0; i < data.length; i++) freq[data[i]]++;
    let entropy = 0;
    for (let i = 0; i < 256; i++) {
      if (freq[i] > 0) {
        const p = freq[i] / data.length;
        entropy -= p * Math.log2(p);
      }
    }
    return Math.round(entropy * 1_000_000) / 1_000_000;
  }
}

// ─── ELF Extractor ──────────────────────────────────────────────

/**
 * Extracts metadata from ELF (Executable and Linkable Format) files.
 */
export class ELFExtractor extends BaseExtractor {
  constructor() {
    super({
      id: 'elf-extractor',
      name: 'ELF Extractor',
      version: '0.1.0',
      supportedArtifactTypes: ['executable', 'file'],
      priority: 100,
    });
  }

  canExtract(context: ExtractionContext): boolean {
    if (!context.content || context.content.length < 16) return false;
    // ELF magic: \x7f E L F
    return (
      context.content[0] === 0x7f &&
      context.content[1] === 0x45 && // E
      context.content[2] === 0x4c && // L
      context.content[3] === 0x46
    ); // F
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const buffer = context.content!;
    const startTime = Date.now();
    const features: ReturnType<typeof createRawFeature>[] = [];
    const issues: import('../types.js').ExtractionIssue[] = [];

    try {
      const is64Bit = buffer[4] === 2; // EI_CLASS
      const endian = buffer[5]; // EI_DATA (1 = LE, 2 = BE)
      const osabi = buffer[7];
      const type = buffer.readUInt16LE(16);

      const abiNames: Record<number, string> = {
        0: 'UNIX System V',
        3: 'Linux',
        9: 'FreeBSD',
        6: 'Solaris',
      };

      const typeNames: Record<number, string> = {
        0: 'NONE',
        1: 'REL (Relocatable)',
        2: 'EXEC (Executable)',
        3: 'DYN (Shared Object)',
        4: 'CORE (Core file)',
      };

      let machine: number;
      let entryPoint: number;
      let sectionOffset: number;
      let sectionCount: number;
      let sectionStringIndex: number;

      if (is64Bit) {
        machine = buffer.readUInt16LE(18);
        entryPoint = Number(buffer.readBigUInt64LE(24));
        sectionOffset = Number(buffer.readBigUInt64LE(40));
        sectionCount = buffer.readUInt16LE(60);
        sectionStringIndex = buffer.readUInt16LE(62);
      } else {
        machine = buffer.readUInt16LE(18);
        entryPoint = buffer.readUInt32LE(24);
        sectionOffset = buffer.readUInt32LE(32);
        sectionCount = buffer.readUInt16LE(48);
        sectionStringIndex = buffer.readUInt16LE(50);
      }

      const machineNames: Record<number, string> = {
        0x03: 'I386',
        0x3e: 'AMD64',
        0x28: 'ARM',
        0xb7: 'ARM64 (AArch64)',
        0x08: 'MIPS',
        0x14: 'PowerPC',
        0x15: 'PowerPC64',
        0x2d: 'IA-64',
        0xf3: 'RISC-V',
      };

      // ELF header metadata
      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'elf-header',
          value: {
            class: is64Bit ? 'ELF64' : 'ELF32',
            endian: endian === 1 ? 'little' : 'big',
            osabi: abiNames[osabi] ?? `unknown-${osabi}`,
            type: typeNames[type] ?? `unknown-${type}`,
            machine: machineNames[machine] ?? `0x${machine.toString(16)}`,
            entryPoint,
            sectionCount,
          },
          confidence: 1.0,
          metadata: { format: 'elf' },
        }),
      );

      // Parse sections
      const sectionHeaderSize = is64Bit ? 64 : 40;
      for (let i = 0; i < sectionCount; i++) {
        const secOffset = sectionOffset + i * sectionHeaderSize;
        if (secOffset + sectionHeaderSize > buffer.length) break;

        let nameOffset: number;
        let secType: number;
        let secAddr: number;
        let secSize: number;
        let secFlags: number;

        if (is64Bit) {
          nameOffset = buffer.readUInt32LE(secOffset);
          secType = buffer.readUInt32LE(secOffset + 4);
          secFlags = Number(buffer.readBigUInt64LE(secOffset + 8));
          secAddr = Number(buffer.readBigUInt64LE(secOffset + 16));
          secSize = Number(buffer.readBigUInt64LE(secOffset + 32));
        } else {
          nameOffset = buffer.readUInt32LE(secOffset);
          secType = buffer.readUInt32LE(secOffset + 4);
          secFlags = buffer.readUInt32LE(secOffset + 8);
          secAddr = buffer.readUInt32LE(secOffset + 12);
          secSize = buffer.readUInt32LE(secOffset + 20);
        }

        // Resolve section name from string table
        const strTableOffset = sectionOffset + sectionStringIndex * sectionHeaderSize;
        let strTableAddr: number;
        if (is64Bit) {
          strTableAddr = Number(buffer.readBigUInt64LE(strTableOffset + 24));
        } else {
          strTableAddr = buffer.readUInt32LE(strTableOffset + 16);
        }
        const name = this._readNullTerminated(buffer, strTableAddr + nameOffset, 64);

        const typeNames32: Record<number, string> = {
          0: 'NULL',
          1: 'PROGBITS',
          2: 'SYMTAB',
          3: 'STRTAB',
          4: 'RELA',
          5: 'HASH',
          6: 'DYNAMIC',
          7: 'NOTE',
          8: 'NOBITS',
          9: 'REL',
          11: 'DYNSYM',
        };

        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'elf-section',
            value: {
              name,
              type: typeNames32[secType] ?? `unknown-${secType}`,
              address: secAddr,
              size: secSize,
              flags: secFlags,
            },
            confidence: 1.0,
            metadata: { sectionIndex: i, format: 'elf' },
          }),
        );
      }

      // Parse dynamic symbols (simplified)
      const symFeatures = this._parseElfSymbols(
        buffer,
        sectionOffset,
        sectionCount,
        sectionHeaderSize,
        is64Bit,
      );
      features.push(...symFeatures);
    } catch (error) {
      issues.push(
        this.error(
          'ELF_PARSE_ERROR',
          `Failed to parse ELF: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(features, {
      bytesProcessed: buffer.length,
      startTime,
      endTime,
      issues,
    });
  }

  private _parseElfSymbols(
    buffer: Buffer,
    sectionOffset: number,
    sectionCount: number,
    sectionHeaderSize: number,
    is64Bit: boolean,
  ): ReturnType<typeof createRawFeature>[] {
    const features: ReturnType<typeof createRawFeature>[] = [];

    // Find DYNSYM and SYMTAB sections and their associated string tables
    for (let i = 0; i < sectionCount; i++) {
      const secOff = sectionOffset + i * sectionHeaderSize;
      if (secOff + sectionHeaderSize > buffer.length) break;

      const secType = is64Bit ? buffer.readUInt32LE(secOff + 4) : buffer.readUInt32LE(secOff + 4);

      if (secType !== 11 && secType !== 2) continue; // DYNSYM or SYMTAB

      const secSize = is64Bit
        ? Number(buffer.readBigUInt64LE(secOff + 32))
        : buffer.readUInt32LE(secOff + 20);
      const secAddr = is64Bit
        ? Number(buffer.readBigUInt64LE(secOff + 24))
        : buffer.readUInt32LE(secOff + 16);
      const link = buffer.readUInt32LE(secOff + (is64Bit ? 40 : 28));

      // Find linked string table
      if (link >= sectionCount) continue;
      const strSecOff = sectionOffset + link * sectionHeaderSize;
      let strTableAddr: number;
      if (is64Bit) {
        strTableAddr = Number(buffer.readBigUInt64LE(strSecOff + 24));
      } else {
        strTableAddr = buffer.readUInt32LE(strSecOff + 16);
      }

      const symSize = is64Bit ? 24 : 16;
      const symCount = Math.min(Math.floor(secSize / symSize), 1000); // Limit to 1000 symbols

      for (let j = 1; j < symCount; j++) {
        const symOff = secAddr + j * symSize;
        if (symOff + symSize > buffer.length) break;

        const nameOffset = is64Bit ? buffer.readUInt32LE(symOff) : buffer.readUInt32LE(symOff);

        const symValue = is64Bit
          ? Number(buffer.readBigUInt64LE(symOff + 8))
          : buffer.readUInt32LE(symOff + 4);

        const symSize_val = is64Bit
          ? Number(buffer.readBigUInt64LE(symOff + 16))
          : buffer.readUInt32LE(symOff + 8);

        const symInfo = is64Bit ? buffer[symOff + 4] : buffer[symOff + 12];
        const symOther = is64Bit ? buffer[symOff + 5] : buffer[symOff + 13];
        const symShndx = is64Bit
          ? buffer.readUInt16LE(symOff + 6)
          : buffer.readUInt16LE(symOff + 14);

        const bind = symInfo >> 4;
        const type = symInfo & 0x0f;
        const visibility = symOther & 0x03;

        const name = this._readNullTerminated(buffer, strTableAddr + nameOffset, 128);
        if (!name) continue;

        const bindNames: Record<number, string> = {
          0: 'LOCAL',
          1: 'GLOBAL',
          2: 'WEAK',
          3: 'GNU_UNIQUE',
        };

        const typeNames: Record<number, string> = {
          0: 'NOTYPE',
          1: 'OBJECT',
          2: 'FUNC',
          3: 'SECTION',
          4: 'FILE',
          5: 'COMMON',
          6: 'TLS',
        };

        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'elf-symbol',
            value: {
              name,
              value: symValue,
              size: symSize_val,
              bind: bindNames[bind] ?? `unknown-${bind}`,
              type: typeNames[type] ?? `unknown-${type}`,
              sectionIndex: symShndx,
            },
            confidence: 1.0,
            metadata: { format: 'elf' },
          }),
        );
      }
    }

    return features;
  }

  private _readNullTerminated(buffer: Buffer, offset: number, maxLen: number): string {
    if (offset >= buffer.length) return '';
    const end = buffer.indexOf(0, offset);
    if (end < 0 || end - offset > maxLen) {
      return buffer
        .toString('utf-8', offset, Math.min(offset + maxLen, buffer.length))
        .replace(/\0/g, '');
    }
    return buffer.toString('utf-8', offset, end);
  }
}

// ─── Mach-O Extractor ───────────────────────────────────────────

/**
 * Extracts metadata from Mach-O (Mach Object) files.
 * Supports both 32-bit and 64-bit formats for x86_64, ARM, and ARM64.
 */
export class MachOExtractor extends BaseExtractor {
  constructor() {
    super({
      id: 'macho-extractor',
      name: 'Mach-O Extractor',
      version: '0.1.0',
      supportedArtifactTypes: ['executable', 'file'],
      priority: 100,
    });
  }

  canExtract(context: ExtractionContext): boolean {
    if (!context.content || context.content.length < 8) return false;
    const magic = context.content.readUInt32LE(0);
    // Mach-O magic numbers (both LE and BE)
    const MAGICS = [0xfeedface, 0xcefaedfe, 0xfeedfacf, 0xcffaedfe, 0xcafebabe, 0xbebafeca];
    return MAGICS.includes(magic);
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const buffer = context.content!;
    const startTime = Date.now();
    const features: ReturnType<typeof createRawFeature>[] = [];
    const issues: import('../types.js').ExtractionIssue[] = [];

    try {
      const magic = buffer.readUInt32LE(0);
      const is64Bit = magic === 0xfeedfacf || magic === 0xcffaedfe;
      const isFat = magic === 0xcafebabe || magic === 0xbebafeca;

      if (isFat) {
        // Universal binary — just report that
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'macho-header',
            value: { format: 'universal-binary' },
            confidence: 1.0,
            metadata: { format: 'macho' },
          }),
        );
      } else {
        const isLittleEndian = magic === 0xcefaedfe || magic === 0xcffaedfe;
        const read32 = (offset: number) =>
          isLittleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);

        const cputype = read32(4);
        const cpusubtype = read32(8);
        const filetype = read32(12);
        const ncmds = read32(16);
        const sizeofcmds = read32(20);

        const cpuNames: Record<number, string> = {
          1: 'VAX',
          6: 'MC680x0',
          7: 'I386',
          8: 'X86_64',
          10: 'MC88000',
          11: 'MC98000',
          12: 'HPPA',
          13: 'ARM',
          14: 'MC88000',
          15: 'SPARC',
          16: 'I860',
          17: 'ALPHA',
          18: 'POWERPC',
          16777228: 'ARM64',
          16777234: 'ARM64_32',
        };

        const filetypeNames: Record<number, string> = {
          1: 'OBJECT',
          2: 'EXECUTE',
          3: 'FVMLIB',
          4: 'CORE',
          5: 'PRELOAD',
          6: 'DYLIB',
          7: 'DYLINKER',
          8: 'BUNDLE',
          9: 'DYLIB_STUB',
          10: 'DSYM',
          11: 'KEXT_BUNDLE',
        };

        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'macho-header',
            value: {
              cpuType: cpuNames[cputype] ?? `0x${cputype.toString(16)}`,
              cpuSubType: cpusubtype,
              fileType: filetypeNames[filetype] ?? `unknown-${filetype}`,
              commands: ncmds,
              commandsSize: sizeofcmds,
              is64Bit,
            },
            confidence: 1.0,
            metadata: { format: 'macho' },
          }),
        );

        // Parse load commands for sections and imports
        const cmdHeader = is64Bit ? 32 : 28;
        let cmdOffset = is64Bit ? 32 : 28;

        for (let i = 0; i < ncmds && cmdOffset + 8 <= buffer.length; i++) {
          const cmd = read32(cmdOffset);
          const cmdsize = read32(cmdOffset + 4);

          if (cmdsize < 8) break;

          // LC_SEGMENT (0x01) or LC_SEGMENT_64 (0x19) — parse sections
          if (cmd === 0x01 || cmd === 0x19) {
            const is64 = cmd === 0x19;
            const segHeaderSize = is64 ? 72 : 56;
            const sectionSize = is64 ? 80 : 68;

            if (cmdOffset + segHeaderSize > buffer.length) break;

            // Compute offsets explicitly to avoid ternary-in-expression issues
            const nsectsOffset = cmdOffset + (is64 ? 64 : 48);
            const nsects = read32(nsectsOffset);
            const segnameStart = cmdOffset + (is64 ? 8 : 8);
            const segnameEnd = cmdOffset + (is64 ? 24 : 24);
            const segname = buffer.toString('utf-8', segnameStart, segnameEnd).replace(/\0/g, '');

            for (let j = 0; j < nsects; j++) {
              const sectOffset = cmdOffset + segHeaderSize + j * sectionSize;
              if (sectOffset + sectionSize > buffer.length) break;

              const sectname = buffer
                .toString('utf-8', sectOffset, sectOffset + 16)
                .replace(/\0/g, '');
              const machoSectAddrOffset = sectOffset + 32;
              const machoSectSizeOffset = sectOffset + 36;
              const addr = is64
                ? Number(buffer.readBigUInt64LE(machoSectAddrOffset))
                : read32(machoSectAddrOffset);
              const size = is64
                ? Number(buffer.readBigUInt64LE(machoSectSizeOffset))
                : read32(machoSectSizeOffset);

              features.push(
                createRawFeature({
                  extractorId: this.id,
                  type: 'macho-section',
                  value: {
                    segment: segname,
                    section: sectname,
                    address: addr,
                    size,
                  },
                  confidence: 1.0,
                  metadata: { format: 'macho' },
                }),
              );
            }
          }

          cmdOffset += cmdsize;
        }
      }
    } catch (error) {
      issues.push(
        this.error(
          'MACHO_PARSE_ERROR',
          `Failed to parse Mach-O: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(features, {
      bytesProcessed: buffer.length,
      startTime,
      endTime,
      issues,
    });
  }
}
