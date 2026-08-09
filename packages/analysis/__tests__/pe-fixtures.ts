/**
 * PE Test Fixtures — creates mock PEParsed structures for testing.
 *
 * These fixtures enable deterministic golden tests for all PE analyzers
 * without requiring real PE binaries on disk.
 *
 * @module @veris/analysis/__tests__/pe-fixtures
 */

import type {
  PEParsed,
  PESection,
  PEImport,
  PEExport,
  PEOverlay,
  PECertificate,
  PEResource,
  TLSInfo,
  TLSCallback,
  DataDirectory,
  CompilerInfo,
  CompilerType,
} from '../src/pe/types.js';

// ── Helper: create section characteristics ──

function chars(
  isExec: boolean,
  isWrit: boolean,
  isRead: boolean,
  isCode: boolean,
): {
  readonly isExecutable: boolean;
  readonly isWritable: boolean;
  readonly isReadable: boolean;
  readonly containsCode: boolean;
  readonly containsInitializedData: boolean;
  readonly containsUninitializedData: boolean;
  readonly isShared: boolean;
  readonly isDiscardable: boolean;
  readonly isRemovable: boolean;
  readonly isPaged: boolean;
} {
  return Object.freeze({
    isExecutable: isExec,
    isWritable: isWrit,
    isReadable: isRead,
    containsCode: isCode,
    containsInitializedData: !isCode,
    containsUninitializedData: false,
    isShared: false,
    isDiscardable: false,
    isRemovable: false,
    isPaged: false,
  });
}

function section(
  name: string,
  vsize: number,
  vaddr: number,
  rsize: number,
  roff: number,
  charsVal: number,
  entropy: number,
  entropyNorm: number,
): PESection {
  return Object.freeze({
    name,
    virtualSize: vsize,
    virtualAddress: vaddr,
    rawSize: rsize,
    rawOffset: roff,
    characteristics: charsVal,
    charFlags: chars(
      (charsVal & 0x20000000) !== 0,
      (charsVal & 0x80000000) !== 0,
      (charsVal & 0x40000000) !== 0,
      (charsVal & 0x00000020) !== 0,
    ),
    entropy,
    entropyNormalized: entropyNorm,
    isPacked: entropy > 7.0 || !['.text', '.data', '.rdata', '.rsrc', '.reloc'].includes(name),
    alignment: 0,
  });
}

function dd(type: string, rva: number, size: number): DataDirectory {
  return Object.freeze({
    type: type as DataDirectory['type'],
    rva,
    size,
    present: rva !== 0 && size > 0,
  });
}

function importEntry(dll: string, name: string | null, ordinal: number | null): PEImport {
  return Object.freeze({
    dll: dll.toLowerCase(),
    name,
    hint: 0,
    ordinal,
    isOrdinal: ordinal !== null,
    iatRva: 0x2000,
  });
}

// ── Factory ──

export function createMockPE(variant: string): PEParsed {
  switch (variant) {
    case 'clean':
      return createCleanPE();
    case 'rwx':
      return createRWXPE();
    case 'upx':
      return createUPXPE();
    case 'themida':
      return createThemidaPE();
    case 'malicious-imports':
      return createMaliciousImportsPE();
    case 'overlay':
      return createOverlayPE();
    case 'tls-callback':
      return createTLSPE();
    case 'signed':
      return createSignedPE();
    case 'unsigned':
      return createUnsignedPE();
    case 'zero-timestamp':
      return createZeroTimestampPE();
    case 'future-timestamp':
      return createFutureTimestampPE();
    case 'msvc':
      return createMSVCPE();
    case 'gcc':
      return createGCCPE();
    case 'rust':
      return createRustPE();
    case 'go':
      return createGoPE();
    case 'resource-heavy':
      return createResourceHeavyPE();
    case 'broken':
      return createBrokenPE();
    case 'high-entropy':
      return createHighEntropyPE();
    case 'embedded-pe':
      return createEmbeddedPEPE();
    default:
      return createCleanPE();
  }
}

