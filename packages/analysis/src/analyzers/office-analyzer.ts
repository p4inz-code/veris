/**
 * Office Analyzer — produces evidence from Office document features.
 *
 * @module @veris/analysis/analyzers/office-analyzer
 */

import { BaseAnalyzer } from '../base-analyzer.js';
import type { AnalysisContext, AnalysisResult } from '../types.js';

/**
 * Analyzes Office document features and produces evidence.
 */
export class OfficeAnalyzer extends BaseAnalyzer {
  constructor() {
    super({
      id: 'office-analyzer',
      name: 'Office Analyzer',
      version: '0.1.0',
      supportedArtifactTypes: ['document', 'file'],
      priority: 100,
    });
  }

  canAnalyze(context: AnalysisContext): boolean {
    return context.features.some(
      (f) =>
        f.type.startsWith('ole-') || f.type.startsWith('macro-') || f.type === 'string-literal',
    );
  }

  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const startTime = Date.now();
    const evidenceList: import('../types.js').Evidence[] = [];
    const issues: import('../types.js').AnalysisIssue[] = [];

    try {
      // Check for macro-related strings
      const macroKeywords = [
        'AutoOpen',
        'AutoExec',
        'AutoClose',
        'Document_Open',
        'Workbook_Open',
        'Auto_Open',
        'VBA',
        'Macro',
        'Shell(',
        'CreateObject',
        'WScript',
        'PowerShell',
        'WinExec',
        'RunHTMLApplication',
      ];

      const stringFeatures = context.features.filter((f) => f.type === 'string-literal');

      const foundMacros = new Set<string>();
      for (const sf of stringFeatures) {
        const str = String(sf.value);
        for (const keyword of macroKeywords) {
          if (str.includes(keyword)) {
            foundMacros.add(keyword);
          }
        }
      }

      if (foundMacros.size > 0) {
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'document',
            'office-macros',
            `Office document contains macros (keywords: ${[...foundMacros].join(', ')})`,
            {
              confidence: 0.9,
              featureIds: stringFeatures
                .filter((f) => {
                  const str = String(f.value);
                  return macroKeywords.some((k) => str.includes(k));
                })
                .map((f) => f.id),
              locations: [],
              metadata: { macroKeywords: [...foundMacros] },
            },
          ),
        );
      }

      // Check for suspicious VBA function calls
      const suspiciousApi = ['Shell', 'CreateObject', 'WScript.Shell', 'ADODB.Stream'];
      const foundApi: string[] = [];
      for (const sf of stringFeatures) {
        const str = String(sf.value);
        for (const api of suspiciousApi) {
          if (str.includes(api) && !foundApi.includes(api)) {
            foundApi.push(api);
          }
        }
      }

      if (foundApi.length > 0) {
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'document',
            'office-suspicious-api',
            `Office document uses potentially dangerous APIs: ${foundApi.join(', ')}`,
            {
              confidence: 0.8,
              featureIds: [],
              locations: [],
              metadata: { apiCalls: foundApi },
            },
          ),
        );
      }
    } catch (error) {
      issues.push(
        this.error(
          'OFFICE_ANALYSIS_ERROR',
          `Failed to analyze Office document: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(evidenceList, { startTime, endTime, issues });
  }
}
