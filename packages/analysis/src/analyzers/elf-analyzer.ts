/**
 * ELF Analyzer — produces evidence from ELF (Executable and Linkable Format) features.
 *
 * @module @veris/analysis/analyzers/elf-analyzer
 */

import { BaseAnalyzer } from '../base-analyzer.js';
import type { AnalysisContext, AnalysisResult } from '../types.js';

/**
 * Analyzes ELF executable features and produces evidence.
 */
export class ELFAnalyzer extends BaseAnalyzer {
  constructor() {
    super({
      id: 'elf-analyzer',
      name: 'ELF Analyzer',
      version: '0.1.0',
      supportedArtifactTypes: ['executable', 'file'],
      priority: 100,
    });
  }

  canAnalyze(context: AnalysisContext): boolean {
    return context.features.some(
      (f) => f.type === 'elf-header' || f.type === 'elf-section' || f.type === 'elf-symbol',
    );
  }

  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const startTime = Date.now();
    const evidenceList: import('../types.js').Evidence[] = [];
    const issues: import('../types.js').AnalysisIssue[] = [];

    try {
      const headerFeatures = context.features.filter((f) => f.type === 'elf-header');
      const sectionFeatures = context.features.filter((f) => f.type === 'elf-section');
      const symbolFeatures = context.features.filter((f) => f.type === 'elf-symbol');

      // Analyze ELF header
      for (const hf of headerFeatures) {
        const header = hf.value as Record<string, unknown>;
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'executable',
            'elf-format',
            `ELF executable format detected: ${header.machine as string}`,
            {
              confidence: 1.0,
              featureIds: [hf.id],
              locations: hf.location ? [hf.location] : [],
              metadata: {
                class: header.class,
                endian: header.endian,
                machine: header.machine,
                type: header.type,
                osabi: header.osabi,
                entryPoint: header.entryPoint,
                sectionCount: header.sectionCount,
              },
            },
          ),
        );
      }

      // Analyze sections
      for (const sf of sectionFeatures) {
        const section = sf.value as Record<string, unknown>;
        const secType = section.type as string;
        const name = section.name as string;
        const flags = section.flags as number;

        // Check for executable stack (GNU_STACK with X and W)
        if (name === 'GNU_STACK') {
          const isExecutable = (flags & 1) !== 0;
          const isWritable = (flags & 2) !== 0;
          if (isExecutable && isWritable) {
            evidenceList.push(
              this.makeEvidence(
                context.artifact.id,
                'executable',
                'elf-executable-stack',
                'ELF has executable and writable stack (GNU_STACK)',
                {
                  confidence: 1.0,
                  featureIds: [sf.id],
                  locations: sf.location ? [sf.location] : [],
                  metadata: { section: name, flags },
                },
              ),
            );
          }
        }

        // Check for loadable sections with suspicious flags
        if (secType === 'PROGBITS' && name.startsWith('.')) {
          const isExecutable = (flags & 1) !== 0;
          const isWritable = (flags & 2) !== 0;
          if (isExecutable && isWritable) {
            evidenceList.push(
              this.makeEvidence(
                context.artifact.id,
                'executable',
                'elf-wx-section',
                `ELF section "${name}" is both writable and executable`,
                {
                  confidence: 1.0,
                  featureIds: [sf.id],
                  locations: sf.location ? [sf.location] : [],
                  metadata: { section: name, type: secType, flags },
                },
              ),
            );
          }
        }
      }

      // Analyze symbols for suspicious patterns
      const suspiciousSymbols = symbolFeatures.filter((sf) => {
        const sym = sf.value as Record<string, unknown>;
        const name = sym.name as string;
        const suspiciousNames = [
          'ptrace',
          'inject',
          'hook',
          'packer',
          'protect',
          'antidebug',
          'antidbg',
          'vmdetect',
          'vmtoolsd',
        ];
        return suspiciousNames.some((s) => name.toLowerCase().includes(s));
      });

      for (const symf of suspiciousSymbols) {
        const sym = symf.value as Record<string, unknown>;
        const name = sym.name as string;
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'executable',
            'elf-suspicious-symbol',
            `ELF contains symbol "${name}" which may indicate anti-analysis`,
            {
              confidence: 0.7,
              featureIds: [symf.id],
              locations: symf.location ? [symf.location] : [],
              metadata: { symbol: name, bind: sym.bind, type: sym.type },
            },
          ),
        );
      }
    } catch (error) {
      issues.push(
        this.error(
          'ELF_ANALYSIS_ERROR',
          `Failed to analyze ELF: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(evidenceList, { startTime, endTime, issues });
  }
}
