/**
 * Packers and Protectors Knowledge Pack.
 *
 * Production-quality pack containing deterministic knowledge about
 * executable packers, cryptors, protectors, and obfuscation tools.
 *
 * @module @veris/knowledge/packs/data
 */

import type { KnowledgePack, KnowledgeEntry } from '../types.js';

function entry(
  overrides: Partial<KnowledgeEntry> & {
    id: string;
    name: string;
    description: string;
    category: string;
    behavior: string;
    recommendedAction: string;
  },
): KnowledgeEntry {
  return Object.freeze({
    tags: [],
    severity: 'medium',
    indicators: [],
    references: [],
    mitreTechniques: [],
    relatedEntries: [],
    ...overrides,
  });
}

const ENTRIES: readonly KnowledgeEntry[] = Object.freeze([
  entry({
    id: 'upx',
    name: 'UPX (Ultimate Packer for Executables)',
    description:
      'UPX is a free, open-source executable packer that compresses PE, ELF, and Mach-O binaries. While legitimate, it is widely abused by malware authors to obfuscate payloads and evade signature-based detection.',
    category: 'packers',
    severity: 'medium',
    tags: ['packer', 'compression', 'upx', 'pe', 'elf', 'obfuscation'],
    behavior:
      'Compresses executable files using an algorithm like NRV (Not Really Vanilla) or LZMA. The compressed executable contains a decompressor stub that decompresses the original code in memory at runtime.',
    recommendedAction:
      'UPX-packed binaries should be unpacked before analysis. Use upx -d to decompress. Monitor for known UPX section names (.UPX0, .UPX1).',
    indicators: [
      {
        type: 'section-name',
        value: 'UPX0',
        confidence: 0.95,
        description: 'UPX compressed code section',
      },
      {
        type: 'section-name',
        value: 'UPX1',
        confidence: 0.95,
        description: 'UPX compressed data section',
      },
      {
        type: 'section-name',
        value: 'UPX2',
        confidence: 0.9,
        description: 'UPX additional compressed section',
      },
      { type: 'string-pattern', value: 'UPX!', confidence: 0.8, description: 'UPX magic marker' },
      {
        type: 'string-pattern',
        value: 'UPX 0.89',
        confidence: 0.7,
        description: 'UPX version 0.89 marker',
      },
      {
        type: 'string-pattern',
        value: 'UPX 1.0',
        confidence: 0.7,
        description: 'UPX version 1.0 marker',
      },
      {
        type: 'string-pattern',
        value: 'UPX 2.',
        confidence: 0.7,
        description: 'UPX version 2.x marker',
      },
      {
        type: 'string-pattern',
        value: 'UPX 3.',
        confidence: 0.7,
        description: 'UPX version 3.x marker',
      },
    ],
    references: [
      { label: 'UPX Official Site', url: 'https://upx.github.io/', source: 'official' },
      {
        label: 'MITRE ATT&CK T1027.002',
        url: 'https://attack.mitre.org/techniques/T1027/002/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1027.002'],
    relatedEntries: ['themida', 'vmprotect', 'aspack'],
  }),
  entry({
    id: 'themida',
    name: 'Themida',
    description:
      'Themida is a commercial software protection and anti-reverse engineering tool that combines code obfuscation, virtualization, anti-debugging, and packing. Widely used by malware to evade analysis.',
    category: 'packers',
    severity: 'high',
    tags: ['packer', 'protector', 'virtualization', 'anti-debug', 'themida'],
    behavior:
      'Applies multiple protection layers including code virtualization (transforms x86 code into VM bytecode), anti-debugging tricks (int3, IsDebuggerPresent, NtGlobalFlag checks), anti-VM, import obfuscation, and API hooking detection.',
    recommendedAction:
      'Themida-packed samples require specialized unpacking tools. Monitor for known Themida section names (.Themida, .Oreans). Use sandbox environments that bypass anti-VM checks.',
    indicators: [
      {
        type: 'section-name',
        value: '.Themida',
        confidence: 0.95,
        description: 'Themida protection section',
      },
      {
        type: 'section-name',
        value: '.Oreans',
        confidence: 0.95,
        description: 'Oreans (Themida) section',
      },
      {
        type: 'section-name',
        value: '.sforce',
        confidence: 0.7,
        description: 'Themida force section',
      },
      {
        type: 'section-name',
        value: 'CODE',
        confidence: 0.3,
        description: 'Standard code section (in Themida-packed files)',
      },
      {
        type: 'string-pattern',
        value: 'Themida',
        confidence: 0.9,
        description: 'Themida identifier string',
      },
      {
        type: 'api-call',
        value: 'OutputDebugStringA',
        confidence: 0.4,
        description: 'Anti-debug API used by Themida',
      },
      {
        type: 'api-call',
        value: 'NtQueryInformationProcess',
        confidence: 0.3,
        description: 'Process information query used for anti-debug',
      },
    ],
    references: [
      { label: 'Oreans Technologies', url: 'https://www.oreans.com/', source: 'vendor' },
    ],
    mitreTechniques: ['T1027.002', 'T1027.001', 'T1622'],
    relatedEntries: ['upx', 'vmprotect', 'aspack'],
  }),
  entry({
    id: 'vmprotect',
    name: 'VMProtect',
    description:
      'VMProtect is a commercial software protection system that uses code virtualization to convert x86/x64 instructions into bytecode executed by a custom virtual machine, making reverse engineering extremely difficult.',
    category: 'packers',
    severity: 'high',
    tags: ['packer', 'virtualization', 'vmprotect', 'anti-debug', 'protector'],
    behavior:
      'Transforms selected x86/x64 code into bytecode interpreted by a custom VM. Applies mutation, encryption, and anti-debug techniques including import obfuscation and integrity checks.',
    recommendedAction:
      'VMProtect-packed binaries are among the most difficult to analyze. Look for known section names (VMP0, VMP1). Requires dynamic analysis in protected environments.',
    indicators: [
      {
        type: 'section-name',
        value: 'VMP0',
        confidence: 0.95,
        description: 'VMProtect code section',
      },
      {
        type: 'section-name',
        value: 'VMP1',
        confidence: 0.95,
        description: 'VMProtect data section',
      },
      {
        type: 'section-name',
        value: 'VMP2',
        confidence: 0.9,
        description: 'VMProtect import section',
      },
      {
        type: 'string-pattern',
        value: 'VMProtect',
        confidence: 0.9,
        description: 'VMProtect identifier',
      },
      {
        type: 'string-pattern',
        value: 'VMP',
        confidence: 0.3,
        description: 'VMProtect abbreviation',
      },
    ],
    references: [{ label: 'VMProtect Official', url: 'https://vmpsoft.com/', source: 'vendor' }],
    mitreTechniques: ['T1027.002', 'T1027.001'],
    relatedEntries: ['themida', 'upx', 'aspack'],
  }),
  entry({
    id: 'aspack',
    name: 'ASPack',
    description:
      'ASPack is a Win32 executable packer that compresses PE files. It was historically popular among malware authors for its simplicity and effectiveness at evading early antivirus signatures.',
    category: 'packers',
    severity: 'medium',
    tags: ['packer', 'compression', 'aspack', 'pe', 'obfuscation'],
    behavior:
      'Compresses PE executables with an integrated decompressor stub. The stub decompresses the original code into memory and handles import resolution transparently.',
    recommendedAction:
      'ASPack-packed files can be unpacked using generic unpacking tools. Look for .aspack section name in PE headers.',
    indicators: [
      { type: 'section-name', value: '.aspack', confidence: 0.9, description: 'ASPack section' },
      {
        type: 'section-name',
        value: '.adata',
        confidence: 0.8,
        description: 'ASPack data section',
      },
      {
        type: 'string-pattern',
        value: 'ASPack',
        confidence: 0.85,
        description: 'ASPack identifier',
      },
    ],
    references: [{ label: 'ASPack', url: 'http://www.aspack.com/', source: 'vendor' }],
    mitreTechniques: ['T1027.002'],
    relatedEntries: ['upx', 'themida'],
  }),
  entry({
    id: 'confuser-ex',
    name: 'ConfuserEx / .NET Obfuscators',
    description:
      'ConfuserEx is an open-source .NET obfuscator that applies renaming, control flow obfuscation, anti-tamper, and anti-debug protections to .NET assemblies. Frequently used to protect malware written in C#.',
    category: 'packers',
    severity: 'high',
    tags: ['packer', 'obfuscation', 'dotnet', 'confuserex', 'renaming'],
    behavior:
      'Renames types, methods, and fields to meaningless identifiers. Applies control flow obfuscation (spaghetti code), string encryption, constant folding, and anti-tamper checks that detect IL modification.',
    recommendedAction:
      'Use deobfuscation tools like de4dot to unpack ConfuserEx-protected assemblies. Monitor for known ConfuserEx markers in .NET metadata.',
    indicators: [
      {
        type: 'string-pattern',
        value: 'Confuser',
        confidence: 0.8,
        description: 'ConfuserEx identifier',
      },
      {
        type: 'string-pattern',
        value: 'ConfuserEx',
        confidence: 0.9,
        description: 'ConfuserEx full name',
      },
      {
        type: 'string-pattern',
        value: 'Obfuscated',
        confidence: 0.5,
        description: 'Obfuscation marker',
      },
      {
        type: 'feature-type',
        value: 'dotnet-metadata',
        confidence: 0.4,
        description: '.NET assembly metadata',
      },
    ],
    references: [
      {
        label: 'ConfuserEx GitHub',
        url: 'https://github.com/mkaring/ConfuserEx',
        source: 'github',
      },
    ],
    mitreTechniques: ['T1027.002', 'T1027.001'],
    relatedEntries: ['themida', 'vmprotect'],
  }),
  entry({
    id: 'mpress',
    name: 'MPRESS',
    description:
      'MPRESS is a free executable packer that compresses PE and .NET executables. Its small stub size and effectiveness make it a common choice for packing malware.',
    category: 'packers',
    severity: 'medium',
    tags: ['packer', 'compression', 'mpress', 'pe', 'dotnet'],
    behavior:
      'Compresses PE/ELF/Mach-O executables using LZMA compression. The decompressor stub is minimal, leaving a small footprint. Decompresses and executes the original code from memory.',
    recommendedAction:
      'Look for MPRESS section names (.MPRESS1, .MPRESS2). Use PE analyzers that detect MPRESS signatures.',
    indicators: [
      {
        type: 'section-name',
        value: '.MPRESS1',
        confidence: 0.9,
        description: 'MPRESS compressed section',
      },
      {
        type: 'section-name',
        value: '.MPRESS2',
        confidence: 0.85,
        description: 'MPRESS data section',
      },
      {
        type: 'string-pattern',
        value: 'MPRESS',
        confidence: 0.8,
        description: 'MPRESS identifier',
      },
    ],
    references: [
      { label: 'MPRESS Official', url: 'http://www.matcode.com/mpress.htm', source: 'vendor' },
    ],
    mitreTechniques: ['T1027.002'],
    relatedEntries: ['upx', 'aspack'],
  }),
  entry({
    id: 'enigma-protector',
    name: 'Enigma Protector',
    description:
      'Enigma Protector is a commercial software protection system that combines packing, code virtualization, encryption, and anti-debugging. Used by both legitimate software and malware.',
    category: 'packers',
    severity: 'high',
    tags: ['packer', 'protector', 'virtualization', 'enigma', 'anti-debug'],
    behavior:
      'Applies multiple protection layers: code virtualization, native code encryption, import protection, anti-debugging (int3, hardware breakpoints, timing checks), anti-dumping, and integrity verification.',
    recommendedAction:
      'Enigma-protected binaries require specialized analysis tools. Look for `.enigma` section names. Dynamic analysis in properly configured sandboxes is recommended.',
    indicators: [
      {
        type: 'section-name',
        value: '.enigma',
        confidence: 0.9,
        description: 'Enigma protector section',
      },
      {
        type: 'section-name',
        value: '.enigma1',
        confidence: 0.9,
        description: 'Enigma code section',
      },
      {
        type: 'section-name',
        value: '.enigma2',
        confidence: 0.85,
        description: 'Enigma data section',
      },
      {
        type: 'string-pattern',
        value: 'Enigma',
        confidence: 0.7,
        description: 'Enigma identifier',
      },
    ],
    references: [
      { label: 'Enigma Protector', url: 'https://enigmaprotector.com/', source: 'vendor' },
    ],
    mitreTechniques: ['T1027.002', 'T1027.001', 'T1622'],
    relatedEntries: ['themida', 'vmprotect'],
  }),
]);

export const PACKERS_PACK: KnowledgePack = Object.freeze({
  metadata: Object.freeze({
    id: 'packers',
    name: 'Packers and Protectors',
    version: '1.0.0',
    description:
      'Executable packers, cryptors, protectors, and obfuscation tools used to conceal malicious code, including UPX, Themida, VMProtect, ConfuserEx, and others.',
    author: 'VERIS Team',
    license: 'UNLICENSED',
    source: 'https://github.com/veris/veris',
    checksum: '',
    categories: ['packers'],
    tags: ['packers', 'obfuscation', 'compression', 'cryptors', 'protectors'],
    supportedVerisVersion: '0.1.0',
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
    dependencies: [],
    references: [
      {
        label: 'MITRE ATT&CK T1027',
        url: 'https://attack.mitre.org/techniques/T1027/',
        source: 'mitre-attack',
      },
    ],
  }),
  entries: ENTRIES,
  contentHash: '',
});