function basePE(overrides?: Partial<PEParsed>): PEParsed {
  return Object.freeze({
    valid: true,
    dosStub: Buffer.alloc(64),
    e_lfanew: 64,
    peSignature: 0x00004550,
    peSignatureString: 'PE\\0\\0',
    machine: 'I386' as const,
    machineRaw: 0x014c,
    numberOfSections: 3,
    timeDateStamp: 1577836800, // Jan 1 2020
    pointerToSymbolTable: 0,
    numberOfSymbols: 0,
    sizeOfOptionalHeader: 224,
    characteristics: 0x0102,
    format: 'PE32' as const,
    entryPoint: 0x1000,
    imageBase: 0x00400000,
    imageSize: 0x4000,
    codeSize: 0x1000,
    initializedDataSize: 0x2000,
    uninitializedDataSize: 0,
    sectionAlignment: 0x1000,
    fileAlignment: 0x200,
    majorOSVersion: 6,
    minorOSVersion: 0,
    majorImageVersion: 14,
    minorImageVersion: 0,
    majorSubsystemVersion: 6,
    minorSubsystemVersion: 0,
    win32VersionValue: 0,
    sizeOfHeaders: 0x200,
    checkSum: 0,
    subsystem: 'windows-gui',
    dllCharacteristics: 0x8540,
    sizeOfStackReserve: 0x100000,
    sizeOfStackCommit: 0x1000,
    sizeOfHeapReserve: 0x100000,
    sizeOfHeapCommit: 0x1000,
    loaderFlags: 0,
    numberOfDataDirectories: 16,
    dataDirectories: Object.freeze([]),
    sections: Object.freeze([]),
    imports: Object.freeze([]),
    importsByDll: new Map(),
    exports: Object.freeze([]),
    tls: null,
    resources: Object.freeze([]),
    certificates: Object.freeze([]),
    overlay: Object.freeze({
      offset: 0,
      size: 0,
      entropy: 0,
      percentage: 0,
      present: false,
    }),
    rawDosHeader: Buffer.alloc(64),
    rawCoffHeader: Buffer.alloc(20),
    rawOptionalHeader: Buffer.alloc(224),
    rawSectionTable: Buffer.alloc(120),
    baseRelocationCount: 0,
    ...overrides,
  });
}

// ── Specific PE variants ──

function createCleanPE(): PEParsed {
  return basePE({
    sections: Object.freeze([
      section('.text', 0x1000, 0x1000, 0x200, 0x1000, 0x60000020, 5.5, 0.69),
      section('.rdata', 0x1000, 0x2000, 0x200, 0x1200, 0x40000040, 4.2, 0.52),
      section('.data', 0x1000, 0x3000, 0x200, 0x1400, 0xc0000040, 3.8, 0.48),
    ]),
    imports: Object.freeze([
      importEntry('kernel32.dll', 'GetProcAddress', null),
      importEntry('kernel32.dll', 'LoadLibraryA', null),
      importEntry('user32.dll', 'MessageBoxA', null),
    ]),
    importsByDll: new Map([
      [
        'kernel32.dll',
        Object.freeze([
          importEntry('kernel32.dll', 'GetProcAddress', null),
          importEntry('kernel32.dll', 'LoadLibraryA', null),
        ]),
      ],
      ['user32.dll', Object.freeze([importEntry('user32.dll', 'MessageBoxA', null)])],
    ]),
  });
}

function createRWXPE(): PEParsed {
  return basePE({
    sections: Object.freeze([
      section('.text', 0x1000, 0x1000, 0x200, 0x1000, 0xe0000020, 6.2, 0.78), // RWX
      section('.rdata', 0x1000, 0x2000, 0x200, 0x1200, 0x40000040, 4.2, 0.52),
      section('.data', 0x1000, 0x3000, 0x200, 0x1400, 0xc0000040, 3.8, 0.48),
    ]),
  });
}

