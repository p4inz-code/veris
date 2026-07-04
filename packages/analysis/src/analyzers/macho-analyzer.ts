/**
 * Mach-O Analyzer — produces evidence from Mach-O (Mach Object) features.
 *
 * @module @veris/analysis/analyzers/macho-analyzer
 */

import { BaseAnalyzer } from '../base-analyzer.js';
import type { AnalysisContext, AnalysisResult } from '../types.js';

/**
 * Analyzes Mach-O executable features and produces evidence.
 */
export class MachOAnalyzer extends BaseAnalyzer {
  constructor() {
    super({
      id: 'macho-analyzer',
      name: 'Mach-O Analyzer',
      version: '0.1.0',
      supportedArtifactTypes: ['executable', 'file'],
      priority: 100,
    });
  }

  canAnalyze(context: AnalysisContext): boolean {
    return context.features.some((f) => f.type === 'macho-header' || f.type === 'macho-section');
  }

  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const startTime = Date.now();
    const evidenceList: import('../types.js').Evidence[] = [];
    const issues: import('../types.js').AnalysisIssue[] = [];

    try {
      const headerFeatures = context.features.filter((f) => f.type === 'macho-header');
      const sectionFeatures = context.features.filter((f) => f.type === 'macho-section');

      // Analyze Mach-O header
      for (const hf of headerFeatures) {
        const header = hf.value as Record<string, unknown>;
        const format = header.format as string;

        if (format === 'universal-binary') {
          evidenceList.push(
            this.makeEvidence(
              context.artifact.id,
              'executable',
              'macho-universal-binary',
              'Mach-O universal binary (fat binary) detected',
              {
                confidence: 1.0,
                featureIds: [hf.id],
                locations: hf.location ? [hf.location] : [],
                metadata: { format: 'universal-binary' },
              },
            ),
          );
        } else {
          evidenceList.push(
            this.makeEvidence(
              context.artifact.id,
              'executable',
              'macho-format',
              `Mach-O executable format detected: ${header.cpuType as string}`,
              {
                confidence: 1.0,
                featureIds: [hf.id],
                locations: hf.location ? [hf.location] : [],
                metadata: {
                  cpuType: header.cpuType,
                  fileType: header.fileType,
                  is64Bit: header.is64Bit,
                  commands: header.commands,
                },
              },
            ),
          );
        }
      }

      // Analyze sections
      for (const sf of sectionFeatures) {
        const section = sf.value as Record<string, unknown>;
        const segname = section.segment as string;
        const sectname = section.section as string;
        const size = section.size as number;

        // Check for suspicious section combinations
        const suspiciousExecSections = ['__TEXT', '__DATA'];
        if (segname === '__DATA' && sectname === '__OBJC') {
          evidenceList.push(
            this.makeEvidence(
              context.artifact.id,
              'executable',
              'macho-objc-section',
              `Mach-O contains Objective-C data section "${segname}.${sectname}"`,
              {
                confidence: 0.9,
                featureIds: [sf.id],
                locations: sf.location ? [sf.location] : [],
                metadata: { segment: segname, section: sectname, size },
              },
            ),
          );
        }
      }
    } catch (error) {
      issues.push(
        this.error(
          'MACHO_ANALYSIS_ERROR',
          `Failed to analyze Mach-O: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(evidenceList, { startTime, endTime, issues });
  }
}
