/**
 * PE Analyzer — produces evidence from PE (Portable Executable) features.
 *
 * Uses the new PE analysis engine when raw binary content is available
 * for deep static analysis. Falls back to feature-based analysis when
 * only features are available.
 *
 * The PE analysis engine provides:
 * - Complete PE header/optional header parsing
 * - Section analysis (RWX, entropy, names, anomalies)
 * - Import analysis (grouped by category, suspicious combinations)
 * - Packer detection (multi-signal)
 * - Overlay detection
 * - Compiler fingerprinting
 * - TLS callback analysis
 * - Resource analysis (icons, version, manifest, embedded binaries)
 * - Signature analysis
 * - Timestamp anomaly detection
 * - Entry point analysis
 *
 * @module @veris/analysis/analyzers/pe-analyzer
 */

import { deterministicId } from '@veris/shared';

import { BaseAnalyzer } from '../base-analyzer.js';
import { analyzePE } from '../pe/engine.js';
import type { PEEvidence } from '../pe/engine.js';
import type { AnalysisContext, AnalysisResult, Evidence } from '../types.js';

/**
 * Analyzes PE executable binaries and produces evidence.
 * Uses deep binary parsing when content is available.
 */
export class PEAnalyzer extends BaseAnalyzer {
  constructor() {
    super({
      id: 'pe-analyzer',
      name: 'PE Analyzer',
      version: '1.0.0',
      supportedArtifactTypes: ['executable', 'file'],
      priority: 100,
    });
  }

  canAnalyze(context: AnalysisContext): boolean {
    // Check content first — raw PE header bytes
    if (context.content && context.content.length >= 64) {
      return context.content[0] === 0x4d && context.content[1] === 0x5a; // "MZ"
    }
    // Fall back to feature detection
    return context.features.some(
      (f) => f.type === 'pe-header' || f.type === 'pe-section' || f.type === 'pe-import',
    );
  }

  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const startTime = Date.now();
    const evidenceList: Evidence[] = [];
    const issues: import('../types.js').AnalysisIssue[] = [];

    try {
      // Path 1: Deep analysis with raw content
      if (context.content && context.content.length >= 64) {
        const peResult = analyzePE(context.content, context.artifact.id);

        if (peResult.parsed.valid) {
          // Convert all PE evidence to framework Evidence objects
          for (const ev of peResult.evidence) {
            evidenceList.push(
              this.makeEvidence(
                context.artifact.id,
                mapCategory(ev.category),
                ev.type,
                ev.explanation,
                {
                  confidence: ev.confidence,
                  metadata: ev.metadata as Record<string, unknown>,
                },
              ),
            );
          }
        } else if (peResult.parsed.error) {
          issues.push(
            this.warning('PE_PARSE_WARNING', `PE parsing issue: ${peResult.parsed.error}`),
          );
          // Fall back to feature-based analysis
          evidenceList.push(...this.analyzeFromFeatures(context));
        }
      } else {
        // Path 2: Feature-based analysis (fallback)
        evidenceList.push(...this.analyzeFromFeatures(context));
      }
    } catch (error) {
      issues.push(
        this.error(
          'PE_ANALYSIS_ERROR',
          `Failed to analyze PE: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(evidenceList, { startTime, endTime, issues });
  }

  /**
   * Feature-based analysis fallback (original behavior).
   * Used when raw binary content is not available.
   */
  private analyzeFromFeatures(context: AnalysisContext): Evidence[] {
    const evidenceList: Evidence[] = [];

    const headerFeatures = context.features.filter((f) => f.type === 'pe-header');
    const sectionFeatures = context.features.filter((f) => f.type === 'pe-section');
    const importFeatures = context.features.filter((f) => f.type === 'pe-import');
    const entropyFeatures = context.features.filter((f) => f.type === 'section-entropy');

    for (const hf of headerFeatures) {
      const header = hf.value as Record<string, unknown>;
      evidenceList.push(
        this.makeEvidence(
          context.artifact.id,
          'executable',
          'pe-format',
          `PE executable format detected: ${(header.machine as string) ?? 'unknown'}`,
          {
            confidence: 1.0,
            featureIds: [hf.id],
            locations: hf.location ? [hf.location] : [],
            metadata: header as Record<string, unknown>,
          },
        ),
      );
    }

    for (const sf of sectionFeatures) {
      const section = sf.value as Record<string, unknown>;
      const chars = section.characteristics as number;
      const isExecutable = (chars & 0x20000000) !== 0;
      const isWritable = (chars & 0x80000000) !== 0;

      if (isExecutable && isWritable) {
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'executable',
            'pe-rwx-section',
            `PE section "${section.name as string}" is both executable and writable (RWX)`,
            {
              confidence: 1.0,
              featureIds: [sf.id],
              locations: sf.location ? [sf.location] : [],
              metadata: {
                section: section.name,
                executable: isExecutable,
                writable: isWritable,
                characteristics: chars,
              },
            },
          ),
        );
      }
    }

    for (const impf of importFeatures) {
      const imp = impf.value as Record<string, unknown>;
      evidenceList.push(
        this.makeEvidence(
          context.artifact.id,
          'executable',
          'pe-dll-import',
          `Executable imports from ${imp.dll as string}`,
          {
            confidence: 1.0,
            featureIds: [impf.id],
            locations: impf.location ? [impf.location] : [],
            metadata: { dll: imp.dll },
          },
        ),
      );
    }

    for (const ef of entropyFeatures) {
      const entropy = ef.value as number;
      if (entropy > 7.0) {
        const meta = ef.metadata as Record<string, unknown> | undefined;
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'obfuscation',
            'high-entropy-section',
            `PE section "${meta?.section as string}" has high entropy (${entropy.toFixed(2)})`,
            {
              confidence: Math.min(1.0, (entropy - 7.0) / 1.0),
              featureIds: [ef.id],
              locations: ef.location ? [ef.location] : [],
              metadata: {
                section: meta?.section,
                entropy,
                offset: meta?.offset,
                size: meta?.size,
              },
            },
          ),
        );
      }
    }

    return evidenceList;
  }
}

function mapCategory(cat: string): import('../types.js').EvidenceCategory {
  const catMap: Record<string, import('../types.js').EvidenceCategory> = {
    executable: 'executable',
    behavior: 'behavior',
    obfuscation: 'obfuscation',
    metadata: 'metadata',
    certificate: 'certificate',
  };
  return catMap[cat] ?? 'executable';
}
