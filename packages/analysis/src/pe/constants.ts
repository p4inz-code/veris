/**
 * PE (Portable Executable) format constants.
 *
 * @module @veris/analysis/pe/constants
 */

// ── DOS Header ──
export const DOS_MAGIC = 0x5a4d; // "MZ"
export const DOS_HEADER_SIZE = 64;
export const DOS_STUB_MAX_SIZE = 128;

// ── PE Signature ──
export const PE_SIGNATURE = 0x00004550; // "PE\0\0"
export const PE_SIGNATURE_OFFSET_FIELD = 0x3c; // offset to e_lfanew in DOS header

// ── COFF Header ──
export const COFF_HEADER_SIZE = 20;
export const COFF_MACHINE_OFFSET = 0;
export const COFF_SECTIONS_OFFSET = 2;
export const COFF_TIMESTAMP_OFFSET = 4;
export const COFF_SYMBOLTABLE_OFFSET = 8;
export const COFF_SYMBOLS_OFFSET = 12;
export const COFF_OPTHEADER_SIZE_OFFSET = 16;
export const COFF_CHARACTERISTICS_OFFSET = 18;

// ── Machine Types ──
export const MACHINE_I386 = 0x014c;
export const MACHINE_AMD64 = 0x8664;
export const MACHINE_ARMNT = 0x01c4;
export const MACHINE_ARM64 = 0xaa64;
export const MACHINE_IA64 = 0x0200;
export const MACHINE_ARM = 0x01c2;
export const MACHINE_ARM_THUMB = 0x01c1;
export const MACHINE_MIPS = 0x0142;
export const MACHINE_POWERPC = 0x01f0;
export const MACHINE_POWERPC64 = 0x01f1;
export const MACHINE_RISCV32 = 0x5032;
export const MACHINE_RISCV64 = 0x5064;

export const MACHINE_NAMES: ReadonlyMap<number, string> = new Map([
  [MACHINE_I386, 'I386'],
  [MACHINE_AMD64, 'AMD64'],
  [MACHINE_ARMNT, 'ARMNT'],
  [MACHINE_ARM64, 'ARM64'],
  [MACHINE_IA64, 'IA64'],
  [MACHINE_ARM, 'ARM'],
  [MACHINE_ARM_THUMB, 'ARM Thumb'],
  [MACHINE_MIPS, 'MIPS'],
  [MACHINE_POWERPC, 'PowerPC'],
  [MACHINE_POWERPC64, 'PowerPC64'],
  [MACHINE_RISCV32, 'RISC-V'],
  [MACHINE_RISCV64, 'RISC-V'],
]);

// ── Optional Header Magic ──
export const OPT_MAGIC_PE32 = 0x010b;
export const OPT_MAGIC_PE32_PLUS = 0x020b;
export const OPT_HEADER_SIZE_PE32 = 224;
export const OPT_HEADER_SIZE_PE32_PLUS = 240;

