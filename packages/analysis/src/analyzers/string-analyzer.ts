/**
 * String Analyzer — produces evidence from string pattern features.
 *
 * @module @veris/analysis/analyzers/string-analyzer
 */

import { BaseAnalyzer } from '../base-analyzer.js';
import type { AnalysisContext, AnalysisResult } from '../types.js';

/**
 * Analyzes string features and produces evidence about interesting patterns.
 */
export class StringAnalyzer extends BaseAnalyzer {
  constructor() {
    super({
      id: 'string-analyzer',
      name: 'String Analyzer',
      version: '0.1.0',
      supportedArtifactTypes: ['file', 'executable', 'script', 'document', 'binary-blob'],
      priority: 100,
    });
  }

  canAnalyze(context: AnalysisContext): boolean {
    return context.features.some((f) => f.type === 'string-literal');
  }

  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const startTime = Date.now();
    const evidenceList: import('../types.js').Evidence[] = [];
    const issues: import('../types.js').AnalysisIssue[] = [];

    try {
      const stringFeatures = context.features.filter((f) => f.type === 'string-literal');
      const strings = stringFeatures.map((f) => String(f.value));

      // Check for PowerShell encoded commands
      const encodedCommandPattern = /-[Ee]ncoded[Cc]ommand\s+([A-Za-z0-9+/=]+)/g;
      const encodedCommands: string[] = [];
      for (const s of strings) {
        const match = encodedCommandPattern.exec(s);
        if (match) {
          encodedCommands.push(match[1].substring(0, 32) + '...');
        }
      }

      if (encodedCommands.length > 0) {
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'obfuscation',
            'encoded-command',
            'Encoded PowerShell command detected',
            {
              confidence: 1.0,
              featureIds: stringFeatures
                .filter((f) => {
                  const s = String(f.value);
                  return /-[Ee]ncoded[Cc]ommand/i.test(s);
                })
                .map((f) => f.id),
              locations: [],
              metadata: { encodedCommands: encodedCommands },
            },
          ),
        );
      }

      // Check for URLs
      const urlPattern = /https?:\/\/[^\s"'<>]+/g;
      const urls: string[] = [];
      for (const s of strings) {
        const matches = s.match(urlPattern);
        if (matches) {
          urls.push(...matches);
        }
      }

      if (urls.length > 0) {
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'network',
            'embedded-url',
            `URLs found in artifact strings: ${urls.length} unique URLs`,
            {
              confidence: 0.9,
              featureIds: stringFeatures
                .filter((f) => {
                  const s = String(f.value);
                  return /https?:\/\//.test(s);
                })
                .map((f) => f.id),
              locations: [],
              metadata: { urls, count: urls.length },
            },
          ),
        );
      }

      // Check for IP addresses
      const ipPattern = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
      const ips: string[] = [];
      for (const s of strings) {
        const matches = s.match(ipPattern);
        if (matches) {
          ips.push(
            ...matches.filter((ip) => {
              const parts = ip.split('.').map(Number);
              return (
                parts.every((p) => p >= 0 && p <= 255) &&
                !ip.startsWith('127.') &&
                !ip.startsWith('10.') &&
                !ip.startsWith('192.168.') &&
                !ip.startsWith('172.16.')
              );
            }),
          );
        }
      }

      if (ips.length > 0) {
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'network',
            'embedded-ip',
            `IP addresses found in artifact strings: ${ips.length} non-private IPs`,
            {
              confidence: 0.8,
              featureIds: stringFeatures
                .filter((f) => {
                  const s = String(f.value);
                  return /\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(s);
                })
                .map((f) => f.id),
              locations: [],
              metadata: { ips, count: ips.length },
            },
          ),
        );
      }

      // Check for registry paths
      const registryPattern = /[HKU|HKLM|HKCU|HKCR|HKCC]\\[A-Za-z0-9_\\]+/g;
      const registryKeys: string[] = [];
      for (const s of strings) {
        const matches = s.match(registryPattern);
        if (matches) {
          registryKeys.push(...matches);
        }
      }

      if (registryKeys.length > 0) {
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'persistence',
            'registry-keys',
            `Registry paths found in artifact strings: ${registryKeys.length} keys`,
            {
              confidence: 0.9,
              featureIds: stringFeatures
                .filter((f) => {
                  const s = String(f.value);
                  return /[HKU|HKLM|HKCU|HKCR|HKCC]\\/.test(s);
                })
                .map((f) => f.id),
              locations: [],
              metadata: { registryKeys, count: registryKeys.length },
            },
          ),
        );
      }

      // Check for file paths
      const suspiciousPaths = [
        /[Cc]:\\[Ww]indows\\[Ss]ystem32\\/,
        /[Cc]:\\[Pp]rogram[Dd]ata\\/,
        /[Cc]:\\[Uu]sers\\[Pp]ublic\\/,
        /\/etc\//,
        /\/var\//,
        /\/tmp\//,
        /\/dev\/shm\//,
        /\\[Aa]pp[Dd]ata\\[Rr]oaming\\/,
        /\\[Tt]emp\\/,
      ];

      const suspiciousFilePaths: string[] = [];
      for (const s of strings) {
        for (const pattern of suspiciousPaths) {
          if (pattern.test(s)) {
            suspiciousFilePaths.push(s.substring(0, 64));
            break;
          }
        }
      }

      if (suspiciousFilePaths.length > 0) {
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'behavior',
            'suspicious-paths',
            `Suspicious file paths found in artifact strings`,
            {
              confidence: 0.8,
              featureIds: [],
              locations: [],
              metadata: { paths: suspiciousFilePaths, count: suspiciousFilePaths.length },
            },
          ),
        );
      }
    } catch (error) {
      issues.push(
        this.error(
          'STRING_ANALYSIS_ERROR',
          `Failed to analyze strings: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(evidenceList, { startTime, endTime, issues });
  }
}
