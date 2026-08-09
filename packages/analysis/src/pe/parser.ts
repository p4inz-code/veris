/**
 * Raw PE (Portable Executable) binary parser.
 *
 * Parses PE files from raw Buffer data following the Microsoft PE/COFF
 * specification. Operates on both PE32 and PE32+ formats.
 *
 * This is a pure, deterministic parser — no I/O, no side effects.
 *
 * @module @veris/analysis/pe/parser
 */

import { deterministicId, sha256 } from '@veris/shared';

import {
  DOS_MAGIC,
  PE_SIGNATURE,
  PE_SIGNATURE_OFFSET_FIELD,
  COFF_HEADER_SIZE,
  MACHINE_NAMES,
  OPT_MAGIC_PE32,
  OPT_MAGIC_PE32_PLUS,
  OPT_HEADER_SIZE_PE32,
  OPT_HEADER_SIZE_PE32_PLUS,
  SECTION_HEADER_SIZE,
  SECTION_HEADER_SIZE as SCN_HEADER_SIZE,
  SCN_MEM_EXECUTE,
  SCN_MEM_READ,
  SCN_MEM_WRITE,
  SCN_IS_CODE,
  SCN_IS_INITIALIZED_DATA,
  SCN_MEM_DISCARDABLE,
  SCN_MEM_SHARED,
  IMAGE_DIRECTORY_ENTRY_IMPORT,
  IMAGE_DIRECTORY_ENTRY_EXPORT,
  IMAGE_DIRECTORY_ENTRY_TLS,
  IMAGE_DIRECTORY_ENTRY_RESOURCE,
  IMAGE_DIRECTORY_ENTRY_CERTIFICATE,
  IMAGE_DIRECTORY_ENTRY_BASERELOC,
  IMAGE_DIRECTORY_ENTRY_CLR_RUNTIME,
  IMAGE_DIRECTORY_ENTRY_IAT,
  SUBSYSTEM_NAMES,
  DATA_DIRECTORY_NAMES,
  RESOURCE_TYPE_NAMES,
  RT_VERSION,
  RT_MANIFEST,
  RT_ICON,
  RT_GROUP_ICON,
  RT_DIALOG,
  RT_STRING,
  RT_RCDATA,
  HIGH_ENTROPY_THRESHOLD,
} from './constants.js';
import type {
  PEParsed,
  MutablePEParsed,
  PESection,
  SectionCharacteristics,
  PEImport,
  PEExport,
  PEResource,
  PECertificate,
  PEOverlay,
  DataDirectory,
  TLSInfo,
  TLSCallback,
  CoffMachine,
  PEFormat,
} from './types.js';

// ── Helper: Read null-terminated string from buffer ──

function readCString(buffer: Buffer, offset: number, maxLen: number): string {
  if (offset >= buffer.length) return '';
  const end = buffer.indexOf(0, offset);
  const len = end >= 0 ? end - offset : Math.min(maxLen, buffer.length - offset);
  return buffer.toString('utf-8', offset, offset + len);
}

// ── PE Parser ──

