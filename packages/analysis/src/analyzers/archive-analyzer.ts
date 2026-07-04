/**
 * Archive Analyzer — produces evidence from archive features.
 *
 * @module @veris/analysis/analyzers/archive-analyzer
 */

import { BaseAnalyzer } from '../base-analyzer.js';
import type { AnalysisContext, AnalysisResult } from '../types.js';

/**
 * Analyzes archive features and produces evidence.
 */
export class ArchiveAnalyzer extends BaseAnalyzer {
  constructor() {
    super({
      id: 'archive-analyzer',
      name: 'Archive Analyzer',
      version: '0.1.0',
      supportedArtifactTypes: ['archive', 'file'],
      priority: 100,
    });
  }

  canAnalyze(context: AnalysisContext): boolean {
    return context.features.some(
      (f) => f.type.startsWith('archive-') || f.type === 'archive-member',
    );
  }

  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const startTime = Date.now();
    const evidenceList: import('../types.js').Evidence[] = [];
    const issues: import('../types.js').AnalysisIssue[] = [];

    try {
      const archiveTypeFeatures = context.features.filter((f) => f.type === 'archive-type');
      const archiveMemberFeatures = context.features.filter((f) => f.type === 'archive-member');
      const archiveMetadataFeatures = context.features.filter((f) => f.type === 'archive-metadata');

      // Archive format
      for (const af of archiveTypeFeatures) {
        const format = af.value as string;
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'archive',
            'archive-format',
            `Archive format detected: ${format}`,
            {
              confidence: 1.0,
              featureIds: [af.id],
              locations: af.location ? [af.location] : [],
              metadata: { format },
            },
          ),
        );
      }

      // Archive metadata
      for (const mf of archiveMetadataFeatures) {
        const meta = mf.value as Record<string, unknown>;
        const format = meta.format as string;
        const memberCount = meta.memberCount as number | undefined;

        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'archive',
            'archive-metadata',
            `Archive contains ${memberCount ?? 'multiple'} members`,
            {
              confidence: 1.0,
              featureIds: [mf.id],
              locations: mf.location ? [mf.location] : [],
              metadata: { format, memberCount },
            },
          ),
        );
      }

      // Archive members with suspicious extensions
      const executableExtensions = ['.exe', '.dll', '.so', '.dylib', '.bin', '.elf', '.app'];
      for (const amf of archiveMemberFeatures) {
        const member = amf.value as Record<string, unknown>;
        const name = (member.name as string) ?? '';
        const ext = (member.extension as string) ?? '';

        if (executableExtensions.includes(ext.toLowerCase())) {
          evidenceList.push(
            this.makeEvidence(
              context.artifact.id,
              'archive',
              'nested-executable',
              `Archive contains nested executable: ${name}`,
              {
                confidence: 1.0,
                featureIds: [amf.id],
                locations: amf.location ? [amf.location] : [],
                metadata: { memberName: name, extension: ext },
              },
            ),
          );
        }

        // Check for nested archives
        const archiveExtensions = ['.zip', '.tar', '.gz', '.rar', '.7z', '.bz2'];
        if (archiveExtensions.includes(ext.toLowerCase())) {
          evidenceList.push(
            this.makeEvidence(
              context.artifact.id,
              'archive',
              'nested-archive',
              `Archive contains nested archive: ${name}`,
              {
                confidence: 1.0,
                featureIds: [amf.id],
                locations: amf.location ? [amf.location] : [],
                metadata: { memberName: name, extension: ext },
              },
            ),
          );
        }
      }
    } catch (error) {
      issues.push(
        this.error(
          'ARCHIVE_ANALYSIS_ERROR',
          `Failed to analyze archive: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(evidenceList, { startTime, endTime, issues });
  }
}
