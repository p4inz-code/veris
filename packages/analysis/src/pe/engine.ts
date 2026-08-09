/**
 * PE Analysis Engine — orchestrates all PE sub-analyzers and produces evidence.
 *
 * Runs all analysis modules and produces:
 * - Section findings (RWX, entropy, names, anomalies)
 * - Import findings (grouped by category, suspicious combinations)
 * - Packer detection (multi-signal)
 * - Overlay analysis
 * - Compiler fingerprinting
 * - TLS callback analysis
 * - Resource analysis
 * - Signature analysis
 * - Timestamp analysis
 * - Entry point analysis
 *
 * @module @veris/analysis/pe/engine
 */

import { deterministicId } from '@veris/shared';

import { identifyCompiler } from './analyzers/compiler.js';
import { analyzeEntryPoint } from './analyzers/entrypoint.js';
import { analyzeImports } from './analyzers/imports.js';
import { analyzeOverlay } from './analyzers/overlay.js';
import { detectPacker } from './analyzers/packer-detector.js';
import { analyzeResources } from './analyzers/resources.js';
import { analyzeSections } from './analyzers/sections.js';
import { analyzeSignature } from './analyzers/signature.js';
import { analyzeTimestamp } from './analyzers/timestamp.js';
import { analyzeTLS } from './analyzers/tls.js';
import { parsePE, computeEntropy } from './parser.js';
import type {
  PEParsed,
  PESection,
  PEImport,
  PEExport,
  PEResource,
  PEOverlay,
  PECertificate,
  TLSInfo,
  CompilerInfo,
  PackerResult,
} from './types.js';

/** A single PE analysis evidence item. */
export interface PEEvidence {
  readonly id: string;
  readonly artifactId: string;
  readonly type: string;
  readonly category: string;
  readonly confidence: number;
  readonly explanation: string;
  readonly metadata: Record<string, unknown>;
  readonly offsets: readonly number[];
}

/** Complete PE analysis result for an artifact. */
export interface PEResult {
  readonly parsed: PEParsed;
  readonly evidence: readonly PEEvidence[];
  readonly packer: PackerResult;
  readonly compiler: CompilerInfo;
  readonly sectionCount: number;
  readonly importCount: number;
  readonly exportCount: number;
  readonly hasSignature: boolean;
  readonly hasOverlay: boolean;
  readonly hasTLS: boolean;
  readonly suspiciousScore: number; // 0-10
}

/**
 * Analyze a PE binary from raw buffer data.
 */
