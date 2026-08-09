/**
 * PE (Portable Executable) data types.
 *
 * Represents the structure of PE files as defined by the Microsoft PE/COFF
 * specification. All types are immutable (readonly) and designed for
 * deterministic static analysis.
 *
 * @module @veris/analysis/pe/types
 */

/** PE header signature (0x00004550 = "PE\0\0"). */
export type PESignature = number;

/** COFF machine types. */
export type CoffMachine =
  | 'I386'
  | 'AMD64'
  | 'ARMNT'
  | 'ARM64'
  | 'IA64'
  | 'ARM'
  | 'ARM Thumb'
  | 'MIPS'
  | 'PowerPC'
  | 'PowerPC64'
  | 'RISC-V'
  | 'Unknown';

/** PE format variant. */
export type PEFormat = 'PE32' | 'PE32+';

/** PE section characteristics flags. */
export interface SectionCharacteristics {
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
}

/** Parsed PE section information. */
export interface PESection {
  readonly name: string;
  readonly virtualSize: number;
  readonly virtualAddress: number;
  readonly rawSize: number;
  readonly rawOffset: number;
  readonly characteristics: number;
  readonly charFlags: SectionCharacteristics;
  readonly entropy: number;
  readonly entropyNormalized: number; // entropy / 8.0 (max possible)
  readonly isPacked: boolean; // heuristic: entropy > 7.0 or suspicious name
  readonly alignment: number;
}

/** A single import entry. */
export interface PEImport {
  readonly dll: string;
  readonly name: string | null; // null for ordinal imports
  readonly hint: number;
  readonly ordinal: number | null;
  readonly isOrdinal: boolean;
  readonly iatRva: number;
}

/** A single export entry. */
export interface PEExport {
  readonly name: string;
  readonly ordinal: number;
  readonly address: number;
  readonly forwarder: string | null;
}

/** PE data directory entry types. */
export type DataDirectoryType =
  | 'export-table'
  | 'import-table'
  | 'resource-table'
  | 'exception-table'
  | 'certificate-table'
  | 'base-relocation-table'
  | 'debug'
  | 'architecture'
  | 'global-ptr'
  | 'tls-table'
  | 'load-config-table'
  | 'bound-import'
  | 'iat'
  | 'delay-import-descriptor'
  | 'clr-runtime-header'
  | 'reserved';

/** A data directory entry. */
export interface DataDirectory {
  readonly type: DataDirectoryType;
  readonly rva: number;
  readonly size: number;
  readonly present: boolean;
}

/** TLS callback entry. */
export interface TLSCallback {
  readonly address: number;
  readonly offset: number;
}

/** TLS directory information. */
export interface TLSInfo {
  readonly rawDataStart: number;
  readonly rawDataEnd: number;
  readonly indexAddress: number;
  readonly callbacks: readonly TLSCallback[];
  readonly zeroFillSize: number;
  readonly characteristics: number;
}

/** Resource entry types. */
export type ResourceType =
  | 'cursor'
  | 'bitmap'
  | 'icon'
  | 'menu'
  | 'dialog'
  | 'string-table'
  | 'font-directory'
  | 'font'
  | 'accelerator'
  | 'rc-data'
  | 'message-table'
  | 'group-cursor'
  | 'group-icon'
  | 'version'
  | 'dlg-include'
  | 'plug-play'
  | 'vxd'
  | 'ani-cursor'
  | 'ani-icon'
  | 'html'
  | 'manifest'
  | 'unknown';

/** A parsed resource entry. */
export interface PEResource {
  readonly type: ResourceType;
  readonly name: string;
  readonly id: number;
  readonly language: string;
  readonly offset: number;
  readonly size: number;
  readonly data: Buffer | null; // null if not read
  readonly subType: string;
}

/** Certificate (PKCS#7 / Authenticode) information. */
export interface PECertificate {
  readonly offset: number;
  readonly size: number;
  readonly revision: number;
  readonly certificateType: string;
}

