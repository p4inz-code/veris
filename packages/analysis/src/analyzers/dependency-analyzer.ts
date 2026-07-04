/**
 * Dependency Analyzer — produces evidence from dependency/package management features.
 *
 * @module @veris/analysis/analyzers/dependency-analyzer
 */

import { BaseAnalyzer } from '../base-analyzer.js';
import type { AnalysisContext, AnalysisResult } from '../types.js';

/**
 * Analyzes dependency features and produces evidence about package usage.
 */
export class DependencyAnalyzer extends BaseAnalyzer {
  constructor() {
    super({
      id: 'dependency-analyzer',
      name: 'Dependency Analyzer',
      version: '0.1.0',
      supportedArtifactTypes: ['file', 'configuration'],
      priority: 200,
    });
  }

  canAnalyze(context: AnalysisContext): boolean {
    return context.features.some(
      (f) =>
        f.type === 'npm-dependency' ||
        f.type === 'npm-dev-dependency' ||
        f.type === 'python-dependency' ||
        f.type === 'env-sensitive-variable' ||
        f.type === 'package-name',
    );
  }

  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const startTime = Date.now();
    const evidenceList: import('../types.js').Evidence[] = [];
    const issues: import('../types.js').AnalysisIssue[] = [];

    try {
      const npmDepFeatures = context.features.filter((f) => f.type === 'npm-dependency');
      const npmDevDepFeatures = context.features.filter((f) => f.type === 'npm-dev-dependency');
      const pythonDepFeatures = context.features.filter((f) => f.type === 'python-dependency');
      const packageNameFeatures = context.features.filter((f) => f.type === 'package-name');
      const envSensitiveFeatures = context.features.filter(
        (f) => f.type === 'env-sensitive-variable',
      );

      // Package name
      for (const pf of packageNameFeatures) {
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'dependency',
            'package-name',
            `Package identified: ${pf.value as string}`,
            {
              confidence: 1.0,
              featureIds: [pf.id],
              locations: pf.location ? [pf.location] : [],
              metadata: { packageName: pf.value },
            },
          ),
        );
      }

      // Count production dependencies
      if (npmDepFeatures.length > 0) {
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'dependency',
            'npm-dependencies',
            `npm production dependencies: ${npmDepFeatures.length}`,
            {
              confidence: 1.0,
              featureIds: npmDepFeatures.map((f) => f.id),
              locations: [],
              metadata: { count: npmDepFeatures.length, type: 'npm' },
            },
          ),
        );
      }

      // Count dev dependencies
      if (npmDevDepFeatures.length > 0) {
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'dependency',
            'npm-dev-dependencies',
            `npm dev dependencies: ${npmDevDepFeatures.length}`,
            {
              confidence: 1.0,
              featureIds: npmDevDepFeatures.map((f) => f.id),
              locations: [],
              metadata: { count: npmDevDepFeatures.length, type: 'npm-dev' },
            },
          ),
        );
      }

      // Python dependencies
      if (pythonDepFeatures.length > 0) {
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'dependency',
            'python-dependencies',
            `Python dependencies: ${pythonDepFeatures.length}`,
            {
              confidence: 1.0,
              featureIds: pythonDepFeatures.map((f) => f.id),
              locations: [],
              metadata: { count: pythonDepFeatures.length, type: 'python' },
            },
          ),
        );
      }

      // Sensitive environment variables
      if (envSensitiveFeatures.length > 0) {
        const sensitiveVars = envSensitiveFeatures.map((f) => f.value as string);
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'configuration',
            'sensitive-env-vars',
            `Sensitive environment variables detected: ${sensitiveVars.join(', ')}`,
            {
              confidence: 1.0,
              featureIds: envSensitiveFeatures.map((f) => f.id),
              locations: [],
              metadata: { variables: sensitiveVars, count: sensitiveVars.length },
            },
          ),
        );
      }
    } catch (error) {
      issues.push(
        this.error(
          'DEPENDENCY_ANALYSIS_ERROR',
          `Failed to analyze dependencies: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(evidenceList, { startTime, endTime, issues });
  }
}