export function analyzePE(buffer: Buffer, artifactId: string, filePath?: string): PEResult {
  const evidence: PEEvidence[] = [];

  // Step 1: Parse the PE binary
  const parsed = parsePE(buffer, filePath);

  if (!parsed.valid) {
    return {
      parsed,
      evidence: Object.freeze([]),
      packer: { packer: null, confidence: 0, signals: [], packerType: null },
      compiler: {
        compiler: 'Unknown',
        confidence: 0,
        linkTimeStamp: new Date(0),
        majorLinkerVersion: 0,
        minorLinkerVersion: 0,
        majorOSVersion: 0,
        minorOSVersion: 0,
      },
      sectionCount: 0,
      importCount: 0,
      exportCount: 0,
      hasSignature: false,
      hasOverlay: false,
      hasTLS: false,
      suspiciousScore: 0,
    };
  }

  // General PE format evidence
  evidence.push({
    id: deterministicId('ev', artifactId, 'pe-format', parsed.machine.toString()),
    artifactId,
    type: 'pe-format',
    category: 'executable',
    confidence: 1.0,
    explanation: `PE executable format detected: ${parsed.machine} (${parsed.format}, ${parsed.numberOfSections} sections, subsystem: ${parsed.subsystem})`,
    metadata: {
      machine: parsed.machine,
      format: parsed.format,
      numberOfSections: parsed.numberOfSections,
      subsystem: parsed.subsystem,
      checksum: parsed.checkSum,
      entryPoint: parsed.entryPoint,
      imageBase: parsed.imageBase,
      imageSize: parsed.imageSize,
      peOffset: parsed.e_lfanew,
      coffOffset: parsed.e_lfanew + 4,
      sectionAlignment: parsed.sectionAlignment,
      fileAlignment: parsed.fileAlignment,
      majorOSVersion: parsed.majorOSVersion,
      minorOSVersion: parsed.minorOSVersion,
      dllCharacteristics: parsed.dllCharacteristics,
    },
    offsets: [parsed.e_lfanew],
  });

  // Step 2: Section analysis
  const sectionFindings = analyzeSections(parsed);
  for (const finding of sectionFindings) {
    const sectionName = finding.section;
    const sectionMeta = parsed.sections.find((s) => s.name === sectionName);
    evidence.push({
      id: deterministicId('ev', artifactId, finding.type, finding.section),
      artifactId,
      type: finding.type,
      category: 'executable',
      confidence: finding.confidence,
      explanation: finding.explanation,
      metadata: {
        ...(finding.metadata as Record<string, unknown>),
        analyzer: 'pe-section-analyzer',
        byteOffset: sectionMeta?.rawOffset ?? 0,
        rva: sectionMeta?.virtualAddress ?? 0,
        section: sectionName,
        rawSize: sectionMeta?.rawSize,
        virtualSize: sectionMeta?.virtualSize,
      },
      offsets: sectionMeta ? [sectionMeta.rawOffset] : [],
    });
  }

  // Step 3: Import analysis
  const importResult = analyzeImports(parsed);
  for (const finding of importResult.findings) {
    evidence.push({
      id: deterministicId('ev', artifactId, finding.type),
      artifactId,
      type: finding.type,
      category: 'behavior',
      confidence: finding.confidence,
      explanation: finding.explanation,
      metadata: {
        ...(finding.metadata as Record<string, unknown>),
        analyzer: 'pe-import-analyzer',
        importCount: parsed.imports.length,
        importTableRva: parsed.dataDirectories.find((d) => d.type === 'import-table')?.rva ?? 0,
      },
      offsets: [],
    });
  }

  // Step 4: Packer detection
  const packerResult = detectPacker(parsed);
  if (packerResult.packer) {
    evidence.push({
      id: deterministicId('ev', artifactId, 'pe-packer', packerResult.packer),
      artifactId,
      type: 'pe-packer',
      category: 'obfuscation',
      confidence: packerResult.confidence,
      explanation: `Packer detected: ${packerResult.packer} (${packerResult.packerType ?? 'unknown'}, confidence: ${Math.round(packerResult.confidence * 100)}%)`,
      metadata: {
        packer: packerResult.packer,
        confidence: packerResult.confidence,
        signals: packerResult.signals,
        packerType: packerResult.packerType,
        analyzer: 'pe-packer-detector',
        entryPoint: parsed.entryPoint,
        importCount: parsed.imports.length,
        overlaySize: parsed.overlay.size,
        highEntropySectionCount: parsed.sections.filter((s) => s.entropy > 7.0).length,
      },
      offsets: [],
    });
  }

  // Step 5: Overlay analysis
  const overlayFinding = analyzeOverlay(parsed);
  if (overlayFinding) {
    evidence.push({
      id: deterministicId('ev', artifactId, overlayFinding.type),
      artifactId,
      type: overlayFinding.type,
      category: 'executable',
      confidence: overlayFinding.confidence,
      explanation: overlayFinding.explanation,
      metadata: {
        ...(overlayFinding.metadata as Record<string, unknown>),
        analyzer: 'pe-overlay-analyzer',
        overlayOffset: parsed.overlay.offset,
        overlaySize: parsed.overlay.size,
        totalFileSize: buffer.length,
      },
      offsets: [parsed.overlay.offset],
    });
  }

  // Step 6: Compiler identification
  const compilerResult = identifyCompiler(parsed);
  if (compilerResult.confidence > 0.3) {
    evidence.push({
      id: deterministicId('ev', artifactId, 'pe-compiler', compilerResult.compiler),
      artifactId,
      type: 'pe-compiler',
      category: 'metadata',
      confidence: compilerResult.confidence,
      explanation: `Compiler identified: ${compilerResult.compiler} (confidence: ${Math.round(compilerResult.confidence * 100)}%)`,
      metadata: {
        compiler: compilerResult.compiler,
        compilerFamily: compilerResult.compiler,
        confidence: compilerResult.confidence,
        majorLinkerVersion: compilerResult.majorLinkerVersion,
        minorLinkerVersion: compilerResult.minorLinkerVersion,
        linkTimeStamp: compilerResult.linkTimeStamp.toISOString(),
        majorOSVersion: compilerResult.majorOSVersion,
        minorOSVersion: compilerResult.minorOSVersion,
        analyzer: 'pe-compiler-analyzer',
        linkerVersionOffset: parsed.e_lfanew + 4,
      },
      offsets: [parsed.e_lfanew + 4],
    });
  }

  // Step 7: TLS callback analysis
  const tlsFinding = analyzeTLS(parsed);
  if (tlsFinding) {
    evidence.push({
      id: deterministicId('ev', artifactId, tlsFinding.type),
      artifactId,
      type: tlsFinding.type,
      category: 'executable',
      confidence: tlsFinding.confidence,
      explanation: tlsFinding.explanation,
      metadata: {
        ...(tlsFinding.metadata as Record<string, unknown>),
        analyzer: 'pe-tls-analyzer',
        tlsTableRva: parsed.dataDirectories.find((d) => d.type === 'tls-table')?.rva ?? 0,
      },
      offsets: parsed.tls?.callbacks.map((c) => c.offset) ?? [],
    });
  }

  // Step 8: Resource analysis
  const resourceFindings = analyzeResources(parsed);
  for (const finding of resourceFindings) {
    evidence.push({
      id: deterministicId('ev', artifactId, finding.type),
      artifactId,
      type: finding.type,
      category: 'executable',
      confidence: finding.confidence,
      explanation: finding.explanation,
      metadata: {
        ...(finding.metadata as Record<string, unknown>),
        analyzer: 'pe-resource-analyzer',
        resourceCount: parsed.resources.length,
      },
      offsets: [],
    });
  }

  // Step 9: Signature analysis
  const signatureFindings = analyzeSignature(parsed);
  for (const finding of signatureFindings) {
    evidence.push({
      id: deterministicId('ev', artifactId, finding.type),
      artifactId,
      type: finding.type,
      category: 'certificate',
      confidence: finding.confidence,
      explanation: finding.explanation,
      metadata: {
        ...(finding.metadata as Record<string, unknown>),
        analyzer: 'pe-signature-analyzer',
        certificateCount: parsed.certificates.length,
        certificateTableOffset:
          parsed.dataDirectories.find((d) => d.type === 'certificate-table')?.rva ?? 0,
      },
      offsets: parsed.certificates.map((c) => c.offset),
    });
  }

  // Step 10: Timestamp analysis
  const tsFinding = analyzeTimestamp(parsed);
  evidence.push({
    id: deterministicId('ev', artifactId, tsFinding.type),
    artifactId,
    type: tsFinding.type,
    category: 'metadata',
    confidence: tsFinding.confidence,
    explanation: tsFinding.explanation,
    metadata: {
      ...(tsFinding.metadata as Record<string, unknown>),
      analyzer: 'pe-timestamp-analyzer',
      timestampOffset: parsed.e_lfanew + 8,
      coffHeaderOffset: parsed.e_lfanew + 4,
      machine: parsed.machine,
    },
    offsets: [parsed.e_lfanew + 8],
  });

  // Step 11: Entry point analysis
  const epFinding = analyzeEntryPoint(parsed);
  evidence.push({
    id: deterministicId('ev', artifactId, epFinding.type),
    artifactId,
    type: epFinding.type,
    category: 'executable',
    confidence: epFinding.confidence,
    explanation: epFinding.explanation,
    metadata: {
      ...(epFinding.metadata as Record<string, unknown>),
      analyzer: 'pe-entrypoint-analyzer',
      entryPointRva: parsed.entryPoint,
      imageBase: parsed.imageBase,
      entryPointVa: parsed.imageBase + parsed.entryPoint,
    },
    offsets: [],
  });

  // Compute suspicious score (0-10) based on evidence
  let suspiciousScore = 0;
  const highSigEvidence = evidence.filter(
    (e) => e.confidence > 0.7 && ['high', 'critical'].includes(getSeverityForType(e.type)),
  );
  suspiciousScore = Math.min(10, Math.round(highSigEvidence.length * 2.5));

  return {
    parsed,
    evidence: Object.freeze(evidence),
    packer: packerResult,
    compiler: compilerResult,
    sectionCount: parsed.sections.length,
    importCount: parsed.imports.length,
    exportCount: parsed.exports.length,
    hasSignature: parsed.certificates.length > 0,
    hasOverlay: parsed.overlay.present,
    hasTLS: parsed.tls !== null,
    suspiciousScore,
  };
}

