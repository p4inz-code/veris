/**
 * PE Analyzer — produces evidence from PE (Portable Executable) features.
 *
 * @module @veris/analysis/analyzers/pe-analyzer
 */

import { BaseAnalyzer } from '../base-analyzer.js';
import type { AnalysisContext, AnalysisResult, EvidenceCategory } from '../types.js';

/**
 * Analyzes PE executable features and produces evidence.
 */
export class PEAnalyzer extends BaseAnalyzer {
  constructor() {
    super({
      id: 'pe-analyzer',
      name: 'PE Analyzer',
      version: '0.1.0',
      supportedArtifactTypes: ['executable', 'file'],
      priority: 100,
    });
  }

  canAnalyze(context: AnalysisContext): boolean {
    // Check if any feature indicates a PE file
    return context.features.some(
      (f) => f.type === 'pe-header' || f.type === 'pe-section' || f.type === 'pe-import',
    );
  }

  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const startTime = Date.now();
    const evidenceList: import('../types.js').Evidence[] = [];
    const issues: import('../types.js').AnalysisIssue[] = [];

    try {
      // Find PE features
      const headerFeatures = context.features.filter((f) => f.type === 'pe-header');
      const sectionFeatures = context.features.filter((f) => f.type === 'pe-section');
      const importFeatures = context.features.filter((f) => f.type === 'pe-import');
      const entropyFeatures = context.features.filter((f) => f.type === 'section-entropy');

      // Analyze PE header
      for (const hf of headerFeatures) {
        const header = hf.value as Record<string, unknown>;
        const machine = header.machine as string;
        const isPE32Plus = header.isPE32Plus as boolean;

        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'executable',
            'pe-format',
            `PE executable format detected: ${machine}`,
            {
              confidence: 1.0,
              featureIds: [hf.id],
              locations: hf.location ? [hf.location] : [],
              metadata: {
                machine,
                isPE32Plus,
                entryPoint: header.entryPoint,
                imageBase: header.imageBase,
                numberOfSections: header.numberOfSections,
              },
            },
          ),
        );
      }

      // Analyze sections for RWX
      for (const sf of sectionFeatures) {
        const section = sf.value as Record<string, unknown>;
        const chars = section.characteristics as number;
        const name = section.name as string;

        // Check for RWX section (IMAGE_SCN_MEM_EXECUTE | IMAGE_SCN_MEM_READ | IMAGE_SCN_MEM_WRITE)
        const isExecutable = (chars & 0x20000000) !== 0;
        const isReadable = (chars & 0x40000000) !== 0;
        const isWritable = (chars & 0x80000000) !== 0;

        if (isExecutable && isWritable) {
          evidenceList.push(
            this.makeEvidence(
              context.artifact.id,
              'executable',
              'pe-rwx-section',
              `PE section "${name}" is both executable and writable (RWX)`,
              {
                confidence: 1.0,
                featureIds: [sf.id],
                locations: sf.location ? [sf.location] : [],
                metadata: {
                  section: name,
                  executable: isExecutable,
                  writable: isWritable,
                  readable: isReadable,
                  characteristics: chars,
                },
              },
            ),
          );
        }
      }

      // Analyze imports
      for (const impf of importFeatures) {
        const imp = impf.value as Record<string, unknown>;
        const dll = imp.dll as string;
        const name = imp.name as string | undefined;

        if (!name) {
          // DLL-level import
          evidenceList.push(
            this.makeEvidence(
              context.artifact.id,
              'executable',
              'pe-dll-import',
              `Executable imports from ${dll}`,
              {
                confidence: 1.0,
                featureIds: [impf.id],
                locations: impf.location ? [impf.location] : [],
                metadata: { dll },
              },
            ),
          );
        }
      }

      // Check sections with high entropy
      for (const ef of entropyFeatures) {
        const entropy = ef.value as number;
        const meta = ef.metadata as Record<string, unknown> | undefined;
        if (entropy > 7.0) {
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
}