/** Overlay data (data appended after the PE structure). */
export interface PEOverlay {
  readonly offset: number;
  readonly size: number;
  readonly entropy: number;
  readonly percentage: number; // percentage of total file
  readonly present: boolean;
}

/** Mutable version of PEParsed for incremental construction during parsing. */
export type MutablePEParsed = { -readonly [K in keyof PEParsed]: PEParsed[K] };

/** Complete parsed PE structure. */
export interface PEParsed {
  readonly valid: boolean;
  readonly error?: string;

  // DOS header
  readonly dosStub: Buffer;
  readonly e_lfanew: number;

  // PE signature
  readonly peSignature: number;
  readonly peSignatureString: string;

  // COFF header
  readonly machine: CoffMachine;
  readonly machineRaw: number;
  readonly numberOfSections: number;
  readonly timeDateStamp: number;
  readonly pointerToSymbolTable: number;
  readonly numberOfSymbols: number;
  readonly sizeOfOptionalHeader: number;
  readonly characteristics: number;

  // Optional header
  readonly format: PEFormat;
  readonly entryPoint: number;
  readonly imageBase: number;
  readonly imageSize: number;
  readonly codeSize: number;
  readonly initializedDataSize: number;
  readonly uninitializedDataSize: number;
  readonly sectionAlignment: number;
  readonly fileAlignment: number;
  readonly majorOSVersion: number;
  readonly minorOSVersion: number;
  readonly majorImageVersion: number;
  readonly minorImageVersion: number;
  readonly majorSubsystemVersion: number;
  readonly minorSubsystemVersion: number;
  readonly win32VersionValue: number;
  readonly sizeOfHeaders: number;
  readonly checkSum: number;
  readonly subsystem: string;
  readonly dllCharacteristics: number;
  readonly sizeOfStackReserve: number;
  readonly sizeOfStackCommit: number;
  readonly sizeOfHeapReserve: number;
  readonly sizeOfHeapCommit: number;
  readonly loaderFlags: number;
  readonly numberOfDataDirectories: number;

  // Data directories
  readonly dataDirectories: readonly DataDirectory[];

  // Sections
  readonly sections: readonly PESection[];

  // Imports
  readonly imports: readonly PEImport[];
  readonly importsByDll: ReadonlyMap<string, readonly PEImport[]>;

  // Exports
  readonly exports: readonly PEExport[];

  // TLS
  readonly tls: TLSInfo | null;

  // Resources
  readonly resources: readonly PEResource[];

  // Certificates
  readonly certificates: readonly PECertificate[];

  // Overlay
  readonly overlay: PEOverlay;

  // Raw header bytes
  readonly rawDosHeader: Buffer;
  readonly rawCoffHeader: Buffer;
  readonly rawOptionalHeader: Buffer;
  readonly rawSectionTable: Buffer;

  // Relocations
  readonly baseRelocationCount: number;
}

/** Compiler/linker identification. */
export interface CompilerInfo {
  readonly compiler: CompilerType;
  readonly confidence: number;
  readonly linkTimeStamp: Date;
  readonly majorLinkerVersion: number;
  readonly minorLinkerVersion: number;
  readonly majorOSVersion: number;
  readonly minorOSVersion: number;
}

export type CompilerType =
  | 'MSVC'
  | 'MinGW'
  | 'Clang'
  | 'GCC'
  | 'Borland'
  | 'Delphi'
  | 'Rust'
  | 'Go'
  | '.NET Native'
  | 'Unknown';

/** Packer detection result. */
export interface PackerResult {
  readonly packer: string | null;
  readonly confidence: number;
  readonly signals: string[]; // what signals triggered
  readonly packerType: 'packer' | 'protector' | 'obfuscator' | null;
}

/** Timestamp analysis result. */
export interface TimestampAnalysis {
  readonly rawValue: number;
  readonly parsedDate: Date | null;
  readonly anomalyType: 'future' | 'epoch' | 'zero' | 'suspicious' | 'normal' | null;
  readonly anomalyDescription: string | null;
  readonly distanceFromNowDays: number;
}