function getSeverityForType(type: string): string {
  const severityMap: Record<string, string> = {
    'pe-rwx-section': 'high',
    'pe-suspicious-process-injection': 'high',
    'pe-suspicious-credential-dumping': 'high',
    'pe-suspicious-process-hollowing': 'high',
    'pe-packer': 'high',
    'pe-large-overlay': 'high',
    'pe-high-entropy-overlay': 'high',
    'pe-tls-callback': 'medium',
    'pe-multiple-tls-callbacks': 'critical',
    'pe-embedded-executable': 'high',
    'pe-entry-point-in-packer-section': 'high',
    'pe-entry-point-outside-sections': 'high',
    'pe-entry-point-zero': 'high',
    'pe-timestamp-future': 'high',
    'pe-requires-admin': 'medium',
    'pe-uiaccess': 'medium',
    'pe-no-signature': 'low',
    'pe-no-imports': 'medium',
    'pe-duplicate-section-name': 'medium',
    'pe-very-high-entropy-section': 'high',
    'pe-high-entropy-section': 'medium',
    'pe-suspicious-url-download': 'high',
    'pe-suspicious-privilege-escalation': 'high',
    'pe-suspicious-anti-debugging': 'medium',
    'pe-suspicious-code-execution': 'medium',
    'pe-suspicious-crypto-combination': 'medium',
    'pe-powershell-spawning': 'medium',
  };
  return severityMap[type] ?? 'low';
}