/** Parse a PE file from raw buffer data. */
export function parsePE(buffer: Buffer, filePath?: string): PEParsed {
  const result: Partial<MutablePEParsed> = {};

  try {
    // Validate minimum size
    if (buffer.length < 64) {
      return { valid: false, error: 'File too small for PE format (min 64 bytes)' } as PEParsed;
    }

    // Check DOS header magic
    const dosMagic = buffer.readUInt16LE(0);
    if (dosMagic !== DOS_MAGIC) {
      return {
        valid: false,
        error: `Invalid DOS header magic: 0x${dosMagic.toString(16)}`,
      } as PEParsed;
    }

    result.dosStub = buffer.subarray(0, 64);
    result.e_lfanew = buffer.readUInt32LE(PE_SIGNATURE_OFFSET_FIELD);

    // Validate PE signature offset
    if (result.e_lfanew + 4 >= buffer.length) {
      return {
        valid: false,
        error: `PE signature offset (${result.e_lfanew}) beyond file bounds`,
      } as PEParsed;
    }

    result.peSignature = buffer.readUInt32LE(result.e_lfanew);
    result.peSignatureString = result.peSignature === PE_SIGNATURE ? 'PE\\0\\0' : 'INVALID';

    if (result.peSignature !== PE_SIGNATURE) {
      return { valid: false, error: 'Invalid PE signature' } as PEParsed;
    }

    const coffOffset = result.e_lfanew + 4;

    // Parse COFF header
    result.machineRaw = buffer.readUInt16LE(coffOffset + COFF_HEADER_SIZE - 20); // 0
    result.numberOfSections = buffer.readUInt16LE(coffOffset + 2);
    result.timeDateStamp = buffer.readUInt32LE(coffOffset + 4);
    result.pointerToSymbolTable = buffer.readUInt32LE(coffOffset + 8);
    result.numberOfSymbols = buffer.readUInt32LE(coffOffset + 12);
    result.sizeOfOptionalHeader = buffer.readUInt16LE(coffOffset + 16);
    result.characteristics = buffer.readUInt16LE(coffOffset + 18);

    result.machine = (MACHINE_NAMES.get(result.machineRaw) ?? 'Unknown') as CoffMachine;
    result.rawCoffHeader = buffer.subarray(coffOffset, coffOffset + COFF_HEADER_SIZE);

    // Parse optional header
    const optOffset = coffOffset + COFF_HEADER_SIZE;
    if (optOffset + 2 > buffer.length) {
      return { valid: false, error: 'Optional header beyond file bounds' } as PEParsed;
    }

    const optMagic = buffer.readUInt16LE(optOffset);
    result.format = optMagic === OPT_MAGIC_PE32_PLUS ? 'PE32+' : 'PE32';

    if (optMagic !== OPT_MAGIC_PE32 && optMagic !== OPT_MAGIC_PE32_PLUS) {
      return {
        valid: false,
        error: `Invalid optional header magic: 0x${optMagic.toString(16)}`,
      } as PEParsed;
    }

    const isPE32Plus = result.format === 'PE32+';
    const optHdrSize = isPE32Plus ? OPT_HEADER_SIZE_PE32_PLUS : OPT_HEADER_SIZE_PE32;

    // Common optional header fields
    result.entryPoint = buffer.readUInt32LE(optOffset + 16);
    result.codeSize = buffer.readUInt32LE(optOffset + 20);

    if (isPE32Plus) {
      result.imageBase = Number(buffer.readBigUInt64LE(optOffset + 24));
      result.initializedDataSize = buffer.readUInt32LE(optOffset + 40);
      result.uninitializedDataSize = buffer.readUInt32LE(optOffset + 44);
      result.sizeOfHeaders = buffer.readUInt32LE(optOffset + 60);
      result.checkSum = buffer.readUInt32LE(optOffset + 64);
      result.subsystem = SUBSYSTEM_NAMES.get(buffer.readUInt16LE(optOffset + 68)) ?? 'unknown';
      result.dllCharacteristics = buffer.readUInt16LE(optOffset + 70);
      result.sizeOfStackReserve = Number(buffer.readBigUInt64LE(optOffset + 72));
      result.sizeOfStackCommit = Number(buffer.readBigUInt64LE(optOffset + 80));
      result.sizeOfHeapReserve = Number(buffer.readBigUInt64LE(optOffset + 88));
      result.sizeOfHeapCommit = Number(buffer.readBigUInt64LE(optOffset + 96));
      result.loaderFlags = buffer.readUInt32LE(optOffset + 104);
      result.numberOfDataDirectories = buffer.readUInt32LE(optOffset + 108);
    } else {
      result.imageBase = buffer.readUInt32LE(optOffset + 28);
      result.initializedDataSize = buffer.readUInt32LE(optOffset + 40);
      result.uninitializedDataSize = buffer.readUInt32LE(optOffset + 44);
      result.sizeOfHeaders = buffer.readUInt32LE(optOffset + 60);
      result.checkSum = buffer.readUInt32LE(optOffset + 64);
      result.subsystem = SUBSYSTEM_NAMES.get(buffer.readUInt16LE(optOffset + 68)) ?? 'unknown';
      result.dllCharacteristics = buffer.readUInt16LE(optOffset + 70);
      result.sizeOfStackReserve = buffer.readUInt32LE(optOffset + 74);
      result.sizeOfStackCommit = buffer.readUInt32LE(optOffset + 78);
      result.sizeOfHeapReserve = buffer.readUInt32LE(optOffset + 82);
      result.sizeOfHeapCommit = buffer.readUInt32LE(optOffset + 86);
      result.loaderFlags = buffer.readUInt32LE(optOffset + 92);
      result.numberOfDataDirectories = buffer.readUInt32LE(optOffset + 96);
    }

    result.imageSize = buffer.readUInt32LE(optOffset + 56);
    result.sectionAlignment = buffer.readUInt32LE(optOffset + 32);
    result.fileAlignment = buffer.readUInt32LE(optOffset + 36);
    result.majorOSVersion = buffer.readUInt16LE(optOffset + 48);
    result.minorOSVersion = buffer.readUInt16LE(optOffset + 50);
    result.majorImageVersion = buffer.readUInt16LE(optOffset + 52);
    result.minorImageVersion = buffer.readUInt16LE(optOffset + 54);
    result.majorSubsystemVersion = buffer.readUInt16LE(optOffset + 56);
    result.minorSubsystemVersion = buffer.readUInt16LE(optOffset + 58);
    result.win32VersionValue = buffer.readUInt32LE(optOffset + 60);

    result.rawOptionalHeader = buffer.subarray(
      optOffset,
      Math.min(optOffset + optHdrSize, buffer.length),
    );

    // Parse data directories
    const dataDirOffset = isPE32Plus ? optOffset + 112 : optOffset + 96;
    const numDirs = Math.min(result.numberOfDataDirectories ?? 16, 16);
    const directories: DataDirectory[] = [];
    for (let i = 0; i < numDirs; i++) {
      const ddOffset = dataDirOffset + i * 8;
      if (ddOffset + 8 > buffer.length) break;
      const rva = buffer.readUInt32LE(ddOffset);
      const size = buffer.readUInt32LE(ddOffset + 4);
      const name = DATA_DIRECTORY_NAMES.get(i) ?? `directory-${i}`;
      directories.push({
        type: name as DataDirectory['type'],
        rva,
        size,
        present: rva !== 0 && size > 0,
      });
    }
    result.dataDirectories = Object.freeze(directories);

    // Parse section table
    const sectionTableOffset = optOffset + result.sizeOfOptionalHeader;
    const sections: PESection[] = [];
    const numSections = Math.min(result.numberOfSections, 100); // Sanity limit

    for (let i = 0; i < numSections; i++) {
      const secOff = sectionTableOffset + i * SCN_HEADER_SIZE;
      if (secOff + SCN_HEADER_SIZE > buffer.length) break;

      const nameRaw = buffer.toString('ascii', secOff, secOff + 8).replace(/\0+$/, '');
      const virtualSize = buffer.readUInt32LE(secOff + 8);
      const virtualAddress = buffer.readUInt32LE(secOff + 12);
      const rawSize = buffer.readUInt32LE(secOff + 16);
      const rawOffset = buffer.readUInt32LE(secOff + 20);
      const relocPtr = buffer.readUInt32LE(secOff + 24);
      const linenumPtr = buffer.readUInt32LE(secOff + 28);
      const numRelocs = buffer.readUInt16LE(secOff + 32);
      const numLinenums = buffer.readUInt16LE(secOff + 34);
      const characteristics = buffer.readUInt32LE(secOff + 36);

      const charFlags: SectionCharacteristics = {
        isExecutable: (characteristics & SCN_MEM_EXECUTE) !== 0,
        isWritable: (characteristics & SCN_MEM_WRITE) !== 0,
        isReadable: (characteristics & SCN_MEM_READ) !== 0,
        containsCode: (characteristics & SCN_IS_CODE) !== 0,
        containsInitializedData: (characteristics & SCN_IS_INITIALIZED_DATA) !== 0,
        containsUninitializedData: (characteristics & 0x80) !== 0,
        isShared: (characteristics & SCN_MEM_SHARED) !== 0,
        isDiscardable: (characteristics & SCN_MEM_DISCARDABLE) !== 0,
        isRemovable: (characteristics & 0x00000800) !== 0,
        isPaged: (characteristics & 0x08000000) !== 0,
      };

      // Compute entropy
      const entropy =
        rawSize > 0 && rawOffset + rawSize <= buffer.length
          ? computeEntropy(buffer.subarray(rawOffset, rawOffset + rawSize))
          : 0;

      sections.push({
        name: nameRaw,
        virtualSize,
        virtualAddress,
        rawSize,
        rawOffset,
        characteristics,
        charFlags,
        entropy,
        entropyNormalized: entropy / 8.0,
        isPacked: entropy > HIGH_ENTROPY_THRESHOLD || isSuspiciousSectionName(nameRaw),
        alignment: sectionAlignment(result.sectionAlignment ?? 0x1000, rawOffset, virtualAddress),
      });
    }
    result.sections = Object.freeze(sections);
    result.rawSectionTable = buffer.subarray(
      sectionTableOffset,
      Math.min(sectionTableOffset + numSections * SCN_HEADER_SIZE, buffer.length),
    );

    // Parse imports
    const imports = parseImports(buffer, sections, directories);
    result.imports = imports.flat() as PEImport[];
    const importsByDll = new Map<string, readonly PEImport[]>();
    for (const imp of imports.flat() as PEImport[]) {
      const existing = importsByDll.get(imp.dll) ?? [];
      importsByDll.set(imp.dll, [...existing, imp]);
    }
    result.importsByDll = importsByDll;

    // Parse exports
    result.exports = Object.freeze(parseExports(buffer, sections, directories));

    // Parse TLS
    result.tls = parseTLS(buffer, sections, directories, isPE32Plus);

    // Parse resources
    result.resources = Object.freeze(parseResources(buffer, sections, directories));

    // Parse certificates
    result.certificates = Object.freeze(parseCertificates(buffer, directories));

    // Parse overlay
    result.overlay = parseOverlay(buffer, sections);

    // Relocation count
    const relocDir = directories[IMAGE_DIRECTORY_ENTRY_BASERELOC];
    result.baseRelocationCount = relocDir?.present ? Math.floor(relocDir.size / 8) : 0;

    result.rawDosHeader = buffer.subarray(0, 64);
    result.valid = true;
  } catch (err) {
    return {
      valid: false,
      error: `PE parse error: ${err instanceof Error ? err.message : String(err)}`,
    } as PEParsed;
  }

  return result as unknown as PEParsed;
}

