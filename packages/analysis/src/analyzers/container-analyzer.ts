/**
 * Container Analyzer — produces evidence from container configuration features.
 *
 * @module @veris/analysis/analyzers/container-analyzer
 */

import { BaseAnalyzer } from '../base-analyzer.js';
import type { AnalysisContext, AnalysisResult } from '../types.js';

/**
 * Analyzes container configuration features (Docker, Kubernetes) for
 * security-relevant evidence.
 */
export class ContainerAnalyzer extends BaseAnalyzer {
  constructor() {
    super({
      id: 'container-analyzer',
      name: 'Container Analyzer',
      version: '0.1.0',
      supportedArtifactTypes: ['configuration', 'file'],
      priority: 200,
    });
  }

  canAnalyze(context: AnalysisContext): boolean {
    return context.features.some(
      (f) =>
        f.type.startsWith('k8s-') ||
        f.type.startsWith('docker-') ||
        f.type === 'yaml-top-level-keys' ||
        f.type === 'json-top-level-keys',
    );
  }

  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const startTime = Date.now();
    const evidenceList: import('../types.js').Evidence[] = [];
    const issues: import('../types.js').AnalysisIssue[] = [];

    try {
      const k8sKindFeatures = context.features.filter((f) => f.type === 'k8s-resource-kind');

      // Kubernetes resource detection
      for (const kf of k8sKindFeatures) {
        const kind = kf.value as string;
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'container',
            'k8s-resource',
            `Kubernetes resource detected: ${kind}`,
            {
              confidence: 1.0,
              featureIds: [kf.id],
              locations: kf.location ? [kf.location] : [],
              metadata: { resourceKind: kind },
            },
          ),
        );
      }

      // Check for security-sensitive container configurations via string patterns
      const stringFeatures = context.features.filter((f) => f.type === 'string-literal');
      const strings = stringFeatures.map((f) => String(f.value));

      const privilegedPattern = /privileged:\s*true/i;
      const hostNetworkPattern = /hostNetwork:\s*true/i;
      const hostPidPattern = /hostPID:\s*true/i;
      const runRootPattern = /runAsRoot:\s*true/i;
      const insecureRegistries = /insecure-registries/i;
      const exposeDockerSocket = /\/var\/run\/docker\.sock/;

      for (const s of strings) {
        if (privilegedPattern.test(s)) {
          evidenceList.push(
            this.makeEvidence(
              context.artifact.id,
              'container',
              'privileged-container',
              'Container runs in privileged mode',
              {
                confidence: 1.0,
                featureIds: [],
                locations: [],
                metadata: { issue: 'privileged' },
              },
            ),
          );
        }

        if (hostNetworkPattern.test(s)) {
          evidenceList.push(
            this.makeEvidence(
              context.artifact.id,
              'container',
              'host-network',
              'Container uses host network namespace',
              {
                confidence: 1.0,
                featureIds: [],
                locations: [],
                metadata: { issue: 'host-network' },
              },
            ),
          );
        }

        if (hostPidPattern.test(s)) {
          evidenceList.push(
            this.makeEvidence(
              context.artifact.id,
              'container',
              'host-pid',
              'Container shares host PID namespace',
              {
                confidence: 1.0,
                featureIds: [],
                locations: [],
                metadata: { issue: 'host-pid' },
              },
            ),
          );
        }

        if (exposeDockerSocket.test(s)) {
          evidenceList.push(
            this.makeEvidence(
              context.artifact.id,
              'container',
              'docker-socket-mounted',
              'Container mounts Docker socket, allowing container escape',
              {
                confidence: 1.0,
                featureIds: [],
                locations: [],
                metadata: { issue: 'docker-socket' },
              },
            ),
          );
        }
      }
    } catch (error) {
      issues.push(
        this.error(
          'CONTAINER_ANALYSIS_ERROR',
          `Failed to analyze container config: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(evidenceList, { startTime, endTime, issues });
  }
}