// ── Section Characteristics ──
export const SCN_IS_CODE = 0x00000020;
export const SCN_IS_INITIALIZED_DATA = 0x00000040;
export const SCN_IS_UNINITIALIZED_DATA = 0x00000080;
export const SCN_LNK_REMOVE = 0x00000800;
export const SCN_LNK_COMDAT = 0x00001000;
export const SCN_NO_DEFER_SPEC_EXC = 0x00004000;
export const SCN_GPREL = 0x00008000;
export const SCN_MEM_PURGEABLE = 0x00020000;
export const SCN_MEM_16BIT = 0x00020000;
export const SCN_MEM_LOCKED = 0x00040000;
export const SCN_MEM_PRELOAD = 0x00080000;
export const SCN_ALIGN_1BYTES = 0x00100000;
export const SCN_ALIGN_2BYTES = 0x00200000;
export const SCN_ALIGN_4BYTES = 0x00300000;
export const SCN_ALIGN_8BYTES = 0x00400000;
export const SCN_ALIGN_16BYTES = 0x00500000;
export const SCN_ALIGN_32BYTES = 0x00600000;
export const SCN_ALIGN_64BYTES = 0x00700000;
export const SCN_ALIGN_128BYTES = 0x00800000;
export const SCN_ALIGN_256BYTES = 0x00900000;
export const SCN_ALIGN_512BYTES = 0x00a00000;
export const SCN_ALIGN_1024BYTES = 0x00b00000;
export const SCN_ALIGN_2048BYTES = 0x00c00000;
export const SCN_ALIGN_4096BYTES = 0x00d00000;
export const SCN_ALIGN_8192BYTES = 0x00e00000;
export const SCN_LNK_NRELOC_OVFL = 0x01000000;
export const SCN_MEM_DISCARDABLE = 0x02000000;
export const SCN_MEM_NOT_CACHED = 0x04000000;
export const SCN_MEM_NOT_PAGED = 0x08000000;
export const SCN_MEM_SHARED = 0x10000000;
export const SCN_MEM_EXECUTE = 0x20000000;
export const SCN_MEM_READ = 0x40000000;
export const SCN_MEM_WRITE = 0x80000000;

export const SECTION_HEADER_SIZE = 40;

// ── Data Directory Types ──
export const IMAGE_DIRECTORY_ENTRY_EXPORT = 0;
export const IMAGE_DIRECTORY_ENTRY_IMPORT = 1;
export const IMAGE_DIRECTORY_ENTRY_RESOURCE = 2;
export const IMAGE_DIRECTORY_ENTRY_EXCEPTION = 3;
export const IMAGE_DIRECTORY_ENTRY_CERTIFICATE = 4;
export const IMAGE_DIRECTORY_ENTRY_BASERELOC = 5;
export const IMAGE_DIRECTORY_ENTRY_DEBUG = 6;
export const IMAGE_DIRECTORY_ENTRY_ARCHITECTURE = 7;
export const IMAGE_DIRECTORY_ENTRY_GLOBALPTR = 8;
export const IMAGE_DIRECTORY_ENTRY_TLS = 9;
export const IMAGE_DIRECTORY_ENTRY_LOAD_CONFIG = 10;
export const IMAGE_DIRECTORY_ENTRY_BOUND_IMPORT = 11;
export const IMAGE_DIRECTORY_ENTRY_IAT = 12;
export const IMAGE_DIRECTORY_ENTRY_DELAY_IMPORT = 13;
export const IMAGE_DIRECTORY_ENTRY_CLR_RUNTIME = 14;

export const DATA_DIRECTORY_NAMES: ReadonlyMap<number, string> = new Map([
  [0, 'export-table'],
  [1, 'import-table'],
  [2, 'resource-table'],
  [3, 'exception-table'],
  [4, 'certificate-table'],
  [5, 'base-relocation-table'],
  [6, 'debug'],
  [7, 'architecture'],
  [8, 'global-ptr'],
  [9, 'tls-table'],
  [10, 'load-config-table'],
  [11, 'bound-import'],
  [12, 'iat'],
  [13, 'delay-import-descriptor'],
  [14, 'clr-runtime-header'],
]);

// ── Subsystem values ──
export const SUBSYSTEM_UNKNOWN = 0;
export const SUBSYSTEM_NATIVE = 1;
export const SUBSYSTEM_WINDOWS_GUI = 2;
export const SUBSYSTEM_WINDOWS_CUI = 3;
export const SUBSYSTEM_OS2_CUI = 5;
export const SUBSYSTEM_POSIX_CUI = 7;
export const SUBSYSTEM_NATIVE_WINDOWS = 8;
export const SUBSYSTEM_WINDOWS_CE_GUI = 9;
export const SUBSYSTEM_EFI_APPLICATION = 10;
export const SUBSYSTEM_EFI_BOOT_SERVICE_DRIVER = 11;
export const SUBSYSTEM_EFI_RUNTIME_DRIVER = 12;
export const SUBSYSTEM_EFI_ROM = 13;
export const SUBSYSTEM_XBOX = 14;
export const SUBSYSTEM_WINDOWS_BOOT_APPLICATION = 16;