// ── Import Parsing ──

function parseImports(
  buffer: Buffer,
  sections: readonly PESection[],
  directories: readonly DataDirectory[],
): PEImport[][] {
  const importDir = directories[IMAGE_DIRECTORY_ENTRY_IMPORT];
  if (!importDir?.present) return [];

  const fileOffset = rvaToOffset(importDir.rva, sections);
  if (fileOffset < 0) return [];

  const results: PEImport[][] = [];
  let offset = fileOffset;

  while (offset + 20 <= buffer.length) {
    const nameRva = buffer.readUInt32LE(offset + 12);
    const originalFirstThunk = buffer.readUInt32LE(offset);
    const timeDateStamp = buffer.readUInt32LE(offset + 4);
    const forwarderChain = buffer.readUInt32LE(offset + 8);

    // End of import descriptors
    if (nameRva === 0 && originalFirstThunk === 0) break;

    const dllName = rvaToString(buffer, nameRva, sections);
    if (!dllName) {
      offset += 20;
      continue;
    }

    // Parse import entries using the IAT (OriginalFirstThunk or FirstThunk)
    const thunkRva =
      originalFirstThunk !== 0 ? originalFirstThunk : buffer.readUInt32LE(offset + 16);
    const thunkOffset = rvaToOffset(thunkRva, sections);
    if (thunkOffset < 0) {
      offset += 20;
      continue;
    }

    const entries: PEImport[] = [];
    let thunk = thunkOffset;

    while (thunk + (sections.length > 0 && sections[0]?.name ? 8 : 8) <= buffer.length) {
      const is64 = sections.length > 0 && sections.some((s) => s.entropy > 0 && s.name !== '');
      const is64Bit = false; // determined by format
      // Read thunk value (4 or 8 bytes depending on PE32/PE32+)
      const thunkVal = buffer.readUInt32LE(thunk);
      if (thunkVal === 0) break;

      const isOrdinal = (thunkVal & 0x80000000) !== 0;
      if (isOrdinal) {
        const ordinal = thunkVal & 0xffff;
        entries.push({
          dll: dllName.toLowerCase(),
          name: null,
          hint: 0,
          ordinal,
          isOrdinal: true,
          iatRva: thunkRva + (thunk - thunkOffset),
        });
      } else {
        // Import by name
        const importOffset = rvaToOffset(thunkVal, sections);
        if (importOffset >= 0 && importOffset + 4 <= buffer.length) {
          const hint = buffer.readUInt16LE(importOffset);
          const name = readCString(buffer, importOffset + 2, 256);
          entries.push({
            dll: dllName.toLowerCase(),
            name,
            hint,
            ordinal: null,
            isOrdinal: false,
            iatRva: thunkRva + (thunk - thunkOffset),
          });
        }
      }
      thunk += sections.length > 0 ? (false ? 8 : 4) : 4;
    }

    if (entries.length > 0) {
      results.push(entries);
    }

    offset += 20;
  }

  return results;
}