function createUPXPE(): PEParsed {
  return basePE({
    machine: 'I386' as const,
    numberOfSections: 3,
    entryPoint: 0x200,
    sections: Object.freeze([
      section('UPX0', 0x4000, 0x1000, 0, 0x1000, 0xe0000080, 7.8, 0.98), // UPX packed section
      section('UPX1', 0x2000, 0x5000, 0x800, 0x0400, 0xe0000020, 7.5, 0.94),
      section('.rsrc', 0x1000, 0x7000, 0x200, 0x0c00, 0xc0000040, 4.5, 0.56),
    ]),
    overlay: Object.freeze({
      offset: 0x0e00,
      size: 0x200,
      entropy: 6.8,
      percentage: 5.2,
      present: true,
    }),
    imports: Object.freeze([
      importEntry('kernel32.dll', 'LoadLibraryA', null),
      importEntry('kernel32.dll', 'GetProcAddress', null),
    ]),
    importsByDll: new Map([
      [
        'kernel32.dll',
        Object.freeze([
          importEntry('kernel32.dll', 'LoadLibraryA', null),
          importEntry('kernel32.dll', 'GetProcAddress', null),
        ]),
      ],
    ]),
  });
}

function createThemidaPE(): PEParsed {
  return basePE({
    numberOfSections: 5,
    sections: Object.freeze([
      section('.text', 0x1000, 0x1000, 0x200, 0x1000, 0x60000020, 5.5, 0.69),
      section('.Themida', 0x4000, 0x2000, 0x2000, 0x1200, 0xe0000020, 7.9, 0.99),
      section('.sforce', 0x2000, 0x6000, 0x1000, 0x3200, 0xe0000020, 7.7, 0.96),
      section('.rdata', 0x1000, 0x8000, 0x200, 0x4200, 0x40000040, 4.0, 0.5),
      section('.data', 0x1000, 0x9000, 0x200, 0x4400, 0xc0000040, 3.5, 0.44),
    ]),
    imports: Object.freeze([]),
    importsByDll: new Map(),
  });
}

function createMaliciousImportsPE(): PEParsed {
  return basePE({
    sections: Object.freeze([
      section('.text', 0x2000, 0x1000, 0x800, 0x1000, 0x60000020, 5.0, 0.62),
      section('.rdata', 0x1000, 0x3000, 0x400, 0x1800, 0x40000040, 4.0, 0.5),
      section('.data', 0x1000, 0x4000, 0x200, 0x1c00, 0xc0000040, 3.5, 0.44),
    ]),
    imports: Object.freeze([
      importEntry('kernel32.dll', 'VirtualAllocEx', null),
      importEntry('kernel32.dll', 'WriteProcessMemory', null),
      importEntry('kernel32.dll', 'CreateRemoteThread', null),
      importEntry('kernel32.dll', 'OpenProcess', null),
      importEntry('kernel32.dll', 'VirtualProtectEx', null),
      importEntry('advapi32.dll', 'OpenProcessToken', null),
      importEntry('advapi32.dll', 'AdjustTokenPrivileges', null),
      importEntry('dbghelp.dll', 'MiniDumpWriteDump', null),
      importEntry('wininet.dll', 'InternetOpen', null),
      importEntry('wininet.dll', 'InternetConnect', null),
      importEntry('urlmon.dll', 'URLDownloadToFile', null),
      importEntry('ntdll.dll', 'NtCreateThreadEx', null),
      importEntry('ntdll.dll', 'NtQueryInformationProcess', null),
      importEntry('ntdll.dll', 'NtSetInformationThread', null),
    ]),
    importsByDll: new Map([
      [
        'kernel32.dll',
        Object.freeze([
          importEntry('kernel32.dll', 'VirtualAllocEx', null),
          importEntry('kernel32.dll', 'WriteProcessMemory', null),
          importEntry('kernel32.dll', 'CreateRemoteThread', null),
          importEntry('kernel32.dll', 'OpenProcess', null),
          importEntry('kernel32.dll', 'VirtualProtectEx', null),
        ]),
      ],
      [
        'advapi32.dll',
        Object.freeze([
          importEntry('advapi32.dll', 'OpenProcessToken', null),
          importEntry('advapi32.dll', 'AdjustTokenPrivileges', null),
        ]),
      ],
      ['dbghelp.dll', Object.freeze([importEntry('dbghelp.dll', 'MiniDumpWriteDump', null)])],
      [
        'wininet.dll',
        Object.freeze([
          importEntry('wininet.dll', 'InternetOpen', null),
          importEntry('wininet.dll', 'InternetConnect', null),
        ]),
      ],
      ['urlmon.dll', Object.freeze([importEntry('urlmon.dll', 'URLDownloadToFile', null)])],
      [
        'ntdll.dll',
        Object.freeze([
          importEntry('ntdll.dll', 'NtCreateThreadEx', null),
          importEntry('ntdll.dll', 'NtQueryInformationProcess', null),
          importEntry('ntdll.dll', 'NtSetInformationThread', null),
        ]),
      ],
    ]),
  });
}