export const SUBSYSTEM_NAMES: ReadonlyMap<number, string> = new Map([
  [0, 'unknown'],
  [1, 'native'],
  [2, 'windows-gui'],
  [3, 'windows-console'],
  [5, 'os2-console'],
  [7, 'posix-console'],
  [8, 'native-windows'],
  [9, 'windows-ce'],
  [10, 'efi-application'],
  [11, 'efi-boot-driver'],
  [12, 'efi-runtime-driver'],
  [13, 'efi-rom'],
  [14, 'xbox'],
  [16, 'windows-boot-application'],
]);

// ── DLL Characteristics ──
export const DLLC_HIGH_ENTROPY_VA = 0x0020;
export const DLLC_DYNAMIC_BASE = 0x0040;
export const DLLC_FORCE_INTEGRITY = 0x0080;
export const DLLC_NX_COMPAT = 0x0100;
export const DLLC_NO_ISOLATION = 0x0200;
export const DLLC_NO_SEH = 0x0400;
export const DLLC_NO_BIND = 0x0800;
export const DLLC_APPCONTAINER = 0x1000;
export const DLLC_WDM_DRIVER = 0x2000;
export const DLLC_GUARD_CF = 0x4000;
export const DLLC_TERMINAL_SERVER_AWARE = 0x8000;

// ── Resource Types ──
export const RT_CURSOR = 1;
export const RT_BITMAP = 2;
export const RT_ICON = 3;
export const RT_MENU = 4;
export const RT_DIALOG = 5;
export const RT_STRING = 6;
export const RT_FONTDIR = 7;
export const RT_FONT = 8;
export const RT_ACCELERATOR = 9;
export const RT_RCDATA = 10;
export const RT_MESSAGETABLE = 11;
export const RT_GROUP_CURSOR = 12;
export const RT_GROUP_ICON = 14;
export const RT_VERSION = 16;
export const RT_DLGINCLUDE = 17;
export const RT_PLUGPLAY = 19;
export const RT_VXD = 20;
export const RT_ANICURSOR = 21;
export const RT_ANIICON = 22;
export const RT_HTML = 23;
export const RT_MANIFEST = 24;

export const RESOURCE_TYPE_NAMES: ReadonlyMap<number, string> = new Map([
  [1, 'cursor'],
  [2, 'bitmap'],
  [3, 'icon'],
  [4, 'menu'],
  [5, 'dialog'],
  [6, 'string-table'],
  [7, 'font-directory'],
  [8, 'font'],
  [9, 'accelerator'],
  [10, 'rc-data'],
  [11, 'message-table'],
  [12, 'group-cursor'],
  [14, 'group-icon'],
  [16, 'version'],
  [17, 'dlg-include'],
  [19, 'plug-play'],
  [20, 'vxd'],
  [21, 'ani-cursor'],
  [22, 'ani-icon'],
  [23, 'html'],
  [24, 'manifest'],
]);