// ── Export Parsing ──

function parseExports(
  buffer: Buffer,
  sections: readonly PESection[],
  directories: readonly DataDirectory[],
): PEExport[] {
  const exportDir = directories[IMAGE_DIRECTORY_ENTRY_EXPORT];
  if (!exportDir?.present) return [];

  const fileOffset = rvaToOffset(exportDir.rva, sections);
  if (fileOffset < 0 || fileOffset + 40 > buffer.length) return [];

  const numFunctions = buffer.readUInt32LE(fileOffset + 20);
  const numNames = buffer.readUInt32LE(fileOffset + 24);
  const addrRva = buffer.readUInt32LE(fileOffset + 28);
  const nameRva = buffer.readUInt32LE(fileOffset + 32);
  const ordRva = buffer.readUInt32LE(fileOffset + 36);

  const addrOffset = rvaToOffset(addrRva, sections);
  const nameOffset = rvaToOffset(nameRva, sections);
  const ordOffset = rvaToOffset(ordRva, sections);

  if (addrOffset < 0) return [];

  const exports: PEExport[] = [];
  const maxEntries = Math.min(numFunctions, 5000); // Sanity limit

  for (let i = 0; i < maxEntries; i++) {
    const addrOff = addrOffset + i * 4;
    if (addrOff + 4 > buffer.length) break;
    const address = buffer.readUInt32LE(addrOff);
    if (address === 0) continue;

    const ordinalBase = buffer.readUInt32LE(fileOffset + 16);
    const ordinal = ordinalBase + i;

    // Check if it's a forwarder
    const exportStart = exportDir.rva;
    const exportEnd = exportDir.rva + exportDir.size;
    const isForwarder = address >= exportStart && address < exportEnd;

    let forwarder: string | null = null;
    if (isForwarder) {
      const fwdOffset = rvaToOffset(address, sections);
      if (fwdOffset >= 0) {
        forwarder = readCString(buffer, fwdOffset, 256);
      }
    }

    // Resolve name
    let name = '';
    if (nameOffset >= 0 && ordOffset >= 0) {
      const ordOff = ordOffset + i * 2;
      if (ordOff + 2 <= buffer.length) {
        const nameIndex = buffer.readUInt16LE(ordOff);
        if (nameIndex < numNames) {
          const nameAddrOff = nameOffset + nameIndex * 4;
          if (nameAddrOff + 4 <= buffer.length) {
            const nameRvaVal = buffer.readUInt32LE(nameAddrOff);
            const nameFileOff = rvaToOffset(nameRvaVal, sections);
            if (nameFileOff >= 0) {
              name = readCString(buffer, nameFileOff, 256);
            }
          }
        }
      }
    }

    exports.push({ name, ordinal, address, forwarder });
  }

  return exports;
}