function createOverlayPE(): PEParsed {
  return basePE({
    sections: Object.freeze([
      section('.text', 0x1000, 0x1000, 0x200, 0x1000, 0x60000020, 5.5, 0.69),
      section('.rdata', 0x1000, 0x2000, 0x200, 0x1200, 0x40000040, 4.2, 0.52),
    ]),
    overlay: Object.freeze({
      offset: 0x1400,
      size: 1024 * 20,
      entropy: 7.3,
      percentage: 45.0,
      present: true,
    }),
  });
}

function createTLSPE(): PEParsed {
  return basePE({
    tls: Object.freeze({
      rawDataStart: 0x3000,
      rawDataEnd: 0x3100,
      indexAddress: 0x4000,
      callbacks: Object.freeze([
        Object.freeze({ address: 0x10001000, offset: 0x1200 }),
        Object.freeze({ address: 0x10002000, offset: 0x1208 }),
      ]),
      zeroFillSize: 0,
      characteristics: 0,
    }),
  });
}

function createSignedPE(): PEParsed {
  return basePE({
    dataDirectories: Object.freeze([dd('certificate-table', 0x2000, 0x400)]),
    certificates: Object.freeze([
      Object.freeze({
        offset: 0x2000,
        size: 0x400,
        revision: 0x0200,
        certificateType: 'PKCS7_SIGNED_DATA',
      }),
    ]),
  });
}

function createUnsignedPE(): PEParsed {
  return basePE({
    certificates: Object.freeze([]),
    dataDirectories: Object.freeze([dd('certificate-table', 0, 0)]),
  });
}

function createZeroTimestampPE(): PEParsed {
  return basePE({
    timeDateStamp: 0,
  });
}

function createFutureTimestampPE(): PEParsed {
  const futureDate = new Date('2099-01-01').getTime() / 1000;
  return basePE({
    timeDateStamp: Math.floor(futureDate),
  });
}

function createMSVCPE(): PEParsed {
  return basePE({
    majorImageVersion: 14,
    minorImageVersion: 0,
  });
}

function createGCCPE(): PEParsed {
  return basePE({
    majorImageVersion: 0,
    minorImageVersion: 0,
    sections: Object.freeze([
      section('.text', 0x1000, 0x1000, 0x200, 0x1000, 0x60000020, 5.0, 0.62),
      section('.eh_frame', 0x200, 0x2000, 0x100, 0x1200, 0x40000040, 3.0, 0.38),
      section('.gcc_except_table', 0x100, 0x2200, 0x50, 0x1300, 0x40000040, 2.5, 0.31),
      section('.data', 0x1000, 0x3000, 0x200, 0x1400, 0xc0000040, 3.5, 0.44),
    ]),
  });
}