// ── Known Packer Section Names ──
export const KNOWN_PACKER_SECTIONS: ReadonlyMap<string, string> = new Map([
  ['UPX0', 'UPX'],
  ['UPX1', 'UPX'],
  ['UPX2', 'UPX'],
  ['.UPX0', 'UPX'],
  ['.UPX1', 'UPX'],
  ['.UPX2', 'UPX'],
  ['.Themida', 'Themida'],
  ['.Oreans', 'Themida'],
  ['.sforce', 'Themida'],
  ['VMP0', 'VMProtect'],
  ['VMP1', 'VMProtect'],
  ['VMP2', 'VMProtect'],
  ['.aspack', 'ASPack'],
  ['.adata', 'ASPack'],
  ['.MPRESS1', 'MPRESS'],
  ['.MPRESS2', 'MPRESS'],
  ['.enigma', 'Enigma'],
  ['.enigma1', 'Enigma'],
  ['.enigma2', 'Enigma'],
  ['.packed', 'Generic'],
  ['.pdata', 'Generic'],
  ['.sforce', 'Themida'],
  ['PEC2', 'PECompact'],
  ['.pec', 'PECompact'],
  ['nsp0', 'NSIS'],
  ['nsp1', 'NSIS'],
  ['.RLPack', 'RLPack'],
  ['.RLP', 'RLPack'],
  ['.petite', 'Petite'],
  ['.pett', 'Petite'],
  ['.MPRO', 'Morphine'],
  ['.MOR', 'Morphine'],
  ['.taz', 'tElock'],
  ['.tls0', 'tElock'],
  ['.arm0', 'Armadillo'],
  ['.arm1', 'Armadillo'],
  ['.WWP', 'WWPACK'],
  ['.winapi', 'WinAPI'],
  ['SHCode', 'ShadowProtect'],
]);

// ── Compiler Signature Strings ──
export const COMPILER_SIGNATURES: ReadonlyArray<{
  readonly pattern: string;
  readonly compiler: string;
  readonly confidence: number;
}> = Object.freeze([
  { pattern: 'Microsoft Visual C++', compiler: 'MSVC', confidence: 0.9 },
  { pattern: 'Visual C++', compiler: 'MSVC', confidence: 0.85 },
  { pattern: 'MSVC', compiler: 'MSVC', confidence: 0.8 },
  { pattern: 'LINK', compiler: 'MSVC', confidence: 0.7 },
  { pattern: 'MinGW', compiler: 'MinGW', confidence: 0.95 },
  { pattern: 'GCC', compiler: 'GCC', confidence: 0.8 },
  { pattern: 'GNU C', compiler: 'GCC', confidence: 0.85 },
  { pattern: 'GNU AS', compiler: 'GCC', confidence: 0.7 },
  { pattern: 'clang', compiler: 'Clang', confidence: 0.9 },
  { pattern: 'LLVM', compiler: 'Clang', confidence: 0.85 },
  { pattern: 'Borland', compiler: 'Borland', confidence: 0.9 },
  { pattern: 'Delphi', compiler: 'Delphi', confidence: 0.95 },
  { pattern: 'rustc', compiler: 'Rust', confidence: 0.9 },
  { pattern: 'Rust', compiler: 'Rust', confidence: 0.8 },
  { pattern: 'go', compiler: 'Go', confidence: 0.7 },
  { pattern: 'Go Build', compiler: 'Go', confidence: 0.85 },
  { pattern: '.NET', compiler: '.NET Native', confidence: 0.6 },
  { pattern: 'Mono', compiler: '.NET Native', confidence: 0.7 },
]);

// ── Known Suspicious API DLLs ──
export const SUSPICIOUS_DLLS: readonly string[] = Object.freeze([
  'kernel32.dll',
  'ntdll.dll',
  'advapi32.dll',
  'ws2_32.dll',
  'wininet.dll',
  'urlmon.dll',
  'crypt32.dll',
  'bcrypt.dll',
  'wmi.dll',
  'combase.dll',
  'ole32.dll',
  'dbghelp.dll',
]);