// ── TLS Parsing ──

function parseTLS(
  buffer: Buffer,
  sections: readonly PESection[],
  directories: readonly DataDirectory[],
  isPE32Plus: boolean,
): TLSInfo | null {
  const tlsDir = directories[IMAGE_DIRECTORY_ENTRY_TLS];
  if (!tlsDir?.present) return null;

  const fileOffset = rvaToOffset(tlsDir.rva, sections);
  if (fileOffset < 0) return null;

  const tlsSize = isPE32Plus ? 40 : 24;
  if (fileOffset + tlsSize > buffer.length) return null;

  let rawDataStart: number;
  let rawDataEnd: number;
  let indexAddress: number;
  let callbacksAddr: number;
  let zeroFillSize: number;
  let characteristics: number;

  if (isPE32Plus) {
    rawDataStart = Number(buffer.readBigUInt64LE(fileOffset));
    rawDataEnd = Number(buffer.readBigUInt64LE(fileOffset + 8));
    indexAddress = Number(buffer.readBigUInt64LE(fileOffset + 16));
    callbacksAddr = Number(buffer.readBigUInt64LE(fileOffset + 24));
    zeroFillSize = buffer.readUInt32LE(fileOffset + 32);
    characteristics = buffer.readUInt32LE(fileOffset + 36);
  } else {
    rawDataStart = buffer.readUInt32LE(fileOffset);
    rawDataEnd = buffer.readUInt32LE(fileOffset + 4);
    indexAddress = buffer.readUInt32LE(fileOffset + 8);
    callbacksAddr = buffer.readUInt32LE(fileOffset + 12);
    zeroFillSize = buffer.readUInt32LE(fileOffset + 16);
    characteristics = buffer.readUInt32LE(fileOffset + 20);
  }

  // Parse callbacks
  const callbacks: TLSCallback[] = [];
  if (callbacksAddr !== 0) {
    const cbOffset = rvaToOffset(callbacksAddr, sections);
    if (cbOffset >= 0) {
      for (let i = 0; ; i++) {
        const entryOff = cbOffset + i * (isPE32Plus ? 8 : 4);
        if (entryOff + (isPE32Plus ? 8 : 4) > buffer.length) break;
        const callbackAddr = isPE32Plus
          ? Number(buffer.readBigUInt64LE(entryOff))
          : buffer.readUInt32LE(entryOff);
        if (callbackAddr === 0) break;
        callbacks.push({ address: callbackAddr, offset: entryOff });
      }
    }
  }

  return {
    rawDataStart,
    rawDataEnd,
    indexAddress,
    callbacks: Object.freeze(callbacks),
    zeroFillSize,
    characteristics,
  };
}

