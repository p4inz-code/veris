/**
 * PE Compiler/Linker Fingerprinting — identifies the toolchain used to build the PE.
 *
 * Identifies:
 * - MSVC (Visual Studio versions)
 * - MinGW
 * - Clang/LLVM
 * - GCC
 * - Borland C++
 * - Delphi
 * - Rust
 * - Go
 * - .NET Native
 *
 * @module @veris/analysis/pe/analyzers/compiler
 */

import { MSVC_LINKER_VERSIONS } from '../constants.js';
import type { PEParsed, CompilerInfo, CompilerType } from '../types.js';

/** Identify the compiler/linker toolchain. */
export function identifyCompiler(pe: PEParsed): CompilerInfo {
  if (!pe.valid) {
    return {
      compiler: 'Unknown',
      confidence: 0,
      linkTimeStamp: new Date(0),
      majorLinkerVersion: 0,
      minorLinkerVersion: 0,
      majorOSVersion: 0,
      minorOSVersion: 0,
    };
  }

  const linkTimeStamp = new Date(pe.timeDateStamp * 1000);
  const majorLinker = pe.majorImageVersion;
  const minorLinker = pe.minorImageVersion;

  // Signal 1: Linker version ranges (MSVC specific)
  let compiler: CompilerType = 'Unknown';
  let confidence = 0;

  // MSVC detection via linker version
  if (majorLinker >= 6 && majorLinker <= 14) {
    const verKey = `${majorLinker}.${minorLinker}`;
    if (majorLinker >= 6) {
      // MSVC 6+
      compiler = 'MSVC';
      confidence = 0.7;
      if (MSVC_LINKER_VERSIONS.has(verKey)) {
        confidence = 0.85;
      }
    }
  }

  // Check for Rust via section names and linker patterns
  const rustSections = pe.sections.filter(
    (s) => s.name.startsWith('.rust') || s.name.startsWith('__rust'),
  );
  if (rustSections.length > 0) {
    if (compiler !== 'Unknown') confidence = Math.max(confidence, 0.5);
    compiler = 'Rust';
    confidence = Math.max(confidence, 0.8);
  }

  // Check for Go via section names and symbols
  const goSections = pe.sections.filter(
    (s) => s.name === '.gopclntab' || s.name === '.go_export' || s.name === '.init_array',
  );
  if (goSections.length > 0) {
    if (compiler !== 'Unknown') confidence = Math.max(confidence, 0.5);
    compiler = 'Go';
    confidence = Math.max(confidence, 0.85);
  }

  // Check for .NET via CLR header
  const clrDir = pe.dataDirectories.find((d) => d.type === 'clr-runtime-header');
  if (clrDir?.present) {
    if (compiler !== 'Unknown') confidence = Math.max(confidence, 0.5);
    compiler = '.NET Native';
    confidence = Math.max(confidence, 0.9);
  }

  // Check for Delphi via section names and characteristics
  const delphiSections = pe.sections.filter((s) => s.name === '.reloc' || s.name === '.idata');
  if (delphiSections.length >= 2 && pe.imports.length < 20) {
    // Delphi typically has minimal imports
    const borlandImports = pe.imports.some(
      (i) => i.dll.includes('borland') || i.dll.includes('system'),
    );
    if (borlandImports) {
      if (compiler !== 'Unknown') confidence = Math.max(confidence, 0.5);
      compiler = 'Borland';
      confidence = Math.max(confidence, 0.8);
    }
  }

  // Check for MinGW via import patterns
  const mingwImports = pe.imports.some((i) => i.dll === 'msvcrt.dll' && i.name === '_onexit');
  if (mingwImports && compiler === 'Unknown') {
    compiler = 'MinGW';
    confidence = 0.7;
  }

  // Check for GCC via section names
  const gccSections = pe.sections.filter(
    (s) => s.name === '.eh_frame' || s.name === '.gcc_except_table',
  );
  if (gccSections.length > 0 && compiler === 'Unknown') {
    compiler = 'GCC';
    confidence = 0.7;
  }

  // Check for Borland by linker version and sections
  if (majorLinker < 6 && compiler === 'Unknown') {
    const borlandSections = pe.sections.filter(
      (s) => s.name.startsWith('CODE') || s.name.startsWith('DATA'),
    );
    if (borlandSections.length > 0) {
      compiler = 'Borland';
      confidence = 0.6;
    }
  }

  return {
    compiler,
    confidence: Math.round(confidence * 100) / 100,
    linkTimeStamp,
    majorLinkerVersion: majorLinker,
    minorLinkerVersion: minorLinker,
    majorOSVersion: pe.majorOSVersion,
    minorOSVersion: pe.minorOSVersion,
  };
}
