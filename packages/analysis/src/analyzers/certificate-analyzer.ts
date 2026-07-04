/**
 * Certificate Analyzer — produces evidence from certificate features.
 *
 * @module @veris/analysis/analyzers/certificate-analyzer
 */

import { BaseAnalyzer } from '../base-analyzer.js';
import type { AnalysisContext, AnalysisResult } from '../types.js';

/**
 * Analyzes certificate features and produces evidence.
 */
export class CertificateAnalyzer extends BaseAnalyzer {
  constructor() {
    super({
      id: 'certificate-analyzer',
      name: 'Certificate Analyzer',
      version: '0.1.0',
      supportedArtifactTypes: ['certificate', 'file'],
      priority: 100,
    });
  }

  canAnalyze(context: AnalysisContext): boolean {
    return context.features.some((f) => f.type === 'certificate-type' || f.type === 'pem-label');
  }

  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const startTime = Date.now();
    const evidenceList: import('../types.js').Evidence[] = [];
    const issues: import('../types.js').AnalysisIssue[] = [];

    try {
      const certTypeFeatures = context.features.filter((f) => f.type === 'certificate-type');
      const pemLabelFeatures = context.features.filter((f) => f.type === 'pem-label');

      for (const cf of certTypeFeatures) {
        const certType = cf.value as string;
        const metadata: Record<string, unknown> = { certificateType: certType };

        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'certificate',
            'certificate-present',
            `Certificate detected: ${certType}`,
            {
              confidence: 1.0,
              featureIds: [cf.id],
              locations: cf.location ? [cf.location] : [],
              metadata,
            },
          ),
        );
      }

      for (const pf of pemLabelFeatures) {
        const label = pf.value as string;
        const isPrivateKey = label.includes('PRIVATE KEY');

        if (isPrivateKey) {
          evidenceList.push(
            this.makeEvidence(
              context.artifact.id,
              'certificate',
              'private-key-present',
              `Private key material found: ${label}`,
              {
                confidence: 1.0,
                featureIds: [pf.id],
                locations: pf.location ? [pf.location] : [],
                metadata: { pemLabel: label, isPrivateKey: true },
              },
            ),
          );
        } else if (label === 'CERTIFICATE') {
          evidenceList.push(
            this.makeEvidence(
              context.artifact.id,
              'certificate',
              'x509-certificate',
              'X.509 certificate detected',
              {
                confidence: 1.0,
                featureIds: [pf.id],
                locations: pf.location ? [pf.location] : [],
                metadata: { pemLabel: label },
              },
            ),
          );
        }
      }

      // Check for unsigned executables (if present in same artifact)
      const missingCert =
        context.features.length > 0 &&
        !certTypeFeatures.length &&
        context.artifact.type === 'executable';

      if (missingCert) {
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'certificate',
            'unsigned-executable',
            'Executable does not contain an embedded certificate (unsigned)',
            {
              confidence: 0.9,
              featureIds: [],
              locations: [],
              metadata: { artifactType: context.artifact.type },
            },
          ),
        );
      }
    } catch (error) {
      issues.push(
        this.error(
          'CERT_ANALYSIS_ERROR',
          `Failed to analyze certificate: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(evidenceList, { startTime, endTime, issues });
  }
}
