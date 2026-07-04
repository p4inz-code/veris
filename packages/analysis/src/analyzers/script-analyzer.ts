/**
 * Script Analyzer — produces evidence from script language features.
 *
 * @module @veris/analysis/analyzers/script-analyzer
 */

import { BaseAnalyzer } from '../base-analyzer.js';
import type { AnalysisContext, AnalysisResult } from '../types.js';

/**
 * Analyzes script features for evidence of suspicious or obfuscated code.
 */
export class ScriptAnalyzer extends BaseAnalyzer {
  constructor() {
    super({
      id: 'script-analyzer',
      name: 'Script Analyzer',
      version: '0.1.0',
      supportedArtifactTypes: ['script', 'file'],
      priority: 100,
    });
  }

  canAnalyze(context: AnalysisContext): boolean {
    return context.features.some(
      (f) =>
        f.type === 'string-literal' ||
        f.type.startsWith('js-') ||
        f.type.startsWith('py-') ||
        f.type.startsWith('shell-') ||
        f.type.startsWith('rs-'),
    );
  }

  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const startTime = Date.now();
    const evidenceList: import('../types.js').Evidence[] = [];
    const issues: import('../types.js').AnalysisIssue[] = [];

    try {
      const stringFeatures = context.features.filter((f) => f.type === 'string-literal');
      const strings = stringFeatures.map((f) => String(f.value));

      // JavaScript obfuscation detection
      const hasUseStrict = context.features.some((f) => f.type === 'use-strict');

      // Check for JS obfuscation patterns
      const obfuscationPatterns = [
        /eval\s*\(/,
        /\\x[0-9a-fA-F]{2}/,
        /String\.fromCharCode/,
        /unescape\s*\(/,
        /atob\s*\(/,
        /btoa\s*\(/,
        /\\u[0-9a-fA-F]{4}/,
        /document\.write\s*\(/,
        /Function\s*\(/,
      ];

      let obfuscationScore = 0;
      for (const s of strings) {
        for (const pattern of obfuscationPatterns) {
          if (pattern.test(s)) {
            obfuscationScore++;
            break;
          }
        }
      }

      if (obfuscationScore >= 3) {
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'obfuscation',
            'js-obfuscated',
            'JavaScript appears heavily obfuscated',
            {
              confidence: Math.min(1.0, 0.6 + obfuscationScore * 0.1),
              featureIds: stringFeatures
                .filter((f) => {
                  const s = String(f.value);
                  return obfuscationPatterns.some((p) => p.test(s));
                })
                .map((f) => f.id),
              locations: [],
              metadata: { obfuscationScore, patterns: obfuscationScore },
            },
          ),
        );
      }

      // Shell script analysis
      const shellFeatures = context.features.filter((f) => f.type === 'shell-shebang');
      for (const sf of shellFeatures) {
        const shell = sf.value as string;
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'script',
            'shell-script',
            `Shell script detected: ${shell}`,
            {
              confidence: 1.0,
              featureIds: [sf.id],
              locations: sf.location ? [sf.location] : [],
              metadata: { shell },
            },
          ),
        );
      }

      // Dangerous shell commands
      const dangerousCommands = [
        'curl.*| bash',
        'wget.*| bash',
        'chmod +x',
        'chmod 777',
        'rm -rf /',
        'mkfs.',
        'dd if=',
        '>:',
        'nc -e',
        'bash -i',
        '/dev/tcp/',
        '/dev/udp/',
      ];

      const foundDangerous: string[] = [];
      for (const s of strings) {
        for (const cmd of dangerousCommands) {
          if (s.toLowerCase().includes(cmd.toLowerCase())) {
            foundDangerous.push(cmd);
            break;
          }
        }
      }

      if (foundDangerous.length > 0) {
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'script',
            'dangerous-commands',
            'Shell script contains potentially dangerous commands',
            {
              confidence: 0.9,
              featureIds: [],
              locations: [],
              metadata: { commands: foundDangerous },
            },
          ),
        );
      }

      // Python-specific analysis
      const pyExecPatterns = [
        /exec\s*\(/,
        /eval\s*\(/,
        /compile\s*\(/,
        /__import__\s*\(/,
        /os\.system/,
        /subprocess\.(call|Popen|run)/,
        /pickle\.loads/,
        /base64\.(b64decode|b64encode)/,
        /marshal\.loads/,
      ];

      let pyDangerousScore = 0;
      for (const s of strings) {
        for (const pattern of pyExecPatterns) {
          if (pattern.test(s)) {
            pyDangerousScore++;
            break;
          }
        }
      }

      if (pyDangerousScore >= 2) {
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'script',
            'python-code-execution',
            'Python script contains code execution or deserialization patterns',
            {
              confidence: Math.min(1.0, 0.5 + pyDangerousScore * 0.15),
              featureIds: [],
              locations: [],
              metadata: { dangerousPatterns: pyDangerousScore },
            },
          ),
        );
      }

      // Check for obvious encoded data
      const b64Pattern = /[A-Za-z0-9+/]{40,}={0,2}/g;
      const foundB64: string[] = [];
      for (const s of strings) {
        const matches = s.match(b64Pattern);
        if (matches) {
          foundB64.push(...matches);
        }
      }

      if (foundB64.length >= 3) {
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'obfuscation',
            'base64-data',
            `Large base64-encoded strings found (${foundB64.length} matches), possible obfuscated payload`,
            {
              confidence: 0.7,
              featureIds: [],
              locations: [],
              metadata: { matchCount: foundB64.length },
            },
          ),
        );
      }
    } catch (error) {
      issues.push(
        this.error(
          'SCRIPT_ANALYSIS_ERROR',
          `Failed to analyze script: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(evidenceList, { startTime, endTime, issues });
  }
}
