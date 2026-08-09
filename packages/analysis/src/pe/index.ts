/**
 * PE (Portable Executable) Analysis — barrel export.
 *
 * Exports the complete PE analysis engine for static analysis of
 * PE/COFF binary files (Windows executables, DLLs, drivers, etc.).
 *
 * @module @veris/analysis/pe
 */

// Core types
export type {
  PEParsed,
  PESection,
  SectionCharacteristics,
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
  PackerResult,
  TimestampAnalysis,
} from './types.js';

// Constants
export {
  DOS_MAGIC,
  PE_SIGNATURE,
  SCN_MEM_EXECUTE,
  SCN_MEM_WRITE,
  SCN_MEM_READ,
  HIGH_ENTROPY_THRESHOLD,
  VERY_HIGH_ENTROPY_THRESHOLD,
  MACHINE_NAMES,
  SUBSYSTEM_NAMES,
  SUSPICIOUS_APIS,
  KNOWN_PACKER_SECTIONS,
  STANDARD_SECTION_NAMES,
} from './constants.js';

// Parser
export { parsePE, computeEntropy, rvaToOffset } from './parser.js';

// Engine
export { analyzePE } from './engine.js';
export type { PEEvidence, PEResult } from './engine.js';

// Sub-analyzers
export { analyzeSections } from './analyzers/sections.js';
export { analyzeImports } from './analyzers/imports.js';
export { detectPacker } from './analyzers/packer-detector.js';
export { analyzeOverlay } from './analyzers/overlay.js';
export { identifyCompiler } from './analyzers/compiler.js';
export { analyzeTLS } from './analyzers/tls.js';
export { analyzeResources } from './analyzers/resources.js';
export { analyzeSignature } from './analyzers/signature.js';
export { analyzeTimestamp } from './analyzers/timestamp.js';
export { analyzeEntryPoint } from './analyzers/entrypoint.js';