// ── Resource Parsing ──

function parseResources(
  buffer: Buffer,
  sections: readonly PESection[],
  directories: readonly DataDirectory[],
): PEResource[] {
  const rsrcDir = directories[IMAGE_DIRECTORY_ENTRY_RESOURCE];
  if (!rsrcDir?.present) return [];

  const fileOffset = rvaToOffset(rsrcDir.rva, sections);
  if (fileOffset < 0) return [];

  const resources: PEResource[] = [];
  parseResourceDirectory(buffer, fileOffset, rsrcDir.rva, sections, 0, resources, '');
  return resources;
}

function parseResourceDirectory(
  buffer: Buffer,
  baseOffset: number,
  baseRva: number,
  sections: readonly PESection[],
  level: number,
  results: PEResource[],
  parentName: string,
): void {
  if (level > 3 || baseOffset + 16 > buffer.length) return;

  const numNamedEntries = buffer.readUInt16LE(baseOffset + 12);
  const numIdEntries = buffer.readUInt16LE(baseOffset + 14);
  const totalEntries = numNamedEntries + numIdEntries;

  for (let i = 0; i < totalEntries; i++) {
    const entryOff = baseOffset + 16 + i * 8;
    if (entryOff + 8 > buffer.length) break;

    const idOrOffset = buffer.readUInt32LE(entryOff);
    const subOffset = buffer.readUInt32LE(entryOff + 4);

    const isIdEntry = (idOrOffset & 0x80000000) === 0;
    const entryId = isIdEntry ? idOrOffset & 0xffff : 0;
    const entryName = isIdEntry ? '' : 'named';

    if ((subOffset & 0x80000000) !== 0) {
      // Subdirectory
      const subDirOffset = subOffset & 0x7fffffff;
      parseResourceDirectory(
        buffer,
        baseRva + subDirOffset,
        baseRva,
        sections,
        level + 1,
        results,
        entryName || String(entryId),
      );
    } else {
      // Leaf node (data entry)
      const dataEntryOff = baseRva + subOffset;
      if (dataEntryOff + 16 > buffer.length) break;
      const dataRva = buffer.readUInt32LE(dataEntryOff);
      const dataSize = buffer.readUInt32LE(dataEntryOff + 4);
      const cp = buffer.readUInt32LE(dataEntryOff + 8);
      const language = getLanguageName(buffer.readUInt32LE(dataEntryOff + 12));

      const dataFileOff = rvaToOffset(dataRva, sections);
      const data =
        dataFileOff >= 0 && dataFileOff + dataSize <= buffer.length
          ? buffer.subarray(dataFileOff, dataFileOff + dataSize)
          : null;

      const resourceType = RESOURCE_TYPE_NAMES.get(level === 0 ? entryId : 0) ?? 'unknown';

      results.push({
        type: resourceType as PEResource['type'],
        name: entryName || String(entryId),
        id: entryId,
        language,
        offset: dataFileOff,
        size: dataSize,
        data,
        subType: level === 0 ? 'root' : level === 1 ? 'type' : 'item',
      });
    }
  }
}