function createRustPE(): PEParsed {
  return basePE({
    majorImageVersion: 14,
    minorImageVersion: 2,
    sections: Object.freeze([
      section('.text', 0x2000, 0x1000, 0x800, 0x1000, 0x60000020, 5.5, 0.69),
      section('.rustc', 0x200, 0x3000, 0x100, 0x1800, 0x40000040, 3.5, 0.44),
      section('.data', 0x1000, 0x4000, 0x200, 0x1c00, 0xc0000040, 3.0, 0.38),
    ]),
  });
}

function createGoPE(): PEParsed {
  return basePE({
    majorImageVersion: 0,
    minorImageVersion: 0,
    sections: Object.freeze([
      section('.text', 0x4000, 0x1000, 0x2000, 0x1000, 0x60000020, 6.5, 0.81),
      section('.gopclntab', 0x800, 0x5000, 0x400, 0x3000, 0x40000040, 4.5, 0.56),
      section('.data', 0x2000, 0x6000, 0x1000, 0x3800, 0xc0000040, 3.8, 0.48),
    ]),
  });
}

function createResourceHeavyPE(): PEParsed {
  return basePE({
    resources: Object.freeze([
      Object.freeze({
        type: 'version' as const,
        name: '1',
        id: 1,
        language: 'en-US',
        offset: 0x2000,
        size: 500,
        data: Buffer.alloc(500),
        subType: 'item',
      }),
      Object.freeze({
        type: 'manifest' as const,
        name: '2',
        id: 2,
        language: 'en-US',
        offset: 0x2200,
        size: 300,
        data: Buffer.from(
          '<assembly><assemblyIdentity version="1.0.0" /><requestedExecutionLevel level="requireAdministrator" /></assembly>',
        ),
        subType: 'item',
      }),
      Object.freeze({
        type: 'icon' as const,
        name: '3',
        id: 3,
        language: 'en-US',
        offset: 0x2350,
        size: 1000,
        data: Buffer.alloc(1000),
        subType: 'item',
      }),
      Object.freeze({
        type: 'rc-data' as const,
        name: '101',
        id: 101,
        language: 'en-US',
        offset: 0x2750,
        size: 5000,
        data: Buffer.alloc(5000),
        subType: 'item',
      }),
    ]),
  });
}

function createBrokenPE(): PEParsed {
  return basePE({
    valid: false,
    error: 'Invalid PE signature',
  });
}

function createHighEntropyPE(): PEParsed {
  return basePE({
    sections: Object.freeze([
      section('.text', 0x2000, 0x1000, 0x1000, 0x1000, 0x60000020, 7.8, 0.98),
      section('.rdata', 0x1000, 0x3000, 0x200, 0x2000, 0x40000040, 4.0, 0.5),
      section('.data', 0x1000, 0x4000, 0x200, 0x2200, 0xc0000040, 3.5, 0.44),
    ]),
  });
}

function createEmbeddedPEPE(): PEParsed {
  return basePE({
    resources: Object.freeze([
      Object.freeze({
        type: 'rc-data' as const,
        name: 'EMBEDDED',
        id: 100,
        language: 'en-US',
        offset: 0x3000,
        size: 1024,
        data: Buffer.from([0x4d, 0x5a, ...Buffer.alloc(1022)]), // "MZ" at start
        subType: 'item',
      }),
    ]),
  });
}

/** List of all fixture variants. */
export const ALL_FIXTURES: readonly string[] = Object.freeze([
  'clean',
  'rwx',
  'upx',
  'themida',
  'malicious-imports',
  'overlay',
  'tls-callback',
  'signed',
  'unsigned',
  'zero-timestamp',
  'future-timestamp',
  'msvc',
  'gcc',
  'rust',
  'go',
  'resource-heavy',
  'broken',
  'high-entropy',
  'embedded-pe',
]);