// ── Suspicious API patterns (grouped by category) ──
export const SUSPICIOUS_APIS: ReadonlyMap<string, readonly string[]> = new Map([
  [
    'memory-injection',
    [
      'VirtualAllocEx',
      'VirtualProtectEx',
      'WriteProcessMemory',
      'CreateRemoteThread',
      'NtCreateThreadEx',
      'RtlCreateUserThread',
      'QueueUserAPC',
      'SetThreadContext',
    ],
  ],
  [
    'credential-access',
    [
      'MiniDumpWriteDump',
      'OpenProcess',
      'AdjustTokenPrivileges',
      'SeDebugPrivilege',
      'CryptUnprotectData',
    ],
  ],
  [
    'process-manipulation',
    [
      'CreateProcess',
      'CreateProcessAsUser',
      'WinExec',
      'ShellExecuteEx',
      'CreateProcessWithLogonW',
    ],
  ],
  [
    'network-communication',
    [
      'WSAStartup',
      'socket',
      'connect',
      'send',
      'recv',
      'WSASocket',
      'InternetOpen',
      'InternetConnect',
      'HttpOpenRequest',
      'URLDownloadToFile',
      'URLDownloadToCacheFile',
    ],
  ],
  [
    'persistence',
    [
      'CreateService',
      'ChangeServiceConfig',
      'RegCreateKeyEx',
      'RegSetValueEx',
      'SchRpcRegisterTask',
      'CopyFile',
    ],
  ],
  [
    'anti-debug',
    [
      'IsDebuggerPresent',
      'CheckRemoteDebuggerPresent',
      'NtQueryInformationProcess',
      'NtSetInformationThread',
      'OutputDebugStringA',
      'CloseHandle',
    ],
  ],
  [
    'crypto',
    ['CryptEncrypt', 'CryptDecrypt', 'CryptProtectData', 'BCryptEncrypt', 'BCryptDecrypt'],
  ],
  [
    'code-injection',
    [
      'VirtualAlloc',
      'VirtualProtect',
      'MapViewOfFile',
      'CreateFileMapping',
      'NtUnmapViewOfSection',
      'WriteProcessMemory',
    ],
  ],
]);

// ── Common Non-Standard Section Names ──
export const STANDARD_SECTION_NAMES: readonly string[] = Object.freeze([
  '.text',
  '.data',
  '.rdata',
  '.idata',
  '.edata',
  '.pdata',
  '.rsrc',
  '.reloc',
  '.tls',
  '.debug',
  '.bss',
  '.crt',
  '.stab',
  '.stabstr',
  '.ctors',
  '.dtors',
]);

// ── Entropy Thresholds ──
export const HIGH_ENTROPY_THRESHOLD = 7.0;
export const VERY_HIGH_ENTROPY_THRESHOLD = 7.5;

// ── Certificate Constants ──
export const CERT_REVISION_1 = 0x0100;
export const CERT_REVISION_2 = 0x0200;
export const CERT_TYPE_PKCS_SIGNED_DATA = 2;

// ── Linker Versions ──
export const MSVC_LINKER_VERSIONS: ReadonlyMap<string, string> = new Map([
  ['6.0', 'Visual Studio 6.0'],
  ['7.0', 'Visual Studio .NET 2002'],
  ['7.1', 'Visual Studio .NET 2003'],
  ['8.0', 'Visual Studio 2005'],
  ['9.0', 'Visual Studio 2008'],
  ['10.0', 'Visual Studio 2010'],
  ['11.0', 'Visual Studio 2012'],
  ['12.0', 'Visual Studio 2013'],
  ['14.0', 'Visual Studio 2015'],
  ['14.1', 'Visual Studio 2017'],
  ['14.2', 'Visual Studio 2019'],
  ['14.3', 'Visual Studio 2022'],
]);

// ── Resource Language IDs ──
export const LANGUAGE_NAMES: ReadonlyMap<number, string> = new Map([
  [0x0409, 'en-US'],
  [0x0809, 'en-GB'],
  [0x0c09, 'en-AU'],
  [0x0407, 'de-DE'],
  [0x040c, 'fr-FR'],
  [0x0410, 'it-IT'],
  [0x040a, 'es-ES'],
  [0x0411, 'ja-JP'],
  [0x0804, 'zh-CN'],
  [0x0c04, 'zh-HK'],
  [0x0412, 'ko-KR'],
  [0x0419, 'ru-RU'],
  [0x0416, 'pt-BR'],
  [0x0413, 'nl-NL'],
  [0x041d, 'sv-SE'],
]);