// ── Certificate Parsing ──

function parseCertificates(buffer: Buffer, directories: readonly DataDirectory[]): PECertificate[] {
  const certDir = directories[IMAGE_DIRECTORY_ENTRY_CERTIFICATE];
  if (!certDir?.present) return [];

  const offset = certDir.rva; // Certificates are at a file offset, not RVA
  if (offset + 8 > buffer.length) return [];

  const certificates: PECertificate[] = [];
  let currentOffset = offset;

  while (currentOffset + 8 <= buffer.length) {
    const dwLength = buffer.readUInt32LE(currentOffset);
    const wRevision = buffer.readUInt16LE(currentOffset + 4);
    const wCertificateType = buffer.readUInt16LE(currentOffset + 6);
    const certSize = Math.min(dwLength, buffer.length - currentOffset);

    if (dwLength < 8) break;

    certificates.push({
      offset: currentOffset,
      size: dwLength,
      revision: wRevision,
      certificateType: wCertificateType === 2 ? 'PKCS7_SIGNED_DATA' : `type-${wCertificateType}`,
    });

    // Align to 8 bytes
    currentOffset += Math.ceil(dwLength / 8) * 8;
    if (currentOffset <= offset + 8) break;
  }

  return certificates;
}

// ── Overlay Detection ──

function parseOverlay(buffer: Buffer, sections: readonly PESection[]): PEOverlay {
  if (sections.length === 0) {
    return { offset: 0, size: 0, entropy: 0, percentage: 0, present: false };
  }

  // Find the last section's end
  let lastEnd = 0;
  for (const section of sections) {
    const sectionEnd = section.rawOffset + section.rawSize;
    if (sectionEnd > lastEnd) lastEnd = sectionEnd;
  }

  const overlaySize = buffer.length - lastEnd;
  if (overlaySize <= 0) {
    return { offset: lastEnd, size: 0, entropy: 0, percentage: 0, present: false };
  }

  const overlayData = buffer.subarray(lastEnd);
  const entropy = computeEntropy(overlayData);
  const percentage = Math.round((overlaySize / buffer.length) * 10000) / 100;

  return {
    offset: lastEnd,
    size: overlaySize,
    entropy,
    percentage,
    present: true,
  };
}

// ── Utility Functions ──

/** Convert an RVA (Relative Virtual Address) to a file offset. */
export function rvaToOffset(rva: number, sections: readonly PESection[]): number {
  for (const section of sections) {
    if (rva >= section.virtualAddress && rva < section.virtualAddress + section.virtualSize) {
      return section.rawOffset + (rva - section.virtualAddress);
    }
  }
  return -1;
}

/** Read a null-terminated string from an RVA. */
export function rvaToString(buffer: Buffer, rva: number, sections: readonly PESection[]): string {
  const offset = rvaToOffset(rva, sections);
  if (offset < 0) return '';
  return readCString(buffer, offset, 256);
}

/** Compute Shannon entropy of a buffer. */
export function computeEntropy(data: Buffer): number {
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

/** Check if a section name is suspicious (non-standard). */
export function isSuspiciousSectionName(name: string): boolean {
  const STANDARD = [
    '.text',
    '.data',
    '.rdata',
    '.idata',
    '.rsrc',
    '.reloc',
    '.tls',
    '.debug',
    '.bss',
    '.pdata',
    '.crt',
  ];
  return !STANDARD.includes(name);
}

function sectionAlignment(fileAlign: number, rawOffset: number, virtualAddress: number): number {
  return rawOffset % fileAlign;
}

function getLanguageName(langId: number): string {
  const LANG_NAMES: Record<number, string> = {
    0x0409: 'en-US',
    0x0809: 'en-GB',
    0x0407: 'de-DE',
    0x040c: 'fr-FR',
    0x0410: 'it-IT',
    0x040a: 'es-ES',
    0x0411: 'ja-JP',
    0x0804: 'zh-CN',
    0x0412: 'ko-KR',
    0x0419: 'ru-RU',
    0x0416: 'pt-BR',
  };
  return LANG_NAMES[langId] ?? `lang-${langId}`;
}
