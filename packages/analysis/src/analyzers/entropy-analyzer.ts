/**
 * Entropy Analyzer — produces evidence from entropy features.
 *
 * @module @veris/analysis/analyzers/entropy-analyzer
 */

import { BaseAnalyzer } from '../base-analyzer.js';
import type { AnalysisContext, AnalysisResult } from '../types.js';

/**
 * Analyzes entropy features and produces evidence about suspicious
 * data randomness (e.g., encoded payloads, encrypted content, packed executables).
 */
export class EntropyAnalyzer extends BaseAnalyzer {
  constructor() {
    super({
      id: 'entropy-analyzer',
      name: 'Entropy Analyzer',
      version: '0.1.0',
      supportedArtifactTypes: ['file', 'executable', 'script', 'document', 'binary-blob'],
      priority: 100,
    });
  }

  canAnalyze(context: AnalysisContext): boolean {
    return context.features.some((f) => f.type === 'entropy-global' || f.type === 'entropy-window');
  }

  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const startTime = Date.now();
    const evidenceList: import('../types.js').Evidence[] = [];
    const issues: import('../types.js').AnalysisIssue[] = [];

    try {
      const globalEntropyFeatures = context.features.filter((f) => f.type === 'entropy-global');
      const windowEntropyFeatures = context.features.filter((f) => f.type === 'entropy-window');

      // Global entropy analysis
      for (const ef of globalEntropyFeatures) {
        const entropy = ef.value as number;
        const size = (ef.metadata as Record<string, unknown> | undefined)?.size as
          number | undefined;

        // High global entropy suggests packed/encrypted content
        if (entropy > 7.5) {
          evidenceList.push(
            this.makeEvidence(
              context.artifact.id,
              'obfuscation',
              'high-entropy',
              `Artifact has high global entropy (${entropy.toFixed(2)}), suggesting packed or encrypted content`,
              {
                confidence: Math.min(1.0, (entropy - 7.0) / 1.5),
                featureIds: [ef.id],
                locations: ef.location ? [ef.location] : [],
                metadata: { entropy, type: 'global', size },
              },
            ),
          );
        } else if (entropy > 6.5) {
          evidenceList.push(
            this.makeEvidence(
              context.artifact.id,
              'obfuscation',
              'elevated-entropy',
              `Artifact has elevated entropy (${entropy.toFixed(2)})`,
              {
                confidence: Math.min(0.7, (entropy - 6.0) / 1.5),
                featureIds: [ef.id],
                locations: ef.location ? [ef.location] : [],
                metadata: { entropy, type: 'global', size },
              },
            ),
          );
        }

        // Low entropy in large binary suggests padding or uniform data
        if (entropy < 1.0 && size && size > 1024) {
          evidenceList.push(
            this.makeEvidence(
              context.artifact.id,
              'anomaly',
              'low-entropy',
              `Artifact has unusually low entropy (${entropy.toFixed(2)}), possible padding or uniform data`,
              {
                confidence: 0.6,
                featureIds: [ef.id],
                locations: ef.location ? [ef.location] : [],
                metadata: { entropy, type: 'global', size },
              },
            ),
          );
        }
      }

      // Window entropy analysis — look for high-entropy regions
      for (const wf of windowEntropyFeatures) {
        const entropy = wf.value as number;
        const meta = wf.metadata as Record<string, unknown> | undefined;
        const offset = meta?.offset as number | undefined;

        if (entropy > 7.5 && offset !== undefined) {
          evidenceList.push(
            this.makeEvidence(
              context.artifact.id,
              'obfuscation',
              'high-entropy-region',
              `High entropy region at offset ${offset} (${entropy.toFixed(2)})`,
              {
                confidence: 0.8,
                featureIds: [wf.id],
                locations: wf.location ? [wf.location] : [],
                metadata: { entropy, type: 'window', offset, windowSize: meta?.windowSize },
              },
            ),
          );
        }
      }
    } catch (error) {
      issues.push(
        this.error(
          'ENTROPY_ANALYSIS_ERROR',
          `Failed to analyze entropy: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(evidenceList, { startTime, endTime, issues });
  }
}
