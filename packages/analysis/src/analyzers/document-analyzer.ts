/**
 * Document Analyzer — produces evidence from document (PDF, etc.) features.
 *
 * @module @veris/analysis/analyzers/document-analyzer
 */

import { BaseAnalyzer } from '../base-analyzer.js';
import type { AnalysisContext, AnalysisResult } from '../types.js';

/**
 * Analyzes document features and produces evidence.
 */
export class DocumentAnalyzer extends BaseAnalyzer {
  constructor() {
    super({
      id: 'document-analyzer',
      name: 'Document Analyzer',
      version: '0.1.0',
      supportedArtifactTypes: ['document', 'file'],
      priority: 100,
    });
  }

  canAnalyze(context: AnalysisContext): boolean {
    return context.features.some(
      (f) => f.type.startsWith('pdf-') || f.type === 'string-literal' || f.type === 'url',
    );
  }

  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const startTime = Date.now();
    const evidenceList: import('../types.js').Evidence[] = [];
    const issues: import('../types.js').AnalysisIssue[] = [];

    try {
      const pdfHeaderFeatures = context.features.filter((f) => f.type === 'pdf-header');
      const pdfEncryptedFeatures = context.features.filter((f) => f.type === 'pdf-encrypted');
      const urlFeatures = context.features.filter((f) => f.type === 'url');

      // PDF version detection
      for (const hf of pdfHeaderFeatures) {
        const header = hf.value as Record<string, unknown>;
        const version = header.version as string;

        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'document',
            'pdf-format',
            `PDF document detected: ${version}`,
            {
              confidence: 1.0,
              featureIds: [hf.id],
              locations: hf.location ? [hf.location] : [],
              metadata: { format: 'pdf', version },
            },
          ),
        );
      }

      // PDF encryption
      for (const ef of pdfEncryptedFeatures) {
        const isEncrypted = ef.value as boolean;
        if (isEncrypted) {
          evidenceList.push(
            this.makeEvidence(
              context.artifact.id,
              'document',
              'pdf-encrypted',
              'PDF document is encrypted',
              {
                confidence: 1.0,
                featureIds: [ef.id],
                locations: ef.location ? [ef.location] : [],
                metadata: { encrypted: true },
              },
            ),
          );
        }
      }

      // URLs in documents
      for (const uf of urlFeatures) {
        const url = uf.value as string;
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'document',
            'document-url',
            `URL found in document: ${url}`,
            {
              confidence: 0.9,
              featureIds: [uf.id],
              locations: uf.location ? [uf.location] : [],
              metadata: { url },
            },
          ),
        );
      }
    } catch (error) {
      issues.push(
        this.error(
          'DOC_ANALYSIS_ERROR',
          `Failed to analyze document: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(evidenceList, { startTime, endTime, issues });
  }
}
